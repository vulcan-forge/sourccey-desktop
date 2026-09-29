# Temporary macOS release without an Apple Developer account

This flow creates a host-native macOS app with an ad-hoc code signature, an installer DMG, and a Tauri updater archive. It does not use an Apple certificate or notarization. Gatekeeper will require each user to approve the app manually the first time it is opened.

## Build on the Mac

Install the Xcode Command Line Tools, Bun, Rust, and `uv`, then install the project dependencies:

```sh
xcode-select --install
bun install --frozen-lockfile
```

Copy the project's `.env` file to the Mac. These non-Apple credentials are required because the release still produces cryptographically signed Tauri updater artifacts:

```dotenv
TAURI_SIGNING_PRIVATE_KEY=...
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=...
```

No `APPLE_*` variables are required. Run the preflight and build from the repository root:

```sh
bun run tauri:build:macos:adhoc --check
bun run tauri:build:macos:adhoc
```

The command intentionally creates a native build for the host Mac. An Apple Silicon Mac produces `aarch64` artifacts; an Intel Mac produces `x64` artifacts. Cross-target builds are rejected because the packaged `uv` executable must use the same architecture.

## Result

Artifacts are written below `src-tauri/target/release/bundle`:

- `dmg/VulcanStudio_<version>_<architecture>.dmg` is the installer to share.
- `macos/VulcanStudio_<version>_<architecture>.app.tar.gz` is the updater payload.
- The adjacent `.sig` file is the Tauri updater signature.

The build also updates the matching macOS entry in `public/latest.json`. Upload the DMG, updater archive, and updater signature first. Publish the reviewed `latest.json` to the updater endpoint last so clients cannot discover files that are not available yet.

## First launch for testers

After copying **Vulcan Studio** to Applications, the user should try to open it once. If macOS blocks it, open **System Settings > Privacy & Security**, find the message about Vulcan Studio, choose **Open Anyway**, and confirm **Open**.

This flow is only a temporary distribution path for trusted testers. Use `bun tauri build` after the Developer ID and notarization credentials are available; that command continues to use the verified signed release flow.
