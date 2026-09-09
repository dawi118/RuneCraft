import { dev } from 'astro';
// Programmatic startup keeps the server in the caller's process, including CI and browser tests.
const server = await dev({ server: { host: '127.0.0.1', port: Number(process.env.PORT || 4377) } });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.stop(); process.exit(0); });
