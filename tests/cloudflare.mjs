import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

register('./cloudflare-loader.mjs', import.meta.url);

const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root);
const text = (path) => readFile(file(path), 'utf8');

class LocalD1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new LocalD1Statement(this.database, this.sql, values);
  }

  async first(column) {
    const row = this.database.prepare(this.sql).get(...this.values) ?? null;
    return column && row ? row[column] ?? null : row;
  }

  async all() {
    return {
      results: this.database.prepare(this.sql).all(...this.values),
      success: true,
      meta: {}
    };
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid)
      }
    };
  }
}

class LocalD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new LocalD1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const wrangler = JSON.parse(await text('wrangler.jsonc'));
assert.equal(wrangler.main, '@astrojs/cloudflare/entrypoints/server');
assert.equal(wrangler.workers_dev, true);
assert.equal('pages_build_output_dir' in wrangler, false);
assert.equal(wrangler.d1_databases?.[0]?.binding, 'DB');
assert.equal(wrangler.d1_databases?.[0]?.migrations_dir, 'migrations');
assert.equal(wrangler.vars?.NOTIFICATION_EMAIL, 'rajabalaboud@gmail.com');
assert.equal(wrangler.vars?.ALLOW_DEMO_SUBMISSIONS, 'false');

await Promise.all([
  access(file('dist/server/entry.mjs')),
  access(file('dist/server/wrangler.json')),
  access(file('dist/client/_assets')),
  access(file('migrations/0001_consultations.sql')),
  access(file('migrations/0002_consultation_extra_fields.sql')),
  assert.rejects(access(file('netlify.toml'))),
  assert.rejects(access(file('netlify'))),
  assert.rejects(access(file('src/pages/netlify-forms.astro')))
]);

const generatedWrangler = JSON.parse(await text('dist/server/wrangler.json'));
assert.equal(generatedWrangler.main, 'entry.mjs');
assert.equal(generatedWrangler.assets?.binding, 'ASSETS');
assert.equal(generatedWrangler.assets?.directory, '../client');
assert.equal(generatedWrangler.d1_databases?.[0]?.binding, 'DB');

const [submitSource, dashboardSource, privacySource, formSource] = await Promise.all([
  text('src/pages/api/submit.ts'),
  text('src/scripts/local-dashboard.ts'),
  text('content/policies/privacy.json'),
  text('src/components/ConsultationForm.astro')
]);
assert.match(submitSource, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
assert.match(submitSource, /request_count\) >= 10/);
assert.doesNotMatch(formSource, /type=["']file["']/);
assert.match(dashboardSource, /data-drag-collection="\$\{collection\}"/);
assert.match(dashboardSource, /document\.addEventListener\('drop'/);
assert.match(dashboardSource, /item\.order = \(index \+ 1\) \* 10/);
assert.match(privacySource, /Cloudflare D1/);
assert.match(privacySource, /Cloudflare Turnstile/);

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await text('migrations/0001_consultations.sql'));
sqlite.exec(await text('migrations/0002_consultation_extra_fields.sql'));
const database = new LocalD1(sqlite);
const env = {
  DB: database,
  ADMIN_PASSWORD: 'strong-admin-password-2026',
  SESSION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef',
  NOTIFICATION_EMAIL: 'rajabalaboud@gmail.com',
  ALLOW_DEMO_SUBMISSIONS: 'true'
};
const locals = { runtime: { env } };

const chunkDirectory = file('dist/server/chunks/');
const chunkFiles = (await readdir(chunkDirectory)).filter((name) => name.endsWith('.mjs'));
const importRoute = async (marker) => {
  for (const name of chunkFiles) {
    if ((await text(`dist/server/chunks/${name}`)).includes(marker)) {
      return (await import(new URL(name, chunkDirectory))).page();
    }
  }
  throw new Error(`تعذر العثور على مسار البناء: ${marker}`);
};
const submitApi = await importRoute('src/pages/api/submit.ts');
const loginApi = await importRoute('src/pages/api/admin/login.ts');
const listApi = await importRoute('src/pages/api/admin/consultations/index.ts');
const itemApi = await importRoute('src/pages/api/admin/consultations/[id].ts');
const exportApi = await importRoute('src/pages/api/admin/consultations/export.ts');

const requestId = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const submission = (index) => ({
  clientRequestId: requestId(index),
  deviceId: 'device-cloudflare-test-001',
  turnstileToken: '',
  consultation: {
    name: `عميل اختبار ${index}`,
    phone: '0912345678',
    city: 'حمص',
    requestMode: 'consultation',
    consultationType: 'استشارة عن البشرة وروتين العناية',
    serviceSlug: '',
    serviceName: '',
    subject: index === 1 ? '=1+1' : 'استشارة أولية للبشرة',
    description: '',
    extraFields: {}
  },
  tracking: {
    source: 'الموقع',
    utmSource: 'cloudflare-test',
    utmMedium: 'automated',
    utmCampaign: 'final-validation',
    utmContent: '',
    utmTerm: ''
  },
  consents: { privacy: true }
});

const submit = (index, overrides = {}) => submitApi.POST({
  request: new Request('http://127.0.0.1/api/submit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://127.0.0.1',
      'CF-Connecting-IP': '192.0.2.10',
      'user-agent': 'Cloudflare final test'
    },
    body: JSON.stringify({ ...submission(index), ...overrides })
  }),
  locals
});

