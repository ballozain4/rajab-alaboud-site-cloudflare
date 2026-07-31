import type { APIRoute } from 'astro';
import { getPublicContent } from '../../lib/server-content';
import {
  CONSULTATION_SOURCES
} from '../../lib/consultation-options';
import {
  apiError,
  clean,
  cleanMultiline,
  jsonResponse,
  readJsonBody,
  requireDatabase,
  runtimeEnv,
  sameOriginRequest
} from '../../lib/cloudflare-runtime';
import type { ConsultationFieldDefinition } from '../../types';

export const prerender = false;

interface SubmissionInput {
  requestId: string;
  deviceId: string;
  turnstileToken: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  city: string;
  requestMode: 'consultation' | 'service';
  consultationType: string;
  serviceSlug: string;
  serviceName: string;
  subject: string;
  description: string;
  extraFields: Record<string, string | boolean>;
  source: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
}

const object = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const normalizePhone = (value: string) => {
  let phone = value.replace(/[()\s-]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (/^09\d{8}$/.test(phone)) phone = `+963${phone.slice(1)}`;
  else if (/^9\d{8}$/.test(phone)) phone = `+963${phone}`;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) throw new Error('أدخل رقم هاتف صالحاً بصيغة سورية أو دولية.');
  return phone;
};

const htmlEscape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character] || character));

async function verifyTurnstile(request: Request, token: string, secret: string | undefined, allowDemo: boolean) {
  const hostname = new URL(request.url).hostname;
  if (allowDemo && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return;
  if (!secret) throw new Error('TURNSTILE_NOT_CONFIGURED');
  if (!token || token.length > 2_048) throw new Error('TURNSTILE_FAILED');
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      secret,
      response: token,
      remoteip: request.headers.get('CF-Connecting-IP') || undefined,
      idempotency_key: crypto.randomUUID()
    })
  });
  const result = await response.json() as { success?: boolean; hostname?: string };
  if (!response.ok || !result.success || (result.hostname && result.hostname !== hostname)) {
    throw new Error('TURNSTILE_FAILED');
  }
}

