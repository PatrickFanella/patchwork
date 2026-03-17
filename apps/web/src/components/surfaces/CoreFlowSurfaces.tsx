import { FeedSurfaceCard } from './FeedSurfaceCard';
import { PostingSurfaceCard } from './PostingSurfaceCard';
import { ResourceSurfaceCard } from './ResourceSurfaceCard';
import { VolunteerSurfaceCard } from './VolunteerSurfaceCard';

export const CoreFlowSurfaces = () => {
    return (
        <section className='mt-10 border-t-2 border-mh-border pt-8'>
            <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
                <h1 className='font-heading text-3xl font-black uppercase tracking-tight sm:text-4xl'>
                    Core flow surfaces
                </h1>
                <p className='text-xs uppercase tracking-[0.12em] text-mh-textMuted'>
                    Feed · Posting · Resources · Volunteer
                </p>
            </div>

            <div className='grid gap-6 lg:grid-cols-2'>
                <FeedSurfaceCard />
                <PostingSurfaceCard />
                <ResourceSurfaceCard />
                <VolunteerSurfaceCard />
            </div>
        </section>
    );
};
