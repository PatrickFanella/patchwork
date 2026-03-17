import {
    meetsRoleLevel,
    type PlatformRole,
} from '@patchwork/shared';

export const publicRoutes = [
    '/map',
    '/feed',
    '/resources',
    '/volunteer',
    '/settings',
    '/moderation',
    '/inbox',
    '/notifications',
    '/scheduling',
    '/feedback',
    '/groups',
    '/legal/terms',
    '/legal/privacy',
    '/legal/community-guidelines',
] as const;

export type PublicRoute = (typeof publicRoutes)[number];

export interface ShellSection {
    route: PublicRoute;
    title: string;
    description: string;
    /**
     * Optional minimum PlatformRole required to see this section.
     * When omitted, the route is visible to all roles including anonymous.
     */
    requiresRole?: PlatformRole;
}

export const shellSections: readonly ShellSection[] = [
    {
        route: '/map',
        title: 'Map',
        description: 'Clustered, approximate-area discovery with quick triage.',
    },
    {
        route: '/feed',
        title: 'Feed',
        description: 'Latest + nearby request stream with lifecycle actions.',
    },
    {
        route: '/resources',
        title: 'Resources',
        description: 'Directory overlays and partner resources.',
    },
    {
        route: '/volunteer',
        title: 'Volunteer',
        description: 'Volunteer onboarding and profile management.',
        requiresRole: 'user',
    },
    {
        route: '/settings',
        title: 'Settings',
        description: 'Account settings, privacy controls, and data management.',
        requiresRole: 'user',
    },
    {
        route: '/moderation',
        title: 'Moderation',
        description: 'Moderator operations console for queue triage, policy actions, and audit review.',
        requiresRole: 'moderator',
    },
    {
        route: '/inbox',
        title: 'Inbox',
        description: 'Unified inbox for requests, assignments, messages, and alerts.',
        requiresRole: 'user',
    },
    {
        route: '/notifications',
        title: 'Notifications',
        description: 'Notification center with read/unread controls and channel preferences.',
        requiresRole: 'user',
    },
    {
        route: '/scheduling',
        title: 'Scheduling',
        description: 'Calendar, availability windows, and volunteer shift management.',
        requiresRole: 'volunteer',
    },
    {
        route: '/feedback',
        title: 'Feedback',
        description: 'Post-handoff outcome feedback and reporting.',
        requiresRole: 'user',
    },
    {
        route: '/groups',
        title: 'Groups',
        description: 'Public and private group coordination spaces for neighborhoods and request teams.',
        requiresRole: 'user',
    },
    {
        route: '/legal/terms',
        title: 'Terms of Service',
        description: 'Platform terms of service and user agreement.',
    },
    {
        route: '/legal/privacy',
        title: 'Privacy Policy',
        description: 'How we collect, use, and protect your data.',
    },
    {
        route: '/legal/community-guidelines',
        title: 'Community Guidelines',
        description: 'Expected behaviour, prohibited content, and enforcement.',
    },
];

export const isPublicRoute = (value: string): value is PublicRoute => {
    return publicRoutes.includes(value as PublicRoute);
};

/**
 * Return only the shell sections visible to the given platform role.
 * Sections with no `requiresRole` are visible to everyone.
 */
export function getVisibleRoutes(role: PlatformRole): readonly ShellSection[] {
    return shellSections.filter((section) => {
        if (!section.requiresRole) {
            return true;
        }
        return meetsRoleLevel(role, section.requiresRole);
    });
}
