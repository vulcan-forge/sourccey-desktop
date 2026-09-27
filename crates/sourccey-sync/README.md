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
- User opt-out cancels all pending work. Admin-policy downgrades cancel work
  that is no longer allowed.
- A strict consent gate: inbox processing and dataset discovery do not run while
  sharing is `nothing`.
- A durable control inbox through which the desktop applies sharing and dataset
  root changes without writing the sync database directly.
- Single-instance background loop.
- Windows and Linux per-user startup registration commands.
- macOS startup boundary reserved for `SMAppService` in the signed app bundle.

The current production metadata uploader remains unchanged. The desktop should
only switch to this process after local IPC, credential storage, packaging, and
cloud upload execution have been implemented.

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
cargo run --manifest-path crates/Cargo.toml -p sourccey-sync -- set-user-sharing enabled
```

`bun tauri:dev` starts ordinary Tauri development. `bun tauri:dev:full` builds
and runs the sync service alongside Tauri; `bun tauri dev:full` is an equivalent
alias. When either process exits, the full launcher stops the other process so
a development sync service is not left behind.

Set `SOURCCEY_SYNC_DATA_DIR` to isolate development data from the normal OS data
directory.

The dataset root resolves from `SOURCCEY_DATASET_ROOT`, `HF_LEROBOT_HOME`, or
`HF_HOME`, then persists in `sync.sqlite3`. Use `set-dataset-root` to change it;
the selected path must end in `vulcan-studio`.

## Next slices

1. Local named-pipe/Unix-socket protocol for live status and shutdown control.
2. Desktop recording-completion event submission.
3. Installation enrollment, authenticated policy fetch, and secure device
   credential storage outside the webview.
4. Metadata upload execution using the existing cloud presign contract.
5. Installer bundling, update coordination, and macOS `SMAppService` support.
6. Resumable full-dataset uploads.

