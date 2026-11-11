import json5 from 'json5';
import type { defineGkdSubscription } from '@gkd-kit/define';

/** 订阅结构直接借用 defineGkdSubscription 的返回类型，避免再引一层 @gkd-kit/api */
type Subscription = ReturnType<typeof defineGkdSubscription>;
type List<T> = NonNullable<T>;
type App = List<Subscription['apps']>[number];
type Category = List<Subscription['categories']>[number];
type RuleLike = { key: number; name?: string; snapshotUrls?: unknown };
type GroupLike = {
  key: number;
  name?: string;
  rules?: unknown;
  snapshotUrls?: unknown;
};
type AppGroupLike = GroupLike & { name: string };

type Provider = {
  /** 日志里显示的名字 */
  name: string;
  /** 来源仓库，只用于日志与 README 溯源 */
  repo: string;
  license: string;
  /** 依次尝试的下载地址（镜像挂了自动换下一个） */
  urls: readonly string[];
};

/**
 * 上游候选，按顺序尝试，只取**第一个成功**的：两个订阅的应用规则会整体替换，
 * 不能把两份混着合并（分类 key 与订阅 id 都不一致，混起来必错）。
 *
 * 1. 甘霖的GKD订阅：MIT 许可，仍在维护（2026 年仍在每周更新），610 个应用。
 * 2. 官方订阅：gkd-kit/subscription 已于 2024-05 归档，npm 包名就是「默认订阅-已停止维护」，
 *    规则停在 2024 年，仅作兜底。
 *
 * 想固定用哪一个：环境变量 GKD_UPSTREAM=ganlin|official（默认自动：甘霖 → 官方 → 只用自有规则）。
 */
const PROVIDERS: readonly Provider[] = [
  {
    name: '甘霖的GKD订阅',
    repo: 'https://github.com/ganlinte/GKD-subscription',
    license: 'MIT',
    urls: [
      'https://gcore.jsdelivr.net/gh/ganlinte/GKD-subscription@main/dist/ganlin_gkd.json5',
      'https://fastly.jsdelivr.net/gh/ganlinte/GKD-subscription@main/dist/ganlin_gkd.json5',
      'https://raw.githubusercontent.com/ganlinte/GKD-subscription/main/dist/ganlin_gkd.json5',
    ],
  },
  {
    name: '官方订阅（已停止维护）',
    repo: 'https://github.com/gkd-kit/subscription',
    license: 'MIT',
    urls: [
      'https://registry.npmmirror.com/@gkd-kit/subscription/latest/files/dist/gkd.json5',
      'https://fastly.jsdelivr.net/npm/@gkd-kit/subscription@latest/dist/gkd.json5',
      'https://unpkg.com/@gkd-kit/subscription@latest/dist/gkd.json5',
    ],
  },
];

/** 读 GKD_UPSTREAM，允许固定上游；读不到就当没设置 */
function pickProviders(): readonly Provider[] {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  const pick = env?.GKD_UPSTREAM;
  if (pick === 'ganlin') {
    return PROVIDERS.filter((p) => p.repo.includes('ganlinte'));
  }
  if (pick === 'official') {
    return PROVIDERS.filter((p) => p.repo.includes('gkd-kit'));
  }
  return PROVIDERS;
}

function isSubscription(value: unknown): value is Subscription {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const o = value as {
    apps?: unknown;
    globalGroups?: unknown;
    categories?: unknown;
  };
  return (
    Array.isArray(o.apps) &&
    Array.isArray(o.globalGroups) &&
    Array.isArray(o.categories)
  );
}

/**
 * 下载并解析上游订阅：按 PROVIDERS 顺序找到第一个能用的源就返回。
 * 全部失败时返回 null，构建退化成只有自己的规则（绝不因为上游挂掉而让 CI 变红）。
 */
