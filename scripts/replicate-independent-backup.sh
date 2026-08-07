#!/usr/bin/env bash
# Replicate a validated database archive and private-object snapshot to an
# independently configured S3-compatible destination, then read it back.

set -Eeuo pipefail
umask 077

archive=${1:?Usage: replicate-independent-backup.sh BACKUP.dump}
destination=${PATCHWORK_INDEPENDENT_BACKUP_URI:?Set PATCHWORK_INDEPENDENT_BACKUP_URI (s3://bucket/prefix)}
attachment_source=${PATCHWORK_ATTACHMENT_SOURCE_URI:?Set PATCHWORK_ATTACHMENT_SOURCE_URI}
destination_profile=${PATCHWORK_INDEPENDENT_BACKUP_PROFILE:?Set destination AWS profile}
source_profile=${PATCHWORK_ATTACHMENT_SOURCE_PROFILE:?Set attachment source AWS profile}
metrics_file=${PATCHWORK_INDEPENDENT_BACKUP_METRICS_FILE:-}
destination_endpoint=${PATCHWORK_INDEPENDENT_BACKUP_ENDPOINT:-}
source_endpoint=${PATCHWORK_ATTACHMENT_SOURCE_ENDPOINT:-}
sse=${PATCHWORK_INDEPENDENT_BACKUP_SSE:-AES256}

for command in aws sha256sum find sort diff date xargs; do
    command -v "$command" >/dev/null
done
[[ -r "$archive" && -s "$archive" && -r "${archive}.sha256" ]]
[[ "$destination" =~ ^s3://[^/]+(/.*)?$ && "$attachment_source" =~ ^s3://[^/]+(/.*)?$ ]]
[[ "$sse" == AES256 || "$sse" == aws:kms ]]

tmpdir=$(mktemp -d)
cleanup() { rm -rf "$tmpdir"; }
write_metrics() {
    local success=$1
    local last_success=${2:-}
    local now
    [[ -n "$metrics_file" ]] || return 0
    now=$(date +%s)
    install -d -m 0755 "$(dirname "$metrics_file")"
    {
        printf '# TYPE patchwork_independent_backup_last_attempt_success gauge\n'
        printf 'patchwork_independent_backup_last_attempt_success{project="patchwork",environment="staging"} %s\n' "$success"
        printf '# TYPE patchwork_independent_backup_last_attempt_timestamp_seconds gauge\n'
        printf 'patchwork_independent_backup_last_attempt_timestamp_seconds{project="patchwork",environment="staging"} %s\n' "$now"
        if [[ -n "$last_success" ]]; then
            printf '# TYPE patchwork_independent_backup_last_success_timestamp_seconds gauge\n'
            printf 'patchwork_independent_backup_last_success_timestamp_seconds{project="patchwork",environment="staging"} %s\n' "$last_success"
        fi
    } > "${metrics_file}.tmp"
    chmod 0644 "${metrics_file}.tmp"
    mv "${metrics_file}.tmp" "$metrics_file"
}
record_failure() {
    last_success=''
    if [[ -r "$metrics_file" ]]; then
        last_success=$(awk '/patchwork_independent_backup_last_success_timestamp_seconds/ {print $2}' "$metrics_file")
    fi
    write_metrics 0 "$last_success"
}
trap 'record_failure; cleanup' ERR
trap cleanup EXIT

(cd "$(dirname "$archive")" && sha256sum -c "$(basename "${archive}.sha256")")
archive_sha=$(awk 'NR == 1 {print $1}' "${archive}.sha256")
[[ "$archive_sha" =~ ^[0-9a-f]{64}$ ]]

aws_source=(aws --profile "$source_profile")
aws_destination=(aws --profile "$destination_profile")
[[ -z "$source_endpoint" ]] || aws_source+=(--endpoint-url "$source_endpoint")
[[ -z "$destination_endpoint" ]] || aws_destination+=(--endpoint-url "$destination_endpoint")

snapshot_id="$(basename "$archive" .dump)-$(date -u +%Y%m%dT%H%M%SZ)"
snapshot_uri="${destination%/}/snapshots/${snapshot_id}"
sse_args=(--sse "$sse")
if [[ "$sse" == aws:kms ]]; then
    kms_key=${PATCHWORK_INDEPENDENT_BACKUP_KMS_KEY_ID:?Set KMS key ID}
    sse_args+=(--sse-kms-key-id "$kms_key")
fi

"${aws_destination[@]}" s3 cp "$archive" "$snapshot_uri/database.dump" \
    "${sse_args[@]}" --metadata "sha256=${archive_sha}" --only-show-errors
"${aws_destination[@]}" s3 cp "${archive}.sha256" "$snapshot_uri/database.dump.sha256" \
    "${sse_args[@]}" --only-show-errors

"${aws_source[@]}" s3 sync "$attachment_source" "$tmpdir/source" --only-show-errors
(
    cd "$tmpdir/source"
    find . -type f -print0 | sort -z | xargs -0 -r sha256sum
) > "$tmpdir/source.manifest"
"${aws_destination[@]}" s3 sync "$tmpdir/source" "$snapshot_uri/attachments" \
    "${sse_args[@]}" --only-show-errors
"${aws_destination[@]}" s3 cp "$tmpdir/source.manifest" "$snapshot_uri/attachments.sha256" \
    "${sse_args[@]}" --only-show-errors

"${aws_destination[@]}" s3 cp "$snapshot_uri/database.dump" "$tmpdir/database.dump" --only-show-errors
printf '%s  %s\n' "$archive_sha" "$tmpdir/database.dump" | sha256sum -c -
"${aws_destination[@]}" s3 sync "$snapshot_uri/attachments" "$tmpdir/restored" --only-show-errors
(
    cd "$tmpdir/restored"
    find . -type f -print0 | sort -z | xargs -0 -r sha256sum
) > "$tmpdir/restored.manifest"
diff -u "$tmpdir/source.manifest" "$tmpdir/restored.manifest"

write_metrics 1 "$(date +%s)"
trap - ERR
printf '{"event":"independent-backup","status":"success","snapshot":"%s","database_sha256":"%s"}\n' \
    "$snapshot_uri" "$archive_sha"
