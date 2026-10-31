# Signal · Local job-search website

React + TypeScript + Vite, with a small Node.js 24 HTTP server and embedded SQLite. The website runs on your own computer, stores data in the project folder, and needs no Tauri, Rust, Python, database server, or cloud account. Existing funding digests in `../weeks/` are unchanged.

For Windows on D:, see [中文启动说明](START_HERE.zh-CN.md).

## Current slice

- Eight working sidebar destinations with active states, keyboard focus, and responsive layout.
- Dashboard reads real aggregate counts through `GET /api/dashboard`, with loading, error, and retry states.
- SQLite migration with foreign keys, indexes, and constraints for companies, funding rounds, contacts, outreach, email drafts, resumes, projects, matches, and follow-ups.
- Remaining feature pages are explicitly scaffolded. Company entry, funding import, generation, matching, and reminder workflows are not implemented yet. Nothing sends email.

## Development

Use Node.js 24.x (its built-in `node:sqlite` supplies SQLite) and npm. From this `web` directory:

```sh
npm ci
npm run dev
```

This starts the API on loopback port 1421 and Vite on loopback port 1420. Open `http://127.0.0.1:1420` **on the same computer**. The Vite proxy forwards `/api` to the local backend. Ctrl+C stops both processes. `npm run dev:ui` alone starts only the frontend and cannot supply database counts.

## Run the built website

```sh
npm run build
npm start
```

Open `http://127.0.0.1:1421` on the computer running the server. This is a local website, not a published Internet address. Servers in a cloud task do not make your laptop's localhost work. The service binds only to `127.0.0.1` and rejects unrecognized Host headers; do not expose this personal-data scaffold to the Internet without a separate deployment/authentication design.

The Windows launcher `Start-Signal.cmd` calls `Start-Signal.ps1`. It requires the project to be on D:, downloads portable Node 24.19.0 from nodejs.org on first use, checks the official SHA-256 manifest, installs locked dependencies, builds the website, and starts it. Tools, npm cache, process temporary files, and database all use directories under the project on D:. It needs Internet access for the first setup, but does not install Node globally. The launcher prints five progress stages, keeps the CMD window open on exit, and saves diagnostics under `.cache/logs/`. Once the health endpoint confirms SQLite is connected, it opens Chrome with a separate profile/cache under the project on D:. `Open-Signal.cmd` remains available to reopen the browser. The launcher owns its server process and stops it when interrupted.

The Windows launchers have not been executed in this Linux environment. The Node/HTTP/SQLite workflow has been tested here. Windows itself, PowerShell, antivirus, and an already installed browser may still use system files on C:; the application cannot guarantee zero system-disk writes.

## Storage

By default, `data/signal.sqlite3` lives under this project, regardless of the shell's working directory. Override it with the absolute path `SIGNAL_DATA_DIR`; relative/empty values are rejected. An unavailable directory causes startup to fail, without a fallback to AppData. Default production port is 1421; `SIGNAL_PORT` can override it when running just the built server. Development's Vite proxy and the Windows browser launcher use 1421.

Migration 001 is applied transactionally and recorded using `PRAGMA user_version`. Existing records survive restart. A database created by a newer application version is rejected. Foreign keys are enabled per connection. No sample companies or personal documents are seeded. If you used an older desktop scaffold, close it and back up its database before copying it to the new selected data directory; no old data is moved or deleted automatically.

Amounts use integer minor units with an explicit currency. Funding dates use `YYYY-MM-DD`; future write endpoints should normalize timestamps to UTC ISO 8601 ending in `Z`. Match scores range from 0 to 100, and each match names exactly one resume or project with a rationale. Outreach protects linked company/contact history from deletion. Deleting outreach cascades its drafts, matches, and reminders. The current backend exposes only health and aggregate reads, not arbitrary SQL or filesystem operations.

Back up the entire `data` folder with the server stopped before upgrades. Its contents are private plain-text SQLite data and are ignored by Git. Resume uploads have not yet been built.

## Offline layout preview

```sh
npm run preview:export
```

Copy `dist/signal-preview.html` to any folder on D: and open that file in Chrome or Edge. Scripts and styles are embedded. This is a navigation/layout preview only: it does not connect to SQLite or save records. Use the full local website for SQLite.

## Validation

```sh
npm run build
npm test
npm run test:server
npm run test:schema
```

UI tests cover navigation, routes, offline layout state, real count rendering, and retry. Server tests execute the actual Node SQLite migration, persistence, aggregate queries, HTTP static/API routing, and access boundaries. Schema tests use Python 3's standard library as an optional developer check; Python is not needed to run the website. On Windows, `py -3 scripts/check_schema.py` is an alternative.

## Structure

```text
src/App.tsx                         Shell, routes, dashboard, placeholders
src/lib/database.ts                 Typed HTTP client
server/database.mjs                 Local storage, migrations, aggregate SQL
server/app.mjs                      HTTP API and built static website
server/index.mjs                    Server lifecycle and loopback binding
database/migrations/001_initial.sql Initial SQLite schema
scripts/dev.mjs                     Frontend + backend development runner
Start-Signal.cmd / .ps1             D-drive Windows setup/start
Open-Signal.cmd / .ps1              Separate D-drive Chrome profile
```

Next slice: company create/list/edit through validated API endpoints, followed by a source-preserving import of the existing funding digests.
