# Project RuneCraft Deployment

This site is now ready for static hosting with a small admin board editor.

## Recommended Setup

1. Create a GitHub repository and upload this project.
2. Make sure `netlify.toml` exists at the repository root. It should publish the `runecraft_site` folder.
3. Deploy the repository to Netlify. The root `netlify.toml` publishes the `runecraft_site` folder and enables `netlify/functions`.

4. Add the environment variables used by the board editor:

   ```text
   ADMIN_TOKEN=shared-admin-password-for-this-low-stakes-tool
   GITHUB_TOKEN=github-fine-grained-token-with-contents-read-write
   GITHUB_REPO=dawi118/RuneCraft
   GITHUB_BRANCH=main
   BOARD_FILE_PATH=runecraft_site/data/board.json
   ```

5. Create `GITHUB_TOKEN` as a fine-grained GitHub token with read/write access to repository contents. Keep it server-side in Netlify only.
6. Share `ADMIN_TOKEN` only with low-stakes test admins who should be allowed to publish board changes.

When adding environment variables in Netlify, put only the value in the value field. For example, `GITHUB_TOKEN` should be set to the token string itself, not `GITHUB_TOKEN=...` or `Bearer ...`. If the admin page says "GitHub rejected GITHUB_TOKEN" or "Bad credentials", the admin token was accepted but GitHub rejected the server-side token value.

The public repository only documents environment variable names and placeholders. The real values stay in Netlify and are read server-side by the function. For a safer setup, make the GitHub token fine-grained, restrict it to this repository, grant only contents read/write, set an expiry date, and rotate it whenever an admin leaves or a token may have been exposed.

For Netlify, keep the site connected to the repository root. The root `netlify.toml` publishes `runecraft_site`, so the Netlify UI can leave the publish directory blank unless you want to override it manually.

## Editing Board Items

Admins visit:

```text
https://your-site-url/admin/
```

The board editor can add, edit, delete, import, and export board items. It keeps a browser draft while admins work, then writes `data/board.json` to GitHub through the Netlify Function when they save.

Each board item supports:

- Name
- Description
- Location: backlog, in progress, done
- Region
- Type: landscape, monument, building, infrastructure, other
- Progress percentage
- Estimated build time in hours
- Estimated time left, calculated from build time and progress
- Progress update
- Images
- Image captions

## Why this replaced Decap

The previous admin page used Decap CMS with the GitHub backend. That workflow depends on an OAuth/Git Gateway service; when that service is missing or misconfigured, the GitHub connection can return "Not Found". The current editor keeps the board's JSON source of truth, but moves GitHub writes into a small server-side function so the browser never needs a GitHub OAuth portal or a GitHub token.

## Grand Exchange Updates

The completed-build carousel is populated from the board data and uses the most recent five tickets marked `Done`.

The Substack carousel has local fallback cards. In production, Substack posts are read from:

```text
https://dhmorgan.substack.com/feed
```

Set `SUBSTACK_FEED_URL` in Netlify only if that changes.

## Donation Link

The donation button points to:

```text
https://gofund.me/7dc3fc541
```
