import { defineGkdGlobalGroups } from '@gkd-kit/define';

export default defineGkdGlobalGroups([
  {
    key: 1,
    name: '开屏广告',
    desc: '应用启动时的开屏广告，点击「跳过 / 跳过广告 / 关闭广告」一类的文字按钮',
    // 每次进入应用只尝试一次，避免在应用内误触「跳过片头」这类同名按钮
    actionMaximum: 1,
    resetMatch: 'app',
    rules: [
      {
        key: 11,
        name: '点击「跳过广告」',
        matches: '[text="跳过广告"]',
      },
      {
        key: 12,
        name: '点击「跳过」',
        matches: '[text="跳过"]',
      },
      {
        key: 13,
        name: '点击「点击跳过」',
        matches: '[text="点击跳过"]',
      },
      {
        key: 14,
        name: '点击「跳过 3」这类带倒计时的跳过按钮',
        // 倒计时按钮的文案常是「跳过 3」「跳过3」，最长不超过 8 个字，避免误伤长文案
        matches: '[text^="跳过"][text.length<=8]',
      },
      {
        key: 15,
        name: '点击「关闭广告」',
        matches: '[text="关闭广告"]',
      },
    ],
  },
  {
    key: 2,
    name: '更新提示',
    desc: '关闭「发现新版本」一类的更新弹窗，规则组默认关闭，需要时在 GKD 里手动启用',
    enable: false,
    actionMaximum: 1,
    resetMatch: 'app',
    rules: [
      {
        key: 21,
        name: '点击「以后再说」',
        matches: '[text="以后再说"]',
      },
      {
        key: 22,
        name: '点击「暂不更新」',
        matches: '[text="暂不更新"]',
      },
      {
        key: 23,
        name: '点击「下次再说」',
        matches: '[text="下次再说"]',
      },
      {
        key: 24,
        name: '点击「跳过此版本」',
        matches: '[text="跳过此版本"]',
      },
      {
        key: 25,
        name: '点击「暂不升级」',
        matches: '[text="暂不升级"]',
      },
    ],
  },
]);
