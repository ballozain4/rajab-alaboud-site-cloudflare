import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

const localDashboard = process.env.LOCAL_DASHBOARD === 'true';

export default defineConfig({
  site: process.env.SITE_URL || 'https://rajab-alaboud-site-cloudflare.workers.dev',
  output: 'server',
  // The local content dashboard reads and writes project files through node:fs.
  // Running it through the Cloudflare dev runtime changes cwd to /bundle and
  // prevents access to those files, so dashboard mode deliberately uses
  // Astro's native Node development server.
  adapter: localDashboard
    ? undefined
    : cloudflare({
        imageService: 'passthrough',
        prerenderEnvironment: 'node'
      }),
  build: {
    assets: '_assets'
  },
  vite: {
    build: {
      cssMinify: true
    }
  }
});
