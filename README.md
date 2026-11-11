# 我的 GKD 订阅

基于 [gkd-kit/subscription-template](https://github.com/gkd-kit/subscription-template) 的个人订阅仓库。

规则写在 `src/` 里，推到 `main` 之后 GitHub Actions 会自动跑类型检查 + 构建，把合并后的订阅文件提交到 `dist/`。GKD 里只要导入一次链接，之后每次改规则，手机端都会自动收到更新。

---

## 订阅地址

构建完成后（第一次 Actions 跑绿之后）用下面任意一个：

```txt
https://raw.githubusercontent.com/9ucb/gkd-subscription/main/dist/gkd.json5
```

如果 raw.githubusercontent.com 打不开（国内常见），换成 jsDelivr 镜像：

```txt
https://fastly.jsdelivr.net/gh/9ucb/gkd-subscription@main/dist/gkd.json5
```

> 两个链接指向同一份文件，GKD 里二选一即可。jsDelivr 有几分钟缓存，改完规则后可能要等一会儿或点一次「检查更新」。

上面的账号名和仓库名由 `scripts/deploy.mjs` 在部署时按实际目标替换；如果你换了账号或仓库名，记得同步改 `src/subscription.ts` 和本文件里的地址。

## 私有仓库的订阅获取方式

仓库是私有的，所以 raw / jsDelivr 地址匿名访问会 404，GKD 拿不到。

### 手动导入（当前可用）

1. 打开 https://github.com/9ucb/gkd-subscription/blob/main/dist/gkd.json5 ，点右上角 Download 或复制全文（约 1.1 KB）；
2. 传到手机（微信/网盘皆可），文件名保持 `gkd.json5`；
3. GKD → 订阅 → 添加 → 选择本地文件导入。

改完规则后要重复一次上面三步；版本号（`dist/gkd.version.json5`）会由构建自动 +1。

### 自动更新（需要代理）

如果想让手机直接订阅一个链接并自动收到更新，需要一层带凭据的代理，例如 Cloudflare Worker：
Worker 里存一个只读 token，对外暴露一个随机路径，由它去 GitHub API 取私有仓库里的 `dist/gkd.json5`。

## 自动更新是怎么生效的

```
你改 src/**  →  push 到 main
      ↓
auto_build.yml: pnpm check → pnpm build
      ↓
dist/gkd.json5 重新生成，dist/gkd.version.json5 里的 version +1
      ↓  自动提交回 main
GKD 读 checkUpdateUrl（./gkd.version.json5）发现 version 变了 → 拉取新订阅
```

版本号由 `@gkd-kit/tools` 的 `updateDist` 在构建时自增，不用手改。规则内容没变时不会重复提交。

## 第一次部署

如果这个仓库还只在本地，用自带脚本一键建仓 + 推送 + 触发首次构建：

1. 生成 token：GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token，勾选 `repo` 和 `workflow`（不勾 workflow 无法推送 .github/workflows 下的文件）。
2. 在项目目录里运行：

```shell
node scripts/deploy.mjs --repo gkd-subscription --token <你的token>
```

脚本会：建仓库 → 上传文件 → 打开 Actions 写权限 → 触发 `auto_build` → 等构建结束 → 打印订阅地址。token 只用于本次请求，不落盘。

也可以先试运行看会上传哪些文件：

```shell
node scripts/deploy.mjs --dry-run
```

如果你更想手动来：在 GitHub 点 **Use this template** 建空仓库，本地 `git remote add origin …` 后 push，然后去 Actions 里跑一次 `auto_build`。注意仓库 Settings → Actions → General → Workflow permissions 选 **Read and write permissions**，否则机器人无法把 `dist/` 提交回去。

## 已内置的规则

现在 `src/globalGroups.ts` 里有两个全局规则组（不绑定具体应用，所有 app 都生效）：

| 规则组   | 默认     | 作用                                                                                  |
| -------- | -------- | ------------------------------------------------------------------------------------- |
| 开屏广告 | 开启     | 点「跳过 / 跳过广告 / 点击跳过 / 跳过 3 / 关闭广告」，每次进入应用最多触发一次        |
| 更新提示 | **关闭** | 点「以后再说 / 暂不更新 / 下次再说 / 跳过此版本 / 暂不升级」，需要时在 GKD 里手动启用 |

设计上刻意保守：只匹配**文案完全相等**的按钮（如 `[text="跳过"]`），不去猜 id、也不用宽泛的子串匹配；配合 `actionMaximum: 1` + `resetMatch: 'app'`，每次启动应用只点一次，避免在应用内误触视频「跳过片头」这类同名按钮。代价是全局规则不看 activityId，理论上仍可能误点 —— 不放心就把「开屏广告」组在 GKD 里关掉。

`src/apps/` 下的三个文件（微信 / QQ / GKD）目前 `groups` 为空，等你给具体界面再加。

## 改规则

```
src/
├── subscription.ts   # 订阅元信息（id / 名称 / 作者）
├── categories.ts     # 规则分类
├── globalGroups.ts   # 全局规则（不绑定具体应用）
└── apps/             # 每个应用一个文件，文件名 = 包名
    ├── com.tencent.mm.ts
    └── com.tencent.mobileqq.ts
```

一个应用规则的最小写法：

```ts
import { defineGkdApp } from '@gkd-kit/define';

export default defineGkdApp({
  id: 'com.example.app',
  name: '示例应用',
  groups: [
    {
      key: 1,
      name: '开屏广告',
      activityIds: ['com.example.app.LauncherActivity'],
      rules: [
        {
          key: 1,
          matches: '[id="com.example.app:id/splash_skip"]',
          // 可选：actionCd 延迟点击、excludeMatches 排除、snapshotUrls 存快照
        },
      ],
    },
  ],
});
```

- 选择器语法和字段说明：<https://gkd.li/api>
- 抓界面快照拿选择器：<https://gkd.li/guide/inspect>（GKD 设置 → 高级 → 快照检查）
- 加完规则 push 即可：`check` 工作流负责 check / prettier / eslint（只检查、不改文件），`auto_build` 负责构建并提交 `dist/`

### 订阅元信息

`src/subscription.ts` 里：

- `id`：**必须改成没人用过的大随机数**，否则会和别人订阅冲突。当前是 `1738204917`，想换就换。
- `name`：GKD 里显示的订阅名。
- `author` / `supportUri`：作者与反馈地址。

## 本地开发

需要 node >= 22、pnpm >= 9（模板用 WasmGc 校验 Java/Kotlin 正则，node 版本低了会报错）。

```shell
pnpm install --registry=https://registry.npmmirror.com
pnpm run build    # 生成 dist/gkd.json5
pnpm run check    # 类型检查 + 规则校验
```

## 说明

- 只保留了自己需要的应用规则；模板自带的三个空文件（微信 / QQ / GKD）可以删，也可以往里填规则。
- `build_release.yml` 是模板自带的「手动发布 + 打 Release」工作流，需要发版时在 Actions 里手动点一次。
