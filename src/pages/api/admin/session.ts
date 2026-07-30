import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/admin-auth';
import { apiError, jsonResponse, requireDatabase } from '../../../lib/cloudflare-runtime';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    await requireAdmin({ request, locals });
    requireDatabase(locals);
    return jsonResponse({ authenticated: true });
  } catch (error) {
    return apiError(error);
  }
};

export const ALL: APIRoute = () => jsonResponse({ message: 'الطريقة غير مسموحة.' }, 405, { allow: 'GET' });
