# ScreenRaid Receiver — releases & auto-update

## Mises à jour sans réinstaller

L’app embarque le plugin **Tauri Updater**. Au démarrage elle consulte
`https://github.com/StriikzLeLama/LamaWorlds_ScreenRaid/releases/latest/download/latest.json`.
Si une version plus récente est signée et publiée, elle **télécharge, installe et relance** toute seule.

Les utilisateurs qui ont déjà installé un build signé (NSIS) **n’ont pas besoin de réinstaller** :
il suffit de republier une release `client-v*` (ex. `client-v0.1.2`).

Prérequis côté éditeur :

1. Secret GitHub `TAURI_SIGNING_PRIVATE_KEY` (clé privée updater)
2. Tag + push → workflow `release-receiver.yml`
3. Publier la release draft sur GitHub

Les installs « portable » / copies manuelles de `.exe` hors NSIS peuvent ne pas recevoir l’updater.

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
   git add .github/workflows/release-receiver.yml client/src-tauri/tauri.release.conf.json
   git commit -m "fix(ci): release workflow config path on Windows"
   git push origin HEAD

   # Retag si le tag pointe déjà sur un commit cassé :
   git tag -d client-v0.1.2
   git push origin :refs/tags/client-v0.1.2
   git tag client-v0.1.2
   git push origin client-v0.1.2
   ```

   Le workflow `.github/workflows/release-receiver.yml` build l’installateur, signe les artefacts et crée une release draft sur GitHub.

   **Note Windows CI :** ne pas passer de JSON inline à `--config` (ça casse l’échappement). On merge `src-tauri/tauri.release.conf.json` à la place.

4. **Au démarrage**, l’app vérifie  
   `https://github.com/StriikzLeLama/LamaWorlds_ScreenRaid/releases/latest/download/latest.json`  
   et installe la mise à jour si une version plus récente est disponible.

## Serveur par défaut

Nouvelles installs et migration depuis `http://localhost:8080` :

`https://screenraid.lama-worlds.com`

Modifiable dans Receiver Settings → Server URL.
