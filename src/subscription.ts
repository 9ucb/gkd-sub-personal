import { defineGkdSubscription } from '@gkd-kit/define';
import { batchImportApps } from '@gkd-kit/tools';
import categories from './categories';
import globalGroups from './globalGroups';

export default defineGkdSubscription({
  id: 1738204917,
  name: 'GKD 自用订阅',
  version: 0,
  author: '9ucb',
  checkUpdateUrl: './gkd.version.json5',
  supportUri: 'https://github.com/9ucb/gkd-sub-personal',
  categories,
  globalGroups,
  apps: await batchImportApps(`${import.meta.dirname}/apps`),
});
