# Project RuneCraft Deployment

This site is now ready for static hosting with an admin CMS.

## Recommended Setup

1. Create a GitHub repository and upload this project.
2. Make sure `netlify.toml` exists at the repository root. It should publish the `runecraft_site` folder.
3. Edit `runecraft_site/admin/config.yml` and replace:

   ```yaml
   repo: YOUR_GITHUB_USERNAME/YOUR_REPO_NAME
   ```

   with the real repository, for example:

   ```yaml
   repo: marc-and-david/project-runecraft
   ```

4. Deploy the repository to Netlify, Vercel, Cloudflare Pages, or GitHub Pages.
5. For Decap CMS editing at `/admin`, use a host/OAuth setup that supports the GitHub backend. Only GitHub users with write access to the repository can publish board changes.
6. Add admins by inviting them as GitHub collaborators with write access.

For Netlify, keep the site connected to the repository root. The root `netlify.toml` publishes `runecraft_site`, so the Netlify UI can leave the publish directory blank unless you want to override it manually.

## Editing Board Items

Admins visit:

```text
https://your-site-url/admin/
```

The "Lumber Yard Board" editor can add, edit, remove, and reorder board items.

Each board item supports:

- Name
- Subtitle
- Location: backlog, in progress, done
- Progress percentage
- Estimated total time
- Estimated time left
- Why we built it
- What we did
- Images
- Image captions

## Donation Link

The Asgarnian ale donation button points to:

```text
https://gofund.me/7dc3fc541
```
