/**
 * @patchwork/mobile -- Mobile client entry point.
 *
 * Re-exports the mobile API client, navigation model, push notification
 * handler, and mobile-optimized offline sync module.
 */

export { MobileApiClient, type MobileApiClientConfig } from './api-client.js';
export {
    MobileNavigationModel,
    type MobileNavigationState,
    type MobileTab,
    MOBILE_TABS,
} from './navigation.js';
export {
    PushNotificationHandler,
    type PushNotificationPayload,
    type PushRegistrationResult,
} from './push-notifications.js';
export {
    MobileOfflineSync,
    type MobileOfflineSyncState,
} from './offline-sync-mobile.js';