const firstResponse = await submit(1);
assert.equal(firstResponse.status, 201);
const firstResult = await firstResponse.json();
assert.equal(firstResult.ok, true);
assert.equal(firstResult.duplicate, false);
assert.equal(firstResult.notificationStatus, 'demo');
assert.match(firstResult.reference, /^CON-\d{8}-0001$/);
assert.match(firstResult.whatsappUrl, /^https:\/\/wa\.me\//);

const duplicateResponse = await submit(1);
assert.equal(duplicateResponse.status, 200);
assert.equal((await duplicateResponse.json()).duplicate, true);

for (let index = 2; index <= 10; index += 1) {
  const response = await submit(index);
  assert.equal(response.status, 201, `الطلب ${index} يجب أن ينجح ضمن حد الساعة`);
}
const limitedResponse = await submit(11);
assert.equal(limitedResponse.status, 429);

assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM consultations').get().total, 10);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM consultation_activity').get().total, 10);
assert.equal(
  sqlite.prepare('SELECT phone_normalized FROM consultations WHERE id = 1').get().phone_normalized,
  '+963912345678'
);
assert.throws(
  () => sqlite.prepare("UPDATE consultations SET status = 'invalid' WHERE id = 1").run(),
  /CHECK constraint/
);

const badOriginResponse = await submitApi.POST({
  request: new Request('http://127.0.0.1/api/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://example.com' },
    body: JSON.stringify(submission(50))
  }),
  locals
});
assert.equal(badOriginResponse.status, 403);

const loginResponse = await loginApi.POST({
  request: new Request('http://127.0.0.1/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1' },
    body: JSON.stringify({ password: env.ADMIN_PASSWORD })
  }),
  locals
});
assert.equal(loginResponse.status, 200);
const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
assert.match(cookie || '', /^rajab_admin_session=/);

const authenticatedHeaders = { cookie };
const listResponse = await listApi.GET({
  request: new Request('http://127.0.0.1/api/admin/consultations?q=اختبار', {
    headers: authenticatedHeaders
  }),
  locals
});
assert.equal(listResponse.status, 200);
const listResult = await listResponse.json();
assert.equal(listResult.items.length, 10);
assert.equal(listResult.pagination.total, 10);
assert.equal(Number(listResult.stats.overview.new_count), 10);

const updateResponse = await itemApi.PATCH({
  request: new Request('http://127.0.0.1/api/admin/consultations/1', {
    method: 'PATCH',
    headers: {
      ...authenticatedHeaders,
      'content-type': 'application/json',
      origin: 'http://127.0.0.1'
    },
    body: JSON.stringify({
      status: 'contacted',
      archived: true,
      note: 'ملاحظة داخلية للاختبار النهائي.'
    })
  }),
  locals,
  params: { id: '1' }
});
assert.equal(updateResponse.status, 200);
const updateResult = await updateResponse.json();
assert.equal(updateResult.item.status, 'contacted');
assert.equal(Number(updateResult.item.archived), 1);
assert.equal(updateResult.notes.length, 1);

const archivedResponse = await listApi.GET({
  request: new Request('http://127.0.0.1/api/admin/consultations?archived=1', {
    headers: authenticatedHeaders
  }),
  locals
});
assert.equal(archivedResponse.status, 200);
assert.equal((await archivedResponse.json()).items.length, 1);

const exportResponse = await exportApi.GET({
  request: new Request('http://127.0.0.1/api/admin/consultations/export?archived=1', {
    headers: authenticatedHeaders
  }),
  locals
});
assert.equal(exportResponse.status, 200);
assert.match(await exportResponse.text(), /"'=1\+1"/);

const deleteResponse = await itemApi.DELETE({
  request: new Request('http://127.0.0.1/api/admin/consultations/1', {
    method: 'DELETE',
    headers: {
      ...authenticatedHeaders,
      origin: 'http://127.0.0.1',
      'x-confirm-reference': firstResult.reference
    }
  }),
  locals,
  params: { id: '1' }
});
assert.equal(deleteResponse.status, 200);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM consultations').get().total, 9);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM consultation_notes').get().total, 0);
assert.equal(
  sqlite.prepare('SELECT COUNT(*) AS total FROM consultation_activity WHERE consultation_id = 1').get().total,
  0
);

sqlite.close();
console.log('Cloudflare tests passed: Workers artifact, D1 migrations, Turnstile/rate limit, consultation API, admin auth, archive, notes, and cascade delete.');
