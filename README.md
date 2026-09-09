# Gielinor: Reforged

**Gielinor, built by hand.** Marc and David’s recreation of Gielinor in Minecraft with Conquest Reforged.

An Astro/Netlify website with a photographic home page, place archive, atlas, build journal, gallery and first-party author workspace. The public site renders readable HTML and share metadata on the server. Routine publishing updates Netlify Blobs without a code deploy.

## Development

Requires Node 24.

```sh
npm ci
npm run dev
```

The development server uses port 4377. Stop it before production builds, because the Netlify development adapter manages its own build directory. After `npm run build`, `npm run preview` serves the compiled Netlify handler on port 4379; `node scripts/measure.mjs` records synthetic performance and screenshots. Public browsing works immediately from the preserved content snapshot. For local author access, set `SESSION_SECRET` and `ADMIN_MARC_TOKEN`/`ADMIN_DAVID_TOKEN` in the process environment before starting the server. See `.env.example` for deployment variables. Do not store real keys in source, browser storage or the example file.

```sh
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Browser tests start their own isolated server and content directory on port 4378. The test credentials are local fixtures; they cannot authenticate against production. `npm run verify` runs unit tests, the deployment build and browser tests together.

## Public routes

- `/` — home and latest real update
- `/explore/`, `/regions/misthalin/` — atlas and accessible place directory
- `/places/{slug}/`, `/builds/{legacy-id}/` — places and preserved original stages
- `/progress/` — filtered list/board, with optional project notes
- `/journal/`, `/journal/{slug}/`, `/rss.xml` — updates and reading links
- `/gallery/`, `/tours/through-draynor/` — curated photographs and a guided visit
- `/about/`, `/community/`, `/support/`, `/credits/`, `/privacy/`
- `/search/` — cross-site search and browser-local saved places
- `/admin/` — authenticated author workspace

Old `#tutorial`, `#lumber`, `#map`, `#exchange`, `#bonanza` and `#build-{id}` links redirect through an explicit fragment compatibility script. Missing records return HTTP 404.

## Author workflow

Choose a place, add or reuse photographs, write a title and note, preview at phone/desktop width, then publish. One update appears on the place, journal, home and region pages. Device autosave and private account drafts are separate and labelled accurately. The workspace includes place/pin editing, site settings, gallery curation, native dates, import/export, revision history, restore and field-level conflict resolution.

Publication uses conditional writes and strong verification. Unrelated edits merge; same-field conflicts preserve both versions. Images are decoded and validated server-side, with orientation correction, metadata removal and reusable WebP variants. Private drafts and idea/contact records never enter public API payloads, RSS, search or optional public backups.

The original `runecraft_site` source is retained as migration/rollback reference. It is no longer the publish directory. Its legacy mutation endpoint now returns a clear conflict after authentication, preventing old browser tabs from silently saving to a disconnected content store. Existing read/media paths remain available. The new workspace provides the retained editing, upload, import/export and recovery capabilities through `/api/`.

## Deployment, migration and limitations

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for the source snapshot, preservation inventory, data model, Netlify setup, staging isolation, migration rehearsal, rollback and verification boundaries. The root `netlify.toml` is the only active Netlify configuration; publish output is `dist` plus the adapter’s generated server function.

Idea submissions are closed until an author names a reviewer and chooses retention settings. Moderation, consented outcomes, duplicate protection, rate limits, pausing and deletion are implemented. No public game server, downloadable world, automatic email integration or event schedule is claimed.

The project remains an independent fan creation, not affiliated with Jagex, Mojang or Microsoft. See the public credits page for the builders, terrain credit, tools and font licences.
