# ScreenRaid Receiver — releases & auto-update

## Tray (barre des tâches)

Fermer la fenêtre (X ou Alt+F4) **minimise dans la zone de notification** au lieu de quitter l’app.  
Clic gauche sur l’icône ou menu **Ouvrir ScreenRaid** pour réafficher. **Quitter** ferme vraiment l’app.

## Build `.exe` local (test)

```powershell
cd client
npm ci
npm run tauri:build
```

Installateur Windows :

- `client/src-tauri/target/release/bundle/nsis/ScreenRaid Receiver_*_x64-setup.exe`

## Mises à jour GitHub

1. **Clé de signature** (une fois) — déjà générée localement :
   - Privée : `client/screenraid-updater.key` (**ne jamais commit**)
   - Publique : embarquée dans `client/src-tauri/tauri.conf.json`

2. **Secret GitHub** `TAURI_SIGNING_PRIVATE_KEY`  
   Contenu du fichier `screenraid-updater.key` (Settings → Secrets → Actions).

3. **Publier une release** :

   ```bash
   git tag client-v0.1.1
   git push origin client-v0.1.1
   ```

   Le workflow `.github/workflows/release-receiver.yml` build l’installateur, signe les artefacts et crée une release draft sur GitHub.

4. **Au démarrage**, l’app vérifie  
   `https://github.com/StriikzLeLama/LamaWorlds_ScreenRaid/releases/latest/download/latest.json`  
   et installe la mise à jour si une version plus récente est disponible.

## Serveur par défaut

Nouvelles installs et migration depuis `http://localhost:8080` :

`https://screenraid.lama-worlds.com`

Modifiable dans Receiver Settings → Server URL.
