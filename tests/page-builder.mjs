import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

process.env.ASTRO_TELEMETRY_DISABLED = '1';
process.env.XDG_CONFIG_HOME = '/tmp/rajab-page-builder-config';
process.env.CLOUDFLARE_PLATFORM_PROXY = 'false';
process.env.TMPDIR = '/tmp/rajab-page-builder-runtime';
await mkdir(process.env.TMPDIR, { recursive: true });

const { dev } = await import('astro');
const root = new URL('../', import.meta.url);
const server = await dev({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const origin = `http://127.0.0.1:${server.address.port}`;
const original = await (await fetch(`${origin}/api/local-dashboard/content`)).json();

const types = [
  'hero', 'text-image', 'services-grid', 'steps', 'cases-gallery', 'about-profile',
  'features', 'faq', 'testimonials', 'gallery', 'stats', 'logos', 'cta',
  'consultation-form', 'contact'
];
const itemTypes = new Set(['steps', 'features', 'faq', 'testimonials', 'gallery', 'stats', 'logos']);
const section = (type, index) => ({
  id: `test-${type}`,
  type,
  name: `قسم اختبار ${type}`,
  visible: true,
  style: {
    background: index % 3 === 0 ? 'surface' : 'default',
    backgroundColor: '',
    textColor: '',
    accentColor: '',
    buttonColor: '',
    width: 'normal',
    spacing: 'small',
    alignment: index % 2 ? 'start' : 'center',
    imagePosition: 'end',
    columns: 3
  },
  content: {
    eyebrow: 'اختبار منشئ الصفحات',
    title: `عنوان ${type}`,
    description: 'محتوى اختباري عام لا يتضمن بيانات شخصية.',
    image: '',
    imageAlt: '',
    buttonLabel: type === 'hero' || type === 'cta' ? 'ابدأ الآن' : '',
    buttonUrl: type === 'hero' || type === 'cta' ? '#test-contact' : '',
    secondaryButtonLabel: '',
    secondaryButtonUrl: '',
    source: type === 'services-grid' ? 'services' : type === 'cases-gallery' ? 'cases' : type === 'about-profile' ? 'about' : type === 'contact' || type === 'consultation-form' ? 'contact' : 'manual',
    limit: 3,
    items: itemTypes.has(type) ? [{
      id: `test-item-${index + 1}`,
      title: `عنصر ${index + 1}`,
      text: 'وصف العنصر',
      image: '',
      imageAlt: '',
      value: type === 'stats' ? '25' : '',
      label: type === 'stats' ? 'قيمة اختبارية' : '',
      url: ''
    }] : []
  }
});

try {
  const modified = structuredClone(original);
  modified.theme = {
    ...modified.theme,
    preset: 'ocean',
    primary: '#155f74',
    primaryStrong: '#083947',
    primarySoft: '#39849a',
    secondary: '#a9d3dc',
    secondarySoft: '#e7f4f6',
    accent: '#1d8ca5',
    background: '#f8fcfd',
    surfaceAlt: '#edf7f8',
    text: '#16272c',
    muted: '#586b70',
    border: '#d3e6ea',
    focus: '#1d8ca5'
  };
  modified.pages.push({
    id: 'page-level-two-test',
    title: 'صفحة اختبار المستوى الثاني',
    slug: 'level-two-test',
    navigationLabel: 'اختبار المستوى الثاني',
    status: 'published',
    pageKind: 'landing',
    isHomepage: false,
    showInNavigation: false,
    headerMode: 'minimal',
    footerMode: 'minimal',
    seo: {
      title: 'صفحة اختبار المستوى الثاني',
      description: 'صفحة مؤقتة لاختبار منشئ الصفحات.',
      image: '/images/placeholders/portrait.svg',
      noindex: true
    },
    sections: types.map(section),
    updatedAt: new Date().toISOString()
  });
  modified.pages.at(-1).sections.find((item) => item.type === 'services-grid').content.limit = 0;
  modified.site.navigation.push({
    id: 'level-two-test-link',
    label: 'صفحة اختبار المستوى الثاني',
    url: '/level-two-test/',
    visible: true,
    primary: false
  });

  const save = await fetch(`${origin}/api/local-dashboard/content`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(modified)
  });
  assert.equal(save.status, 200, `حفظ صفحة الاختبار يعمل: ${await save.text()}`);

  const saved = await (await fetch(`${origin}/api/local-dashboard/content`)).json();
  assert.equal(saved.pages.some((page) => page.slug === 'level-two-test' && page.sections.length === 15), true);
  assert.equal(saved.pages.find((page) => page.slug === 'level-two-test').sections.find((item) => item.type === 'services-grid').content.limit, 0, 'القيمة 0 تحفظ خيار عرض جميع العناصر');
  assert.ok(saved.site.navigation.some((item) => item.id === 'level-two-test-link'));
  assert.equal(saved.theme.primary, '#155f74');

  let html = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${origin}/level-two-test/?attempt=${attempt}`, { redirect: 'manual' });
    html = await response.text();
    if (response.status === 200 && html.includes('صفحة اختبار المستوى الثاني')) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  assert.match(html, /صفحة اختبار المستوى الثاني|عنوان hero/, 'المسار الديناميكي يعرض الصفحة الجديدة');
  for (const type of types) assert.match(html, new RegExp(`builder-${type}`), `يُعرض القسم ${type}`);
  assert.match(html, /--primary:#155f74/, 'تُطبّق ألوان الهوية المركزية على الصفحة');
  assert.match(html, /main-nav-minimal/, 'صفحة الهبوط تستخدم الهيدر المبسط');

  console.log('Page builder tests passed: 15 section types, templates schema, dynamic published route, landing layout, and centralized theme variables.');
} finally {
  await fetch(`${origin}/api/local-dashboard/content`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(original)
  }).catch(() => {});
  await server.stop();
}
