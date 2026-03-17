import { type NormalizedFirehoseEvent } from '@patchwork/shared';
import { Pool, type PoolClient } from 'pg';

const DISCOVERY_EVENTS_TABLE = 'discovery_events';

const ensureDiscoveryEventsTableSql = `
CREATE TABLE IF NOT EXISTS ${DISCOVERY_EVENTS_TABLE} (
    event_id TEXT PRIMARY KEY,
    seq BIGINT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    uri TEXT NOT NULL,
    collection TEXT NOT NULL,
    author_did TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    payload JSONB,
    delete_reason TEXT,
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_events_seq
    ON ${DISCOVERY_EVENTS_TABLE} (seq ASC);
`;

const batchUpsertDiscoveryEventsSql = `
INSERT INTO ${DISCOVERY_EVENTS_TABLE} (
    event_id,
    seq,
    action,
    uri,
    collection,
    author_did,
    received_at,
    payload,
    delete_reason
)
SELECT
    UNNEST($1::text[]),
    UNNEST($2::bigint[]),
    UNNEST($3::text[]),
    UNNEST($4::text[]),
    UNNEST($5::text[]),
    UNNEST($6::text[]),
    UNNEST($7::timestamptz[]),
    UNNEST($8::text[])::jsonb,
    UNNEST($9::text[])
ON CONFLICT (event_id)
DO UPDATE SET
    seq = EXCLUDED.seq,
    action = EXCLUDED.action,
    uri = EXCLUDED.uri,
    collection = EXCLUDED.collection,
    author_did = EXCLUDED.author_did,
    received_at = EXCLUDED.received_at,
    payload = EXCLUDED.payload,
    delete_reason = EXCLUDED.delete_reason
`;

interface DiscoveryEventRow {
    event_id: string;
    seq: string | number;
    action: NormalizedFirehoseEvent['action'];
    uri: string;
    collection: NormalizedFirehoseEvent['collection'];
    author_did: string;
    received_at: string | Date;
    payload: NormalizedFirehoseEvent['payload'] | null;
    delete_reason: string | null;
}

export const toNormalizedFirehoseEvent = (
    row: DiscoveryEventRow,
): NormalizedFirehoseEvent => {
    return {
        eventId: row.event_id,
        seq: Number(row.seq),
        action: row.action,
        uri: row.uri,
        collection: row.collection,
        authorDid: row.author_did,
        receivedAt: new Date(row.received_at).toISOString(),
        payload: row.payload ?? undefined,
        deleteReason: row.delete_reason ?? undefined,
    };
};

const upsertDiscoveryEventsWithClient = async (
    client: PoolClient,
    events: readonly NormalizedFirehoseEvent[],
): Promise<void> => {
    if (events.length === 0) {
        return;
    }

    await client.query(batchUpsertDiscoveryEventsSql, [
        events.map(e => e.eventId),
        events.map(e => e.seq),
        events.map(e => e.action),
        events.map(e => e.uri),
        events.map(e => e.collection),
        events.map(e => e.authorDid),
        events.map(e => e.receivedAt),
        events.map(e => JSON.stringify(e.payload ?? null)),
        events.map(e => e.deleteReason ?? null),
    ]);
};

export const createPostgresPool = (connectionString: string): Pool => {
    return new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    });
};

export const ensureDiscoveryEventsTable = async (
    pool: Pool,
): Promise<void> => {
    await pool.query(ensureDiscoveryEventsTableSql);
};

export const loadDiscoveryEvents = async (
    pool: Pool,
): Promise<NormalizedFirehoseEvent[]> => {
    await ensureDiscoveryEventsTable(pool);
    const result = await pool.query<DiscoveryEventRow>(`
        SELECT
            event_id,
            seq,
            action,
            uri,
            collection,
            author_did,
            received_at,
            payload,
            delete_reason
        FROM ${DISCOVERY_EVENTS_TABLE}
        ORDER BY seq ASC, event_id ASC
    `);

    return result.rows.map(toNormalizedFirehoseEvent);
};

export const countDiscoveryEvents = async (pool: Pool): Promise<number> => {
    await ensureDiscoveryEventsTable(pool);
    const result = await pool.query<{ count: string }>(`
        SELECT COUNT(*)::TEXT AS count
        FROM ${DISCOVERY_EVENTS_TABLE}
    `);

    return Number(result.rows[0]?.count ?? '0');
};

export const appendDiscoveryEvents = async (
    pool: Pool,
    events: readonly NormalizedFirehoseEvent[],
): Promise<void> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(ensureDiscoveryEventsTableSql);
        await upsertDiscoveryEventsWithClient(client, events);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const replaceDiscoveryEvents = async (
    pool: Pool,
    events: readonly NormalizedFirehoseEvent[],
): Promise<void> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(ensureDiscoveryEventsTableSql);
        await client.query(`TRUNCATE TABLE ${DISCOVERY_EVENTS_TABLE}`);
        await upsertDiscoveryEventsWithClient(client, events);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
