#!/usr/bin/env python3
"""Retire only the approved browser fixtures' block, retaining a recovery audit."""
import datetime
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import uuid


def fixture_pair(accounts, today):
    dids = []
    for role in ('helper', 'requester'):
        account = accounts[role]
        if (account.get('purpose') != 'Patchwork deployment browser tests'
                or not re.fullmatch(r'did:plc:[a-z2-7]{24}', account.get('did', ''))
                or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', account.get('review_by', ''))
                or account['review_by'] < today):
            raise ValueError('Unapproved or expired staging browser fixture.')
        dids.append(account['did'])
    if dids[0] == dids[1]:
        raise ValueError('Staging browser fixtures must be distinct.')
    return tuple(dids)


def sql(query):
    result = subprocess.run([
        'docker', 'exec', '-i', 'patchwork-staging-postgres', 'sh', '-c',
        'psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ], input=query, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Staging fixture database operation failed; private diagnostics withheld.')
    return json.loads(result.stdout)


def reset(run_id='manual'):
    os.umask(0o077)
    if os.geteuid() != 0 or not re.fullmatch(r'manual|[0-9]+', run_id):
        raise ValueError('Root and a valid staging run identifier are required.')
    path = Path('/etc/patchwork/e2e-accounts/accounts.json')
    metadata = path.stat()
    if metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) != 0o600:
        raise ValueError('Staging account store must be root-owned and mode 0600.')
    now = datetime.datetime.now(datetime.timezone.utc)
    helper, requester = fixture_pair(json.loads(path.read_text()), now.date().isoformat())
    inspected = subprocess.run(['docker', 'inspect', 'patchwork-staging-postgres'], capture_output=True, text=True, check=True)
    labels = json.loads(inspected.stdout)[0]['Config']['Labels']
    if labels.get('com.docker.compose.project') != 'patchwork' or labels.get('com.docker.compose.service') != 'postgres':
        raise ValueError('Refusing a different staging database container.')
    # Both identities passed the strict DID alphabet above before SQL interpolation.
    scope = f"blocker_did = '{helper}' AND subject_did = '{requester}' AND deleted_at IS NULL"
    rows = sql(f"SELECT COALESCE(json_agg(b), '[]'::json) FROM user_blocks b WHERE {scope};")
    if not rows:
        print('Staging test-account block cleanup: 0 active fixture blocks.')
        return
    if len(rows) != 1 or rows[0]['reason'] != 'Blocked from a discovered aid request.':
        raise ValueError('Refusing an unexpected block between staging fixtures.')
    block_id = rows[0]['block_id']
    if type(block_id) is not int or block_id < 1:
        raise ValueError('Invalid staging fixture block identifier.')
    audit_dir = Path('/var/lib/patchwork/releases/e2e-block-cleanup')
    audit_dir.mkdir(mode=0o700, exist_ok=True)
    if audit_dir.stat().st_uid != 0 or stat.S_IMODE(audit_dir.stat().st_mode) != 0o700:
        raise ValueError('Staging fixture recovery directory must be root-owned and mode 0700.')
    audit = audit_dir / f'{now.strftime("%Y%m%dT%H%M%SZ")}-{uuid.uuid4().hex}.json'
    record = {'runId': run_id, 'recordedAt': now.isoformat(), 'before': rows}
    with audit.open('x') as output:
        json.dump(record, output)
        output.flush()
        os.fsync(output.fileno())
    retired = sql(f"""WITH retired AS (
        UPDATE user_blocks SET deleted_at = '{now.isoformat()}'
        WHERE {scope} AND block_id = {block_id}
          AND reason = 'Blocked from a discovered aid request.'
        RETURNING block_id
    ) SELECT COALESCE(json_agg(block_id), '[]'::json) FROM retired;""")
    with audit.with_suffix('.result.json').open('x') as output:
        json.dump({'runId': run_id, 'retiredIds': retired}, output)
    print(f'Staging test-account block cleanup: {len(retired)} fixture block retired; private recovery audit retained.')


if __name__ == '__main__':
    try:
        reset(sys.argv[1] if len(sys.argv) == 2 else 'manual')
    except Exception:
        print('Staging fixture cleanup refused or failed; private diagnostics withheld.', file=sys.stderr)
        sys.exit(1)
