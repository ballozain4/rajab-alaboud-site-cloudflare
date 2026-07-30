import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost/' });
const globals = ['window', 'document', 'location', 'localStorage', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLDialogElement', 'HTMLFormElement', 'FormData', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'Node'];
for (const name of globals) Object.defineProperty(globalThis, name, { configurable: true, value: window[name] });
Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback) => window.setTimeout(callback, 0) });
window.HTMLElement.prototype.scrollIntoView = () => {};

const dialogPrototype = window.HTMLDialogElement.prototype;
dialogPrototype.showModal = function showModal() {
  this.open = true;
  this.setAttribute('open', '');
};
dialogPrototype.close = function close() {
  if (!this.open) return;
  this.open = false;
  this.removeAttribute('open');
  this.dispatchEvent(new window.Event('close'));
};

window.document.body.innerHTML = `
  <button id="open-service" type="button" data-dialog-open="service-initial-consultation">فتح الخدمة</button>
  <dialog id="service-initial-consultation">
    <button type="button" data-dialog-close>إغلاق</button>
    <button type="button" data-service-request="initial-consultation">طلب هذه الخدمة</button>
  </dialog>
  <button id="open-case-title" class="case-title-button" type="button" data-dialog-open="case-demo" aria-haspopup="dialog">عنوان الحالة التجريبية</button>
  <dialog id="case-demo" aria-labelledby="case-demo-title">
    <h2 id="case-demo-title">عنوان الحالة التجريبية</h2>
    <button type="button" data-dialog-close>إغلاق</button>
  </dialog>
  <button type="button" data-reveal="services-list" data-more-label="إظهار المزيد" data-less-label="إظهار أقل" aria-expanded="false">إظهار المزيد</button>
  <div id="services-list"><article data-reveal-item></article><article data-reveal-item></article><article data-reveal-item></article><article data-reveal-item hidden></article></div>
  <section id="consultation">
    <form data-consultation-form novalidate>
      <input type="hidden" name="requestMode" value="consultation" data-request-mode />
      <div data-service-mode-notice hidden><button type="button" data-reset-consultation>العودة</button></div>
      <input name="name" required minlength="2" />
      <p data-error-for="name"></p>
      <input name="phone" required pattern="[+0-9 ()\-]{7,30}" />
      <p data-error-for="phone"></p>
      <select name="city" required><option value=""></option><option>حمص</option></select>
      <p data-error-for="city"></p>
      <div data-consultation-type-field>
        <label>نوع الاستشارة <span>*</span></label>
        <select name="consultationType" required data-consultation-type><option value=""></option><option>استشارة عن خدمة</option></select>
        <p data-error-for="consultationType"></p>
      </div>
      <div data-service-field hidden>
        <label data-request-label>طلب الحصول على خدمة <span>*</span></label>
        <select name="serviceSlug" disabled data-service-select><option value=""></option><option value="initial-consultation">الاستشارة الأولية</option></select>
        <p data-error-for="serviceSlug"></p>
      </div>
      <label data-subject-label>الخدمة أو المشكلة المطلوبة <span>*</span></label>
      <input name="subject" required minlength="3" />
      <p data-error-for="subject"></p>
      <textarea name="description"></textarea><p data-error-for="description"></p>
      <input name="preferredChannel" data-custom-field="preferredChannel" value="" />
      <p data-error-for="preferredChannel"></p>
      <input name="privacy" type="checkbox" required /><p data-error-for="privacy"></p>
      <input name="cf-turnstile-response" type="hidden" value="local-demo" />
      <button type="submit" data-submit-button><span data-submit-label>تسجيل طلب الاستشارة</span></button>
      <div data-form-status></div>
    </form>
  </section>`;

await import(`../src/scripts/dialogs.ts?test=${Date.now()}`);
await import(`../src/scripts/landing.ts?test=${Date.now()}`);

