import { Badge } from '../Badge';
import { Card } from '../Card';
import { feedSurfacePreview, toFeedSurfaceTone } from './fixtures';

export const FeedSurfaceCard = () => {
    return (
        <Card title='Feed lifecycle'>
            <ul className='space-y-3'>
                {feedSurfacePreview.cards.map(card => {
                    const presentation = feedSurfacePreview.presentations.find(
                        view => view.id === card.id,
                    );

                    if (!presentation) {
                        return null;
                    }

                    return (
                        <li
                            key={card.id}
                            className='rounded-none border-2 border-mh-border bg-mh-surfaceElev p-3'
                        >
                            <p className='text-sm font-bold text-mh-text'>
                                {card.title}
                            </p>
                            <div className='mt-2 flex flex-wrap gap-2'>
                                <Badge
                                    tone={toFeedSurfaceTone(
                                        presentation.statusBadge.tone,
                                    )}
                                >
                                    {presentation.statusBadge.label}
                                </Badge>
                                <Badge
                                    tone={toFeedSurfaceTone(
                                        presentation.urgencyBadge.tone,
                                    )}
                                >
                                    {presentation.urgencyBadge.label}
                                </Badge>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </Card>
    );
};
