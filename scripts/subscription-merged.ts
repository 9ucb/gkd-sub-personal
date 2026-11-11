import subscription from '../src/subscription';
import {
  loadOfficialSubscription,
  mergeOfficialSubscription,
} from './official';

export default mergeOfficialSubscription(
  subscription,
  await loadOfficialSubscription(),
);