const opener = window.document.querySelector('#open-service');
const dialog = window.document.querySelector('#service-initial-consultation');
opener.click();
assert.equal(dialog.open, true, 'بطاقة الخدمة تفتح النافذة');
assert.equal(window.document.body.classList.contains('dialog-open'), true);
window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
assert.equal(dialog.open, false, 'Escape يغلق النافذة');
assert.equal(window.document.activeElement, opener, 'يعود التركيز إلى العنصر الذي فتح النافذة');

const caseTitle = window.document.querySelector('#open-case-title');
caseTitle.focus();
caseTitle.click();
assert.equal(window.document.querySelector('#case-demo').open, true, 'عنوان الحالة يفتح النافذة نفسها');
window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
assert.equal(window.document.activeElement, caseTitle, 'يعود التركيز إلى عنوان الحالة بعد الإغلاق');

const revealButton = window.document.querySelector('[data-reveal]');
const fourthItem = window.document.querySelectorAll('[data-reveal-item]')[3];
revealButton.click();
assert.equal(fourthItem.hidden, false, 'إظهار المزيد يكشف العناصر الأخرى');
assert.equal(revealButton.getAttribute('aria-expanded'), 'true');
revealButton.click();
assert.equal(fourthItem.hidden, true, 'إظهار أقل يعيد إخفاء العناصر');

opener.click();
window.document.querySelector('[data-service-request]').click();
const form = window.document.querySelector('[data-consultation-form]');
const mode = form.querySelector('[data-request-mode]');
const consultationType = form.querySelector('[data-consultation-type]');
const serviceSelect = form.querySelector('[data-service-select]');
assert.equal(mode.value, 'service', 'طلب الخدمة يحول النموذج إلى وضع الخدمة');
assert.equal(serviceSelect.value, 'initial-consultation', 'الخدمة المضغوط عليها محددة تلقائياً');
assert.equal(serviceSelect.disabled, false);
assert.equal(form.querySelector('[data-service-field]').hidden, false);
assert.equal(form.querySelector('[data-consultation-type-field]').hidden, true);
assert.equal(consultationType.disabled, true);
assert.match(form.querySelector('[data-request-label]').textContent, /طلب الحصول على خدمة/);

form.elements.name.value = 'اختبار المستخدم';
form.elements.phone.value = '0980123456';
form.elements.city.value = 'حمص';
form.elements.subject.value = 'استشارة أولية';
form.elements.description.value = '';
form.elements.preferredChannel.value = 'واتساب';
form.elements.privacy.checked = true;

let fetchCount = 0;
let requestPayload;
let releaseFetch;
const fetchPromise = new Promise((resolve) => { releaseFetch = resolve; });
const fetchStub = async (_url, options) => {
  fetchCount += 1;
  requestPayload = JSON.parse(options.body);
  return fetchPromise;
};
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchStub });
window.fetch = fetchStub;

const submitEvent = () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
submitEvent();
submitEvent();
assert.equal(fetchCount, 1, 'يُمنع الإرسال المتكرر أثناء انتظار الاستجابة');
assert.equal(requestPayload.consultation.requestMode, 'service');
assert.equal(requestPayload.consultation.serviceSlug, 'initial-consultation');
assert.equal(requestPayload.consultation.phone, '0980123456');
assert.equal(requestPayload.consultation.city, 'حمص');
assert.equal('bestContactTime' in requestPayload.consultation, false);
assert.deepEqual(requestPayload.consultation.extraFields, { preferredChannel: 'واتساب' });
assert.deepEqual(requestPayload.consents, { privacy: true }, 'لا يوجد سوى موافقة الخصوصية');

releaseFetch({
  ok: true,
  json: async () => ({ ok: true, reference: 'CON-TEST-123', notificationStatus: 'sent', whatsappUrl: 'https://wa.me/963980623852?text=test' })
});
await window.happyDOM.waitUntilComplete();
assert.match(form.querySelector('[data-form-status]').textContent, /CON-TEST-123/);
assert.equal(form.querySelector('[data-form-status] a').href.startsWith('https://wa.me/'), true);

console.log('Interaction tests passed: service/case-title dialogs, Escape/focus return, reveal controls, service preselection, validation payload, and duplicate-submit guard.');
await window.happyDOM.abort();
