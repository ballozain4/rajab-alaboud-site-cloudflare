import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../lib/admin-auth';
import { CONSULTATION_STATUSES, STATUS_LABELS } from '../../../../lib/consultation-options';
import {
  apiError,
  cleanMultiline,
  jsonResponse,
  readJsonBody,
  requireDatabase
} from '../../../../lib/cloudflare-runtime';
import type { RecordStatus } from '../../../../types';

export const prerender = false;

const numericId = (value: string | undefined) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error('NOT_FOUND');
  return id;
};

async function getConsultation(database: D1Database, id: number) {
  const item = await database.prepare('SELECT * FROM consultations WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!item) throw new Error('NOT_FOUND');
  const [notes, activity] = await Promise.all([
    database.prepare(
      'SELECT id, note, created_at FROM consultation_notes WHERE consultation_id = ? ORDER BY created_at DESC'
    ).bind(id).all(),
    database.prepare(
      'SELECT id, action, details, created_at FROM consultation_activity WHERE consultation_id = ? ORDER BY created_at DESC'
    ).bind(id).all()
  ]);
  return { item, notes: notes.results, activity: activity.results };
}

export const GET: APIRoute = async ({ request, locals, params }) => {
  try {
    await requireAdmin({ request, locals });
    const database = requireDatabase(locals);
    const id = numericId(params.id);
    const current = await database.prepare(
      'SELECT status FROM consultations WHERE id = ?'
    ).bind(id).first<{ status: RecordStatus }>();
    if (!current) throw new Error('NOT_FOUND');
    if (current.status === 'new') {
      const now = new Date().toISOString();
      await database.batch([
        database.prepare(
          `UPDATE consultations SET status = 'reviewed', updated_at = ? WHERE id = ? AND status = 'new'`
        ).bind(now, id),
        database.prepare(
          `INSERT INTO consultation_activity (consultation_id, action, details, created_at)
           VALUES (?, 'status_changed', 'تم تغيير الحالة إلى: تمت المراجعة', ?)`
        ).bind(id, now)
      ]);
    }
    return jsonResponse(await getConsultation(database, id));
  } catch (error) {
    return apiError(error);
  }
};

export const PATCH: APIRoute = async ({ request, locals, params }) => {
  try {
    await requireAdmin({ request, locals }, true);
    const database = requireDatabase(locals);
    const id = numericId(params.id);
    const existing = await database.prepare(
      'SELECT status, archived FROM consultations WHERE id = ?'
    ).bind(id).first<{ status: RecordStatus; archived: number }>();
    if (!existing) throw new Error('NOT_FOUND');
    const body = await readJsonBody(request, 12_000);
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    let status = existing.status;
    let archived = Number(existing.archived) === 1;

    if (typeof body.status === 'string' && CONSULTATION_STATUSES.includes(body.status as RecordStatus)) {
      status = body.status as RecordStatus;
      if (status !== existing.status) {
        statements.push(database.prepare(
          `INSERT INTO consultation_activity (consultation_id, action, details, created_at)
           VALUES (?, 'status_changed', ?, ?)`
        ).bind(id, `تم تغيير الحالة إلى: ${STATUS_LABELS[status]}`, now));
      }
    }
    if (typeof body.archived === 'boolean') {
      archived = body.archived;
      if (archived !== (Number(existing.archived) === 1)) {
        statements.push(database.prepare(
          `INSERT INTO consultation_activity (consultation_id, action, details, created_at)
           VALUES (?, ?, ?, ?)`
        ).bind(
          id,
          archived ? 'archived' : 'restored',
          archived ? 'تمت أرشفة الطلب.' : 'تمت استعادة الطلب من الأرشيف.',
          now
        ));
      }
    }
    const note = cleanMultiline(body.note, 2_000);
    if (note) {
      statements.push(database.prepare(
        'INSERT INTO consultation_notes (consultation_id, note, created_at) VALUES (?, ?, ?)'
      ).bind(id, note, now));
      statements.push(database.prepare(
        `INSERT INTO consultation_activity (consultation_id, action, details, created_at)
         VALUES (?, 'note_added', 'تمت إضافة ملاحظة داخلية.', ?)`
      ).bind(id, now));
    }
    statements.unshift(database.prepare(
      'UPDATE consultations SET status = ?, archived = ?, updated_at = ? WHERE id = ?'
    ).bind(status, archived ? 1 : 0, now, id));
    await database.batch(statements);
    return jsonResponse({ ok: true, ...(await getConsultation(database, id)) });
  } catch (error) {
    return apiError(error);
  }
};

export const DELETE: APIRoute = async ({ request, locals, params }) => {
  try {
    await requireAdmin({ request, locals }, true);
    const database = requireDatabase(locals);
    const id = numericId(params.id);
    const item = await database.prepare(
      'SELECT reference FROM consultations WHERE id = ?'
    ).bind(id).first<{ reference: string }>();
    if (!item) throw new Error('NOT_FOUND');
    if (request.headers.get('x-confirm-reference') !== item.reference) throw new Error('FORBIDDEN');
    await database.prepare('DELETE FROM consultations WHERE id = ?').bind(id).run();
    return jsonResponse({ ok: true });
  } catch (error) {
    return apiError(error);
  }
};

export const ALL: APIRoute = () => jsonResponse(
  { message: 'الطريقة غير مسموحة.' },
  405,
  { allow: 'GET, PATCH, DELETE' }
);