async function deviceHash(request: Request, deviceId: string) {
  const fingerprint = [
    request.headers.get('CF-Connecting-IP') || 'local',
    request.headers.get('user-agent') || 'unknown',
    deviceId
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function enforceRateLimit(database: D1Database, bucket: string) {
  const now = Date.now();
  const hour = 60 * 60 * 1_000;
  const current = await database.prepare(
    'SELECT window_started_at, request_count FROM rate_limits WHERE bucket = ?'
  ).bind(bucket).first<{ window_started_at: number; request_count: number }>();
  if (!current || now - Number(current.window_started_at) >= hour) {
    await database.prepare(
      `INSERT INTO rate_limits (bucket, window_started_at, request_count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = 1, updated_at = excluded.updated_at`
    ).bind(bucket, now, now).run();
  } else {
    if (Number(current.request_count) >= 10) throw new Error('RATE_LIMITED');
    await database.prepare(
      'UPDATE rate_limits SET request_count = request_count + 1, updated_at = ? WHERE bucket = ?'
    ).bind(now, bucket).run();
  }
  if (Math.random() < 0.05) {
    await database.prepare('DELETE FROM rate_limits WHERE updated_at < ?').bind(now - 24 * hour).run();
  }
}

async function validateSubmission(
  body: Record<string, unknown>,
  fields: ConsultationFieldDefinition[]
): Promise<SubmissionInput> {
  const consultation = object(body.consultation);
  const rawExtraFields = object(consultation.extraFields);
  const tracking = object(body.tracking);
  const consents = object(body.consents);
  const requestId = clean(body.clientRequestId, 80);
  const deviceId = clean(body.deviceId, 100);
  const name = clean(consultation.name, 100);
  const phone = clean(consultation.phone, 30);
  const city = clean(consultation.city, 80);
  const requestMode = clean(consultation.requestMode, 20) === 'service' ? 'service' : 'consultation';
  const consultationType = clean(consultation.consultationType, 120);
  const serviceSlug = clean(consultation.serviceSlug, 100);
  const serviceName = clean(consultation.serviceName, 160);
  const subject = clean(consultation.subject, 220);
  const description = cleanMultiline(consultation.description, 1_500);
  const visibleFields = fields.filter((field) => field.visible);
  const byId = new Map(visibleFields.map((field) => [field.id, field]));
  const valueFor = (field: ConsultationFieldDefinition) => {
    if (field.id === 'privacy') return consents.privacy === true;
    if (field.builtin) return consultation[field.id];
    return rawExtraFields[field.id];
  };
  for (const field of visibleFields) {
    if (requestMode === 'service' && field.id === 'consultationType') continue;
    const value = valueFor(field);
    const missing = field.type === 'checkbox' ? value !== true : !cleanMultiline(value, 1_500);
    if (field.required && missing) throw new Error(`حقل «${field.label}» مطلوب.`);
    if (field.type === 'select' && !missing && !field.options.includes(clean(value, 120))) {
      throw new Error(`اختر قيمة صالحة في حقل «${field.label}».`);
    }
  }
  const extraFields = Object.fromEntries(visibleFields
    .filter((field) => !field.builtin)
    .map((field) => [
      field.id,
      field.type === 'checkbox' ? rawExtraFields[field.id] === true : cleanMultiline(rawExtraFields[field.id], 1_500)
    ]));
  const sourceInput = clean(tracking.source, 80);
  const source = CONSULTATION_SOURCES.includes(sourceInput as (typeof CONSULTATION_SOURCES)[number])
    ? sourceInput
    : 'غير معروف';

  if (!/^[0-9a-f-]{20,80}$/i.test(requestId)) throw new Error('معرّف الطلب غير صالح. حدّث الصفحة وحاول مجدداً.');
  if (!/^[0-9a-z-]{12,100}$/i.test(deviceId)) throw new Error('تعذر التحقق من الجهاز. حدّث الصفحة وحاول مجدداً.');
  if (byId.get('name')?.required && name.length < 2) throw new Error('أدخل الاسم الكامل.');
  if (requestMode === 'service' && !serviceSlug) throw new Error('اختر الخدمة المطلوبة.');
  if (byId.get('subject')?.required && subject.length < 3) throw new Error('اكتب الخدمة أو المشكلة التي تريد مناقشتها.');
  if (consents.privacy !== true) throw new Error('يجب الموافقة على سياسة الخصوصية قبل الإرسال.');

  return {
    requestId,
    deviceId,
    turnstileToken: clean(body.turnstileToken, 2_048),
    name,
    phone,
    phoneNormalized: normalizePhone(phone),
    city,
    requestMode,
    consultationType: requestMode === 'service' ? 'طلب خدمة محددة' : consultationType,
    serviceSlug,
    serviceName,
    subject,
    description,
    extraFields,
    source,
    utmSource: clean(tracking.utmSource, 160),
    utmMedium: clean(tracking.utmMedium, 160),
    utmCampaign: clean(tracking.utmCampaign, 200),
    utmContent: clean(tracking.utmContent, 200),
    utmTerm: clean(tracking.utmTerm, 200)
  };
}

export async function notifyByEmail(
  env: CloudflareEnv,
  reference: string,
  input: SubmissionInput
) {
  const notificationEmail = (
    env.NOTIFICATION_EMAIL || 'alabboudrajab@gmail.com'
  ).trim();

  const notificationEmailFrom = (
    env.NOTIFICATION_EMAIL_FROM || 'alabboudrajab@gmail.com'
  ).trim();

  if (!env.RESEND_TOKEN || !notificationEmail || !notificationEmailFrom) {
    return 'not-configured' as const;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: notificationEmailFrom,
        to: notificationEmail,
        subject: `طلب استشارة جديد — ${reference}`,
        text: [
          `رقم الطلب: ${reference}`,
          `الاسم: ${input.name}`,
          `الهاتف: ${input.phoneNormalized}`,
          `المحافظة: ${input.city}`,
          `الخدمة: ${input.serviceName}`,
          `الموضوع: ${input.subject}`,
          `الوصف: ${input.description}`,
          `المصدر: ${input.source}`
        ].join('\n'),
        html: `
        <div dir="rtl" lang="ar">
          <h2>طلب استشارة جديد</h2>

          <p>
            <strong>رقم الطلب:</strong>
            ${htmlEscape(reference)}
          </p>

          <p>
            <strong>الاسم:</strong>
            ${htmlEscape(input.name)}
          </p>

          <p>
            <strong>الهاتف:</strong>
            ${htmlEscape(input.phoneNormalized)}
          </p>

          <p>
            <strong>المحافظة:</strong>
            ${htmlEscape(input.city)}
          </p>

          <p>
            <strong>الخدمة:</strong>
            ${htmlEscape(input.serviceName || '-')}
          </p>

          <p>
            <strong>الموضوع:</strong>
            ${htmlEscape(input.subject)}
          </p>

          <p>
            <strong>الوصف:</strong><br>
            ${htmlEscape(input.description).replaceAll('\n', '<br>')}
          </p>

          <p>
            <strong>المصدر:</strong>
            ${htmlEscape(input.source)}
          </p>

        </div>
        `
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RESEND ERROR:', errorText);
      return `failed:${errorText.slice(0, 200)}` as const;
    }

    return 'sent' as const;

  } catch (error) {
    console.error('EMAIL SEND ERROR:', error);
    return 'failed' as const;
  }
}

const referenceFor = (id: number, createdAt: string) =>
  `CON-${createdAt.slice(0, 10).replaceAll('-', '')}-${String(id).padStart(4, '0')}`;

const whatsappFollowupUrl = (number: string, reference: string) => {
  const message = `مرحباً، أريد متابعة طلب الاستشارة رقم ${reference}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!sameOriginRequest(request)) return apiError(new Error('FORBIDDEN'));
  try {
    const body = await readJsonBody(request);
    const content = await getPublicContent();
    const input = await validateSubmission(body, content.fieldModel.consultationFields);
    const env = runtimeEnv(locals);
    const allowDemo = env.ALLOW_DEMO_SUBMISSIONS === 'true';
    await verifyTurnstile(request, input.turnstileToken, env.TURNSTILE_SECRET_KEY, allowDemo);
    const database = requireDatabase(locals);
    const existing = await database.prepare(
      'SELECT reference, notification_email_status FROM consultations WHERE client_request_id = ?'
    ).bind(input.requestId).first<{ reference: string; notification_email_status: string }>();
    if (existing) {
      return jsonResponse({
        ok: true,
        duplicate: true,
        reference: existing.reference,
        notificationStatus: existing.notification_email_status,
        whatsappUrl: whatsappFollowupUrl(content.site.whatsapp, existing.reference)
      });
    }

    const fingerprint = await deviceHash(request, input.deviceId);
    await enforceRateLimit(database, `consultation:${fingerprint}`);
    const createdAt = new Date().toISOString();
    const pendingReference = `PENDING-${crypto.randomUUID()}`;
    const inserted = await database.prepare(
      `INSERT INTO consultations (
        reference, client_request_id, name, phone, phone_normalized, city, request_mode,
        consultation_type, service_slug, service_name, subject, description, best_contact_time,
        source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, status, archived,
        notification_email_status, notification_whatsapp_status, device_hash, extra_fields_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 0, ?, 'manual', ?, ?, ?, ?)`
    ).bind(
      pendingReference,
      input.requestId,
      input.name,
      input.phone,
      input.phoneNormalized,
      input.city,
      input.requestMode,
      input.consultationType,
      input.serviceSlug,
      input.serviceName,
      input.subject,
      input.description,
      '',
      input.source,
      input.utmSource,
      input.utmMedium,
      input.utmCampaign,
      input.utmContent,
      input.utmTerm,
      allowDemo ? 'demo' : 'pending',
      fingerprint,
      JSON.stringify(input.extraFields),
      createdAt,
      createdAt
    ).run();
    const id = Number(inserted.meta.last_row_id);
    if (!Number.isInteger(id) || id < 1) throw new Error('تعذر إنشاء رقم متابعة للطلب.');
    const reference = referenceFor(id, createdAt);
    await database.batch([
      database.prepare(
        'UPDATE consultations SET reference = ?, updated_at = ? WHERE id = ?'
      ).bind(reference, createdAt, id),
      database.prepare(
        `INSERT INTO consultation_activity (consultation_id, action, details, created_at)
         VALUES (?, 'created', 'تم إنشاء الطلب من نموذج الموقع.', ?)`
      ).bind(id, createdAt)
    ]);

    const emailStatus = allowDemo
  ? 'demo'
  : (env.RESEND_TOKEN
      ? await notifyByEmail(env, reference, input)
      : 'manual');
    await database.prepare(
      'UPDATE consultations SET notification_email_status = ?, updated_at = ? WHERE id = ?'
    ).bind(emailStatus, new Date().toISOString(), id).run();

    return jsonResponse({
      ok: true,
      duplicate: false,
      reference,
      notificationStatus: emailStatus,
      whatsappUrl: whatsappFollowupUrl(content.site.whatsapp, reference)
    }, 201);
  } catch (error) {
    return apiError(error);
  }
};

export const ALL: APIRoute = () => jsonResponse({ message: 'استخدم POST لإرسال الطلب.' }, 405, { allow: 'POST' });
