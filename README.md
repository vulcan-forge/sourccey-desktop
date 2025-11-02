# Tauri + Vanilla TS

This template should help get you started developing with Tauri in vanilla HTML, CSS and Typescript.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

# Commands

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
