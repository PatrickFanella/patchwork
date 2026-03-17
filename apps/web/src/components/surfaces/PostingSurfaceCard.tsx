import { Badge } from '../Badge';
import { Card } from '../Card';
import { postingSurfaceValidation } from './fixtures';

export const PostingSurfaceCard = () => {
    return (
        <Card title='Posting validation'>
            <p className='mb-3 text-sm text-mh-textMuted'>
                Geoprivacy + taxonomy checks run before creating aid records.
            </p>
            <div className='flex flex-wrap gap-2'>
                <Badge
                    tone={
                        postingSurfaceValidation.ok ? 'success' : 'danger'
                    }
                >
                    {postingSurfaceValidation.ok ? 'Valid draft' : 'Invalid'}
                </Badge>
                <Badge tone='neutral'>
                    {postingSurfaceValidation.ok
                        ? 'Ready to submit'
                        : 'Needs fixes'}
                </Badge>
            </div>
            <p className='mt-3 text-xs text-mh-textSoft'>
                Accessibility tags, location precision, and time window are
                normalized before payload creation.
            </p>
        </Card>
    );
};
