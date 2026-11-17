# Repository Guidelines

## Project Structure & Module Organization

«Стикерборд» is a React + Vite + TypeScript application with a Fastify API and PostgreSQL/Drizzle persistence. Authentication, administration, profiles, shared notes, editable attachments, archives, and notification sounds are implemented. Local tests do not require a PostgreSQL service or Docker.

- `src/components/`: UI components; `Board.tsx` owns draggable groups, `StickyNote.tsx` renders notes, and `ReplyTape.tsx` decorates reply connections.
- `src/Workspace.tsx`, `directory.tsx`: authentication, workspace navigation, and server directory context.
- `src/App.tsx`, `useNotes.ts`, `api.ts`: board filters, note actions, API access, synchronization, and version conflicts.
- `src/components/NoteComposer.tsx`, `AttachmentPreview.tsx`: attachment selection, content deduplication, author editing, and image previews. `src/useNotificationSound.ts` owns notification audio and its per-account browser preference.
- `src/components/ArchiveView.tsx`, `src/archive.ts`, `src/archive.css`: archive stacks by board department, unfolding grids, and separate archived replies; account, admin, and profile components also live in `src/components/`.
- `src/types.ts`, `data.ts`, `storage.ts`, `legacy.ts`, `paper.ts`: models, demo fixtures, legacy local data, import, and seeded paper variation. Live notes come from the API.
- `src/styles.css`, `accounts.css`: interface styles; `src/paper.css`: paper materials and fastenings.
- `src/profile.css`, `src/components/PaperPattern.tsx`, `src/photo.ts`: profile previews, ten paper motifs, and browser photo preparation.
- `server/`: separate npm package with its own lockfile and TypeScript configuration. `src/modules/accounts/` owns access and accounts; `src/modules/stickers/routes.ts` owns shared notes and attachment mutations; `files.ts` streams uploads, validates formats/limits, hashes content, and reads stored files.
- `server/src/db/`: Drizzle schema, relations, and migration helpers; `server/drizzle/`: versioned SQL and metadata; `server/tests/`: server and deployment checks.
- `compose.yaml`, `deploy/`: VPS container configuration, explicit bootstrap override, and operating instructions. See `deploy/README.md` before deployment work.
- `public/assets/`: local avatars, textures, SVG resources, and `sounds/icq-uh-oh.mp3`. `docs/paper-materials.md` and `docs/notification-sound.md` record asset provenance and audio behavior.
- `tests/`: Playwright scenarios and session/database fixtures. Root `code.html` and the reference PNG are design inputs; `index.html` is the application entry point.
- `server/docs/accounts.md`, `shared-board.md`, `attachments.md`, `profile.md`, `database-schema.md`: account rules, shared-board behavior, attachment APIs/storage, personalization, and original schema design respectively.

## Build, Test, and Development Commands

Use Node.js 22.12+ or a current LTS release.

- `npm ci` and `npm --prefix server ci`: install the two packages from their lockfiles.
- `npm run dev`: start Vite on loopback, normally port 5173; `/api` proxies to port 3000.
- `npm run dev:local`: start a manual development workspace on `127.0.0.1:5175` with API on 3102, persistent PGlite in `.local/manual/postgres`, and attachments in `.local/manual/uploads`. Random admin credentials live in `.local/manual/local-admins.env`; existing `.env` files are not read or changed. The explicit local command applies migrations only to this dedicated local database. Restart this command after backend/schema changes. `server/scripts/` is excluded from production builds and images.
- `npm --prefix server run dev`: start the API. Real login and persistent notes require a configured database and applied migrations.
- `npm run build`: check TypeScript and generate `dist/`.
- `npm run preview`: serve the production build locally.
- `npm run test:e2e`: run browser tests; add `-- tests/reply-tape.spec.ts` to target reply connections.
- `npm run test:e2e -- tests/attachments.spec.ts tests/notification-sound.spec.ts tests/department-notifications.spec.ts`: target attachment editing/deduplication and notification behavior across department members.
- `npm --prefix server run typecheck`: check server source, tests, and Drizzle configuration.
- `npm --prefix server test`: build the server and run its tests, including PGlite PostgreSQL tests in memory.
- `npm --prefix server run build`: compile the production API into `server/dist/`.
- `npm --prefix server run db:generate`: generate an additive migration after schema changes; inspect the SQL and metadata.
- `npm --prefix server run db:migrate`: apply migrations only to an explicitly configured, known database.
- `npm --prefix server run admin:bootstrap`: explicitly create two administrators from `BOOTSTRAP_ADMIN_1_*` and `BOOTSTRAP_ADMIN_2_*`; existing accounts remain unchanged. See `server/docs/shared-board.md` for prerequisites.

In PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

## Coding Style & Naming Conventions

Use two-space indentation, single-quoted TypeScript strings, semicolons, and explicit type-only imports. Keep strict TypeScript checks passing. Name component files in PascalCase and helpers in camelCase. Use descriptive kebab-case CSS classes. Follow nearby formatting; no ESLint or Prettier configuration is installed. Keep user-facing labels in Russian.

## Testing Guidelines

Use Playwright files named `*.spec.ts` with descriptive Russian scenario names. Tests require installed Microsoft Edge; the configured server commands use Windows `npm.cmd`. Adapt those commands when testing elsewhere. Playwright starts isolated API/Vite servers on ports 3101/5174, resets in-memory fixtures between tests, uses a separate temporary upload directory, and runs with one worker. Reuse `tests/fixtures.ts` for real authenticated sessions or its unauthenticated fixture for login scenarios. The reset endpoint belongs only to `server/tests/browser-server.ts`; never expose it in production. No numerical coverage threshold is configured.

