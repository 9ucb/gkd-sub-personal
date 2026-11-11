// GKD 私有订阅代理：对外暴露随机路径，内部用 GitHub token 取私有仓库的 dist 文件。
// 部署后在 Cloudflare 里设置两个变量：
//   SUB_PATH  随机路径段，例如 `7f3c9a1e5b`
//   GH_TOKEN  只读的 GitHub token（fine-grained，仅本仓库，Contents: Read）
//
// 订阅地址：  https://<worker域名>/<SUB_PATH>/gkd.json5
// 版本文件：  https://<worker域名>/<SUB_PATH>/gkd.version.json5
// （GKD 的 checkUpdateUrl 是 './gkd.version.json5'，会相对订阅地址自动解析，所以两个文件必须同目录）

const OWNER = '9ucb';
const REPO = 'gkd-subscription';
const BRANCH = 'main';

const FILES = new Set(['gkd.json5', 'gkd.version.json5']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const prefix = '/' + env.SUB_PATH + '/';

    if (!env.SUB_PATH || env.SUB_PATH.length < 16) {
      return new Response('worker misconfigured: SUB_PATH too short', {
        status: 500,
      });
    }
    if (!url.pathname.startsWith(prefix)) {
      return new Response('not found', { status: 404 });
    }

    const file = url.pathname.slice(prefix.length);
    if (!FILES.has(file)) {
      return new Response('not found', { status: 404 });
    }

    const api =
      'https://api.github.com/repos/' +
      OWNER +
      '/' +
      REPO +
      '/contents/dist/' +
      file +
      '?ref=' +
      BRANCH;

    const gh = await fetch(api, {
      headers: {
        authorization: 'Bearer ' + env.GH_TOKEN,
        accept: 'application/vnd.github.raw',
        'user-agent': 'gkd-sub-proxy',
      },
    });

    if (!gh.ok) {
      return new Response('upstream ' + gh.status, { status: 502 });
    }

    return new Response(await gh.text(), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
      },
    });
  },
};
