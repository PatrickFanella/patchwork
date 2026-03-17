import { Badge, VerificationBadge } from '../Badge';
import { Card } from '../Card';
import { volunteerSurfacePreview } from './fixtures';

export const VolunteerSurfaceCard = () => {
    return (
        <Card title='Volunteer onboarding'>
            <div className='flex flex-wrap gap-2'>
                <Badge
                    tone={
                        volunteerSurfacePreview.profileComplete ?
                            'success'
                        :   'danger'
                    }
                >
                    {volunteerSurfacePreview.profileComplete
                        ? 'Profile complete'
                        : 'Profile incomplete'}
                </Badge>
                <Badge
                    tone={
                        volunteerSurfacePreview.fullyVerified ?
                            'success'
                        :   'info'
                    }
                >
                    {volunteerSurfacePreview.fullyVerified
                        ? 'Fully verified'
                        : 'Verification pending'}
                </Badge>
                <VerificationBadge
                    tier={volunteerSurfacePreview.verificationTier}
                    expiryWarning={volunteerSurfacePreview.renewalNeeded}
                    expired={volunteerSurfacePreview.verificationExpired}
                />
            </div>
            <p className='mt-3 text-sm text-mh-textMuted'>
                Approved {volunteerSurfacePreview.summary.approved} · Pending{' '}
                {volunteerSurfacePreview.summary.pending} · Rejected{' '}
                {volunteerSurfacePreview.summary.rejected}
            </p>
            {volunteerSurfacePreview.renewalNeeded && (
                <p className='mt-2 text-xs text-yellow-600'>
                    Your verification will expire soon. Please renew to
                    maintain your current trust tier.
                </p>
            )}
        </Card>
    );
};
