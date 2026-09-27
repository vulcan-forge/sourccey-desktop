# Sourccey Sync

`sourccey-sync` is the headless companion process for Sourccey Desktop. It is
installed and versioned with the desktop application but runs independently,
without Tauri, React, or a webview.

## Current preparation slice

- Versioned dataset-completion event contract.
- Three-state sharing policy: `all`, `metadata`, and `nothing`.
- Atomic filesystem inbox for crash-safe desktop-to-sync handoff.
- Sync-process-owned SQLite database with a metadata-by-default policy.
- Idempotent dataset and upload-job creation.
- Policy downgrades cancel disallowed queued work.
- Single-instance background loop.
- Windows and Linux per-user startup registration commands.
- macOS startup boundary reserved for `SMAppService` in the signed app bundle.

The current production metadata uploader remains unchanged. The desktop should
only switch to this process after local IPC, credential storage, packaging, and
cloud upload execution have been implemented.

## Development

From the repository root:

```powershell
cargo check --manifest-path crates/Cargo.toml -p sourccey-sync
cargo test --manifest-path crates/Cargo.toml
cargo run --manifest-path crates/Cargo.toml -p sourccey-sync -- run --once
cargo run --manifest-path crates/Cargo.toml -p sourccey-sync -- status
```

Set `SOURCCEY_SYNC_DATA_DIR` to isolate development data from the normal OS data
directory.

## Next slices

1. Local named-pipe/Unix-socket control protocol.
2. Desktop completion-event submission and sharing settings UI.
3. Device credential storage outside the webview.
4. Metadata upload execution using the existing cloud presign contract.
5. Installer bundling, update coordination, and macOS `SMAppService` support.
6. Resumable full-dataset uploads.

