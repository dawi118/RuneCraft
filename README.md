# Project RuneCraft

Project RuneCraft is a static fan website for Marc and David's Minecraft recreation of Gielinor, the world of Old School RuneScape. The site presents the project as a nostalgic build diary: visitors can learn what the project is, follow active and planned Minecraft builds, browse region progress, find social/support links, and submit ideas for future landmarks.

The app is built with plain HTML, CSS, and JavaScript. It does not require a JavaScript framework or build step. Project data for the build board lives in `runecraft_site/data/board.json`, with a custom admin editor available under `runecraft_site/admin/`.

## Key Features

- **Tabbed single-page site**: Tutorial Island, Lumber Yard, World Map, Grand Exchange, and Falador Party Room sections are shown through client-side tab navigation and URL hashes.
- **Project introduction**: The homepage explains the Minecraft and RuneScape inspiration behind the build, with custom pixel-style art and local RuneScape-inspired fonts.
- **Lumber Yard build board**: A kanban-style board groups build items into Backlog, In Progress, and Done.
- **Current build highlight**: The first in-progress board item is promoted as the current focus.
- **Detailed build logs**: Each board card can open a detail view with work notes, images, region/type metadata, estimated build time, and calculated time left.
- **JSON-driven content**: Board entries are loaded from `runecraft_site/data/board.json`, with bundled fallback data in `script.js` if the JSON request fails.
- **World map progress view**: Region chips show progress notes and percentage bars for Lumbridge, Varrock, Falador, and Ardougne.
- **Support and social area**: The Grand Exchange section includes Instagram, email, Substack, a completed-build carousel, a Substack carousel, and a GoFundMe donation link.
- **Idea email handoff and fan-requested features**: The Falador Party Room section opens an email draft for new suggestions, then shows board stories marked as fan requests.
- **Admin board editor**: The `/admin/` UI can add, edit, delete, import, and export Lumber Yard tickets. In production it saves board data and new uploads through a Netlify Function backed by Netlify Blobs, so content edits do not require a production redeploy.
- **Static hosting ready**: Netlify configuration and redirects are included for publishing the `runecraft_site` folder.

## Project Structure

```text
.
|-- README.md
|-- _redirects
|-- netlify.toml
|-- netlify/
|   `-- functions/
|       |-- board.js
|       `-- social-feed.js
`-- runecraft_site/
    |-- DEPLOY.md
    |-- index.html
    |-- script.js
    |-- styles.css
    |-- netlify.toml
    |-- admin/
    |   |-- admin.css
    |   |-- admin.js
    |   |-- config.yml       # legacy Decap reference, not loaded by the active editor
    |   `-- index.html
    |-- assets/
    |   |-- fonts/
    |   `-- img/
    `-- data/
        |-- approved-ideas.json
        `-- board.json
```

## Running Locally

Because the board loads `data/board.json` with `fetch`, run the site through a local web server instead of opening `index.html` directly.

1. Clone the repository:

   ```sh
   git clone https://github.com/dawi118/RuneCraft.git
   cd RuneCraft
   ```

2. Start a static server from the published site folder:

   ```sh
   cd runecraft_site
   python3 -m http.server 8000
   ```

3. Open the site in a browser:

   ```text
   http://localhost:8000/
   ```

4. Open the admin editor:

   ```text
   http://localhost:8000/admin/
   ```

The public site works locally with no install step. The admin editor also works locally for drafting, importing, and exporting board JSON. Publishing live data requires the Netlify Function and environment variables described below.

## Admin Editing Approach

The old `/admin/` page loaded Decap CMS with the GitHub backend. That is a good fit for a fuller CMS, but it needs a correctly configured OAuth or Git Gateway service; without that service the GitHub connection can land on a "Not Found" page.

For the low-stakes board workflow, this project now uses a smaller first-party editor:

- Admins edit the same `runecraft_site/data/board.json` data that the public board already reads.
- Drafts are saved in the admin's browser while they work.
- Production saves go through `netlify/functions/board.js`, which writes the live board JSON to Netlify Blobs by default.
- New admin-uploaded images are stored in Netlify Blobs and served by the same function, so they are available immediately without needing a new static deploy.
- Core site media such as the favicon, header logo, nav sprites, home hero map, world map art, Party Room art, and ticket fallback images can be replaced from the admin screen. These settings are saved in Netlify Blobs as `site-settings.json`.
- GitHub backup commits are optional. Set `BOARD_GITHUB_BACKUP=true` only if you want each board save mirrored to `runecraft_site/data/board.json`; the included Netlify ignore script skips data-only backup commits.
- The GitHub token never appears in browser JavaScript, and the admin token is not persisted in browser storage.

Set these environment variables in Netlify:

```text
ADMIN_TOKEN=shared-admin-password-for-this-low-stakes-tool
GITHUB_REPO=dawi118/RuneCraft
GITHUB_BRANCH=main
BOARD_FILE_PATH=runecraft_site/data/board.json
BOARD_STORAGE=blob
```

Only `ADMIN_TOKEN` is required for the default Blob-backed live board. Keep `BOARD_STORAGE=blob` or leave it unset to use Netlify Blobs. To force the older commit-based mode, set `BOARD_STORAGE=github` and configure `GITHUB_TOKEN`. To mirror Blob saves back to GitHub as a backup, set `BOARD_GITHUB_BACKUP=true` and configure `GITHUB_TOKEN`.

In Netlify, enter only the secret value in the value field. For example, if you use `GITHUB_TOKEN`, the value should be the token itself, not `GITHUB_TOKEN=...` or `Bearer ...`. The function trims those common paste mistakes, but a revoked, expired, or repo-restricted token will still be rejected by GitHub.

The names of these environment variables are safe to document publicly. The secret values live in Netlify and are only read by the serverless function at runtime. If GitHub backup mode is enabled, use a fine-grained GitHub token restricted to this repository's contents permission, give it an expiry date, and rotate it immediately if it is ever pasted into GitHub, chat, logs, or the browser.

The root `netlify.toml` also includes a build `ignore` command. If a future backup commit changes only `runecraft_site/data/board.json`, Netlify will skip the build. Build hooks and ordinary code changes still deploy normally.

When the board schema changes, call the board function with `PATCH` and the admin token to rewrite the live Blob board through the current normalizer:

```sh
curl -X PATCH https://your-site-url/.netlify/functions/board \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

