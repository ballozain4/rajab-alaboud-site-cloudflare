import type { APIRoute } from 'astro';

export const prerender = false;
export const GET: APIRoute = ({ site, url }) => {
  const origin = (site || new URL(url.origin)).origin;
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /local-dashboard/\nDisallow: /api/\n\nSitemap: ${new URL('/sitemap.xml', origin)}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' }
  });
};
