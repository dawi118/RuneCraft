import { loadEnvFile } from 'node:process';

// Only local server entry points load this file; hosted Functions use Netlify's environment.
try { loadEnvFile('.env'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
