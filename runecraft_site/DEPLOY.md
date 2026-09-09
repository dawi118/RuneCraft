# Legacy site source

This directory is retained as migration and rollback reference. It is no longer the Netlify publish directory or the active author workspace.

Use the root `netlify.toml`, `npm run build`, and the deployment/recovery instructions in `../IMPLEMENTATION.md`. The current public output is `dist`; the Astro Netlify adapter generates the server function. Do not redeploy this directory over the redesigned site except as an intentional rollback to the old content model and its preserved storage.
