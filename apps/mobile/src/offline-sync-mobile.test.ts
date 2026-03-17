import { describe, expect, it } from 'vitest';
import { MobileOfflineSync } from './offline-sync-mobile.js';
import { mobileContractStubs } from '@patchwork/shared';

const defaultConfig = mobileContractStubs.appConfig.offlineSyncConfig;

describe('MobileOfflineSync', () => {
    it('starts online with empty queue', () => {
        const sync = new MobileOfflineSync(defaultConfig);
        const state = sync.getState();

        expect(state.isOnline).toBe(true);
        expect(state.pendingCount).toBe(0);
        expect(state.failedCount).toBe(0);
        expect(state.offlineDurationMs).toBe(0);
        expect(state.exceedsMaxOfflineDuration).toBe(false);
    });

    it('enqueues items when within max queue size', () => {
        const sync = new MobileOfflineSync(defaultConfig);

        const item = sync.enqueue('create', 'aid-post', { title: 'Test' });
        expect(item).not.toBeNull();
        expect(item?.action).toBe('create');
        expect(item?.resource).toBe('aid-post');
        expect(sync.getQueueSize()).toBe(1);
    });

    it('rejects enqueue when queue is full', () => {
        const sync = new MobileOfflineSync({ ...defaultConfig, maxQueueSize: 2 });

        sync.enqueue('create', 'post-1', {});
        sync.enqueue('create', 'post-2', {});
        const third = sync.enqueue('create', 'post-3', {});

        expect(third).toBeNull();
        expect(sync.getQueueSize()).toBe(2);
    });

    it('processes next item when online', () => {
        const sync = new MobileOfflineSync(defaultConfig);
        sync.enqueue('create', 'aid-post', { title: 'Test' });

        const processed = sync.processNext();
        expect(processed).toBeDefined();
        expect(processed?.resource).toBe('aid-post');
    });

    it('does not process when offline', () => {
        const sync = new MobileOfflineSync(defaultConfig);
        sync.enqueue('create', 'aid-post', { title: 'Test' });
        sync.setOnline(false);

        const processed = sync.processNext();
        expect(processed).toBeUndefined();
    });

    it('flushes all pending items when coming back online', () => {
        const sync = new MobileOfflineSync(defaultConfig);

        // Go offline and queue items
        sync.setOnline(false);
        sync.enqueue('create', 'post-1', {});
        sync.enqueue('update', 'post-2', {});

        expect(sync.getPendingCount()).toBe(2);

        // Come back online -- auto-flush
        const flushed = sync.setOnline(true);
        expect(flushed).toHaveLength(2);
        expect(sync.getPendingCount()).toBe(0);
    });

    it('tracks offline duration', () => {
        const sync = new MobileOfflineSync(defaultConfig);
        const baseTime = new Date('2026-03-01T12:00:00.000Z');

        // Set last online time deterministically, then go offline
        sync.setOnline(true, baseTime.toISOString());
        sync.setOnline(false);

        // Check state 1 hour later
        const oneHourLater = new Date(baseTime.getTime() + 60 * 60 * 1000);
        const state = sync.getState(oneHourLater.toISOString());

        expect(state.isOnline).toBe(false);
        expect(state.offlineDurationMs).toBeGreaterThan(0);
    });

    it('detects when max offline duration is exceeded', () => {
        const sync = new MobileOfflineSync({
            ...defaultConfig,
            maxOfflineDurationMs: 1000, // 1 second for testing
        });

        const baseTime = new Date('2026-03-01T12:00:00.000Z');

        // Set last online time deterministically, then go offline
        sync.setOnline(true, baseTime.toISOString());
        sync.setOnline(false);

        // Check state 2 seconds later
        const twoSecondsLater = new Date(baseTime.getTime() + 2000);
        const state = sync.getState(twoSecondsLater.toISOString());

        expect(state.exceedsMaxOfflineDuration).toBe(true);
    });

    it('marks items as failed', () => {
        const sync = new MobileOfflineSync(defaultConfig);
        const item = sync.enqueue('create', 'aid-post', {});

        expect(item).not.toBeNull();
        const result = sync.markFailed(item!.id, 'Network error');
        expect(result).toBe(true);

        const state = sync.getState();
        expect(state.failedCount).toBe(1);
    });

    it('returns conflicts when failed items have conflict errors', () => {
        const sync = new MobileOfflineSync(defaultConfig);
        const item = sync.enqueue('update', 'aid-post', {});

        expect(item).not.toBeNull();
        sync.markFailed(item!.id, 'conflict: remote version is newer');

        const conflicts = sync.getConflicts();
        expect(conflicts).toHaveLength(1);
    });

    it('flush returns empty array when offline', () => {
        const sync = new MobileOfflineSync(defaultConfig);
        sync.setOnline(false);
        sync.enqueue('create', 'aid-post', {});

        const flushed = sync.flush();
        expect(flushed).toHaveLength(0);
    });

    it('updates lastSyncAt after successful flush', () => {
        const sync = new MobileOfflineSync(defaultConfig);
        sync.enqueue('create', 'aid-post', {});

        expect(sync.getState().lastSyncAt).toBeUndefined();

        sync.flush('2026-03-01T12:00:00.000Z');
        expect(sync.getState().lastSyncAt).toBe('2026-03-01T12:00:00.000Z');
    });

    it('reports zero offline duration when online', () => {
        const sync = new MobileOfflineSync(defaultConfig);
        const state = sync.getState();
        expect(state.offlineDurationMs).toBe(0);
    });
});
