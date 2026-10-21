# Tauri + Vanilla TS

This template should help get you started developing with Tauri in vanilla HTML, CSS and Typescript.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

# Commands

## JavaScript runtime requirements

Use Bun for package management and the commands below. Next.js CLI entry points
target Node.js and may invoke the installed Node.js runtime through their
shebangs even when launched with `bun run`. Keep Node.js patched on development
and build machines; some Bun configurations run those commands with Bun instead.

The minimum versions for the supported Node.js release lines are **22.23.4**,
**24.22.1**, and **26.12.1**, following the
[October 2026 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
The `.nvmrc` file selects 22.23.4; with nvm, run `nvm install` and `nvm use`.
On Windows without nvm, update Node.js using the official installer, then open
a new terminal and verify `node --version` before building.

The packaged desktop app uses Tauri/Rust and the static frontend in `out/`;
it does not bundle Node.js or run a Next.js server. Updating `@types/node` or
the JavaScript dependency lockfile does not patch the Node.js executable.

Get the desktop app

```
bun tauri dev
```

Get the web app

```
bun dev
```

## Raspberry Pi Autostart Setup

To make the Sourccey app launch automatically on boot on your Raspberry Pi:

1. **Pull the latest code:**
   ```sh
   git pull origin your-feature-branch
   ```

2. **Run the setup script:**
   ```sh
   ./pi-setup/install-autostart.sh
   ```

3. **Reboot to test:**
   ```sh
   sudo reboot
   ```

The app will launch automatically in full-screen mode after each boot!

**Note:**
- You may need to adjust the username, project path, or binary name in `pi-setup/sourccey-app.service` if your setup is different.
- The setup script will install dependencies and build the Tauri app before enabling autostart.
