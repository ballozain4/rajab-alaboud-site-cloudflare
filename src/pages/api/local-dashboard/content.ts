import type { APIRoute } from 'astro';
import { readDashboardContent, saveDashboardContent } from '../../../lib/local-dashboard-content';

export const prerender = false;

const localRequest = (request: Request) => {
  const hostname = new URL(request.url).hostname;
  return import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

export const GET: APIRoute = async ({ request }) => {
  if (!localRequest(request)) return response({ message: 'غير موجود.' }, 404);
  try { return response(await readDashboardContent()); }
  catch (error) { return response({ message: error instanceof Error ? error.message : 'تعذر قراءة المحتوى.' }, 500); }
};

export const POST: APIRoute = async ({ request }) => {
  if (!localRequest(request)) return response({ message: 'غير موجود.' }, 404);
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000) return response({ message: 'حجم المحتوى أكبر من المسموح.' }, 413);
    return response({ ok: true, content: await saveDashboardContent(JSON.parse(raw)) });
  } catch (error) {
    return response({ message: error instanceof Error ? error.message : 'تعذر حفظ المحتوى.' }, 400);
  }
};
