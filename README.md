# Ablage (Desktop)

Persönliche Dokumentenablage als Electron-App für Windows. Port von `ablage` (Go + Next.js) ohne Server.

- Dateien liegen in einem frei wählbaren **Bibliotheksordner** (lokal oder `\\nas\share`), den die App selbst verwaltet.
- Texterkennung: PDF-Textlayer via pdf.js, Scans/Bilder via **Ollama-Vision-Modell**.
- Klassifikation via Ollama (Fallback: Stichwortregeln aus `categories.yaml`).
- Kategorien lassen sich in den Einstellungen bearbeiten. Umbenennen einer Hauptkategorie verschiebt die Dateien sofort.
- Volltextsuche mit SQLite FTS5 (`node:sqlite`, keine nativen Module).
- Physische Referenzen (Ordner-Code + Dokument-Code) für Papier, das im Ordner bleibt.

## Bibliotheksordner

```
<Bibliothek>/
  Eingang/                  wird überwacht (Polling, auch auf SMB)
    _Duplikate/  _Fehler/
  Dokumente/<Kategorie>/<Jahr>/<Datum>_<Absender>_<Titel>.pdf
  .ablage/meta/<id>.json    Metadaten je Dokument (Sidecar)
  .ablage/references.json   physische Referenzen
  .ablage/trash/            Papierkorb
```

Die SQLite-Datenbank liegt lokal in `%APPDATA%/Ablage/` und ist nur ein Index.
„Bibliothek neu einlesen“ baut sie vollständig aus den Sidecars neu auf.
Beim Wechsel des Bibliotheksordners passiert das automatisch.

## Ollama

Benötigt ein Textmodell (Standard `mistral`) und für Scans ein Vision-Modell (Standard `qwen2.5vl`):

```bash
ollama pull qwen2.5vl
```

URL und Modelle sind in den Einstellungen konfigurierbar.

## Entwicklung

Node ≥ 22. Unter Windows ausführen (oder WSLg).

```bash
npm install
npm run dev          # App mit Hot Reload
npm test             # Vitest
npm run test:e2e     # Playwright gegen die gebaute Electron-App
npm run typecheck
npm run build:win    # Portable-Exe + ZIP in dist/ (ohne wine baubar)
```

`ABLAGE_USER_DATA=<pfad>` startet mit separatem Profil (Settings, DB, Thumbnails).

## Struktur

| Pfad | Inhalt |
|---|---|
| `src/main/` | Electron-Main: DB, Bibliothek, Pipeline, Ollama, IPC |
| `src/preload/` | `contextBridge` für Hauptfenster und PDF-Worker |
| `src/renderer/src/` | React + shadcn/ui |
| `src/renderer/src/worker.ts` | versteckter Renderer: pdf.js-Text, Seiten-Rendering, Thumbnails |
| `src/shared/` | Typen und IPC-Vertrag (`AblageApi`) |
| `resources/categories.yaml` | Standard-Kategorien, beim ersten Start nach `%APPDATA%` kopiert |

Neuer IPC-Kanal: Methode in `AblageApi` + `channels` (`src/shared/ipc.ts`) ergänzen, Handler in `src/main/ipc.ts`.