For frontend code changes, run the build and relevant browser tests. For server changes, run server typecheck and tests; cover authorization, validation, and persistence when affected. Cover dragging, overlapping layers, reply chains, controls, and reload persistence when affected. Inspect desktop/mobile screenshots for visual changes. Generated screenshots and reports are ignored artifacts. PGlite checks do not establish that Linux containers, persistent PostgreSQL, or backup restoration work; validate those separately before claiming deployment readiness.

Attachment changes must cover duplicate content under different names, replacement/removal, cancel without saving, combined retained/new file limits, foreign attachment IDs, stale revisions, cleanup after failure, and denial of other authors including administrators. Notification changes must cover all department recipients, an unrelated employee, first-load silence, batching, and saved sound preferences.

## Architecture Constraints

Preserve free positioning, overlap and active-group layering, keyboard dragging, and grouped reply movement. Do not change the coordinate model just to adjust decoration. Keep legacy `stickerboard:v1` readable: older notes without `paperSeed` receive a stable seed. Do not overwrite or delete that key during server synchronization. Keep its explicit JSON export and guarded import; do not silently publish another author's local notes.

Preserve the reference's textured, dimensional paper and varied folded or torn edges. Replies form a chain joined by matte cream paper tape; keep it clear of text and controls. Decorative elements must use `pointer-events: none`; keep text selectable and controls accessible.

Attachments support authenticated streaming uploads/downloads and image previews. Limit each note/reply to five files, 10 MiB per file and 25 MiB combined, including retained files during editing. Detect duplicate contents by SHA-256 on both client and server; migration `0005` adds nullable `attachments.content_hash` for compatibility with earlier uploads. Only authors may edit text and attachment sets; administrators cannot edit another author's files. Preserve revision checks and atomic metadata changes. Delete old physical files only after commit; clean new files on failure, keeping old files intact. Never use original filenames as storage paths or expose storage keys in DTOs. Preview only validated JPEG/PNG/GIF/WebP; force document downloads. Preserve the first-file `attachment` alias alongside the `attachments` array. See `server/docs/attachments.md` for API and crash-cleanup limitations.

Store attachments in `UPLOAD_DIR`, separate from public assets, and back up that directory together with the database. Keep Compose's uploads volume and Nginx's 26 MiB body limit with request buffering disabled, so uploads do not fill its limited tmpfs. Tests must never write to the manual workspace's database or upload directory.

Enforce access on the server, using session identity rather than client-supplied authors or roles. Administrators manage departments, accounts, and memberships; regular employees personalize their avatar and choose a preset paper style. Admin accounts are bootstrapped explicitly from env; the UI/API creates regular employees and does not promote roles. Bootstrap must not reset existing passwords. Preserve Argon2id password hashes, session cookies, Origin/CSRF checks, and bounded proxy trust.

Notes are shared server state, refreshed by polling. Preserve author-only text edits and restoration, admin-or-author archiving, sender/recipient mark permissions, revision conflict checks, and transactional group ordering. Archiving a root hides its thread without changing replies' own archive flags. Admins can purge filtered archived notes on one board at a time; deleting a root includes all replies and attachments. Profiles must not retroactively change stored note presets or origin departments. See `server/docs/shared-board.md` for recipient defaults and restoration rules.

Notifications count active unread notes/replies addressed personally or through current department membership, excluding the sender. Read/done marks are currently shared note state, not per-user read receipts. Audio uses the local classic ICQ recording at gain 0.42, enabled by default; explicit opt-out is stored per account in the browser. Polling pauses in hidden tabs. Desktop Web Push requires browser permission, VAPID keys and an active session; subscription endpoints are restricted to known push services and must be kept secret. Push messages contain no note text. When push is active, avoid replaying polling audio; a service worker coordinates a single open tab and uses a silent system notification. When no tab is open the operating system controls the notification sound. See README for setup and limitations.

Archive folders are grouped by the note's board, including general and inactive department boards. An explicitly archived reply is a standalone archive card with a short context link while its root is active; never render an active original as an archived card. When the root is archived, show matching replies in its thread, preserving each reply's independent archive status for restoration. Keep management buttons compact, touch-friendly, and clear of torn edges; do not stretch them across the whole note. Archive animations must respect reduced motion.

Profiles offer six male and six female illustrated avatars, an uploaded photo, ten paper presets, and four independent fastenings. Browser uploads are cropped/resized to 256px JPEG; the API limits size/dimensions and serves photos only to authenticated sessions. Keep photo bytes out of account/directory/note JSON responses. Paper and fastening are captured on note creation; replies retain the connecting tape.

Never edit applied migrations; add a new migration. Do not apply migrations to an unknown database or automatically on ordinary API startup. Keep existing `.env` files intact, use `.env.example` for documented settings, and keep credentials out of logs, source, images, and shell arguments. Local development does not require installing database services or deploying anything. Normal Compose API containers must not receive bootstrap passwords; use the explicit bootstrap override when requested.

## Commit & Pull Request Guidelines

This snapshot has no `.git` directory, so historical commit conventions cannot be verified. Use concise imperative subjects, such as `Refine reply tape texture`. Keep changes focused. PR descriptions should explain the behavior change, list validation commands/results, link relevant issues, and include screenshots for visual changes. Exclude `dist/`, `node_modules/`, `.local/`, upload directories, test reports, and `*.tsbuildinfo`.
