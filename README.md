# Vulcan Studio

Desktop and kiosk application for configuring Sourccey robots, teleoperation,
recording datasets, and running policies. The frontend is React/Next.js; Tauri
provides the native Rust backend. Robot operations run in the managed Python
environment under `modules/lerobot-vulcan`.

## Development setup

Install Git (with Git LFS), Bun, a Node.js version supported by `package.json`,
Rust, and uv. `.nvmrc` selects the project's Node.js version. Native Tauri builds
also require the platform's development tools, such as the Visual Studio C++
build tools on Windows.

Use Bun for package management. Commands such as `bun run build` can still invoke
Node.js through a CLI's shebang, so keep the installed Node.js runtime current.
The packaged app contains the static frontend and Rust executable; it does not
bundle a Node.js or Next.js server.

From the repository root:

```sh
bun install --frozen-lockfile
python setup/desktop/setup_dev.py --use-https
bun tauri dev
```

The desktop setup script prepares the robot Python environment and required
submodule. Add `--with-dataset-sync` only when working on the optional private
dataset-sync module. Copy `.env.example` to `.env` for local configuration;
never commit signing credentials or other secrets.

For frontend-only development, use `bun run dev`. Native robot commands require
the Tauri app.

## Checks

```sh
bun run lint
bun x tsc --noEmit
bun run test:all
```

`test:all` runs the frontend/build tests, setup tests, VR recording adapter tests,
and Rust tests. The recording tests require the Python environment prepared by
desktop setup. Individual suites are available as `bun run test`,
`bun run test:setup`, `bun run test:recording`, and `bun run test:rust`.

## Recording

In Robots > Record Data, enter a task and recording settings, enable VR recording,
and open the recording teleoperation connection. Connect the headset to the
desktop's LAN address using command port 5557 and observation port 5561.

Settings edited after connecting apply to the next batch. Invalid drafts block
new captures from both the desktop and headset. A batch already running keeps
its original settings.

Episode announcements match the stored indexes: a three-episode batch records
episodes **0, 1, 2**. Re-record discards the current attempt and repeats its index.
Headset Stop ends an episode; desktop Stop ends the batch. Leave enough disk
space for camera frames and video encoding.

The desktop adapter and protobuf schema live in `scripts/vr_recording`. Keep
`vulcan_vr_pb2.py` committed alongside its schema because packaged apps import it
without a protobuf compiler. Headset application changes belong to the separate
Unity repository.

## Builds and repository contents

`bun tauri build` uses the platform release flow. Official releases require
updater signing credentials and platform signing prerequisites; check them with
`bun run tauri:release:check`. See `scripts/build` for release implementation.

Generated frontend output, Cargo targets, local logs, Python caches, and `.env`
are ignored. The bundled Windows `uv.exe` is an intentional Git LFS resource.
Do not add local datasets, recordings, installers, or signing keys.

For Raspberry Pi kiosk setup and hardware mappings, see
[setup/kiosk/README.md](setup/kiosk/README.md) and the installers under
`setup/kiosk`.
