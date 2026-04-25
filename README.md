# Project RuneCraft

Project RuneCraft is a static fan website for Marc and David's Minecraft recreation of Gielinor, the world of Old School RuneScape. The site presents the project as a nostalgic build diary: visitors can learn what the project is, follow active and planned Minecraft builds, browse region progress, find social/support links, and submit ideas for future landmarks.

The app is built with plain HTML, CSS, and JavaScript. It does not require a JavaScript framework or build step. Project data for the build board lives in `runecraft_site/data/board.json`, with a custom admin editor available under `runecraft_site/admin/`.

## Key Features

- **Tabbed single-page site**: Tutorial Island, Lumber Yard, World Map, Grand Exchange, and Falador Party Room sections are shown through client-side tab navigation and URL hashes.
- **Project introduction**: The homepage explains the Minecraft and RuneScape inspiration behind the build, with custom pixel-style art and local RuneScape-inspired fonts.
- **Lumber Yard build board**: A kanban-style board groups build items into Backlog, In Progress, and Done.
- **Current build highlight**: The first in-progress board item is promoted as the current focus.
- **Detailed build logs**: Each board card can open a detail view with the build rationale, work notes, images, progress, estimated total time, and time left.
- **JSON-driven content**: Board entries are loaded from `runecraft_site/data/board.json`, with bundled fallback data in `script.js` if the JSON request fails.
- **World map progress view**: Region chips show progress notes and percentage bars for Lumbridge, Varrock, Falador, and Ardougne.
- **Support and social area**: The Grand Exchange section includes placeholder social links, progress post cards, an optional blog note area, and a GoFundMe donation link.
- **Idea submission placeholder**: The Falador Party Room section includes a contact link and placeholder idea form for future community suggestions.
- **Admin board editor**: The `/admin/` UI can add, edit, delete, import, and export Lumber Yard tickets. In production it saves `runecraft_site/data/board.json` back to GitHub through a Netlify Function.
- **Static hosting ready**: Netlify configuration and redirects are included for publishing the `runecraft_site` folder.

## Project Structure

```text
.
|-- README.md
|-- _redirects
|-- netlify.toml
|-- netlify/
|   `-- functions/
|       `-- board.js
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

The public site works locally with no install step. The admin editor also works locally for drafting, importing, and exporting board JSON. Saving directly to GitHub requires the Netlify Function and environment variables described below.

## Admin Editing Approach

The old `/admin/` page loaded Decap CMS with the GitHub backend. That is a good fit for a fuller CMS, but it needs a correctly configured OAuth or Git Gateway service; without that service the GitHub connection can land on a "Not Found" page.

For the low-stakes board workflow, this project now uses a smaller first-party editor:

- Admins edit the same `runecraft_site/data/board.json` data that the public board already reads.
- Drafts are saved in the admin's browser while they work.
- Production saves go through `netlify/functions/board.js`, which commits the JSON to GitHub using a server-side token.
- The GitHub token never appears in browser JavaScript, and the admin token is not persisted in browser storage.

Set these environment variables in Netlify:

```text
ADMIN_TOKEN=shared-admin-password-for-this-low-stakes-tool
GITHUB_TOKEN=github-fine-grained-token-with-contents-read-write
GITHUB_REPO=dawi118/RuneCraft
GITHUB_BRANCH=main
BOARD_FILE_PATH=runecraft_site/data/board.json
```

Only `ADMIN_TOKEN` and `GITHUB_TOKEN` are required for the default repository path. For production beyond this testing setup, move admin auth to an identity provider or a hosted CMS/database with role-based access.

In Netlify, enter only the secret value in the value field. For example, the `GITHUB_TOKEN` value should be the token itself, not `GITHUB_TOKEN=...` or `Bearer ...`. The function trims those common paste mistakes, but a revoked, expired, or repo-restricted token will still be rejected by GitHub.

The names of these environment variables are safe to document publicly. The secret values live in Netlify and are only read by the serverless function at runtime. Use a fine-grained GitHub token restricted to this repository's contents permission, give it an expiry date, and rotate it immediately if it is ever pasted into GitHub, chat, logs, or the browser.

## Editing Build Board Content

Board content is stored in:

```text
runecraft_site/data/board.json
```

Each board item supports:

- `id`
- `name`
- `subtitle`
- `location` (`backlog`, `progress`, or `done`)
- `progress`
- `estimatedTotalTime`
- `estimatedTimeLeft`
- `why`
- `what`
- `images`

The same fields are exposed in the custom admin editor at `runecraft_site/admin/`.

## Deployment

The root `netlify.toml` publishes `runecraft_site`, which is the recommended deployment target for Netlify.

For Netlify:

1. Connect the repository to Netlify.
2. Keep the repository root as the base directory.
3. Let `netlify.toml` set the publish directory to `runecraft_site`.
4. Configure `ADMIN_TOKEN` and `GITHUB_TOKEN` environment variables if the `/admin/` editor should publish content changes.

See `runecraft_site/DEPLOY.md` for the original deployment notes.
