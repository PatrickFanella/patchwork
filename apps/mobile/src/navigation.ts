/**
 * Mobile navigation model.
 *
 * Maps core mobile flows to a tab-based navigation structure.
 * Provides navigation state management and deep link resolution.
 */

import { CORE_MOBILE_FLOWS, type CoreMobileFlow } from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

export interface MobileTab {
    key: CoreMobileFlow;
    label: string;
    icon: string;
    requiresAuth: boolean;
}

export const MOBILE_TABS: readonly MobileTab[] = [
    { key: 'map', label: 'Map', icon: 'map-pin', requiresAuth: false },
    { key: 'feed', label: 'Feed', icon: 'list', requiresAuth: false },
    { key: 'post', label: 'Post', icon: 'plus-circle', requiresAuth: true },
    { key: 'inbox', label: 'Inbox', icon: 'mail', requiresAuth: true },
    { key: 'profile', label: 'Profile', icon: 'user', requiresAuth: true },
] as const;

// ---------------------------------------------------------------------------
// Navigation state
// ---------------------------------------------------------------------------

export interface MobileNavigationState {
    activeTab: CoreMobileFlow;
    stack: CoreMobileFlow[];
    params: Record<string, string>;
    isAuthenticated: boolean;
}

// ---------------------------------------------------------------------------
// Deep link patterns
// ---------------------------------------------------------------------------

export interface DeepLinkRoute {
    pattern: string;
    flow: CoreMobileFlow;
    extractParams: (path: string) => Record<string, string>;
}

const DEEP_LINK_ROUTES: readonly DeepLinkRoute[] = [
    {
        pattern: '/map',
        flow: 'map',
        extractParams: () => ({}),
    },
    {
        pattern: '/feed',
        flow: 'feed',
        extractParams: () => ({}),
    },
    {
        pattern: '/post/:id',
        flow: 'post',
        extractParams: (path: string) => {
            const segments = path.split('/').filter(Boolean);
            return { id: segments[1] ?? '' };
        },
    },
    {
        pattern: '/chat/:conversationId',
        flow: 'chat',
        extractParams: (path: string) => {
            const segments = path.split('/').filter(Boolean);
            return { conversationId: segments[1] ?? '' };
        },
    },
    {
        pattern: '/inbox',
        flow: 'inbox',
        extractParams: () => ({}),
    },
    {
        pattern: '/notifications',
        flow: 'notifications',
        extractParams: () => ({}),
    },
    {
        pattern: '/profile',
        flow: 'profile',
        extractParams: () => ({}),
    },
    {
        pattern: '/settings',
        flow: 'settings',
        extractParams: () => ({}),
    },
];

// ---------------------------------------------------------------------------
// Navigation model
// ---------------------------------------------------------------------------

export class MobileNavigationModel {
    private state: MobileNavigationState;

    constructor(isAuthenticated: boolean) {
        this.state = {
            activeTab: 'map',
            stack: ['map'],
            params: {},
            isAuthenticated,
        };
    }

    getState(): Readonly<MobileNavigationState> {
        return { ...this.state, stack: [...this.state.stack], params: { ...this.state.params } };
    }

    /**
     * Navigate to a tab. If the tab requires auth and the user is not
     * authenticated, navigation is rejected and the method returns false.
     */
    navigateToTab(flow: CoreMobileFlow): boolean {
        if (!CORE_MOBILE_FLOWS.includes(flow)) {
            return false;
        }

        const tab = MOBILE_TABS.find((t) => t.key === flow);
        if (tab?.requiresAuth && !this.state.isAuthenticated) {
            return false;
        }

        this.state.activeTab = flow;
        this.state.stack = [flow];
        this.state.params = {};
        return true;
    }

    /**
     * Push a flow onto the navigation stack (e.g., drill into detail).
     */
    push(flow: CoreMobileFlow, params: Record<string, string> = {}): boolean {
        if (!CORE_MOBILE_FLOWS.includes(flow)) {
            return false;
        }

        this.state.stack.push(flow);
        this.state.params = params;
        return true;
    }

    /**
     * Pop the navigation stack. Returns false if at root.
     */
    goBack(): boolean {
        if (this.state.stack.length <= 1) {
            return false;
        }

        this.state.stack.pop();
        const current = this.state.stack[this.state.stack.length - 1];
        if (current) {
            this.state.activeTab = current;
        }
        this.state.params = {};
        return true;
    }

    /**
     * Resolve a deep link path to a navigation action.
     * Returns true if the deep link was handled.
     */
    handleDeepLink(path: string): boolean {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;

        for (const route of DEEP_LINK_ROUTES) {
            const patternSegments = route.pattern.split('/').filter(Boolean);
            const pathSegments = normalizedPath.split('/').filter(Boolean);

            if (patternSegments.length !== pathSegments.length) {
                continue;
            }

            let matches = true;
            for (let i = 0; i < patternSegments.length; i++) {
                if (patternSegments[i]!.startsWith(':')) {
                    continue;
                }
                if (patternSegments[i] !== pathSegments[i]) {
                    matches = false;
                    break;
                }
            }

            if (matches) {
                const params = route.extractParams(normalizedPath);
                this.state.activeTab = route.flow;
                this.state.stack = [route.flow];
                this.state.params = params;
                return true;
            }
        }

        return false;
    }

    /**
     * Update authentication state. If the user becomes unauthenticated
     * while on an auth-required tab, navigate back to map.
     */
    setAuthenticated(isAuthenticated: boolean): void {
        this.state.isAuthenticated = isAuthenticated;

        if (!isAuthenticated) {
            const tab = MOBILE_TABS.find((t) => t.key === this.state.activeTab);
            if (tab?.requiresAuth) {
                this.navigateToTab('map');
            }
        }
    }

    /**
     * Get the tabs visible to the current user.
     */
    getVisibleTabs(): readonly MobileTab[] {
        if (this.state.isAuthenticated) {
            return MOBILE_TABS;
        }
        return MOBILE_TABS.filter((tab) => !tab.requiresAuth);
    }
}
