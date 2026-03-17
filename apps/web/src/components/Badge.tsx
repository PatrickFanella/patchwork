import type { PropsWithChildren } from 'react';
import type { VerificationTier } from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Base Badge
// ---------------------------------------------------------------------------

interface BadgeProps {
    tone?: 'default' | 'neutral' | 'info' | 'danger' | 'success';
    /** Accessible label for screen readers when badge text alone is insufficient */
    'aria-label'?: string;
}

const toneMap: Record<NonNullable<BadgeProps['tone']>, string> = {
    default: 'bg-mh-accent3 text-mh-text',
    neutral: 'bg-mh-surfaceElev text-mh-text',
    info: 'bg-mh-accent2 text-mh-text',
    danger: 'bg-mh-danger text-white',
    success: 'bg-mh-success text-white',
};

export const Badge = ({
    children,
    tone = 'default',
    'aria-label': ariaLabel,
}: PropsWithChildren<BadgeProps>) => {
    return (
        <span
            role='status'
            aria-label={ariaLabel}
            className={[
                'inline-flex min-w-0 max-w-full break-all whitespace-normal rounded-full border border-mh-border px-2.5 py-1 text-xs font-semibold tracking-[0.01em]',
                toneMap[tone],
            ].join(' ')}
        >
            {children}
        </span>
    );
};

// ---------------------------------------------------------------------------
// Verification tier badge
// ---------------------------------------------------------------------------

const TIER_BADGE_CONFIG: Record<
    VerificationTier,
    { label: string; tone: NonNullable<BadgeProps['tone']>; icon: string }
> = {
    unverified: { label: 'Unverified', tone: 'neutral', icon: '\u25CB' }, // circle outline
    basic: { label: 'Basic', tone: 'default', icon: '\u25CF' }, // filled circle
    verified: { label: 'Verified', tone: 'info', icon: '\u2713' }, // check mark
    trusted: { label: 'Trusted', tone: 'success', icon: '\u2605' }, // star
    org_verified: { label: 'Org Verified', tone: 'success', icon: '\u2606\u2713' }, // star + check
};

interface VerificationBadgeProps {
    tier: VerificationTier;
    /** When true, shows a warning indicator next to the badge. */
    expiryWarning?: boolean;
    /** When true, shows an expired indicator instead of the normal badge. */
    expired?: boolean;
}

export const VerificationBadge = ({
    tier,
    expiryWarning = false,
    expired = false,
}: VerificationBadgeProps) => {
    const config = TIER_BADGE_CONFIG[tier];

    if (expired) {
        return (
            <span
                role="status"
                aria-label={`Verification expired (was ${config.label})`}
                className={[
                    'inline-flex min-w-0 max-w-full items-center gap-1 break-all whitespace-normal rounded-full border border-mh-border px-2.5 py-1 text-xs font-semibold tracking-[0.01em]',
                    toneMap.danger,
                ].join(' ')}
            >
                <span aria-hidden="true">{'\u26A0'}</span>
                {config.label} (expired)
            </span>
        );
    }

    return (
        <span
            role="status"
            aria-label={`Verification tier: ${config.label}${expiryWarning ? ' (renewal needed soon)' : ''}`}
            className={[
                'inline-flex min-w-0 max-w-full items-center gap-1 break-all whitespace-normal rounded-full border border-mh-border px-2.5 py-1 text-xs font-semibold tracking-[0.01em]',
                toneMap[config.tone],
            ].join(' ')}
        >
            <span aria-hidden="true">{config.icon}</span>
            {config.label}
            {expiryWarning && (
                <span
                    aria-hidden="true"
                    className="ml-1 text-yellow-500"
                    title="Renewal needed soon"
                >
                    {'\u23F0'}
                </span>
            )}
        </span>
    );
};
