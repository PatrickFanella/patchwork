import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
    FirehoseConsumer,
    buildPhase3FixtureFirehoseEvents,
    buildPilotScenarioFirehoseEvents,
    loadApiConfig,
} from '@patchwork/shared';
import {
    appendDiscoveryEvents,
    countDiscoveryEvents,
    createPostgresPool,
    replaceDiscoveryEvents,
} from './discovery-events.js';

export interface SeedOptions {
    append: boolean;
    includePilotScenarios: boolean;
}

export interface SeedResult {
    insertedEvents: number;
    totalEventsInDatabase: number;
    appendMode: boolean;
}

const parseSeedOptions = (argv: readonly string[]): SeedOptions => {
    return {
        append: argv.includes('--append'),
        includePilotScenarios: !argv.includes('--phase3-only'),
    };
};

const buildSeedRawEvents = (includePilotScenarios: boolean): unknown[] => {
    const events = [...buildPhase3FixtureFirehoseEvents()];

    if (includePilotScenarios) {
        events.push(...buildPilotScenarioFirehoseEvents());
    }

    return events;
};

const resolveDatabaseUrl = (): string => {
    const config = loadApiConfig();
    const databaseUrl = config.API_DATABASE_URL ?? config.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error(
            'API_DATABASE_URL (or DATABASE_URL) must be set to seed Postgres.',
        );
    }

    return databaseUrl;
};

export const seedPostgresDiscoveryEvents = async (
    options: SeedOptions,
): Promise<SeedResult> => {
    const rawEvents = buildSeedRawEvents(options.includePilotScenarios);
    const consumer = new FirehoseConsumer();
    const ingestion = consumer.ingest(rawEvents);

    if (ingestion.failures.length > 0) {
        const firstFailure = ingestion.failures[0];
        throw new Error(
            `Fixture ingestion failed (${ingestion.failures.length} failures). First failure: ${firstFailure?.code ?? 'unknown'} ${firstFailure?.message ?? ''}`,
        );
    }

    const pool = createPostgresPool(resolveDatabaseUrl());

    try {
        if (options.append) {
            await appendDiscoveryEvents(pool, ingestion.normalizedEvents);
        } else {
            await replaceDiscoveryEvents(pool, ingestion.normalizedEvents);
        }

        const totalEventsInDatabase = await countDiscoveryEvents(pool);

        return {
            insertedEvents: ingestion.normalizedEvents.length,
            totalEventsInDatabase,
            appendMode: options.append,
        };
    } finally {
        await pool.end();
    }
};

const isExecutedDirectly =
    process.argv[1] !== undefined &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isExecutedDirectly) {
    const options = parseSeedOptions(process.argv.slice(2));

    seedPostgresDiscoveryEvents(options)
        .then(result => {
            console.log(
                `[api:db:seed] mode=${result.appendMode ? 'append' : 'replace'} inserted=${result.insertedEvents} total=${result.totalEventsInDatabase}`,
            );
        })
        .catch(error => {
            console.error('[api:db:seed] failed:', error);
            process.exitCode = 1;
        });
}
