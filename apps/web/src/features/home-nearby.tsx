import { useEffect, useState, type MouseEvent } from 'react';
import { lookupPostalArea } from '@patchwork/at-lexicons';
import {
    defaultDiscoveryFilterState,
    serializeDiscoveryFilterState,
    type DiscoveryFilterState,
} from '../discovery-filters';
import {
    currentExactPublicAddress,
    type ResourceDirectoryCard,
} from '../resource-directory-ux';
import { webDataMode } from '../app/runtime';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { TextLink } from '../components/TextLink';
import { useLocale } from '../i18n';
import {
    fetchDirectoryCardPageFromApi,
    fetchFeedRecordPageFromApi,
} from './api-client';
import type { FeedRecordEnvelope } from './discovery-runtime';

const defaultRadiusMeters = 20000;
/** The same starting area the map uses when no place has been chosen. */
const defaultCenter = { lat: 41.885, lng: -87.623 };
const requestLimit = 2;
const placeLimit = 3;

interface NearbyExcerpt {
    requests: readonly FeedRecordEnvelope[];
    places: readonly ResourceDirectoryCard[];
    placeTotal: number;
}

interface HomeNearbyProps {
    discoveryState: DiscoveryFilterState;
    onPatchDiscovery: (patch: Partial<DiscoveryFilterState>) => void;
    onOpenMap: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * A short, live excerpt of what is listed around the visitor's area, so the
 * home page shows real requests and places instead of describing them.
 */
export const HomeNearby = ({
    discoveryState,
    onPatchDiscovery,
    onOpenMap,
}: HomeNearbyProps) => {
    const { t, fmt } = useLocale();
    const center = discoveryState.center ?? defaultCenter;
    const radiusMeters = discoveryState.radiusMeters ?? defaultRadiusMeters;
    const area = discoveryState.center
        ? (discoveryState.areaLabel ?? t('discovery.areaUnknown'))
        : t('mapExplorer.chicago');
    const [excerpt, setExcerpt] = useState<NearbyExcerpt>();
    const [failed, setFailed] = useState(false);
    const [zip, setZip] = useState(discoveryState.postalCode ?? '');
    const [zipError, setZipError] = useState(false);
    const directoryParams = new URLSearchParams(serializeDiscoveryFilterState(discoveryState));

    useEffect(() => {
        const controller = new AbortController();
        setExcerpt(undefined);
        setFailed(false);
        if (webDataMode === 'fixture') {
            void import('./fixtures').then(
                ({ fixtureFeedRecords, fixtureResourceCards }) => {
                    if (controller.signal.aborted) return;
                    setExcerpt({
                        requests: fixtureFeedRecords.slice(0, requestLimit),
                        places: fixtureResourceCards.slice(0, placeLimit),
                        placeTotal: fixtureResourceCards.length,
                    });
                },
            );
            return () => controller.abort();
        }
        const query: DiscoveryFilterState = {
            ...defaultDiscoveryFilterState,
            center: { lat: center.lat, lng: center.lng },
            radiusMeters,
            feedTab: 'nearby',
        };
        void Promise.all([
            fetchFeedRecordPageFromApi(query, 'feed', 1, controller.signal),
            fetchDirectoryCardPageFromApi(query, 1, controller.signal),
        ]).then(([requests, places]) => {
            if (controller.signal.aborted) return;
            if (!places.ok) {
                setFailed(true);
                return;
            }
            setExcerpt({
                // Requests are optional here; the places list still helps.
                requests: requests.ok
                    ? requests.data.items.slice(0, requestLimit)
                    : [],
                places: places.data.items.slice(0, placeLimit),
                placeTotal: places.data.total,
            });
        });
        return () => controller.abort();
    }, [center.lat, center.lng, radiusMeters]);

    const isEmpty =
        excerpt && excerpt.requests.length === 0 && excerpt.places.length === 0;

    return (
        <aside
            className='mh-nearby-card'
            aria-labelledby='home-nearby-heading'
            aria-busy={!excerpt && !failed}
        >
            <div className='mh-nearby-card__patches' aria-hidden='true'>
                <span />
                <span />
                <span />
                <span />
            </div>
            <p className='mh-kicker'>{t('dashboard.excerptEyebrow')}</p>
            <h2 id='home-nearby-heading' className='mh-nearby-card__title'>
                {t('dashboard.excerptTitle', { area })}
            </h2>
            {!discoveryState.center && (
                <p className='mh-nearby-card__note'>{t('dashboard.previewArea')}</p>
            )}
            <details className='mh-filter-disclosure mt-3'>
                <summary>{t('dashboard.changeArea')}</summary>
                <form
                    className='mt-2 grid gap-2'
                    onSubmit={event => {
                        event.preventDefault();
                        if (!lookupPostalArea(zip.trim())) {
                            setZipError(true);
                            return;
                        }
                        setZipError(false);
                        onPatchDiscovery({
                            postalCode: zip.trim(),
                            areaLabel: t('mapExplorer.zipArea', { zip: zip.trim() }),
                            radiusMeters: discoveryState.radiusMeters ?? defaultRadiusMeters,
                            feedTab: 'nearby',
                        });
                    }}
                >
                    <label htmlFor='home-area-zip' className='mh-field-label'>
                        {t('mapExplorer.zipLabel')}
                    </label>
                    <Input
                        id='home-area-zip'
                        inputMode='numeric'
                        autoComplete='postal-code'
                        maxLength={5}
                        pattern='[0-9]{5}'
                        required
                        value={zip}
                        onChange={event => {
                            setZip(event.target.value);
                            setZipError(false);
                        }}
                        errorMessage={zipError ? t('mapExplorer.zipError') : undefined}
                    />
                    <Button type='submit' size='sm'>
                        {t('experience.findArea')}
                    </Button>
                </form>
            </details>

            {failed ? (
                <p className='mh-nearby-card__note'>
                    {t('dashboard.excerptError')}
                </p>
            ) : !excerpt ? (
                <div aria-label={t('dashboard.excerptLoading')}>
                    {Array.from({ length: placeLimit }).map((_, index) => (
                        <div key={index} className='mh-nearby-card__row'>
                            <div className='mh-skeleton h-4 w-2/3' />
                            <div className='mh-skeleton mt-2 h-3 w-1/2' />
                        </div>
                    ))}
                </div>
            ) : isEmpty ? (
                <p className='mh-nearby-card__note'>
                    {t('dashboard.excerptEmpty')}
                </p>
            ) : (
                <>
                    {excerpt.requests.length > 0 ? (
                        <>
                            <h3 className='mh-nearby-card__group'>
                                {t('dashboard.excerptRequests')}
                            </h3>
                            <ul>
                                {excerpt.requests.map((record) => (
                                    <li
                                        key={record.aidPostUri}
                                        className='mh-nearby-card__row'
                                    >
                                        <TextLink
                                            href={`/requests/view?uri=${encodeURIComponent(record.aidPostUri)}`}
                                        >
                                            {record.card.title}
                                        </TextLink>
                                        <p>
                                            {t(
                                                `labels.${record.card.category}`,
                                                {
                                                    defaultValue:
                                                        record.card.category,
                                                },
                                            )}
                                            {' · '}
                                            {fmt.relativeTime(
                                                record.card.updatedAt,
                                            )}{' '}
                                            {record.recordOrigin ===
                                            'synthetic' ? (
                                                <Badge tone='neutral'>
                                                    {t(
                                                        'dashboard.excerptExample',
                                                    )}
                                                </Badge>
                                            ) : null}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : null}
                    {excerpt.places.length > 0 ? (
                        <>
                            <h3 className='mh-nearby-card__group'>
                                {t('dashboard.excerptPlaces')}
                            </h3>
                            <ul>
                                {excerpt.places.map((place) => (
                                    <li
                                        key={place.uri}
                                        className='mh-nearby-card__row'
                                    >
                                        <TextLink
                                            href={`/resources?${new URLSearchParams({ ...Object.fromEntries(directoryParams), resource: place.uri })}`}
                                        >
                                            {place.name}
                                        </TextLink>
                                        <p>
                                            {[
                                                currentExactPublicAddress(place)
                                                    ?.streetAddress ??
                                                    place.location?.areaLabel ??
                                                    place.serviceArea,
                                                place.distanceMeters !==
                                                undefined
                                                    ? fmt.distance(
                                                          place.distanceMeters,
                                                      )
                                                    : undefined,
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}{' '}
                                            {place.recordOrigin ===
                                            'synthetic' ? (
                                                <Badge tone='neutral'>
                                                    {t(
                                                        'dashboard.excerptExample',
                                                    )}
                                                </Badge>
                                            ) : place.recordOrigin === 'sourced-public' ? (
                                                <Badge tone='neutral'>{t('resources.publicSource')}</Badge>
                                            ) : null}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                            <p className='mh-nearby-card__note'>
                                {t('dashboard.excerptPlaceCount', {
                                    count: excerpt.placeTotal,
                                    distance: fmt.distance(radiusMeters),
                                })}
                            </p>
                        </>
                    ) : null}
                </>
            )}

            <div className='mh-nearby-card__actions'>
                <TextLink href='/map' onClick={onOpenMap}>
                    {t('dashboard.excerptOpenMap')}
                </TextLink>
                <TextLink href={`/resources?${directoryParams}`}>
                    {t('dashboard.excerptDirectory')}
                </TextLink>
            </div>
        </aside>
    );
};
