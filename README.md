# ExpandedFavorites

ExpandedFavorites extends the built-in Discord GIF Favorites picker on Windows. Keep using the normal star button. Discord saves GIFs to your account whenever it has room, and ExpandedFavorites saves to your PC when the native capacity check rejects a GIF.

Open **GIF → Favorites** to see both sources together, newest first. Click the star again to remove a favorite. After you free space in your Discord account, the next new favorite goes to your account. Existing local favorites stay on your PC.

## Installation

### Windows installer

Download and run [ExpandedFavorites-Setup.exe](https://github.com/notjacobwashere/expandedfavorites/releases/latest/download/ExpandedFavorites-Setup.exe). Vencord must already be installed in the Windows Discord desktop app. The installer enables ExpandedFavorites and restarts any open supported Discord desktop clients. Closed clients stay closed.

This installer supports the official Vencord 1.15.18 build at revision `ce9355e`, plus existing builds that already contain ExpandedFavorites. It checks the installed files before replacing an official build. Use the custom-build steps below for other releases or for a build that includes other userplugins.

On a stock install, the installer saves the original Vencord build and settings in the backup folder it prints. It turns off Vencord's automatic updates because replacing the bundled files with a stock update removes the plugin. Update notifications stay enabled. To restore the original installation, close Discord, restore the backup's `dist` and `settings.json` to their original locations under `%APPDATA%\Vencord`, and reopen Discord. The installer is unsigned.

### Custom build

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

## Building the installer

The setup executable includes Vencord from [source revision ce9355e](https://github.com/Vendicated/Vencord/tree/ce9355e9a93e369c7295fa162ad563f7f97b1ff7), built with this userplugin using `pnpm build --standalone --dev`. Download `patcher.js`, `preload.js`, `renderer.js`, and `renderer.css` from [the matching official build](https://github.com/Vencord/builds/tree/67f791f8d6a30dfe3be491395aa58dd65840fe6a) into a separate stock directory. Run `installer\Build.ps1 -StockDirectory <stock> -BuildDirectory <Vencord-dist> -OutputFile ExpandedFavorites-Setup.exe` on 64-bit Windows to package the executable.
