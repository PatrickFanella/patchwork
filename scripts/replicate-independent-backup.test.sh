#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
mkdir -p "$tmpdir/bin" "$tmpdir/s3/source/source-bucket/private" "$tmpdir/work"
printf 'private-object-one' > "$tmpdir/s3/source/source-bucket/private/one.bin"
printf 'private-object-two' > "$tmpdir/s3/source/source-bucket/private/two.bin"

cat > "$tmpdir/bin/aws" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
profile=default
if [[ "${1:-}" == --profile ]]; then profile=$2; shift 2; fi
if [[ "${1:-}" == --endpoint-url ]]; then shift 2; fi
[[ "$1" == s3 ]]
operation=$2
source=$3
destination=$4
resolve() {
    if [[ "$1" == s3://* ]]; then
        printf '%s/%s/%s' "$FAKE_S3_ROOT" "$profile" "${1#s3://}"
    else
        printf '%s' "$1"
    fi
}
source_path=$(resolve "$source")
destination_path=$(resolve "$destination")
case "$operation" in
    cp)
        mkdir -p "$(dirname "$destination_path")"
        cp "$source_path" "$destination_path"
        ;;
    sync)
        mkdir -p "$destination_path"
        [[ ! -d "$source_path" ]] || cp -a "$source_path/." "$destination_path/"
        ;;
    *) exit 2 ;;
esac
EOF
chmod +x "$tmpdir/bin/aws"

printf 'database-content' > "$tmpdir/work/patchwork_20260807.dump"
(
    cd "$tmpdir/work"
    sha256sum patchwork_20260807.dump > patchwork_20260807.dump.sha256
)

export PATH="$tmpdir/bin:$PATH"
export FAKE_S3_ROOT="$tmpdir/s3"
export PATCHWORK_INDEPENDENT_BACKUP_URI=s3://backup-bucket/patchwork
export PATCHWORK_INDEPENDENT_BACKUP_PROFILE=destination
export PATCHWORK_ATTACHMENT_SOURCE_URI=s3://source-bucket/private
export PATCHWORK_ATTACHMENT_SOURCE_PROFILE=source
export PATCHWORK_INDEPENDENT_BACKUP_METRICS_FILE="$tmpdir/metrics/independent.prom"

result=$(bash "$repo_root/scripts/replicate-independent-backup.sh" \
    "$tmpdir/work/patchwork_20260807.dump")
[[ "$result" == *'"status":"success"'* ]]
grep -q 'patchwork_independent_backup_last_attempt_success.*} 1' \
    "$tmpdir/metrics/independent.prom"
find "$tmpdir/s3/destination/backup-bucket/patchwork/snapshots" \
    -name database.dump -size +0c | grep -q .
find "$tmpdir/s3/destination/backup-bucket/patchwork/snapshots" \
    -path '*/attachments/one.bin' -size +0c | grep -q .

printf 'bad checksum\n' > "$tmpdir/work/patchwork_20260807.dump.sha256"
if bash "$repo_root/scripts/replicate-independent-backup.sh" \
    "$tmpdir/work/patchwork_20260807.dump" >/dev/null 2>&1; then
    exit 1
fi
grep -q 'patchwork_independent_backup_last_attempt_success.*} 0' \
    "$tmpdir/metrics/independent.prom"
grep -q 'patchwork_independent_backup_last_success_timestamp_seconds' \
    "$tmpdir/metrics/independent.prom"
[[ "$(stat -c '%a' "$tmpdir/metrics/independent.prom")" == 644 ]]
