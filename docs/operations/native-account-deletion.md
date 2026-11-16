# Patchwork account deletion

Implements #246 using the existing account cleanup service. No PDS account
is deleted. Native Settings entry points belong to #302/#303.

`POST /account/delete` requires a current Patchwork session, an OAuth sign-in
within five minutes, `Idempotency-Key`, and JSON `{ "confirmDeletion": true }`.
Authority comes from the session; a supplied DID cannot select another account.
Browser callers also require the existing origin/CSRF checks. Bearer callers
use the same session repository. Cookie/bearer conflicts are rejected.

The public web entry is `/account/delete`, linked from Settings and the footer.
It explains scope and retention before offering sign-in and confirmation. It
sends the authenticated command and shows a confirmation without private data.
The legacy `/account/deactivate` contract remains available to installed callers.

Cleanup immediately removes account-owned data and notification targets and
revokes Patchwork/OAuth sessions. A response lost after commit can mean deletion
succeeded: revoked credentials cannot retrieve a receipt. A later sign-in is
blocked by the suppression hash; do not repeatedly submit or promise an
unauthenticated status lookup. Service retries are idempotent; matching command
receipts are bounded to seven days. After expiry the sweep discards the command
ID, timestamp and result, preserving the hash/status against resurrection.

Attachment rows enqueue durable original/derivative object-deletion jobs.
Worker failures retry, and a recreated worker can complete the same queue.
Backups expire under the deployment policy. Safety/audit and accounting
exceptions are described in the privacy policy. Federated AT copies remain
under the member's provider controls.

## Verification and limits

Disposable PostgreSQL: 26 tests passed across account privacy HTTP, retention,
session repository, attachment service, durable groups and durable chat. These
exercise synthetic accounts, real SQL and handler calls; object storage in the
attachment suite is a test double. Auth/CSRF/client/notification unit checks:
133 passed. The production web build, focused deletion browser journey and
automated accessibility scan passed; web/API typechecks passed. This does not establish live object-store deletion or independent
privacy review. Production accounts and services were not touched.

Migration 0048 bounds existing receipts and allows scrubbing command metadata.
Keep this migration before running the new retention worker. It preserves the
suppression rows consumed by login and indexer replay checks.
