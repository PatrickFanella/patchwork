import { Badge } from '../Badge';
import { Card } from '../Card';
import {
    resourceSurfaceDetail,
    resourceSurfacePreview,
    resourceSurfaceUiState,
} from './fixtures';

export const ResourceSurfaceCard = () => {
    return (
        <Card title='Resource directory'>
            <div className='flex flex-wrap gap-2'>
                <Badge
                    tone={
                        resourceSurfaceUiState.status === 'ready' ?
                            'success'
                        : resourceSurfaceUiState.status === 'error' ?
                            'danger'
                        :   'info'
                    }
                >
                    {resourceSurfaceUiState.status}
                </Badge>
                <Badge tone='neutral'>
                    {resourceSurfacePreview.cards.length} matching resources
                </Badge>
            </div>
            <p className='mt-3 text-sm text-mh-textMuted'>
                {resourceSurfaceUiState.message}
            </p>
            {resourceSurfaceDetail.open ? (
                <div className='mt-3 rounded-none border-2 border-mh-border bg-mh-surfaceElev p-3'>
                    <p className='text-sm font-bold text-mh-text'>
                        {resourceSurfaceDetail.title}
                    </p>
                    <p className='mt-1 text-xs text-mh-textSoft'>
                        {resourceSurfaceDetail.categoryLabel} ·{' '}
                        {resourceSurfaceDetail.openHours}
                    </p>
                </div>
            ) : null}
        </Card>
    );
};
