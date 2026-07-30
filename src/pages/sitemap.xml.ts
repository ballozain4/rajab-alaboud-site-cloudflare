import type { APIRoute } from 'astro';
import { getPublicContent } from '../lib/server-content';

export const prerender = false;
const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (character) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
}[character] || character));

export const GET: APIRoute = async ({ site, url }) => {
  const origin = (site || new URL(url.origin)).origin;
  const content = await getPublicContent();
  const managedPaths = content.pages
    .filter((page) => page.status === 'published' && !page.seo.noindex)
    .map((page) => page.isHomepage ? '/' : `/${page.slug}/`);
  const paths = Array.from(new Set([...managedPaths, '/achievements/', '/policies/']));
  const urls = paths.map((path) => `<url><loc>${escapeXml(new URL(path, origin).toString())}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' }
  });
};
