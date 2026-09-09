import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: process.env.URL || 'https://projectrunecraft.netlify.app',
  output: 'server',
  adapter: netlify({ devFeatures: { edgeFunctions: false, images: false, environmentVariables: false } }),
  server: { host: '127.0.0.1', port: 4321 },
  devToolbar: { enabled: false },
});
