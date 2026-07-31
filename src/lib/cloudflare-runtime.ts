import type { APIContext } from 'astro';
import { env as cloudflareBindings } from 'cloudflare:workers';

export const jsonResponse = (body: unknown, status = 200, extraHeaders: HeadersInit = {}) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  }
);

// Astro 6+ removes `Astro.locals.runtime.env`. Cloudflare bindings are exposed
// directly by the runtime module, so do not read the legacy locals property.
export const runtimeEnv = (_locals: unknown): CloudflareEnv => {
  const cloudflareEnv = cloudflareBindings as unknown as CloudflareEnv;
  const nodeEnv = typeof process !== 'undefined' && process.env
    ? (process.env as Partial<CloudflareEnv>)
    : {};
  return { ...nodeEnv, ...cloudflareEnv } as CloudflareEnv;
};

export const requireDatabase = (locals: APIContext['locals']): D1Database => {
  const database = runtimeEnv(locals).DB;
  if (!database) throw new Error('D1_NOT_CONFIGURED');
  return database;
};

export async function readJsonBody(request: Request, maxBytes = 32_000): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new Error('UNSUPPORTED_MEDIA_TYPE');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON');
  return value as Record<string, unknown>;
}

export const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);
export const cleanMultiline = (value: unknown, max = 2_000) =>
  String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

export const sameOriginRequest = (request: Request) => {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
};

export const apiError = (error: unknown) => {
  const code = error instanceof Error ? error.message : 'UNKNOWN';
  const known: Record<string, [number, string]> = {
    D1_NOT_CONFIGURED: [503, 'قاعدة بيانات الطلبات غير مرتبطة بالموقع بعد.'],
    UNSUPPORTED_MEDIA_TYPE: [415, 'نوع البيانات المرسل غير مدعوم.'],
    PAYLOAD_TOO_LARGE: [413, 'حجم البيانات أكبر من المسموح.'],
    INVALID_JSON: [400, 'البيانات المرسلة غير صالحة.'],
    UNAUTHORIZED: [401, 'انتهت جلسة الدخول أو لم يتم تسجيل الدخول.'],
    FORBIDDEN: [403, 'تعذر تنفيذ الطلب. حدّث الصفحة وحاول مجدداً.'],
    NOT_FOUND: [404, 'الطلب غير موجود.'],
    RATE_LIMITED: [429, 'تم بلوغ الحد المسموح. حاول مجدداً بعد ساعة.'],
    TURNSTILE_NOT_CONFIGURED: [503, 'حماية النموذج غير مكتملة الإعداد.'],
    TURNSTILE_FAILED: [400, 'تعذر التحقق من الحماية. أعد المحاولة.']
  };
  const [status, message] = known[code] || [400, code && !/^[A-Z0-9_]+$/.test(code) ? code : 'تعذر تنفيذ الطلب.'];
  return jsonResponse({ message }, status);
};
