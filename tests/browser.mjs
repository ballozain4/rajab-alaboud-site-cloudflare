import assert from 'node:assert/strict';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

process.env.ASTRO_TELEMETRY_DISABLED = '1';
process.env.XDG_CONFIG_HOME = '/tmp/rajab-alaboud-config';
process.env.CLOUDFLARE_PLATFORM_PROXY = 'false';
process.env.TMPDIR = '/tmp/rajab-browser-runtime';
await mkdir(process.env.TMPDIR, { recursive: true });
globalThis.Bare = { platform: process.platform };
const { default: chromium } = await import('@sparticuz/chromium');
const { default: puppeteer } = await import('puppeteer-core');
const { dev } = await import('astro');
const root = new URL('../', import.meta.url);
const server = await dev({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
const origin = `http://127.0.0.1:${server.address.port}`;
const originalContent = await (await fetch(`${origin}/api/local-dashboard/content`)).json();
const uploadDirectory = fileURLToPath(new URL('../public/images/uploads/', import.meta.url));
const servicesDirectory = fileURLToPath(new URL('../content/services/', import.meta.url));
const casesDirectory = fileURLToPath(new URL('../content/cases/', import.meta.url));
const testImagePath = '/tmp/rajab-dashboard-test.png';
await mkdir(uploadDirectory, { recursive: true });
await writeFile(testImagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
const uploadsBefore = new Set(await readdir(uploadDirectory));
const serviceFilesBefore = new Set(await readdir(servicesDirectory));
const caseFilesBefore = new Set(await readdir(casesDirectory));
let uploadedTestFiles = [];
const executablePath = await chromium.executablePath();
delete globalThis.Bare;
const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: null,
  executablePath,
  headless: 'shell'
});
console.log('Browser test stage: Chromium ready');

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') console.error('BROWSER CONSOLE:', entry.text()); });
  for (const width of [320, 360, 390, 412]) {
    console.log(`Browser test stage: homepage ${width}px`);
    await page.setViewport({ width, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
    const layout = await page.evaluate(() => {
      const quickCards = Array.from(document.querySelectorAll('.quick-start-card')).map((element) => element.getBoundingClientRect());
      const touchTargets = Array.from(document.querySelectorAll('.button, .menu-toggle, .mobile-action-bar a, .service-card, .comparison-button'))
        .filter((element) => !element.hasAttribute('hidden'))
        .map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
      return {
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        quickCount: quickCards.length,
        quickCardsNarrowerThanViewport: quickCards.every((rect) => rect.width < innerWidth - 12),
        undersizedTargets: touchTargets.filter((rect) => rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)).length,
        overflowElements: Array.from(document.querySelectorAll('body *')).map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, className: element.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
        }).filter((rect) => rect.right > innerWidth + 1 || rect.left < -1).slice(0, 12)
      };
    });
    assert.ok(layout.scrollWidth <= width + 1, `لا يوجد تمرير أفقي غير مقصود عند ${width}px: ${JSON.stringify(layout.overflowElements)}`);
    assert.equal(layout.quickCount, 3);
    assert.equal(layout.quickCardsNarrowerThanViewport, true, `بطاقات البداية مضغوطة عند ${width}px`);
    assert.equal(layout.undersizedTargets, 0, `أهداف اللمس الأساسية مناسبة عند ${width}px`);

    await page.click('.menu-toggle');
    await page.waitForFunction(() => {
      const nav = document.querySelector('#main-nav');
      const rect = nav?.getBoundingClientRect();
      return nav?.classList.contains('open') && rect && rect.left >= -1 && rect.right <= innerWidth + 1;
    });
    const menuState = await page.$eval('.menu-toggle', (element) => {
      const rect = element.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const nav = document.querySelector('#main-nav');
      const links = Array.from(nav?.querySelectorAll('a') || []);
      const overlay = document.querySelector('vite-error-overlay');
      const root = overlay?.shadowRoot;
      return {
        expanded: element.getAttribute('aria-expanded'),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        topTag: top?.tagName,
        topClass: top?.className,
        linkCount: links.length,
        visibleLinks: links.filter((link) => {
          const linkRect = link.getBoundingClientRect();
          return linkRect.width > 0 && linkRect.height >= 44 && linkRect.top >= 0 && linkRect.bottom <= innerHeight;
        }).length,
        clickableLinks: links.filter((link) => {
          const linkRect = link.getBoundingClientRect();
          const hit = document.elementFromPoint(linkRect.left + linkRect.width / 2, linkRect.top + linkRect.height / 2);
          return hit === link || link.contains(hit);
        }).length,
        linkHits: links.map((link) => {
          const linkRect = link.getBoundingClientRect();
          const hit = document.elementFromPoint(linkRect.left + linkRect.width / 2, linkRect.top + linkRect.height / 2);
          return { label: link.textContent.trim(), left: linkRect.left, right: linkRect.right, top: linkRect.top, bottom: linkRect.bottom, hit: hit?.className || hit?.tagName };
        }),
        navClientHeight: nav?.clientHeight,
        navScrollHeight: nav?.scrollHeight,
        overlay: root?.innerHTML?.slice(-5000)
      };
    });
    assert.equal(menuState.expanded, 'true', `قائمة الهاتف تفتح عند ${width}px: ${JSON.stringify(menuState)}`);
    assert.ok(menuState.linkCount >= 4, `قائمة الهاتف تحتوي جميع الروابط عند ${width}px`);
    assert.equal(menuState.visibleLinks, menuState.linkCount, `كل روابط القائمة ظاهرة معاً عند ${width}px: ${JSON.stringify(menuState)}`);
    assert.equal(menuState.clickableLinks, menuState.linkCount, `كل روابط القائمة قابلة للنقر عند ${width}px: ${JSON.stringify(menuState)}`);
    await page.$eval('#main-nav a[href="/#services"]', (link) => link.click());
    assert.equal(await page.$eval('.menu-toggle', (element) => element.getAttribute('aria-expanded')), 'false');
  }

  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  console.log('Browser test stage: desktop homepage');
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
  const sectionWidths = await page.evaluate(() => ['about', 'quick-start', 'consultation-steps', 'consultation', 'services', 'cases'].map((id) => {
    const container = document.querySelector(`#${id} > .container`);
    return { id, width: Math.round(container?.getBoundingClientRect().width || 0) };
  }));
  assert.ok(sectionWidths.every((item) => item.width === sectionWidths[0].width), `عروض محتوى أقسام الرئيسية متساوية: ${JSON.stringify(sectionWidths)}`);
  const serviceCardLayout = await page.$eval('.service-card', (card) => {
    const image = card.querySelector('.service-media-image');
    const category = card.querySelector('.service-category');
    const cardRect = card.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    const categoryRect = category?.getBoundingClientRect();
    return {
      imageWidth: imageRect?.width || 0,
      imageHeight: imageRect?.height || 0,
      cardWidth: cardRect.width,
      cardCenter: cardRect.left + cardRect.width / 2,
      categoryCenter: categoryRect ? categoryRect.left + categoryRect.width / 2 : 0,
      imageWidthAttribute: image?.querySelector('img')?.getAttribute('width'),
      imageHeightAttribute: image?.querySelector('img')?.getAttribute('height')
    };
  });
  assert.ok(Math.abs(serviceCardLayout.imageWidth - serviceCardLayout.cardWidth) <= 2, `صورة الخدمة تمتد على كامل عرض البطاقة: ${JSON.stringify(serviceCardLayout)}`);
  assert.ok(Math.abs(serviceCardLayout.imageWidth / serviceCardLayout.imageHeight - (16 / 9)) < 0.02, `صورة الخدمة معروضة بنسبة 1600×900: ${JSON.stringify(serviceCardLayout)}`);
  assert.equal(serviceCardLayout.imageWidthAttribute, '1600');
  assert.equal(serviceCardLayout.imageHeightAttribute, '900');
  assert.ok(Math.abs(serviceCardLayout.cardCenter - serviceCardLayout.categoryCenter) <= 1, `تصنيف الخدمة في منتصف البطاقة: ${JSON.stringify(serviceCardLayout)}`);

  await page.setViewport({ width: 390, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  console.log('Browser test stage: mobile interactions and consultation form');
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('[data-back-to-top]', (button) => button.hidden), true, 'زر العودة مخفي عند أعلى الصفحة');
  assert.equal(await page.$eval('.builder-profile-details .details-more', (label) => label.textContent.trim()), 'إظهار المزيد');
  await page.click('.builder-profile-details summary');
  assert.equal(await page.$eval('.builder-profile-details', (details) => details.open), true, 'زر إظهار المزيد يفتح تفاصيل بطاقة رجب داخل البطاقة');
  assert.ok(await page.$eval('.builder-profile-details .profile-details-content', (element) => element.textContent.trim().length > 40));
  const graduationLayout = await page.$eval('.graduation-project-detail', (element) => {
    const rect = element.getBoundingClientRect();
    const parent = element.closest('.mini-details')?.getBoundingClientRect();
    return {
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      inside: Boolean(parent && rect.left >= parent.left - 1 && rect.right <= parent.right + 1),
      textLength: element.textContent.trim().length
    };
  });
  assert.equal(graduationLayout.inside, true, 'تفاصيل مشروع التخرج تبقى داخل البطاقة');
  assert.ok(graduationLayout.scrollWidth <= graduationLayout.clientWidth + 1, 'نص مشروع التخرج لا يُقص أفقياً');
  assert.ok(graduationLayout.textLength > 20, 'نص مشروع التخرج ظاهر كاملاً');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-back-to-top]');
    return button && !button.hidden && !button.disabled;
  });
  await page.click('[data-back-to-top]');
  await page.waitForFunction(() => window.scrollY < 10);

  const serviceMore = await page.$('[data-reveal="services-list"]');
  assert.ok(serviceMore);
  await serviceMore.click();
  assert.equal(
    await page.$$eval('#services-list [data-reveal-item]', (items) => items.filter((item) => !item.hidden).length),
    9,
    'إظهار المزيد يعرض الخدمات التسع المعتمدة'
  );

  const firstService = await page.$('.service-card');
  assert.ok(firstService);
  assert.doesNotMatch(await firstService.evaluate((element) => element.textContent || ''), /تصنيف\s*:/, 'تظهر قيمة تصنيف الخدمة دون بادئة');
  await firstService.focus();
  await firstService.click();
  assert.equal(await page.$eval('dialog[id^="service-"]', (dialog) => dialog.open), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('dialog[id^="service-"]', (dialog) => dialog.open), false);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('service-card')), true, 'يعود التركيز إلى بطاقة الخدمة');

  await firstService.click();
  const selectedSlug = await page.$eval('dialog[open] [data-service-request]', (button) => button.dataset.serviceRequest);
  await page.click('dialog[open] [data-service-request]');
  await page.waitForFunction((slug) => {
    const select = document.querySelector('[data-service-select]');
    const field = select?.closest('[data-service-field]');
    return select && field && !field.hidden && select.value === slug && select.getBoundingClientRect().height > 0;
  }, {}, selectedSlug);
  assert.match(await page.$eval('[data-request-label]', (element) => element.textContent || ''), /طلب الحصول على خدمة/);
  assert.equal(
    await page.$$eval('[data-service-select] option', (options) => options.length),
    10,
    'تضم القائمة الخدمات التسع الظاهرة إضافة إلى خيار الإرشاد'
  );
  assert.equal(
    await page.$eval('[data-consultation-type-field]', (field) => field.hidden),
    true,
    'يختفي حقل نوع الاستشارة كاملاً عند طلب خدمة'
  );

  let submitCount = 0;
  let submittedPayload;
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (request.url().endsWith('/api/submit') && request.method() === 'POST') {
      submitCount += 1;
      submittedPayload = JSON.parse(await request.fetchPostData() || '{}');
      await request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, reference: 'CON-BROWSER-TEST', notificationStatus: 'sent', whatsappUrl: 'https://wa.me/963980623852?text=test' })
      });
    } else await request.continue();
  });
  await page.$eval('#consultation-name', (element) => {
    element.value = 'اختبار المتصفح';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.$eval('#consultation-phone', (element) => {
    element.value = '0980123456';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.select('#consultation-city', 'حمص');
  assert.equal(await page.$('#consultation-best-time'), null, 'أُلغي حقل أفضل وقت للتواصل');
  assert.equal(await page.$eval('#consultation-description', (element) => element.required), false, 'الوصف المختصر اختياري');
  const privacyAlreadyChecked = await page.$eval('#consultation-privacy', (element) => element.checked);
  if (!privacyAlreadyChecked) await page.$eval('.checkbox-field', (element) => element.click());
  const privacyState = await page.$eval('#consultation-privacy', (element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { checked: element.checked, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, topTag: top?.tagName, topClass: top?.className };
  });
  assert.equal(privacyState.checked, true, `يمكن تحديد موافقة الخصوصية: ${JSON.stringify(privacyState)}`);
  await page.$eval('[data-submit-button]', (element) => element.scrollIntoView({ block: 'center' }));
  const submitHit = await page.$eval('[data-submit-button]', (element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      bodyClass: document.body.className,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      topTag: top?.tagName,
      topClass: top?.className,
      disabled: element.disabled
    };
  });
  await page.click('[data-submit-button]');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const formResult = await page.evaluate(() => ({
    status: document.querySelector('[data-form-status]')?.textContent || '',
    invalid: Array.from(document.querySelectorAll('#consultation-form [aria-invalid="true"]')).map((element) => ({ name: element.getAttribute('name'), value: element.value })),
    disabled: document.querySelector('[data-submit-button]')?.disabled
  }));
  assert.match(formResult.status, /CON-BROWSER-TEST/, `يكتمل إرسال النموذج: ${JSON.stringify({ formResult, submitCount, submittedPayload, submitHit })}`);
  assert.equal(submitCount, 1);
  assert.equal(submittedPayload.consultation.requestMode, 'service');
  assert.equal(submittedPayload.consultation.serviceSlug, selectedSlug);
  assert.equal(submittedPayload.consultation.phone, '0980123456');
  assert.equal(submittedPayload.consultation.city, 'حمص');
  assert.equal('bestContactTime' in submittedPayload.consultation, false);
  assert.deepEqual(submittedPayload.consents, { privacy: true });
  await page.setRequestInterception(false);

  const caseMore = await page.$('[data-reveal="cases-list"]');
  assert.ok(caseMore);
  await caseMore.click();
  assert.equal(await page.$$eval('#cases-list [data-reveal-item]', (items) => items.filter((item) => !item.hidden).length), 8);
  assert.ok(await page.$('.case-card[data-case-display-type="before-after"]'), 'تظهر بطاقات الحالات المستوردة قبل وبعد');
  assert.doesNotMatch(
    await page.$eval('.case-card', (element) => element.textContent || ''),
    /الخدمة أو الإجراء\s*:/,
    'تظهر قيمة الإجراء دون بادئة داخل بطاقة الحالة'
  );
  const caseTitle = await page.$('.case-title-button');
  await caseTitle.focus();
  await caseTitle.click();
  assert.equal(await page.$eval('dialog[id^="case-"][open]', (dialog) => dialog.open), true, 'عنوان الحالة يفتح نافذة التفاصيل');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('case-title-button')), true, 'يعود التركيز إلى عنوان الحالة بعد الإغلاق');

  await page.screenshot({ path: '/tmp/rajab-home-390.png', fullPage: true });

  await page.goto(`${origin}/local-dashboard/`, { waitUntil: 'domcontentloaded' });
  console.log('Browser test stage: local dashboard');
  await page.waitForSelector('[data-panel="services"] [data-item-card]');
  const dashboardClick = (selector) => page.$eval(selector, (element) => element.click());
  const dashboardLayout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(dashboardLayout.scrollWidth <= dashboardLayout.width + 1, 'لوحة التحكم لا تُحدث تمريراً أفقياً على الهاتف');

  assert.ok(await page.$('#panel-pages'), 'توجد واجهة منشئ الصفحات');
  assert.ok(await page.$('#panel-theme'), 'توجد واجهة ألوان الموقع');
  assert.ok(await page.$('#panel-navigation'), 'توجد واجهة مستقلة لإدارة عناصر الهيدر');
  assert.equal(await page.$('#panel-service-fields'), null, 'لا يوجد تبويب منفصل لحقول الخدمات');
  assert.ok(await page.$('#panel-consultation-fields'), 'توجد واجهة مستقلة لتخصيص نموذج الاستشارة');
  assert.equal(await page.$('#panel-banner'), null, 'أزيلت واجهة المحتوى القديمة');
  assert.equal(await page.$('#panel-sections'), null, 'أزيلت واجهة ترتيب الأقسام القديمة');
  assert.equal(await page.$$eval('[data-section-library] option', (items) => items.length), 15, 'مكتبة الأقسام تحتوي 15 نوعاً مضبوطاً');
  const firstServiceCard = '[data-panel="services"] [data-item-card]:first-child';
  const secondServiceCard = '[data-panel="services"] [data-item-card]:nth-child(2)';
  const initialServiceFieldCount = await page.$$eval(`${firstServiceCard} [data-field-row]`, (items) => items.length);
  const secondSuitableForBefore = await page.$eval(
    `${secondServiceCard} [data-field-id="suitableFor"] .managed-field-heading strong`,
    (item) => item.textContent.trim()
  );
  await dashboardClick(`${firstServiceCard} [data-field-id="suitableFor"] [data-edit-display-field]`);
  await page.waitForSelector('[data-field-editor-dialog][open]');
  await page.$eval('[data-field-editor-label]', (input) => { input.value = 'الفئة المستهدفة'; });
  await dashboardClick('[data-field-editor-form] button[type="submit"]');
  assert.equal(
    await page.$eval(`${firstServiceCard} [data-field-id="suitableFor"] .managed-field-heading strong`, (item) => item.textContent.trim()),
    'الفئة المستهدفة',
    'يمكن تعديل عنوان حقل داخل خدمة واحدة مباشرة'
  );
  assert.equal(
    await page.$eval(`${secondServiceCard} [data-field-id="suitableFor"] .managed-field-heading strong`, (item) => item.textContent.trim()),
    secondSuitableForBefore,
    'لا ينتقل تعديل عنوان الحقل إلى خدمة أخرى'
  );
  await dashboardClick(`${firstServiceCard} [data-add-display-field]`);
  await page.waitForSelector('[data-field-editor-dialog][open]');
  await page.$eval('[data-field-editor-label]', (input) => { input.value = 'تعليمات إضافية'; });
  await dashboardClick('[data-field-editor-form] button[type="submit"]');
  assert.equal(await page.$$eval(`${firstServiceCard} [data-field-row]`, (items) => items.length), initialServiceFieldCount + 1, 'يمكن إضافة حقل إلى خدمة واحدة');
  assert.equal(await page.$$eval(`${secondServiceCard} [data-field-row]`, (items) => items.length), initialServiceFieldCount, 'لا يُضاف الحقل إلى الخدمات الأخرى');
  const customField = `${firstServiceCard} [data-field-id^="service-field-"]`;
  assert.ok(await page.$(`${customField} [data-key^="customFields."]`), 'يظهر الحقل الإضافي فوراً داخل الخدمة المختارة');
  await page.evaluate((cardSelector) => {
    const handle = document.querySelector(`${cardSelector} [data-field-id^="service-field-"] [data-field-drag-handle]`);
    const target = document.querySelectorAll(`${cardSelector} [data-field-row]`)[0];
    const dataTransfer = new DataTransfer();
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
  }, firstServiceCard);
  assert.equal(
    await page.$$eval(`${firstServiceCard} [data-field-row] .managed-field-heading strong`, (items) => items[0]?.textContent.trim()),
    'تعليمات إضافية',
    'يمكن إعادة ترتيب حقول البطاقة بالسحب والإفلات'
  );
  await dashboardClick(`${customField} [data-move-display-field="down"]`);
  assert.equal(
    await page.$$eval(`${firstServiceCard} [data-field-row] .managed-field-heading strong`, (items) => items[1]?.textContent.trim()),
    'تعليمات إضافية',
    'يمكن إعادة ترتيب الحقول بالأسهم'
  );
  await dashboardClick(`${firstServiceCard} [data-field-id^="service-field-"] [data-edit-display-field]`);
  page.once('dialog', (dialog) => dialog.accept());
  await dashboardClick('[data-delete-display-field]');
  assert.equal(await page.$$eval(`${firstServiceCard} [data-field-row]`, (items) => items.length), initialServiceFieldCount);

  const initialConsultationFieldCount = await page.$$eval('[data-panel="consultation-fields"] [data-model-card]', (items) => items.length);
  const descriptionRequired = await page.$$eval('[data-panel="consultation-fields"] [data-model-card]', (cards) => {
    const card = cards.find((item) => item.querySelector('code')?.textContent.trim() === 'description');
    return card?.querySelector('[data-model-key="required"]')?.checked;
  });
  assert.equal(descriptionRequired, false, 'حقل الوصف المختصر اختياري');
  await dashboardClick('[data-add-consultation-field]');
  assert.equal(
    await page.$$eval('[data-panel="consultation-fields"] [data-model-card]', (items) => items.length),
    initialConsultationFieldCount + 1,
    'يمكن إضافة حقل جديد إلى نموذج الاستشارة'
  );
  const newConsultationCard = '[data-panel="consultation-fields"] [data-model-card]:last-child';
  await page.$eval(`${newConsultationCard} [data-path$=".label"]`, (input) => {
    input.value = 'طريقة التواصل المفضلة';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await dashboardClick(`${newConsultationCard} [data-move-model="up"]`);
  assert.ok(
    await page.$$eval('[data-panel="consultation-fields"] [data-model-card]', (cards) =>
      cards.some((card) => card.querySelector('h3')?.textContent.trim() === 'طريقة التواصل المفضلة')),
    'يمكن تعديل عنوان الحقل وإعادة ترتيبه'
  );
  page.once('dialog', (dialog) => dialog.accept());
  await dashboardClick('[data-panel="consultation-fields"] [data-model-card] [data-delete-model]');
  assert.equal(await page.$$eval('[data-panel="consultation-fields"] [data-model-card]', (items) => items.length), initialConsultationFieldCount);
  const initialNavigationCount = await page.$$eval('[data-panel="navigation"] [data-navigation-item]', (items) => items.length);
  await dashboardClick('[data-add-navigation]');
  assert.equal(await page.$$eval('[data-panel="navigation"] [data-navigation-item]', (items) => items.length), initialNavigationCount + 1, 'يمكن إضافة عنصر إلى الهيدر');
  const addedNavigation = '[data-panel="navigation"] [data-navigation-item]:last-child';
  await page.$eval(`${addedNavigation} [data-navigation-key="label"]`, (input) => {
    input.value = 'رابط اختبار';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.$eval(`${addedNavigation} [data-navigation-key="url"]`, (input) => {
    input.value = '/achievements/';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const displayControls = await page.evaluate(() => Array.from(document.querySelectorAll('[data-page-section-card]')).map((card) => ({
    type: card.querySelector('[data-section-key="type"]')?.value,
    limit: card.querySelector('[data-section-key="content.limit"]')?.value || null
  })));
  assert.equal(displayControls.find((item) => item.type === 'services-grid')?.limit, '0', 'يعرض قسم الخدمات جميع العناصر افتراضياً');
  assert.equal(displayControls.find((item) => item.type === 'cases-gallery')?.limit, '0', 'يعرض معرض الأعمال جميع الحالات المنشورة افتراضياً');
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('[data-page-section-card]')).find((item) => item.querySelector('[data-section-key="type"]')?.value === 'services-grid');
    const input = card?.querySelector('[data-section-key="content.limit"]');
    input.value = '10';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const initialPageCount = await page.$$eval('[data-page-list] > button', (items) => items.length);
  await dashboardClick('[data-create-template="consultation"]');
  assert.equal(await page.$$eval('[data-page-list] > button', (items) => items.length), initialPageCount + 1, 'يمكن إنشاء صفحة من قالب الاستشارة');
  assert.equal(await page.$eval('[data-page-key="status"]', (select) => select.value), 'draft', 'الصفحة الجديدة تبدأ كمسودة');
  const templateSectionCount = await page.$$eval('[data-page-section-card]', (items) => items.length);
  assert.ok(templateSectionCount >= 4, 'قالب الاستشارة ينشئ بنية أقسام كاملة');
  await dashboardClick('[data-add-page-section]');
  assert.equal(await page.$$eval('[data-page-section-card]', (items) => items.length), templateSectionCount + 1, 'يمكن إضافة قسم من المكتبة');
  await dashboardClick('[data-page-undo]');
  assert.equal(await page.$$eval('[data-page-section-card]', (items) => items.length), templateSectionCount, 'التراجع يعيد بنية الصفحة');
  await dashboardClick('[data-page-redo]');
  assert.equal(await page.$$eval('[data-page-section-card]', (items) => items.length), templateSectionCount + 1, 'الإعادة تستعيد التعديل');
  await dashboardClick('[data-preview-size="mobile"]');
  assert.equal(await page.$eval('[data-page-preview]', (element) => element.classList.contains('mobile')), true, 'معاينة الهاتف تعمل');
  await dashboardClick('[data-theme-preset="ocean"]');
  assert.equal(await page.$eval('[data-theme-key="primary"][type="text"]', (input) => input.value), '#155f74', 'يمكن تطبيق لوحة ألوان جاهزة');
  page.once('dialog', (dialog) => dialog.accept());
  await dashboardClick('[data-delete-page]');
  assert.equal(await page.$$eval('[data-page-list] > button', (items) => items.length), initialPageCount, 'يمكن حذف الصفحة بعد التأكيد');
  page.once('dialog', (dialog) => dialog.accept());
  await dashboardClick('[data-reload]');
  await page.waitForFunction(() => document.querySelector('[data-theme-key="primary"][type="text"]')?.value === '#5a2f73');
  await dashboardClick('[data-add-navigation]');
  const savedNavigation = '[data-panel="navigation"] [data-navigation-item]:last-child';
  await page.$eval(`${savedNavigation} [data-navigation-key="label"]`, (input) => {
    input.value = 'رابط اختبار';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.$eval(`${savedNavigation} [data-navigation-key="url"]`, (input) => {
    input.value = '/achievements/';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('[data-page-section-card]')).find((item) => item.querySelector('[data-section-key="type"]')?.value === 'services-grid');
    const input = card?.querySelector('[data-section-key="content.limit"]');
    input.value = '10';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const initialServiceCount = await page.$$eval('[data-panel="services"] [data-item-card]', (items) => items.length);
  console.log('Browser test stage: dashboard service and case CRUD');
  await dashboardClick('[data-add-service]');
  assert.equal(await page.$$eval('[data-panel="services"] [data-item-card]', (items) => items.length), initialServiceCount + 1, 'يمكن إضافة خدمة');
  const addedServiceSelector = `[data-panel="services"] [data-item-card]:last-child`;
  await page.$eval(`${addedServiceSelector} [data-key="name"]`, (input) => {
    input.value = 'تنظيف البشرة الاختباري';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.match(await page.$eval(`${addedServiceSelector} [data-key="slug"]`, (input) => input.value), /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'يتولد slug إنجليزي صالح');
  await page.select(`${addedServiceSelector} [data-key="mediaType"]`, 'image');
  await dashboardClick(`${addedServiceSelector} [data-upload-collection="services"]`);
  await (await page.$('[data-image-input]')).uploadFile(testImagePath);
  await page.waitForFunction((selector) => document.querySelector(`${selector} [data-image-editor] img`)?.src.startsWith('blob:'), {}, addedServiceSelector);
  assert.deepEqual(new Set(await readdir(uploadDirectory)), uploadsBefore, 'اختيار الصورة لا ينسخها قبل حفظ ملفات المشروع');

  const firstServiceSelector = `[data-panel="services"] [data-item-card]:first-child`;
  await page.select(`${firstServiceSelector} [data-key="mediaType"]`, 'image');
  await page.$eval(`${firstServiceSelector} [data-key="image"]`, (input) => {
    input.value = '/images/placeholders/certificate.svg';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForSelector('[data-page-preview] .preview-block-card img');
  assert.ok(await page.$('[data-page-preview] .preview-block-card img'), 'المعاينة الفورية الحالية تعرض صورة الخدمة');
  await dashboardClick(`${firstServiceSelector} [data-remove-image="services"]`);
  assert.equal(await page.$eval(`${firstServiceSelector} [data-key="mediaType"]`, (select) => select.value), 'icon', 'إزالة الصورة تعيد الخدمة إلى الأيقونة');

  await dashboardClick(`${firstServiceSelector} [data-duplicate-item="services"]`);
  assert.equal(await page.$$eval('[data-panel="services"] [data-item-card]', (items) => items.length), initialServiceCount + 2, 'يمكن تكرار الخدمة');
  const orderBefore = await page.$$eval('[data-panel="services"] [data-card-identifier]', (items) => items.slice(0, 2).map((item) => item.textContent));
  await dashboardClick(`${firstServiceSelector} [data-move-item="down"]`);
  const orderAfter = await page.$$eval('[data-panel="services"] [data-card-identifier]', (items) => items.slice(0, 2).map((item) => item.textContent));
  assert.notDeepEqual(orderAfter, orderBefore, 'يمكن تغيير ترتيب الخدمات');
  page.once('dialog', (dialog) => dialog.accept());
  await dashboardClick('[data-panel="services"] [data-item-card]:nth-child(2) [data-delete-item="services"]');
  assert.equal(await page.$$eval('[data-panel="services"] [data-item-card]', (items) => items.length), initialServiceCount + 1, 'يمكن حذف الخدمة بعد التأكيد');

  const initialCaseCount = await page.$$eval('[data-panel="cases"] [data-item-card]', (items) => items.length);
  await dashboardClick('[data-add-case]');
  await dashboardClick('[data-add-case]');
  assert.equal(await page.$$eval('[data-panel="cases"] [data-item-card]', (items) => items.length), initialCaseCount + 2, 'يمكن إضافة حالتي قبل/بعد ونتيجة نهائية');
  const addedSingleCase = '[data-panel="cases"] [data-item-card]:last-child';
  await page.select(`${addedSingleCase} [data-key="displayType"]`, 'single-result');
  await page.$eval(`${addedSingleCase} [data-key="resultImage"]`, (input) => {
    input.value = '/images/placeholders/after.svg';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.ok(await page.$(`${addedSingleCase} [data-upload-collection="cases"][data-image-key="resultImage"]`), 'يظهر حقل الصورة النهائية فقط للنمط الفردي');
  assert.equal(await page.$(`${addedSingleCase} [data-image-key="beforeImage"]`), null);
  assert.ok(await page.$('[data-page-preview] .preview-block-card img'), 'المعاينة الفورية تعرض صور الحالات');

  page.once('dialog', (dialog) => dialog.accept());
  await dashboardClick('[data-reload]');
  await page.waitForFunction(
    (serviceCount, caseCount) =>
      document.querySelectorAll('[data-panel="services"] [data-item-card]').length === serviceCount
      && document.querySelectorAll('[data-panel="cases"] [data-item-card]').length === caseCount,
    {},
    initialServiceCount,
    initialCaseCount
  );

  const serviceOrderBeforeDrag = await page.$$eval(
    '[data-panel="services"] [data-card-identifier]',
    (items) => items.map((item) => item.textContent.trim())
  );
  await page.evaluate(() => {
    const handle = document.querySelector('[data-panel="services"] [data-item-card]:first-child [data-drag-handle]');
    const target = document.querySelector('[data-panel="services"] [data-item-card]:nth-child(3)');
    const dataTransfer = new DataTransfer();
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
  });
  const serviceOrderAfterDrag = await page.$$eval(
    '[data-panel="services"] [data-card-identifier]',
    (items) => items.map((item) => item.textContent.trim())
  );
  assert.notDeepEqual(serviceOrderAfterDrag, serviceOrderBeforeDrag, 'السحب والإفلات يغيّر ترتيب الخدمات');

  const caseOrderBeforeDrag = await page.$$eval(
    '[data-panel="cases"] [data-card-identifier]',
    (items) => items.map((item) => item.textContent.trim())
  );
  await page.evaluate(() => {
    const handle = document.querySelector('[data-panel="cases"] [data-item-card]:first-child [data-drag-handle]');
    const target = document.querySelector('[data-panel="cases"] [data-item-card]:nth-child(3)');
    const dataTransfer = new DataTransfer();
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
  });
  const caseOrderAfterDrag = await page.$$eval(
    '[data-panel="cases"] [data-card-identifier]',
    (items) => items.map((item) => item.textContent.trim())
  );
  assert.notDeepEqual(caseOrderAfterDrag, caseOrderBeforeDrag, 'السحب والإفلات يغيّر ترتيب الحالات');

  await dashboardClick('[data-add-navigation]');
  const finalNavigation = '[data-panel="navigation"] [data-navigation-item]:last-child';
  await page.$eval(`${finalNavigation} [data-navigation-key="label"]`, (input) => {
    input.value = 'رابط اختبار';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.$eval(`${finalNavigation} [data-navigation-key="url"]`, (input) => {
    input.value = '/achievements/';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('[data-page-section-card]')).find((item) => item.querySelector('[data-section-key="type"]')?.value === 'services-grid');
    const input = card?.querySelector('[data-section-key="content.limit"]');
    input.value = '10';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.$eval('[data-page-section-card]:first-child [data-section-key="content.title"]', (input) => {
    input.value = 'عنوان اختبار حفظ لوحة التحكم';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await dashboardClick('[data-save-draft]');
  assert.equal(await page.evaluate(() => Boolean(localStorage.getItem('rajab-local-dashboard-draft-v3'))), true);

  const saveResponse = page.waitForResponse((response) => response.url().endsWith('/api/local-dashboard/content') && response.request().method() === 'POST');
  console.log('Browser test stage: dashboard save and restore');
  await dashboardClick('[data-save-files]');
  assert.equal((await saveResponse).status(), 200, 'حفظ لوحة التحكم يكتب ملفات المحتوى');
  await page.waitForFunction(() => document.querySelector('[data-dashboard-message]')?.dataset.kind === 'success');
  const savedContent = await (await fetch(`${origin}/api/local-dashboard/content`)).json();
  const savedHomepage = savedContent.pages.find((item) => item.isHomepage);
  assert.equal(savedHomepage.sections[0].content.title, 'عنوان اختبار حفظ لوحة التحكم');
  assert.equal(savedHomepage.sections.find((item) => item.type === 'services-grid').content.limit, 10);
  assert.ok(savedContent.site.navigation.some((item) => item.label === 'رابط اختبار' && item.url === '/achievements/'));
  assert.equal(savedContent.cases.length, 8, 'تبقى الحالات الثماني المستوردة محفوظة');
  assert.deepEqual(savedContent.services.map((item) => item.slug), serviceOrderAfterDrag, 'ترتيب الخدمات المسحوب محفوظ في الملفات');
  assert.deepEqual(savedContent.cases.map((item) => item.slug), caseOrderAfterDrag, 'ترتيب الحالات المسحوب محفوظ في الملفات');
  assert.deepEqual(savedContent.services.map((item) => item.order), savedContent.services.map((_, index) => (index + 1) * 10));
  assert.deepEqual(savedContent.cases.map((item) => item.order), savedContent.cases.map((_, index) => (index + 1) * 10));
  uploadedTestFiles = (await readdir(uploadDirectory)).filter((name) => !uploadsBefore.has(name) && name.includes('rajab-dashboard-test'));

  let renderedSavedTitle = false;
  for (let attempt = 0; attempt < 15 && !renderedSavedTitle; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      renderedSavedTitle = (await (await fetch(`${origin}/?dashboard-save-test=${attempt}`)).text()).includes('عنوان اختبار حفظ لوحة التحكم');
    } catch {}
  }
  assert.equal(renderedSavedTitle, true, 'يظهر النص المحفوظ في الموقع العام');
  console.log('Browser tests passed: 320/360/390/412px responsiveness, dialogs/focus, case modes/title, back-to-top, form privacy, page templates/sections/undo/preview/theme, and dashboard CRUD/media/save workflow.');
} finally {
  try {
    const restoreResponse = await fetch(`${origin}/api/local-dashboard/content`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(originalContent)
    });
    if (!restoreResponse.ok) console.error('RESTORE ERROR:', await restoreResponse.text());
  } catch {}
  await browser.close();
  await server.stop();
  const uploadCleanup = (await readdir(uploadDirectory)).filter((name) => !uploadsBefore.has(name));
  const serviceCleanup = (await readdir(servicesDirectory)).filter((name) => !serviceFilesBefore.has(name));
  const caseCleanup = (await readdir(casesDirectory)).filter((name) => !caseFilesBefore.has(name));
  await Promise.all([
    ...Array.from(new Set([...uploadedTestFiles, ...uploadCleanup])).map((name) => unlink(`${uploadDirectory}/${name}`).catch(() => {})),
    ...serviceCleanup.map((name) => unlink(`${servicesDirectory}/${name}`).catch(() => {})),
    ...caseCleanup.map((name) => unlink(`${casesDirectory}/${name}`).catch(() => {}))
  ]);
  await unlink(testImagePath).catch(() => {});
}
