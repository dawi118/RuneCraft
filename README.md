# Project RuneCraft

Project RuneCraft is a static fan website for Marc and David's Minecraft recreation of Gielinor, the world of Old School RuneScape. The site presents the project as a nostalgic build diary: visitors can learn what the project is, follow active and planned Minecraft builds, browse region progress, find social/support links, and submit ideas for future landmarks.

The app is built with plain HTML, CSS, and JavaScript. It does not require a JavaScript framework or build step. Project data for the build board lives in `runecraft_site/data/board.json`, with a Decap CMS admin interface available under `runecraft_site/admin/`.

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
- **Admin CMS**: Decap CMS is configured to edit the Lumber Yard board JSON using the GitHub backend.
- **Static hosting ready**: Netlify configuration and redirects are included for publishing the `runecraft_site` folder.

## Project Structure

```text
.
|-- README.md
|-- _redirects
|-- netlify.toml
`-- runecraft_site/
    |-- DEPLOY.md
    |-- index.html
    |-- script.js
    |-- styles.css
    |-- netlify.toml
    |-- admin/
    |   |-- config.yml
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

The public site works locally with no install step. The admin editor loads Decap CMS from a CDN and is configured for the GitHub backend, so publishing CMS edits requires a supported OAuth/hosting setup and write access to `dawi118/RuneCraft`.

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

The same fields are exposed in the Decap CMS admin configuration at `runecraft_site/admin/config.yml`.

## Deployment

The root `netlify.toml` publishes `runecraft_site`, which is the recommended deployment target for Netlify.

For Netlify:

1. Connect the repository to Netlify.
2. Keep the repository root as the base directory.
3. Let `netlify.toml` set the publish directory to `runecraft_site`.
4. Configure GitHub authentication/OAuth for Decap CMS if the `/admin/` editor should publish content changes.

See `runecraft_site/DEPLOY.md` for the original deployment notes.
