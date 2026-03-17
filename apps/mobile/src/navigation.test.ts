import { describe, expect, it } from 'vitest';
import { MobileNavigationModel, MOBILE_TABS } from './navigation.js';

describe('MobileNavigationModel', () => {
    it('starts on the map tab with a single-entry stack', () => {
        const nav = new MobileNavigationModel(false);
        const state = nav.getState();

        expect(state.activeTab).toBe('map');
        expect(state.stack).toEqual(['map']);
        expect(state.params).toEqual({});
    });

    it('navigates to a public tab when unauthenticated', () => {
        const nav = new MobileNavigationModel(false);
        const result = nav.navigateToTab('feed');

        expect(result).toBe(true);
        expect(nav.getState().activeTab).toBe('feed');
    });

    it('rejects navigation to auth-required tab when unauthenticated', () => {
        const nav = new MobileNavigationModel(false);
        const result = nav.navigateToTab('inbox');

        expect(result).toBe(false);
        expect(nav.getState().activeTab).toBe('map');
    });

    it('allows navigation to auth-required tab when authenticated', () => {
        const nav = new MobileNavigationModel(true);
        const result = nav.navigateToTab('inbox');

        expect(result).toBe(true);
        expect(nav.getState().activeTab).toBe('inbox');
    });

    it('rejects navigation to invalid flow', () => {
        const nav = new MobileNavigationModel(true);
        const result = nav.navigateToTab('invalid' as never);

        expect(result).toBe(false);
    });

    it('pushes flows onto the stack', () => {
        const nav = new MobileNavigationModel(true);
        nav.navigateToTab('feed');
        nav.push('post', { id: 'post-123' });

        const state = nav.getState();
        expect(state.stack).toEqual(['feed', 'post']);
        expect(state.params).toEqual({ id: 'post-123' });
    });

    it('pops the stack on goBack', () => {
        const nav = new MobileNavigationModel(true);
        nav.navigateToTab('feed');
        nav.push('post');

        expect(nav.goBack()).toBe(true);
        expect(nav.getState().stack).toEqual(['feed']);
        expect(nav.getState().activeTab).toBe('feed');
    });

    it('returns false when goBack at root', () => {
        const nav = new MobileNavigationModel(true);
        expect(nav.goBack()).toBe(false);
    });

    it('handles deep link to /feed', () => {
        const nav = new MobileNavigationModel(true);
        const result = nav.handleDeepLink('/feed');

        expect(result).toBe(true);
        expect(nav.getState().activeTab).toBe('feed');
    });

    it('handles deep link to /post/:id with params', () => {
        const nav = new MobileNavigationModel(true);
        const result = nav.handleDeepLink('/post/abc-123');

        expect(result).toBe(true);
        expect(nav.getState().activeTab).toBe('post');
        expect(nav.getState().params).toEqual({ id: 'abc-123' });
    });

    it('handles deep link to /chat/:conversationId', () => {
        const nav = new MobileNavigationModel(true);
        const result = nav.handleDeepLink('/chat/conv-456');

        expect(result).toBe(true);
        expect(nav.getState().activeTab).toBe('chat');
        expect(nav.getState().params).toEqual({ conversationId: 'conv-456' });
    });

    it('returns false for unrecognized deep links', () => {
        const nav = new MobileNavigationModel(true);
        const result = nav.handleDeepLink('/unknown/path/here');

        expect(result).toBe(false);
    });

    it('navigates away from auth-required tab when user logs out', () => {
        const nav = new MobileNavigationModel(true);
        nav.navigateToTab('inbox');
        expect(nav.getState().activeTab).toBe('inbox');

        nav.setAuthenticated(false);
        expect(nav.getState().activeTab).toBe('map');
    });

    it('returns only public tabs when unauthenticated', () => {
        const nav = new MobileNavigationModel(false);
        const tabs = nav.getVisibleTabs();

        expect(tabs.every((tab) => !tab.requiresAuth)).toBe(true);
        expect(tabs.length).toBeLessThan(MOBILE_TABS.length);
    });

    it('returns all tabs when authenticated', () => {
        const nav = new MobileNavigationModel(true);
        const tabs = nav.getVisibleTabs();

        expect(tabs).toHaveLength(MOBILE_TABS.length);
    });

    it('handles deep link without leading slash', () => {
        const nav = new MobileNavigationModel(true);
        const result = nav.handleDeepLink('notifications');

        expect(result).toBe(true);
        expect(nav.getState().activeTab).toBe('notifications');
    });
});
