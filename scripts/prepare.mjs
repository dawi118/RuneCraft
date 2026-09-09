import fs from 'node:fs/promises';
await fs.mkdir('public/admin', { recursive: true });
await fs.writeFile('public/admin/content.js', await fs.readFile('src/lib/content.mjs'));
