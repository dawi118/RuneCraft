import fs from 'node:fs/promises';
process.env.LOCAL_CONTENT_DIR = '.local-content/e2e';
process.env.ADMIN_TOKEN = 'local-e2e-project-key';
delete process.env.SESSION_SECRET;
process.env.REFORGED_LOCAL_STORE = '1';
await fs.rm(process.env.LOCAL_CONTENT_DIR, { recursive: true, force: true });
await import('../scripts/prepare.mjs');
process.env.PORT = '4378';
await import('../scripts/preview.mjs');
