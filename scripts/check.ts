import subscription from './subscription-merged';
import { checkSubscription, checkApiVersion } from '@gkd-kit/tools';

await checkApiVersion();

checkSubscription(subscription);

export default subscription;
