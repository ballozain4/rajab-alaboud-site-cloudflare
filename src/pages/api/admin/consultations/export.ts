import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../lib/admin-auth';
import { STATUS_LABELS } from '../../../../lib/consultation-options';
import { apiError, requireDatabase } from '../../../../lib/cloudflare-runtime';
import type { RecordStatus } from '../../../../types';

export const prerender = false;

const cell = (value: unknown) => {
  const raw = String(value ?? '');
  const safe = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
};

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    await requireAdmin({ request, locals });
    const database = requireDatabase(locals);
    const archived = new URL(request.url).searchParams.get('archived') === '1';
    const result = await database.prepare(
      `SELECT reference, created_at, name, phone, phone_normalized, city, consultation_type,
        service_name, subject, description, extra_fields_json, source, status, archived,
        notification_email_status, utm_source, utm_medium, utm_campaign
       FROM consultations
       WHERE archived = ?
       ORDER BY created_at DESC`
    ).bind(archived ? 1 : 0).all<Record<string, unknown>>();
    const headers = [
      'رقم الطلب',
      'تاريخ الإنشاء',
      'الاسم',
      'الهاتف المدخل',
      'الهاتف الدولي',
      'المحافظة',
      'نوع الاستشارة',
      'الخدمة',
      'الموضوع',
      'الوصف',
      'الحقول الإضافية (JSON)',
      'المصدر',
      'الحالة',
      'مؤرشف',
      'حالة إشعار البريد',
      'UTM Source',
      'UTM Medium',
      'UTM Campaign'
    ];
    const keys = [
      'reference',
      'created_at',
      'name',
      'phone',
      'phone_normalized',
      'city',
      'consultation_type',
      'service_name',
      'subject',
      'description',
      'extra_fields_json',
      'source',
      'status',
      'archived',
      'notification_email_status',
      'utm_source',
      'utm_medium',
      'utm_campaign'
    ];
    const lines = [
      headers.map(cell).join(','),
      ...result.results.map((row) => keys.map((key) => {
        if (key === 'status') return cell(STATUS_LABELS[row[key] as RecordStatus] || row[key]);
        if (key === 'archived') return cell(Number(row[key]) === 1 ? 'نعم' : 'لا');
        return cell(row[key]);
      }).join(','))
    ];
    return new Response(`\uFEFF${lines.join('\r\n')}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="consultations-${new Date().toISOString().slice(0, 10)}.csv"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      }
    });
  } catch (error) {
    return apiError(error);
  }
};

export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { allow: 'GET' } });
