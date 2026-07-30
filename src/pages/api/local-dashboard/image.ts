import type { APIRoute } from 'astro';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

export const prerender = false;
const allowedTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif']
]);
const localRequest = (request: Request) => {
  const hostname = new URL(request.url).hostname;
  return import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

export const POST: APIRoute = async ({ request }) => {
  if (!localRequest(request)) return json({ message: 'غير موجود.' }, 404);
  try {
    const requestType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    let bytes: Uint8Array;
    let originalName: string;
    let mimeType: string;
    if (allowedTypes.has(requestType)) {
      const rawName = request.headers.get('x-image-name') || 'image';
      try { originalName = decodeURIComponent(rawName); }
      catch { originalName = 'image'; }
      mimeType = requestType;
      bytes = new Uint8Array(await request.arrayBuffer());
    } else {
      const form = await request.formData();
      const file = form.get('image');
      if (!(file instanceof File)) return json({ message: 'اختر ملف صورة.' }, 400);
      originalName = file.name;
      mimeType = file.type;
      bytes = new Uint8Array(await file.arrayBuffer());
    }
    if (bytes.byteLength > 5 * 1024 * 1024) return json({ message: 'حجم الصورة يجب ألا يتجاوز 5 ميغابايت.' }, 413);
    const extension = allowedTypes.get(mimeType);
    if (!extension) return json({ message: 'الصيغ المسموحة: JPG وPNG وWebP وAVIF.' }, 415);
    const original = originalName.replace(extname(originalName), '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
    const filename = `${Date.now()}-${original}${extension}`;
    const directory = resolve(process.cwd(), 'public/images/uploads');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), bytes);
    return json({ ok: true, path: `/images/uploads/${filename}` });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : 'تعذر رفع الصورة.' }, 400);
  }
};
