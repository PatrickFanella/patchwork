/**
 * Checkpoint storage abstractions for the indexer pipeline.
 *
 * A checkpoint records the last successfully processed firehose sequence
 * number so the pipeline can resume from where it left off after a restart.
 */

export interface CheckpointData {
    /** The highest firehose sequence number that was fully processed. */
    cursor: number;
    /** ISO-8601 timestamp of when this checkpoint was saved. */
    savedAt: string;
    /** Monotonically increasing sequence of checkpoint writes (1-based). */
    sequence: number;
}

export interface CheckpointHealth {
    /** Whether the checkpoint store is operational. */
    healthy: boolean;
    /** Seconds since the last checkpoint was saved, or null if never saved. */
    lagSeconds: number | null;
    /** The current checkpoint data, or null if none exists. */
    lastCheckpoint: CheckpointData | null;
}

export interface CheckpointStore {
    /**
     * Load the most recent checkpoint.
     * Returns null if no checkpoint has been saved yet.
     */
    load(): Promise<CheckpointData | null>;

    /**
     * Persist a checkpoint with the given cursor position.
     * Implementations must set savedAt and increment the sequence.
     */
    save(cursor: number): Promise<CheckpointData>;

    /**
     * Return health/lag information about the checkpoint store.
     */
    health(): Promise<CheckpointHealth>;
}
