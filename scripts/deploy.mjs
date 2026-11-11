#!/usr/bin/env node
/**
 * 一键把本地订阅工程发布到 GitHub，并触发首次自动构建。
 *
 * 用法:
 *   node scripts/deploy.mjs --repo my-gkd-sub --token ghp_xxx
 *   GITHUB_TOKEN=ghp_xxx node scripts/deploy.mjs --repo my-gkd-sub
 *
 * token 需要权限: classic PAT 勾选 repo + workflow；fine-grained 勾选
 * Contents(read/write) + Workflows(read/write) + Administration(read/write，用于建仓库)。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const API = 'https://api.github.com';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes('--' + name);

const token = opt(
  'token',
  process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
);
const repoName = opt('repo', 'gkd-sub-personal');
const isPrivate = flag('private');
const dryRun = flag('dry-run');
const skipWait = flag('no-wait');
const force = flag('force');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.local',
  'logs',
  '.vscode',
  '.idea',
]);
const SKIP_FILES = new Set(['.DS_Store', '.eslintcache']);

if (!token && !dryRun) {
  console.error('缺少 token。请用 --token <PAT> 或设置环境变量 GITHUB_TOKEN。');
  process.exit(1);
}

let owner = opt('user', '');

async function api(p, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(API + p, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gkd-subscription-deploy',
      Authorization: 'Bearer ' + token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // 非 JSON 响应，保持 null
  }
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || text.slice(0, 300);
    const err = new Error(`${method} ${p} -> ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function walk(dir, rel = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (rel === '' && e.name === 'dist') continue; // dist 交给 CI 生成
      out.push(...(await walk(abs, r)));
    } else if (e.isFile() && !SKIP_FILES.has(e.name)) {
      out.push({ abs, rel: r });
    }
  }
  return out;
}

async function patchIdentity(user) {
  const file = path.join(ROOT, 'src/subscription.ts');
  let src = await fs.readFile(file, 'utf8');
  src = src
    .replaceAll('__GITHUB_USERNAME__', user)
    .replaceAll('__REPO_NAME__', repoName);
  await fs.writeFile(file, src);
  const readmeFile = path.join(ROOT, 'README.md');
  const readme = (await fs.readFile(readmeFile, 'utf8'))
    .replaceAll('__GITHUB_USERNAME__', user)
    .replaceAll('__REPO_NAME__', repoName);
  await fs.writeFile(readmeFile, readme);
}

function rawUrl() {
  return `https://raw.githubusercontent.com/${owner}/${repoName}/main/dist/gkd.json5`;
}
function jsdelivrUrl() {
  return `https://fastly.jsdelivr.net/gh/${owner}/${repoName}@main/dist/gkd.json5`;
}

async function main() {
  if (dryRun) {
    owner = owner || 'YOUR_GITHUB_NAME';
    const files = await walk(ROOT);
    console.log(
      `试运行：将上传 ${files.length} 个文件（不含 dist/node_modules/.git）：`,
    );
    for (const f of files) console.log('  ' + f.rel);
    console.log(
      '\n订阅地址（构建完成后）:\n  ' + rawUrl() + '\n  ' + jsdelivrUrl(),
    );
    return;
  }

  const me = await api('/user');
  owner = owner || me.login;
  console.log(`账号: ${me.login}  目标仓库: ${owner}/${repoName}`);

  await patchIdentity(owner);

  // 1. 创建仓库
  try {
    await api('/user/repos', {
      method: 'POST',
      body: {
        name: repoName,
        private: isPrivate,
        description: '我的 GKD 订阅（自动构建）',
        has_issues: false,
        has_wiki: false,
        has_projects: false,
      },
    });
    console.log('仓库已创建');
  } catch (e) {
    if (e.status === 422) {
      const exists = await api(`/repos/${owner}/${repoName}`).catch(() => null);
      if (!exists) throw e;
      const branches = await api(`/repos/${owner}/${repoName}/branches`).catch(
        () => [],
      );
      if (branches.length && !force) {
        throw new Error(
          `仓库 ${owner}/${repoName} 已存在且非空，为安全起见不覆盖。请换一个 --repo 名称，或加 --force 在现有内容之上追加提交。`,
          { cause: e },
        );
      }
      console.log(
        branches.length
          ? '仓库已存在，--force 模式：在当前 main 之上追加提交'
          : '仓库已存在但为空，继续写入',
      );
    } else throw e;
  }
  // 等到仓库真正可用
  for (let i = 0; i < 10; i++) {
    const info = await api(`/repos/${owner}/${repoName}`).catch(() => null);
    if (info) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 2. 上传文件 -> blobs -> tree -> commit -> ref
  const files = await walk(ROOT);
  console.log(`准备上传 ${files.length} 个文件...`);

  // 空仓库上 git/blobs 会直接报 409 (Git Repository is empty)，
  // 所以先用 Contents API 造一个初始 commit，之后才能走 Git Data API。
  let baseCommit;
  let baseTree;
  const head = await api(
    `/repos/${owner}/${repoName}/git/ref/heads/main`,
  ).catch((e) =>
    e.status === 404 || e.status === 409 ? null : Promise.reject(e),
  );
  if (head) {
    baseCommit = head.object.sha;
    baseTree = (
      await api(`/repos/${owner}/${repoName}/git/commits/${baseCommit}`)
    ).tree.sha;
  } else {
    const seed = files.find((f) => f.rel === 'README.md') ?? files[0];
    const seedBuf = await fs.readFile(seed.abs);
    const seeded = await api(
      `/repos/${owner}/${repoName}/contents/${seed.rel}`,
      {
        method: 'PUT',
        body: {
          message: 'chore: init 我的 GKD 订阅',
          content: seedBuf.toString('base64'),
          branch: 'main',
        },
      },
    );
    baseCommit = seeded.commit.sha;
    baseTree =
      seeded.commit.tree?.sha ??
      (await api(`/repos/${owner}/${repoName}/git/commits/${baseCommit}`)).tree
        .sha;
    console.log('已创建初始 commit（空仓库需要先有提交）');
  }

  // 新建仓库的 git 存储要过几秒才就绪，期间 git/blobs 会报 409，重试即可
  const createBlob = async (buf) => {
    for (let i = 0; ; i++) {
      try {
        return await api(`/repos/${owner}/${repoName}/git/blobs`, {
          method: 'POST',
          body: { content: buf.toString('base64'), encoding: 'base64' },
        });
      } catch (e) {
        if (e.status === 409 && i < 10) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        throw e;
      }
    }
  };

  const treeItems = [];
  for (const f of files) {
    const buf = await fs.readFile(f.abs);
    const blob = await createBlob(buf);
    treeItems.push({
      path: f.rel,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }
  const tree = await api(`/repos/${owner}/${repoName}/git/trees`, {
    method: 'POST',
    body: { base_tree: baseTree, tree: treeItems },
  });
  const commit = await api(`/repos/${owner}/${repoName}/git/commits`, {
    method: 'POST',
    body: {
      message: 'chore: init 我的 GKD 订阅',
      tree: tree.sha,
      parents: [baseCommit],
    },
  });
  await api(`/repos/${owner}/${repoName}/git/refs/heads/main`, {
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
  });
  console.log('代码已推送到 main');

  // 3. 开启 Actions 写权限（自动提交 dist 需要）
  await api(`/repos/${owner}/${repoName}/actions/permissions/workflow`, {
    method: 'PUT',
    body: {
      default_workflow_permissions: 'write',
      can_approve_pull_request_reviews: false,
    },
  }).catch((e) =>
    console.warn(
      '设置 Actions 权限失败(可手动在 Settings->Actions 里开启):',
      e.message,
    ),
  );

  // 4. 触发首次构建
  await api(
    `/repos/${owner}/${repoName}/actions/workflows/auto_build.yml/dispatches`,
    {
      method: 'POST',
      body: { ref: 'main' },
    },
  );
  console.log('已触发首次构建');

  if (skipWait) {
    console.log(
      `\n订阅地址（构建完成后可用）:\n  ${rawUrl()}\n  ${jsdelivrUrl()}`,
    );
    return;
  }

  // 5. 等待构建完成
  const started = Date.now();
  let runUrl = `https://github.com/${owner}/${repoName}/actions`;
  while (Date.now() - started < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 8000));
    const runs = await api(
      `/repos/${owner}/${repoName}/actions/runs?per_page=1`,
    ).catch(() => null);
    const run = runs?.workflow_runs?.[0];
    if (!run) {
      process.stdout.write('.');
      continue;
    }
    runUrl = run.html_url;
    if (run.status === 'completed') {
      console.log(`\n构建结束: ${run.conclusion}`);
      if (run.conclusion === 'success') {
        console.log(
          `\n订阅地址:\n  ${rawUrl()}\n  ${jsdelivrUrl()}\n\n仓库: https://github.com/${owner}/${repoName}`,
        );
        return;
      }
      console.error('构建失败，请查看: ' + runUrl);
      process.exitCode = 1;
      return;
    }
    process.stdout.write('.');
  }
  console.log(`\n构建仍在进行，请稍后查看: ${runUrl}`);
}

main().catch((e) => {
  console.error('部署失败:', e.message);
  process.exit(1);
});
