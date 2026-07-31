import type { APIRoute } from 'astro';
import { jsonResponse, apiError, readJsonBody, requireDatabase, runtimeEnv } from '../../../../lib/cloudflare-runtime';
import { notifyByEmail } from '../../../api/submit';

export const prerender = false;

const SECRET = 'temporary-resend-token-2026';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const auth = request.headers.get('x-resend-secret');
    if (auth !== SECRET) throw new Error('FORBIDDEN');
    const body = await readJsonBody(request);
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) throw new Error('INVALID_ID');
    const database = requireDatabase(locals);
    const row = await database.prepare('SELECT reference, client_request_id, name, phone, phone_normalized, city, request_mode, consultation_type, service_slug, service_name, subject, description, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, extra_fields_json FROM consultations WHERE id = ?').bind(id).first<Record<string, unknown>>();
    if (!row) throw new Error('NOT_FOUND');

    const input = {
      requestId: String(row.client_request_id || ''),
      deviceId: 'manual-resend',
      turnstileToken: 'manual-resend',
      name: String(row.name || ''),
      phone: String(row.phone || ''),
      phoneNormalized: String(row.phone_normalized || ''),
      city: String(row.city || ''),
      requestMode: String(row.request_mode || 'consultation') as 'consultation' | 'service',
      consultationType: String(row.consultation_type || ''),
      serviceSlug: String(row.service_slug || ''),
      serviceName: String(row.service_name || ''),
      subject: String(row.subject || ''),
      description: String(row.description || ''),
      extraFields: typeof row.extra_fields_json === 'string' ? JSON.parse(row.extra_fields_json) : (row.extra_fields_json || {}),
      source: String(row.source || ''),
      utmSource: String(row.utm_source || ''),
      utmMedium: String(row.utm_medium || ''),
      utmCampaign: String(row.utm_campaign || ''),
      utmContent: String(row.utm_content || ''),
      utmTerm: String(row.utm_term || '')
    };

    const env = runtimeEnv(locals);
    const emailStatus = await notifyByEmail(env, String(row.reference || ''), input as any);

    await database.prepare('UPDATE consultations SET notification_email_status = ?, updated_at = ? WHERE id = ?').bind(emailStatus, new Date().toISOString(), id).run();
    return jsonResponse({ ok: true, emailStatus });
  } catch (error) {
    return apiError(error);
  }
};
