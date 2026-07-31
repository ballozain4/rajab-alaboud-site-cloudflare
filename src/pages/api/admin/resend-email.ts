import type { APIRoute } from 'astro';
import { jsonResponse, runtimeEnv, requireDatabase } from '../../../lib/cloudflare-runtime';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv(locals);
    const token = request.headers.get('x-resend-token') || '';
    if (!env.RESEND_TOKEN || token !== env.RESEND_TOKEN) return jsonResponse({ message: 'Unauthorized' }, 401);
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) return jsonResponse({ message: 'Invalid id' }, 400);
    const database = requireDatabase(locals);
    const row = await database.prepare('SELECT * FROM consultations WHERE id = ?').bind(id).first<Record<string, any>>();
    if (!row) return jsonResponse({ message: 'Not found' }, 404);

    const reference: string = String(row.reference || `CON-UNKNOWN-${id}`);
    const input = {
      requestId: String(row.client_request_id || ''),
      deviceId: String(row.device_hash || ''),
      turnstileToken: '',
      name: String(row.name || ''),
      phone: String(row.phone || ''),
      phoneNormalized: String(row.phone_normalized || row.phone || ''),
      city: String(row.city || ''),
      requestMode: String(row.request_mode || 'consultation'),
      consultationType: String(row.consultation_type || ''),
      serviceSlug: String(row.service_slug || ''),
      serviceName: String(row.service_name || ''),
      subject: String(row.subject || ''),
      description: String(row.description || ''),
      extraFields: row.extra_fields_json ? JSON.parse(String(row.extra_fields_json)) : {},
      source: String(row.source || 'الموقع'),
      utmSource: String(row.utm_source || ''),
      utmMedium: String(row.utm_medium || ''),
      utmCampaign: String(row.utm_campaign || ''),
      utmContent: String(row.utm_content || ''),
      utmTerm: String(row.utm_term || '')
    } as any;

    // Import notifyByEmail from the submit module dynamically
    const mod = await import('../submit');
    if (typeof mod.notifyByEmail !== 'function') return jsonResponse({ message: 'Notify function unavailable' }, 500);
    const status = await mod.notifyByEmail(env as any, reference, input as any);
    await database.prepare('UPDATE consultations SET notification_email_status = ?, updated_at = ? WHERE id = ?')
      .bind(String(status), new Date().toISOString(), id).run();
    return jsonResponse({ ok: true, status });
  } catch (err) {
    return jsonResponse({ message: String(err) }, 500);
  }
};

export const ALL: APIRoute = () => jsonResponse({ message: 'Use POST' }, 405, { allow: 'POST' });
