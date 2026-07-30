import assert from 'node:assert/strict';
import { readFile, stat, unlink } from 'node:fs/promises';

process.env.ASTRO_TELEMETRY_DISABLED = '1';
process.env.XDG_CONFIG_HOME = '/tmp/rajab-alaboud-config';
process.env.CLOUDFLARE_PLATFORM_PROXY = 'false';
const { dev } = await import('astro');
const root = new URL('../', import.meta.url);
const server = await dev({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const origin = `http://127.0.0.1:${server.address.port}`;
let uploadedImageUrl;

try {
  const homeResponse = await fetch(`${origin}/`);
  assert.equal(homeResponse.status, 200, 'الصفحة الرئيسية يجب أن تعمل');
  const home = await homeResponse.text();
  for (const id of ['top', 'about', 'consultation', 'services', 'cases']) {
    assert.match(home, new RegExp(`id=["']${id}["']`), `القسم #${id} مطلوب`);
  }
  assert.match(home, /اطلب استشارة مجانية/);
  assert.match(home, /تسجيل طلب الاستشارة/);
  assert.match(home, /data-service-request/);
  assert.match(home, /data-dialog-open/);
  assert.match(home, /data-back-to-top/);
  assert.match(home, /aria-label="العودة إلى أعلى الصفحة"/);
  assert.match(home, /case-title-button/);
  assert.match(home, /single-result/);
  assert.match(home, /builder-profile-details/);
  assert.match(home, /id="consultation-steps"/);
  assert.doesNotMatch(home, /id="home-cta"/, 'الدعوة الختامية مخفية في الموقع العام');
  assert.doesNotMatch(home, /name="bestContactTime"/, 'أُلغي حقل أفضل وقت للتواصل');
  assert.match(home, /id="consultation-description"/);
  assert.doesNotMatch(home, /id="consultation-description"[^>]*required/);
  assert.match(home, /لمن قد تناسب/);
  assert.match(home, /جامعة الحواش الخاصة/);
  assert.match(home, /class="details-more"[^>]*>إظهار المزيد/);
  assert.match(home, /> فيسبوك<\/a>/);
  assert.doesNotMatch(home, /data-open-cart|data-cart-count|href=["']\/products|href=["']\/checkout/);

  const dashboardResponse = await fetch(`${origin}/local-dashboard/`);
  assert.equal(dashboardResponse.status, 200, 'لوحة التحكم المحلية يجب أن تعمل في وضع التطوير');
  const dashboard = await dashboardResponse.text();
  assert.match(dashboard, /لوحة تحكم موقع رجب العبود/);
  assert.match(dashboard, /حفظ مسودة محلية/);
  assert.match(dashboard, /إعادة تحميل الملفات/);
  assert.match(dashboard, /panel-navigation/);
  assert.match(dashboard, /panel-achievements/);
  assert.match(dashboard, /panel-disclaimer/);
  assert.doesNotMatch(dashboard, /panel-service-fields/);
  assert.match(dashboard, /panel-consultation-fields/);
  assert.match(dashboard, /data-field-editor-dialog/);
  assert.match(dashboard, /data-field-editor-label/);
  assert.match(dashboard, /data-add-consultation-field/);
  assert.doesNotMatch(dashboard, /panel-banner|panel-sections|المحتوى المشترك القديم/);
  assert.doesNotMatch(dashboard, /API key|ADMIN_EMAIL|طلبات الاستشارة المحفوظة/);

  const contentResponse = await fetch(`${origin}/api/local-dashboard/content`);
  assert.equal(contentResponse.status, 200);
  const content = await contentResponse.json();
  assert.equal(content.site.name, 'رجب العبود');
  assert.equal(content.services.length, 9);
  assert.equal(content.cases.length, 8);
  assert.ok(Array.isArray(content.site.navigation));
  assert.ok(content.site.navigation.some((item) => item.url === '/#services' && item.visible));
  assert.ok(content.services.every((item) => ['icon', 'image'].includes(item.mediaType)));
  assert.ok(content.services.every((item) => typeof item.image === 'string'));
  assert.ok(content.cases.every((item) => ['before-after', 'single-result', 'before-after-gallery'].includes(item.displayType)));
  assert.ok(content.cases.every((item) => item.beforeImage && item.afterImage));
  assert.ok(content.cases.every((item) => ['draft', 'published'].includes(item.status)));
  assert.ok(content.services.every((item, index) => item.order === (index + 1) * 10));
  assert.ok(Array.isArray(content.achievements));
  assert.equal(content.achievements.length, 5);
  assert.ok(content.services.every((item) => Array.isArray(item.fields) && item.fields.length >= 5));
  assert.ok(content.cases.every((item) => Array.isArray(item.fields) && item.fields.length >= 7));
  assert.ok(content.achievements.every((item) => Array.isArray(item.fields) && item.fields.length >= 3));
  assert.notEqual(content.services[0].fields, content.services[1].fields, 'لكل خدمة نموذج حقول مستقل');
  assert.equal(content.disclaimer.slug, 'disclaimer');
  assert.equal(content.services[0].fields.find((field) => field.id === 'suitableFor')?.label, 'لمن قد تناسب');
  assert.equal(content.fieldModel.consultationFields.some((field) => field.id === 'bestContactTime'), false);
  assert.equal(content.fieldModel.consultationFields.find((field) => field.id === 'description')?.required, false);
  assert.equal(content.pages[0].sections.find((section) => section.id === 'home-cta')?.visible, false);

  const saveResponse = await fetch(`${origin}/api/local-dashboard/content`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(content)
  });
  const saveResult = await saveResponse.json();
  assert.equal(saveResponse.status, 200, `حفظ المحتوى المحلي يجب أن يعمل: ${JSON.stringify(saveResult)}`);
  assert.equal(saveResult.ok, true);

  const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const imageResponse = await fetch(`${origin}/api/local-dashboard/image`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', 'x-image-name': encodeURIComponent('smoke-upload.png') },
    body: imageBytes
  });
  assert.equal(imageResponse.status, 200, 'رفع الصور المحلي يعمل بطلب صورة آمن');
  const imageResult = await imageResponse.json();
  assert.match(imageResult.path, /^\/images\/uploads\/[0-9]+-smoke-upload\.png$/);
  uploadedImageUrl = new URL(`../public${imageResult.path}`, import.meta.url);
  assert.equal((await stat(uploadedImageUrl)).size, imageBytes.length);

  const robots = await (await fetch(`${origin}/robots.txt`)).text();
  assert.match(robots, /Disallow: \/local-dashboard\//);
  assert.match(robots, /Disallow: \/api\//);

  const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8');
  assert.match(redirects, /\/products\/\*\s+\/#consultation/);
  const localPage = await readFile(new URL('../src/pages/local-dashboard/index.astro', import.meta.url), 'utf8');
  const localApi = await readFile(new URL('../src/pages/api/local-dashboard/content.ts', import.meta.url), 'utf8');
  const localContent = await readFile(new URL('../src/lib/local-dashboard-content.ts', import.meta.url), 'utf8');
  assert.match(localPage, /!import\.meta\.env\.DEV/);
  assert.match(localApi, /import\.meta\.env\.DEV/);
  assert.match(localContent, /relative\(contentRoot, target\)/);
  assert.match(localContent, /isAbsolute\(relativeTarget\)/);
  assert.match(localContent, /mkdir\(dirname\(target\)/);

  const css = await readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.back-to-top/);
  assert.match(css, /\.menu-backdrop\.open/);
  assert.match(css, /grid-auto-rows: minmax\(46px, max-content\)/);
  assert.match(css, /\.graduation-project-detail/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /safe-area-inset-bottom/);
  console.log('Smoke tests passed: homepage profile/footer, configurable navigation, media/case schemas, Windows-safe content save, and responsive guards.');
} finally {
  await server.stop();
  if (uploadedImageUrl) await unlink(uploadedImageUrl).catch(() => {});
}
