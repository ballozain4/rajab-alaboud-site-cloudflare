import type { APIRoute } from 'astro';
import {
  adminCookie,
  createAdminSession,
  passwordMatches
} from '../../../lib/admin-auth';
import {
  apiError,
  clean,
  jsonResponse,
  readJsonBody,
  runtimeEnv,
  sameOriginRequest
} from '../../../lib/cloudflare-runtime';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!sameOriginRequest(request)) return apiError(new Error('FORBIDDEN'));
  try {
    const body = await readJsonBody(request, 4_000);
    const password = clean(body.password, 200);
    const env = runtimeEnv(locals);
    if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 16 || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      return jsonResponse({ message: 'لم يتم إعداد بيانات دخول لوحة التحكم بعد.' }, 503);
    }
    if (!await passwordMatches(password, env.ADMIN_PASSWORD)) {
      return jsonResponse({ message: 'كلمة المرور غير صحيحة.' }, 401);
    }
    const token = await createAdminSession(env.SESSION_SECRET);
    return jsonResponse(
      { ok: true },
      200,
      { 'set-cookie': adminCookie(token, new URL(request.url).protocol === 'https:') }
    );
  } catch (error) {
    return apiError(error);
  }
};

export const ALL: APIRoute = () => jsonResponse({ message: 'الطريقة غير مسموحة.' }, 405, { allow: 'POST' });
