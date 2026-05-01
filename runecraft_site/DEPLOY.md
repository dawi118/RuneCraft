# Project RuneCraft Deployment

This site is now ready for static hosting with a small admin board editor.

## Recommended Setup

1. Create a GitHub repository and upload this project.
2. Make sure `netlify.toml` exists at the repository root. It should publish the `runecraft_site` folder.
3. Deploy the repository to Netlify. The root `netlify.toml` publishes the `runecraft_site` folder and enables `netlify/functions`.

4. Add the environment variables used by the board editor:

   ```text
   ADMIN_TOKEN=shared-admin-password-for-this-low-stakes-tool
   GITHUB_REPO=dawi118/RuneCraft
   GITHUB_BRANCH=main
   BOARD_FILE_PATH=runecraft_site/data/board.json
   BOARD_STORAGE=blob
   ```

5. Netlify Blobs is the recommended live data store. It lets ticket edits and image uploads go live through the function without creating Git commits or production deploys.
6. Share `ADMIN_TOKEN` only with low-stakes test admins who should be allowed to publish board changes.

GitHub commits are now optional. To keep an emergency source-control backup, add `GITHUB_TOKEN=github-fine-grained-token-with-contents-read-write` and `BOARD_GITHUB_BACKUP=true`. The included Netlify build ignore script skips data-only backup commits, so a board JSON backup should not publish a production deploy.

When adding environment variables in Netlify, put only the value in the value field. For example, if `GITHUB_TOKEN` is used, it should be set to the token string itself, not `GITHUB_TOKEN=...` or `Bearer ...`. If the admin page says "GitHub rejected GITHUB_TOKEN" or "Bad credentials", the admin token was accepted but GitHub rejected the server-side token value.

The public repository only documents environment variable names and placeholders. The real values stay in Netlify and are read server-side by the function. If GitHub backup mode is enabled, make the GitHub token fine-grained, restrict it to this repository, grant only contents read/write, set an expiry date, and rotate it whenever an admin leaves or a token may have been exposed.

For Netlify, keep the site connected to the repository root. The root `netlify.toml` publishes `runecraft_site`, so the Netlify UI can leave the publish directory blank unless you want to override it manually.

## Editing Board Items

Admins visit:

```text
https://your-site-url/admin/
```

The board editor can add, edit, delete, import, and export board items. It keeps a browser draft while admins work, then writes the live board JSON to Netlify Blobs through the Netlify Function when they save.

The Site media panel can replace core visual assets, including the favicon, header logo, navigation sprites, home hero image, map art, Party Room image, and carousel fallback images. Those media URLs are stored in Netlify Blobs as `site-settings.json`, while the uploaded image files themselves are stored in the uploads Blob store.

When a code change introduces new board metadata, migrate the live Blob board through the current normalizer:

```sh
curl -X PATCH https://your-site-url/.netlify/functions/board \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Unknown board, ticket, and image metadata is preserved by the normalizer, so future fields used for custom ticket behavior or carousels are not stripped by routine admin saves.

Each board item supports:

- Name
- Description
- Location: backlog, in progress, done
- Region
- Type: landscape, monument, building, infrastructure, other
- Fan request: yes/no
- Progress percentage
- Estimated build time in hours
- Estimated time left, calculated from build time and progress
- Progress update
- Images
- Image captions

Use the `General` region for tickets that do not belong to one map region. Moving a ticket to Done automatically saves its progress as 100%.

JPEG, PNG, and WebP photos up to 10 MB can be added in the admin editor; larger files are compressed in-browser before the Netlify Function receives them. GIF and SVG uploads must remain below the function-safe direct upload size.

## Why this replaced Decap

The previous admin page used Decap CMS with the GitHub backend. That workflow depends on an OAuth/Git Gateway service; when that service is missing or misconfigured, the GitHub connection can return "Not Found". The current editor keeps the board shape, but moves live writes into Netlify Blobs through a small server-side function so the browser never needs a GitHub OAuth portal or a GitHub token.

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
