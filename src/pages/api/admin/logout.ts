import type { APIRoute } from 'astro';
import { clearAdminCookie } from '../../../lib/admin-auth';
import { apiError, jsonResponse, sameOriginRequest } from '../../../lib/cloudflare-runtime';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!sameOriginRequest(request)) return apiError(new Error('FORBIDDEN'));
  return jsonResponse(
    { ok: true },
    200,
    { 'set-cookie': clearAdminCookie(new URL(request.url).protocol === 'https:') }
  );
};

export const ALL: APIRoute = () => jsonResponse({ message: 'الطريقة غير مسموحة.' }, 405, { allow: 'POST' });
