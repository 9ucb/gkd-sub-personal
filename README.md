# GKD 自用订阅

基于 [gkd-kit/subscription-template](https://github.com/gkd-kit/subscription-template) 的个人订阅仓库。

规则写在 `src/` 里，推到 `main` 之后 GitHub Actions 会自动跑类型检查 + 构建，把合并后的订阅文件提交到 `dist/`。GKD 里只要导入一次链接，之后每次改规则，手机端都会自动收到更新。

---

## 订阅地址

构建完成后（第一次 Actions 跑绿之后）用下面任意一个：

```txt
https://raw.githubusercontent.com/9ucb/gkd-sub-personal/main/dist/gkd.json5
```

如果 raw.githubusercontent.com 打不开（国内常见），换成 jsDelivr 镜像：

```txt
https://fastly.jsdelivr.net/gh/9ucb/gkd-sub-personal@main/dist/gkd.json5
```

> 两个链接指向同一份文件，GKD 里二选一即可。jsDelivr 有几分钟缓存，改完规则后可能要等一会儿或点一次「检查更新」。

上面的账号名和仓库名由 `scripts/deploy.mjs` 在部署时按实际目标替换；如果你换了账号或仓库名，记得同步改 `src/subscription.ts` 和本文件里的地址。

> 为什么是公开仓库：GKD 的「添加订阅」只有一个链接输入框（`gkd-app/.../SubsLinkDialogState.kt:197`），抓取用不带凭据的 `NetworkClients.client.get(url)`（`SubscriptionRepository.kt:769`），私有仓库的 raw 地址匿名一律 404，而 URL 里塞 token 也不被 GitHub 接受。所以想「粘一条链接就自动更新」，仓库必须能被匿名读取。这里放的都是开屏广告跳过之类的规则，不含个人信息。

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

除了 push 触发，`auto_build` 还有一条**每周一 04:00（北京时间）的定时构建**：每次都会重新下载上游订阅，上游更新了就会自动出下一个版本，手机端随后自己拉到。所以规则维护是「上游负责更新，这里负责跟随」，你不需要盯。

## 第一次部署

如果这个仓库还只在本地，用自带脚本一键建仓 + 推送 + 触发首次构建：

1. 生成 token：GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token，勾选 `repo` 和 `workflow`（不勾 workflow 无法推送 .github/workflows 下的文件）。
2. 在项目目录里运行：

```shell
node scripts/deploy.mjs --repo gkd-sub-personal --token <你的token>
```

脚本会：建仓库 → 上传文件 → 打开 Actions 写权限 → 触发 `auto_build` → 等构建结束 → 打印订阅地址。token 只用于本次请求，不落盘。

也可以先试运行看会上传哪些文件：

```shell
node scripts/deploy.mjs --dry-run
```

如果你更想手动来：在 GitHub 点 **Use this template** 建空仓库，本地 `git remote add origin …` 后 push，然后去 Actions 里跑一次 `auto_build`。注意仓库 Settings → Actions → General → Workflow permissions 选 **Read and write permissions**，否则机器人无法把 `dist/` 提交回去。

## 已内置的规则

### 1. 上游应用规则

构建时会下载一份上游订阅，把它的应用规则并进本订阅（自己的规则优先、上游只填补空缺），逻辑在 `scripts/official.ts`。上游按顺序尝试，**只取第一个成功的**：

| 顺序 | 上游                                                          | 许可 | 状态                                       | 规模                       |
| ---- | ------------------------------------------------------------- | ---- | ------------------------------------------ | -------------------------- |
| 1    | [甘霖的GKD订阅](https://github.com/ganlinte/GKD-subscription) | MIT  | 仍在维护（每周有提交）                     | 610 个应用 / 1389 个规则组 |
| 2    | [官方订阅](https://github.com/gkd-kit/subscription)           | MIT  | **已归档**（2024-05-12，规则停在 2024 年） | 610 个应用 / 1371 个规则组 |

两个都是 MIT，可以合法再分发（保留署名即可，见「规则来源与许可」）。**不能同时合并两份**：双方订阅 id 与分类 key 都不一致，混起来规则会指错分类，所以只有「换源」没有「叠加」。

想换上游不用改代码：仓库 Settings → Variables 里加一个 `GKD_UPSTREAM`，值填 `ganlin` 或 `official`；不设置就是默认顺序。上游全挂时构建不会失败，只会退回只用自有规则。

> ⚠️ 官方那份已经死了，规则停留在 2024 年，很多应用改版后不会再生效。失效规则一般无害（匹配不到就不做事），但某个应用行为异常时先怀疑它。

合并时会做三处兼容处理，都只动元信息、不动规则内容：

- 重名规则补序号（旧数据里有同组两条同名规则，新版校验会报错）；
- 旧快照链接 `inspect.gkd.li` 迁到 `i.gkd.li`，迁不了就丢掉；
- 组名没有分类前缀的，按关键词补上（`开屏广告-` / `更新提示-` / `功能类-` 等），因为 GKD 靠名字前缀做分类。

### 2. 自己的全局规则

`src/globalGroups.ts` 里有两个全局规则组（不绑定具体应用，所有 app 都生效）：

| 规则组   | 默认     | 作用                                                                                  |
| -------- | -------- | ------------------------------------------------------------------------------------- |
| 开屏广告 | 开启     | 点「跳过 / 跳过广告 / 点击跳过 / 跳过 3 / 关闭广告」，每次进入应用最多触发一次        |
| 更新提示 | **关闭** | 点「以后再说 / 暂不更新 / 下次再说 / 跳过此版本 / 暂不升级」，需要时在 GKD 里手动启用 |

设计上刻意保守：只匹配**文案完全相等**的按钮（如 `[text="跳过"]`），不去猜 id、也不用宽泛的子串匹配；配合 `actionMaximum: 1` + `resetMatch: 'app'`，每次启动应用只点一次，避免在应用内误触视频「跳过片头」这类同名按钮。代价是全局规则不看 activityId，理论上仍可能误点 —— 不放心就把「开屏广告」组在 GKD 里关掉。

`src/apps/` 下的三个文件（微信 / QQ / GKD）自己的 `groups` 还是空的，实际生效的是合并进来的官方规则。

## 规则来源与许可

- 自己的规则（`src/`）：随本仓库。
- 合并进来的应用规则（默认）：来自 [ganlinte/GKD-subscription](https://github.com/ganlinte/GKD-subscription)，作者 ganlinte，**MIT 许可**。
- 兜底上游：[gkd-kit/subscription](https://github.com/gkd-kit/subscription)，作者 lisonge，**MIT 许可**（见 npm 包内 `package.json` 的 `license` 字段），仓库已归档。
- 选择器与构建工具：[@gkd-kit/tools](https://github.com/gkd-kit/selector)、[@gkd-kit/define](https://www.npmjs.com/package/@gkd-kit/define)，均为 MIT。

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
