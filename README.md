# ExpandedFavorites

ExpandedFavorites extends the built-in Discord GIF Favorites picker on Windows. Keep using the normal star button. Discord saves GIFs to your account whenever it has room, and ExpandedFavorites saves to your PC when the native capacity check rejects a GIF.

Open **GIF → Favorites** to see both sources together, newest first. Click the star again to remove a favorite. After you free space in your Discord account, the next new favorite goes to your account. Existing local favorites stay on your PC.

## Installation

Use the Windows Discord desktop app with a [custom Vencord build](https://docs.vencord.dev/installing/custom-build/). The plugin integrates with Discord's GIF picker internals, so a Discord update can require a plugin update.

Version 1.0.0 was verified on Discord Canary 1.0.1353 with Vencord 1.15.17. The live check covered opening the picker, persisting and displaying a local favorite across reload, and unstarring it. The capacity and slot-recovery paths were tested with fixtures for Canary's native favorite action.

From your Vencord source directory, run these PowerShell commands:

```powershell
git clone https://github.com/notjacobwashere/expandedfavorites.git ..\expandedfavorites
New-Item -ItemType Directory -Force src\userplugins | Out-Null
Copy-Item ..\expandedfavorites\expandedFavorites.discordDesktop src\userplugins -Recurse
pnpm install --frozen-lockfile
pnpm build --dev
pnpm inject
```

Choose your Discord installation when prompted. Open **Settings → Vencord → Plugins**, enable **ExpandedFavorites**, and restart Discord. Rebuild and reinject from this same Vencord checkout to update the plugin.

## Local data

The plugin creates `expandedfavorites\favorites.txt` inside the Windows Documents folder on the first overflow save. The UTF-8 file has one JSON record per line. Each local GIF record stores its account ID, URLs, dimensions, format, and save sequence. An ordering record tracks the relative position of account favorites while that account has overflow. GIF media files are loaded from their original URLs, which may expire. The plugin stores the list on the current PC and filters it by Discord account.

Discord's existing favorites keep their displayed order when first recorded. Account GIFs first seen later, including favorites synced from another device, are placed according to when the plugin sees them.

## Uninstall

Disable ExpandedFavorites and restart Discord. To remove the plugin from your custom build, remove its directory from `src/userplugins`, then rebuild and reinject. Keep a copy of `favorites.txt` if you want to restore your local list after reinstalling. Removing the file erases the local list.

Licensed under GPL-3.0-or-later.
