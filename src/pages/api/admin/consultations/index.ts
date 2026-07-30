import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../lib/admin-auth';
import {
  CONSULTATION_SOURCES,
  CONSULTATION_STATUSES,
  SYRIAN_PROVINCES
} from '../../../../lib/consultation-options';
import { apiError, jsonResponse, requireDatabase } from '../../../../lib/cloudflare-runtime';

export const prerender = false;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    await requireAdmin({ request, locals });
    const database = requireDatabase(locals);
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') || '').trim().slice(0, 120);
    const status = url.searchParams.get('status') || '';
    const city = url.searchParams.get('city') || '';
    const source = url.searchParams.get('source') || '';
    const from = url.searchParams.get('from') || '';
    const to = url.searchParams.get('to') || '';
    const archived = url.searchParams.get('archived') === '1';
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = 50;
    const clauses = ['archived = ?'];
    const bindings: unknown[] = [archived ? 1 : 0];

    if (query) {
      clauses.push(`(
        reference LIKE ? ESCAPE '\\'
        OR name LIKE ? ESCAPE '\\'
        OR phone LIKE ? ESCAPE '\\'
        OR phone_normalized LIKE ? ESCAPE '\\'
        OR subject LIKE ? ESCAPE '\\'
      )`);
      const match = `%${escapeLike(query)}%`;
      bindings.push(match, match, match, match, match);
    }
    if (CONSULTATION_STATUSES.includes(status as never)) {
      clauses.push('status = ?');
      bindings.push(status);
    }
    if (SYRIAN_PROVINCES.includes(city as never)) {
      clauses.push('city = ?');
      bindings.push(city);
    }
    if (CONSULTATION_SOURCES.includes(source as never)) {
      clauses.push('source = ?');
      bindings.push(source);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      clauses.push('created_at >= ?');
      bindings.push(`${from}T00:00:00.000Z`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      clauses.push('created_at <= ?');
      bindings.push(`${to}T23:59:59.999Z`);
    }

    const where = clauses.join(' AND ');
    const offset = (page - 1) * limit;
    const listStatement = database.prepare(
      `SELECT
        id, reference, name, phone, phone_normalized, city, request_mode, consultation_type,
        service_name, subject, source, status, archived,
        notification_email_status, notification_whatsapp_status, created_at, updated_at
       FROM consultations
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(...bindings, limit, offset);
    const countStatement = database.prepare(
      `SELECT COUNT(*) AS total FROM consultations WHERE ${where}`
    ).bind(...bindings);
    const [list, count, statusStats, cityStats, sourceStats, overview] = await Promise.all([
      listStatement.all(),
      countStatement.first<{ total: number }>(),
      database.prepare(
        'SELECT status AS label, COUNT(*) AS count FROM consultations WHERE archived = 0 GROUP BY status ORDER BY count DESC'
      ).all(),
      database.prepare(
        'SELECT city AS label, COUNT(*) AS count FROM consultations WHERE archived = 0 GROUP BY city ORDER BY count DESC, city'
      ).all(),
      database.prepare(
        'SELECT source AS label, COUNT(*) AS count FROM consultations WHERE archived = 0 GROUP BY source ORDER BY count DESC, source'
      ).all(),
      database.prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'new' AND archived = 0 THEN 1 ELSE 0 END) AS new_count,
          SUM(CASE WHEN status = 'appointment-booked' AND archived = 0 THEN 1 ELSE 0 END) AS booked_count,
          SUM(CASE WHEN status = 'completed' AND archived = 0 THEN 1 ELSE 0 END) AS completed_count,
          SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END) AS archived_count
         FROM consultations`
      ).first()
    ]);

    return jsonResponse({
      items: list.results,
      pagination: {
        page,
        limit,
        total: Number(count?.total || 0),
        pages: Math.max(1, Math.ceil(Number(count?.total || 0) / limit))
      },
      stats: {
        overview,
        statuses: statusStats.results,
        cities: cityStats.results,
        sources: sourceStats.results
      }
    });
  } catch (error) {
    return apiError(error);
  }
};

export const ALL: APIRoute = () => jsonResponse({ message: 'الطريقة غير مسموحة.' }, 405, { allow: 'GET' });
