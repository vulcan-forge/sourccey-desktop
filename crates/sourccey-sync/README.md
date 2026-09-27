# Sourccey Sync

`sourccey-sync` is the headless companion process for Sourccey Desktop. It is
installed and versioned with the desktop application but runs independently,
without Tauri, React, or a webview.

## Current preparation slice

- Versioned dataset-completion event contract.
- A two-layer sharing policy: the user owns a single on/off consent switch and
  Vulcan owns the `all`, `metadata`, or `nothing` dataset policy.
- A stable, random `installation_id` generated on first sync-database creation.
  It is an identifier, not a secret or an authentication credential.
- Versioned admin-policy storage with monotonic updates and an explicit
  `applies_to_existing` flag for future policy rollouts.
- Atomic filesystem inbox for crash-safe desktop-to-sync handoff.
- Sync-process-owned SQLite database that remains inactive until the desktop
  persists the user's sharing choice. The bootstrap admin policy is `metadata`,
  but scanning does not begin before the user enables sharing.
- Persistent logical datasets, immutable metadata revisions, and independent
  metadata/full-dataset upload jobs.
- Dataset discovery restricted to direct, non-symlink children of the persisted
  `HF_LEROBOT_HOME/vulcan-studio` root.
- Reconciliation using `meta/info.json`, including missing-dataset detection.
- Idempotent dataset, revision, and upload-job creation.
- Background metadata uploads through the installation registration and cloud
  presign contract, with bounded retries and persisted upload results.
- User opt-out cancels all pending work. Admin-policy downgrades cancel work
  that is no longer allowed.
- A strict consent gate: inbox processing and dataset discovery do not run while
  sharing is `nothing`.
- A durable control inbox through which the desktop applies sharing and dataset
  root changes without writing the sync database directly.
- Single-instance background loop.
- Windows and Linux per-user startup registration commands.
- macOS startup boundary reserved for `SMAppService` in the signed app bundle.

The existing desktop metadata uploader remains available during migration.
`sourccey-sync` now executes its own metadata jobs; the older path should be
removed once packaging and rollout of the background process are complete.

The desktop privacy service publishes only the user's general sharing choice
whenever preferences are saved and again at desktop startup. It cannot set the
admin dataset policy. The effective level is always:

```text
user sharing disabled -> nothing
user sharing enabled  -> current Vulcan admin policy
```

This guarantees that an admin can restrict sharing but can never override a
user opt-out.

During the transition from the desktop-owned metadata uploader, desktop startup
also sends its existing installation ID to `sourccey-sync`. The sync service may
adopt that ID only before cloud enrollment, preventing one physical install from
appearing as two installations. Once enrolled, the ID is immutable.

## Installation and account identity

Each desktop install owns one stable UUID in `installation_identity`. Signing in
associates the current Vulcan account with that installation; signing out clears
the local association. One account can therefore own many installation IDs,
while each installation retains its own user consent state.

When optional sharing is enabled, registration includes the installation ID,
associated account ID, diagnostics consent, general data-sharing consent,
privacy notice version, and consent timestamp. A downgrade from a previously
enabled choice is also reported. The desktop does not submit the admin
`all`/`metadata`/`nothing` policy.

## Cloud policy boundary

The future backend flow should be:

1. `sourccey-sync` enrolls the public `installation_id` under the signed-in
   Vulcan account and receives a separate revocable device credential.
2. The service fetches a signed/authenticated policy document containing
   `policyId`, `version`, `level`, `appliesToExisting`, and `issuedAt`.
3. Only strictly newer versions are applied; replayed versions are idempotent
   and conflicting documents with the same version are rejected.
4. Each dataset revision records the effective policy ID/version that created
   its upload jobs for auditability.

Keep policy assignment account- or organization-scoped in the backend. Use the
installation ID to address a particular desktop installation and to revoke its
credential, not as the sole source of authorization. The desktop control inbox
must remain unable to submit admin policies.

## Development

From the repository root:

```powershell
bun tauri:dev:full
cargo check --manifest-path crates/Cargo.toml -p sourccey-sync
cargo test --manifest-path crates/Cargo.toml
cargo run --manifest-path crates/Cargo.toml -p sourccey-sync -- run --once
cargo run --manifest-path crates/Cargo.toml -p sourccey-sync -- status
cargo run --manifest-path crates/Cargo.toml -p sourccey-sync -- datasets
cargo run --manifest-path crates/Cargo.toml -p sourccey-sync -- reconcile
cargo run --manifest-path crates/Cargo.toml -p sourccey-sync -- upload-metadata
cargo run --manifest-path crates/Cargo.toml -p sourccey-sync -- set-user-sharing enabled
```

`bun tauri:dev` starts ordinary Tauri development. `bun tauri:dev:full` builds
and runs the sync service alongside Tauri; `bun tauri dev:full` is an equivalent
alias. When either process exits, the full launcher stops the other process so
a development sync service is not left behind.

The service stores its database and local state in the operating system's local
application-data directory. The dataset root defaults to
`<LeRobot home>/vulcan-studio`, following LeRobot's standard
`HF_LEROBOT_HOME`/`HF_HOME` cache resolution. `VULCAN_STUDIO_DATASET_ROOT` is an
optional override; relative values are resolved from LeRobot home. The resolved
path persists in `sync.sqlite3`; use `set-dataset-root` to change it. The selected
path must end in `vulcan-studio`.

### Testing a metadata upload

Start the full development stack, sign in, enable **Share robot data**, and save
the privacy settings. The desktop publishes the installation/account context,
consent state, and selected API environment to the background process. Confirm
that `status` reports `cloudConfigured: true`, then run:

```powershell
cargo run --manifest-path crates/Cargo.toml -p sourccey-sync -- upload-metadata
cargo run --manifest-path crates/Cargo.toml -p sourccey-sync -- datasets
```

The first command reconciles the configured `vulcan-studio` folder before
claiming up to 20 metadata jobs. Successful jobs become `uploaded`; failures
remain durable with exponential retry timing and are retried by the background
service. `VULCAN_DATASET_SYNC_API_BASE_URL` can temporarily override the API
endpoint for a development run.

## Next slices

1. Local named-pipe/Unix-socket protocol for live status and shutdown control.
2. Desktop recording-completion event submission.
3. Installation enrollment, authenticated policy fetch, and secure device
   credential storage outside the webview.
4. Installer bundling, update coordination, and macOS `SMAppService` support.
5. Resumable full-dataset uploads.