export async function loadOfficialSubscription(): Promise<Subscription | null> {
  for (const provider of pickProviders()) {
    for (const url of provider.urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) {
          console.warn(
            `[upstream] ${provider.name}：${url} 返回 ${res.status}`,
          );
          continue;
        }
        const parsed: unknown = json5.parse(await res.text());
        if (!isSubscription(parsed)) {
          console.warn(`[upstream] ${provider.name}：${url} 不是订阅结构`);
          continue;
        }
        const appCount = parsed.apps?.length ?? 0;
        const groupCount = (parsed.apps ?? []).reduce(
          (sum, app) => sum + (app.groups?.length ?? 0),
          0,
        );
        console.log(
          `[upstream] 载入 ${provider.name} v${parsed.version}（${provider.license}）：` +
            `${appCount} 个应用 / ${groupCount} 个规则组 —— ${url}`,
        );
        return parsed;
      } catch (e) {
        console.warn(
          `[upstream] ${provider.name}：${url} 失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
  console.warn('[upstream] 所有上游都不可用，本次只构建自有规则');
  return null;
}

/** 新版校验只认 i.gkd.li；2024 年的数据里还有一批 inspect.gkd.li 的旧链接 */
const VALID_SNAPSHOT = /^https:\/\/i\.gkd\.li\/(i|import)\/[0-9]+$/;

function fixSnapshotUrl(url: string): string | null {
  if (VALID_SNAPSHOT.test(url)) {
    return url;
  }
  const migrated = url.replace(
    /^https:\/\/inspect\.gkd\.li\//,
    'https://i.gkd.li/',
  );
  return VALID_SNAPSHOT.test(migrated) ? migrated : null;
}

/** 快照链接只是给规则作者看的元信息，迁移不了就丢掉，不影响规则本身 */
function sanitizeSnapshotUrls<T extends { snapshotUrls?: unknown }>(
  item: T,
): T {
  // 单个值或数组都可能出现（IArray）
  const value = item.snapshotUrls;
  if (value === undefined) {
    return item;
  }
  if (Array.isArray(value)) {
    const fixed = value
      .map((u) => (typeof u === 'string' ? fixSnapshotUrl(u) : null))
      .filter((u): u is string => !!u);
    return { ...item, snapshotUrls: fixed } as T;
  }
  if (typeof value === 'string') {
    return { ...item, snapshotUrls: fixSnapshotUrl(value) ?? [] } as T;
  }
  return item;
}

/**
 * 官方订阅是用旧版 @gkd-kit/tools 构建的，同一个组里存在重名规则（例如 X(推特)「信息流广告」
 * 组里两条都叫「点击右上角关闭」）。新版 checkSubscription 把重名当错误，GKD 自己并不校验，
 * 所以这里只给重复项补序号，规则内容一个字不改。注意 rules 可能是数组，也可能是单个值/字符串。
 */
function normalizeGroups<T extends GroupLike>(groups: readonly T[]): T[] {
  return groups.map((group) => {
    const safeGroup = sanitizeSnapshotUrls(group);
    const raw = safeGroup.rules;
    if (!Array.isArray(raw) || raw.length === 0) {
      return safeGroup;
    }
    const usedKeys = new Set<number>();
    const nameCount = new Map<string, number>();
    const keys = raw
      .filter(
        (rule): rule is RuleLike =>
          typeof rule === 'object' &&
          rule !== null &&
          typeof (rule as RuleLike).key === 'number',
      )
      .map((rule) => rule.key);
    let nextKey = Math.max(0, ...keys) + 1;
    const normalized = raw.map((rule) => {
      if (typeof rule !== 'object' || rule === null) {
        return sanitizeSnapshotUrls(rule as { snapshotUrls?: unknown });
      }
      const item = sanitizeSnapshotUrls(rule as RuleLike);
      let key = item.key;
      if (typeof key === 'number') {
        while (usedKeys.has(key)) {
          key = nextKey++;
        }
        usedKeys.add(key);
      }
      let name = item.name;
      if (typeof name === 'string') {
        const seen = (nameCount.get(name) ?? 0) + 1;
        nameCount.set(name, seen);
        if (seen > 1) {
          name = `${name}（${seen}）`;
        }
      }
      return key === item.key && name === item.name
        ? item
        : { ...item, key, name };
    });
    return { ...safeGroup, rules: normalized } as T;
  });
}

function normalizeApps<T extends { groups?: unknown }>(
  apps: readonly T[],
): T[] {
  return apps.map((app) => {
    const groups = app.groups;
    return {
      ...app,
      groups: Array.isArray(groups)
        ? normalizeGroups(groups as GroupLike[])
        : (groups ?? []),
    } as T;
  });
}

/** 自有条目优先；官方条目只在 key 与 name 都不冲突时追加，冲突就丢弃 */
function mergeNamed<T extends { key: number; name?: string }>(
  own: T[],
  extra: T[],
): T[] {
  const usedKeys = new Set(own.map((x) => x.key));
  const usedNames = new Set(
    own.map((x) => x.name).filter((n): n is string => typeof n === 'string'),
  );
  const result = [...own];
  for (const item of extra) {
    if (usedKeys.has(item.key)) {
      continue;
    }
    if (typeof item.name === 'string' && usedNames.has(item.name)) {
      continue;
    }
    usedKeys.add(item.key);
    if (typeof item.name === 'string') {
      usedNames.add(item.name);
    }
    result.push(item);
  }
  return result;
}

/**
 * 分类以官方表为基准：官方应用组的 category 字段直接引用它自己的 key（0..9、-1），
 * 必须原样保留，否则整套官方规则会指向错误的分类。自己的分类只在名字不重复时追加一个新 key。
 */
function mergeCategories(own: Category[], extra: Category[]): Category[] {
  const result = [...extra];
  const usedNames = new Set(extra.map((c) => c.name));
  const usedKeys = new Set(extra.map((c) => c.key));
  let nextKey = Math.max(0, ...extra.map((c) => c.key)) + 1;
  for (const category of own) {
    if (usedNames.has(category.name)) {
      continue;
    }
    while (usedKeys.has(nextKey)) {
      nextKey++;
    }
    result.push({ ...category, key: nextKey });
    usedKeys.add(nextKey);
    usedNames.add(category.name);
    nextKey++;
  }
  return result;
}

/**
 * 新版 checkSubscription 要求应用组的名字以「分类名」或「分类名-」开头（GKD 靠这个分栏）。
 * 2024 年的官方数据里没有 category 字段，组名也是各自起的（「热门推荐关闭」这种），
 * 所以按关键词补一个分类前缀；实在认不出来的归到「功能类」。
 */
const CATEGORY_HINTS: ReadonlyArray<readonly [string, RegExp]> = [
  ['开屏广告', /开屏|启动广告|闪屏/],
  ['青少年模式', /青少年|未成年/],
  ['更新提示', /更新/],
  ['评价提示', /评价|评分|好评|五星/],
  ['通知提示', /通知|推送|提醒/],
  ['定位提示', /定位|位置|附近/],
  ['权限提示', /权限|授权|隐私/],
  ['分段广告', /信息流|分段|列表广告|帖子|feed|动态/],
  ['全屏广告', /全屏|插屏|悬浮窗|浮窗/],
  ['局部广告', /弹窗|局部|横幅|banner|广告/i],
];

function pickCategoryName(name: string): string {
  for (const [categoryName, hint] of CATEGORY_HINTS) {
    if (hint.test(name)) {
      return categoryName;
    }
  }
  return '功能类';
}

function categorizeGroups<T extends AppGroupLike>(
  groups: readonly T[],
  categories: Category[],
): T[] {
  const names = new Set(categories.map((c) => c.name));
  return groups.map((group) => {
    const existing = categories.find(
      (c) =>
        group.name.startsWith(c.name) &&
        (group.name.length === c.name.length ||
          group.name[c.name.length] === '-'),
    );
    if (existing) {
      return group;
    }
    const picked = pickCategoryName(group.name);
    const prefix = names.has(picked) ? picked : '功能类';
    return { ...group, name: `${prefix}-${group.name}` } as T;
  });
}

function mergeApps(own: App[], extra: App[], categories: Category[]): App[] {
  const remaining = new Map(own.map((app) => [app.id, app]));
  const result = extra.map((officialApp) => {
    const mine = remaining.get(officialApp.id);
    if (!mine) {
      return officialApp;
    }
    remaining.delete(officialApp.id);
    return {
      ...mine,
      groups: mergeNamed(mine.groups ?? [], officialApp.groups ?? []),
    };
  });
  for (const app of remaining.values()) {
    result.push(app);
  }
  const categorized = result.map((app) => ({
    ...app,
    groups: categorizeGroups(app.groups ?? [], categories),
  }));
  return normalizeApps(categorized);
}

/** 把官方规则并入自己的订阅：自有规则优先，官方规则只填补空缺 */
export function mergeOfficialSubscription(
  own: Subscription,
  official: Subscription | null,
): Subscription {
  if (!official) {
    return own;
  }
  const categories = mergeCategories(
    own.categories ?? [],
    official.categories ?? [],
  );
  const globalGroups = normalizeGroups(
    mergeNamed(own.globalGroups ?? [], official.globalGroups ?? []),
  );
  const apps = mergeApps(own.apps ?? [], official.apps ?? [], categories);
  const merged: Subscription = { ...own, categories, globalGroups, apps };
  console.log(
    `[merge] 合并后：${apps.length} 个应用 / ${globalGroups.length} 个全局组 / ${categories.length} 个分类`,
  );
  return merged;
}
