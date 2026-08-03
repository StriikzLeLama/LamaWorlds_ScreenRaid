# ScreenRaid Receiver — releases & auto-update

**Production server URL:** `https://screenraid.app.lama-worlds.com` (Receiver Settings → Server URL).

## Updates without reinstalling

The app embeds the **Tauri Updater** plugin. On startup it checks  
`https://github.com/StriikzLeLama/LamaWorlds_ScreenRaid/releases/latest/download/latest.json`.  
If a newer signed build is published, it **downloads, installs, and restarts** automatically.

Users on a signed NSIS install **do not need to reinstall manually** — publish a `client-v*` tag (e.g. `client-v0.1.9`).

Publisher requirements:

1. GitHub secret `TAURI_SIGNING_PRIVATE_KEY` (updater private key)
2. Tag + push → workflow `release-receiver.yml`
3. Publish the draft release on GitHub

Portable / manual `.exe` copies may not receive auto-updates.

## System tray

Closing the window (X or Alt+F4) **minimizes to the notification area** instead of quitting.  
Left-click the tray icon or **Open ScreenRaid** in the menu to restore. **Quit** exits the app.

## Local `.exe` build (testing)

```powershell
cd client
npm ci
npm run tauri:build
```

Windows installer:

- `client/src-tauri/target/release/bundle/nsis/ScreenRaid Receiver_*_x64-setup.exe`

## GitHub releases

1. **Signing key** (one-time):
   - Private: `client/screenraid-updater.key` (**never commit**)
   - Public: embedded in `client/src-tauri/tauri.conf.json`

2. **GitHub secret** `TAURI_SIGNING_PRIVATE_KEY` — contents of `screenraid-updater.key`.

3. **Publish a release**:

   ```bash
   git tag client-v0.1.9
   git push origin client-v0.1.9
   ```

   Workflow `.github/workflows/release-receiver.yml` builds the installer, signs artifacts, and creates a draft GitHub release.

   **Windows CI note:** do not pass inline JSON to `--config`; merge `src-tauri/tauri.release.conf.json` instead.

4. On startup the app checks the latest `latest.json` from GitHub releases.

## Default server URL

No remote URL is baked in. Users enter their server in Receiver Settings → Server URL.  
For production use: **`https://screenraid.app.lama-worlds.com`**.