The normalizer preserves unknown board, ticket, and image metadata so future fields such as `completedAt`, `carouselGroup`, or image `focalPoint` survive admin saves.

The admin "Site media" panel writes media overrides to the same Netlify Function using `?settings=1`. The public site fetches those settings at runtime and swaps any matching `data-media-key` images, so replacing sprites or page art does not require a redeploy after this feature is deployed.

## Grand Exchange Updates

The Grand Exchange page shows the latest completed build tickets from the board data. It takes the most recent five items marked `Done`, using the current board order because tickets do not currently store completion dates.

The Substack carousel calls `netlify/functions/social-feed.js` and renders only real feed items from the Project RuneCraft Substack:

```text
https://dhmorgan.substack.com
```

By default, the function checks `https://dhmorgan.substack.com/feed` for Project RuneCraft posts, including the live "Project Runecraft: Getting Started" article. Set `SUBSTACK_FEED_URL` in Netlify if the feed moves.

## Editing Build Board Content

Board content is stored in:

```text
runecraft_site/data/board.json
```

Each board item supports:

- `id`
- `name`
- `subtitle` (shown as Description in the editor)
- `location` (`backlog`, `progress`, or `done`)
- `region`
- `category`
- `progress`
- `fanRequest` (defaults to `false`)
- `estimatedTotalTime`
- `estimatedTimeLeft`
- `what`
- `images`

The same fields are exposed in the custom admin editor at `runecraft_site/admin/`. Use the `General` region for tickets that do not belong to a specific map region. When a ticket is moved to `done`, the editor and board API normalize its progress to `100`.

The admin image uploader accepts up to 10 images per ticket. JPEG, PNG, and WebP photos up to 10 MB are compressed in the browser before upload so the Netlify Function payload stays below the platform request limit.

## Community Idea Storage

The public Party Room page currently avoids storing visitor submissions on the site. The form opens an email draft to `projectrunecraft@gmail.com`, which keeps the static site from collecting personal data before there is a moderated, GDPR-aware submission workflow.

Good future storage options:

- **Netlify Forms**: Fastest fit for this Netlify site. Use spam filtering, a short retention period, a clear privacy notice, and manual review before marking accepted board stories as fan requests.
- **Supabase or another managed Postgres service**: Best fit if submissions need statuses, reviewer notes, deletion requests, audit logs, and an admin queue. Choose an EU region, enable row-level security, and store only the minimum contact details needed.
- **Hosted form tools such as Typeform or Google Forms**: Quick to launch, but check data processing terms, region controls, retention, access permissions, and export/deletion workflows before using them for public submissions.
- **GitHub issues or direct commits**: Not recommended for raw user submissions because inappropriate content and personal data can become public, cached, or difficult to erase.

For GDPR compliance, publish a privacy notice before collecting submissions, collect only the idea plus optional contact email, record consent for follow-up, protect the review queue behind admin authentication, reject or delete inappropriate submissions, and keep an approval step between raw submissions and the public "Your features we've taken on" carousel.

## Deployment

The root `netlify.toml` publishes `runecraft_site`, which is the recommended deployment target for Netlify.

For Netlify:

1. Connect the repository to Netlify.
2. Keep the repository root as the base directory.
3. Let `netlify.toml` set the publish directory to `runecraft_site`.
4. Configure `ADMIN_TOKEN` and `GITHUB_TOKEN` environment variables if the `/admin/` editor should publish content changes.

See `runecraft_site/DEPLOY.md` for the original deployment notes.
