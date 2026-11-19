<img src="src/assets/tocae-wordmark.png" alt="Tocaê Reprodutor" width="320" />

# Tocaê Reprodutor

[Português (Brasil)](README.md) · **English**

Minimalist video player built with Electron, React and TypeScript. It opens a video and plays it without any fuss.

![Demo](.github/demo.png)

## Features

- Play a list of videos in sequence
- Reorder the playlist by dragging items or with the keyboard
- Jump between videos with single-key shortcuts
- Use the frameless main window with custom controls and rounded corners
- Watch portrait videos without cropping; zoom in and pan the enlarged image
- Preview frames on the timeline or skip forward and backward in 1-second intervals
- Switch between Portuguese (Brazil) and English at any time

## Project structure

- `src/features/player/`: playback, controls, zoom, previews and timeline navigation
- `src/features/playlist/`: playlist state and interface
- `src/components/`: reusable application components
- `src/lib/`: renderer utilities
- `shared/`: types, IPC contracts and translations shared with Electron
- `electron/`: main process, preload and system integration

The player preserves each video's aspect ratio, including portrait footage. Zoom can be panned with a mouse or touch and is constrained to the image bounds. Its compact, translucent controls adapt to narrow windows.

## Languages

The app follows the operating system language on first run and can be changed at any time from the selector in the top bar (also available in the *About* and *Shortcuts* windows).

Available languages: **Portuguese (Brazil)** and **English**. The choice is stored in `settings.json` in the app data directory; the *Follow system* option restores the automatic behaviour.

The texts live in `shared/i18n/messages/`, with the Portuguese catalogue as the source of truth for the keys: the English catalogue is typed from it, so a missing key breaks the build.

## Running from source

```sh
npm install
npm run dev      # Vite dev server
npm run build    # typecheck + bundle + .deb and .rpm packages
```

## Linux packages

The project is packaged for Linux only, as `.deb` (Debian/Ubuntu) and `.rpm` (Fedora/RHEL). `npm run build` writes the packages to `release/<version>/`; the architecture matches the machine that ran the build.

```sh
# Debian/Ubuntu
sudo apt install ./release/0.0.4/tocae-reprodutor_0.0.4_amd64.deb

# Fedora/RHEL
sudo dnf install ./release/0.0.4/tocae-reprodutor-0.0.4.x86_64.rpm
```

Building the `.rpm` requires `rpmbuild` (the `rpm` package on Debian/Ubuntu). The packages register the application in the menu, install the icons at the usual sizes and declare the Electron runtime dependencies. The metadata (category, maintainer, description and executable name) lives in `electron-builder.json5`.

## Versioning

The build workflow automatically creates the `v<version>` tag when the version in `package.json` changes on a push to `main`. If the tag already exists, nothing happens. The tag is only created after the package build succeeds.

## Author

[![João M J Braga](https://github.com/joaomjbraga.png?size=100)](https://github.com/joaomjbraga)

If you liked it, consider leaving a ⭐ on the repository!
