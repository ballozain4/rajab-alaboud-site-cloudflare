type ConsultationRow = Record<string, string | number | null>;
type Breakdown = { label: string; count: number };
type AdminOptions = {
  statusLabels: Record<string, string>;
  statusValues: string[];
  consultationFieldLabels: Record<string, string>;
};

declare global {
  interface Window {
    __RAJAB_ADMIN_OPTIONS__?: AdminOptions;
  }
}

const options = window.__RAJAB_ADMIN_OPTIONS__ || { statusLabels: {}, statusValues: [], consultationFieldLabels: {} };
const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const loginView = $('[data-login-view]')!;
const adminView = $('[data-admin-view]')!;
const filterForm = $('[data-filter-form]') as HTMLFormElement;
const requestDialog = $('[data-request-dialog]') as HTMLDialogElement;
const detailContent = $('[data-detail-content]')!;
const message = $('[data-global-message]')!;
let currentPage = 1;
let selected: ConsultationRow | null = null;
let loading = false;

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character] || character));
const formatDate = (value: unknown) => {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('ar-SY', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
const statusLabel = (value: unknown) => options.statusLabels[String(value)] || String(value || '—');
const phoneDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
const setMessage = (text: string, kind: 'success' | 'error' | '' = '') => {
  message.textContent = text;
  message.dataset.kind = kind;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers || {})
    },
    ...init
  });
  const type = response.headers.get('content-type') || '';
  const result = type.includes('application/json')
    ? await response.json() as { message?: string }
    : null;
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw new Error(result?.message || 'تعذر تنفيذ الطلب.');
  }
  return result as T;
}

const showLogin = () => {
  loginView.hidden = false;
  adminView.hidden = true;
  requestDialog.close();
  $('[data-login-form] input')?.focus();
};
const showAdmin = () => {
  loginView.hidden = true;
  adminView.hidden = false;
};

const renderBreakdown = (selector: string, rows: Breakdown[], labels: Record<string, string> = {}) => {
  const target = $(selector)!;
  const top = rows.slice(0, 6);
  target.innerHTML = top.length
    ? top.map((row) => `<div><span>${esc(labels[row.label] || row.label)}</span><strong>${Number(row.count) || 0}</strong></div>`).join('')
    : '<p>لا توجد بيانات بعد.</p>';
};

const renderStats = (stats: Record<string, any>) => {
  const overview = stats.overview || {};
  ($('[data-stat="total"]')!).textContent = String(Number(overview.total) || 0);
  ($('[data-stat="new"]')!).textContent = String(Number(overview.new_count) || 0);
  ($('[data-stat="booked"]')!).textContent = String(Number(overview.booked_count) || 0);
  ($('[data-stat="completed"]')!).textContent = String(Number(overview.completed_count) || 0);
  ($('[data-stat="archived"]')!).textContent = String(Number(overview.archived_count) || 0);
  const newCount = Number(overview.new_count) || 0;
  document.title = `${newCount ? `(${newCount}) ` : ''}إدارة طلبات الاستشارة | رجب العبود`;
  renderBreakdown('[data-insight-statuses]', stats.statuses || [], options.statusLabels);
  renderBreakdown('[data-insight-cities]', stats.cities || []);
  renderBreakdown('[data-insight-sources]', stats.sources || []);
};

const rowTemplate = (item: ConsultationRow) => `
  <button class="request-row" type="button" data-open-request="${Number(item.id)}">
    <span class="request-main">
      <strong>${esc(item.name)}</strong>
      <small>${esc(item.reference)} · ${esc(item.city)}</small>
    </span>
    <span class="request-subject">${esc(item.subject)}</span>
    <span class="status-pill status-${esc(item.status)}">${esc(statusLabel(item.status))}</span>
    <time datetime="${esc(item.created_at)}">${esc(formatDate(item.created_at))}</time>
    <span class="row-arrow" aria-hidden="true">←</span>
  </button>`;

const renderList = (items: ConsultationRow[], total: number) => {
  const target = $('[data-requests-list]')!;
  ($('[data-results-count]')!).textContent = `${total} طلب`;
  target.innerHTML = items.length
    ? `<div class="request-list-head" aria-hidden="true"><span>العميل</span><span>الموضوع</span><span>الحالة</span><span>التاريخ</span><span></span></div>${items.map(rowTemplate).join('')}`
    : '<div class="empty-requests"><strong>لا توجد طلبات مطابقة</strong><p>غيّر الفلاتر أو انتظر وصول طلب جديد.</p></div>';
};

const renderPagination = (page: number, pages: number) => {
  const target = $('[data-pagination]')!;
  target.innerHTML = pages <= 1 ? '' : `
    <button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>السابق</button>
    <span>صفحة ${page} من ${pages}</span>
    <button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>التالي</button>`;
};

const filterQuery = () => {
  const data = new FormData(filterForm);
  const params = new URLSearchParams();
  for (const [key, value] of data) if (String(value).trim()) params.set(key, String(value));
  params.set('page', String(currentPage));
  return params;
};

async function loadRequests(quiet = false) {
  if (loading) return;
  loading = true;
  if (!quiet) setMessage('جارٍ تحميل الطلبات…');
  try {
    const result = await api<{
      items: ConsultationRow[];
      pagination: { page: number; total: number; pages: number };
      stats: Record<string, any>;
    }>(`/api/admin/consultations?${filterQuery()}`);
    renderList(result.items, Number(result.pagination.total) || 0);
    renderPagination(Number(result.pagination.page) || 1, Number(result.pagination.pages) || 1);
    renderStats(result.stats);
    if (!quiet) setMessage(`آخر تحديث: ${formatDate(new Date().toISOString())}`, 'success');
  } catch (error) {
    setMessage(error instanceof Error ? error.message : 'تعذر تحميل الطلبات.', 'error');
  } finally {
    loading = false;
  }
}

const detailValue = (label: string, value: unknown, full = false) => `
  <div class="${full ? 'full' : ''}"><dt>${esc(label)}</dt><dd>${esc(value || '—')}</dd></div>`;

const activityLabel = (action: unknown) => ({
  created: 'تم إنشاء الطلب',
  status_changed: 'تغيير الحالة',
  note_added: 'إضافة ملاحظة',
  archived: 'أرشفة الطلب',
  restored: 'استعادة الطلب'
}[String(action)] || String(action || 'تحديث'));

const messageTemplates = [
  {
    label: 'رسالة الترحيب',
    value: (item: ConsultationRow) => `مرحباً ${item.name}، معك رجب العبود. وصلني طلب الاستشارة رقم ${item.reference} وسأتابع معك بخصوص ${item.subject}.`
  },
  {
    label: 'طلب صور',
    value: (item: ConsultationRow) => `مرحباً ${item.name}، لمتابعة الطلب ${item.reference} يمكنك إرسال صور واضحة في إضاءة طبيعية ومن دون فلاتر، مع تجنب إظهار أي معلومات شخصية غير لازمة.`
  },
  {
    label: 'تأكيد موعد',
    value: (item: ConsultationRow) => `مرحباً ${item.name}، نود تأكيد موعدك المرتبط بالطلب ${item.reference}. يرجى الرد لتثبيت اليوم والوقت.`
  },
  {
    label: 'تذكير بالموعد',
    value: (item: ConsultationRow) => `تذكير لطيف بموعدك المرتبط بالطلب ${item.reference}. يرجى إبلاغنا إذا احتجت إلى تعديل الموعد.`
  },
  {
    label: 'متابعة بعد الاستشارة',
    value: (item: ConsultationRow) => `مرحباً ${item.name}، أتابع معك بعد الاستشارة رقم ${item.reference}. كيف أصبح الوضع؟ يمكنك إرسال أي ملاحظة أو سؤال لديك.`
  }
];

function renderDetail(payload: { item: ConsultationRow; notes: ConsultationRow[]; activity: ConsultationRow[] }) {
  selected = payload.item;
  const item = payload.item;
  ($('[data-detail-title]')!).textContent = `${item.reference} — ${item.name}`;
  const selectedStatus = String(item.status);
  const archived = Number(item.archived) === 1;
  let extraFields: Record<string, string | boolean> = {};
  try {
    const parsed = JSON.parse(String(item.extra_fields_json || '{}')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) extraFields = parsed as Record<string, string | boolean>;
  } catch {
    extraFields = {};
  }
  const extraDetails = Object.entries(extraFields)
    .filter(([, value]) => value !== '' && value !== false)
    .map(([key, value]) => detailValue(options.consultationFieldLabels[key] || key, value === true ? 'نعم' : value, true))
    .join('');
  detailContent.innerHTML = `
    <div class="detail-actions">
      <a class="admin-button primary" href="https://wa.me/${phoneDigits(item.phone_normalized)}" target="_blank" rel="noopener" data-whatsapp-link>فتح واتساب</a>
      <a class="admin-button secondary" href="tel:${esc(item.phone_normalized)}">اتصال</a>
      <button class="admin-button secondary" type="button" data-copy-phone>نسخ الرقم</button>
    </div>

    <dl class="detail-grid">
      ${detailValue('الاسم', item.name)}
      ${detailValue('الهاتف', item.phone)}
      ${detailValue('الهاتف الدولي', item.phone_normalized)}
      ${detailValue('المحافظة', item.city)}
      ${detailValue('نوع الاستشارة', item.consultation_type)}
      ${detailValue('الخدمة المحددة', item.service_name)}
      ${detailValue('الموضوع', item.subject, true)}
      ${detailValue('الوصف', item.description, true)}
      ${extraDetails}
      ${detailValue('المصدر', item.source)}
      ${detailValue('تاريخ الإنشاء', formatDate(item.created_at))}
      ${detailValue('آخر تحديث', formatDate(item.updated_at))}
    </dl>

    <section class="detail-section">
      <h3>إدارة المتابعة</h3>
      <div class="detail-edit-grid">
        <label><span>الحالة</span><select data-detail-status>${options.statusValues.map((status) => `<option value="${esc(status)}" ${status === selectedStatus ? 'selected' : ''}>${esc(statusLabel(status))}</option>`).join('')}</select></label>
        <label class="full"><span>ملاحظة داخلية جديدة</span><textarea rows="3" maxlength="2000" data-detail-note placeholder="لا تظهر هذه الملاحظة للعميل."></textarea></label>
      </div>
      <div class="detail-save-actions">
        <button class="admin-button primary" type="button" data-save-detail>حفظ التحديث</button>
        <button class="admin-button secondary" type="button" data-toggle-archive>${archived ? 'استعادة من الأرشيف' : 'أرشفة الطلب'}</button>
        <button class="admin-button danger" type="button" data-delete-request>حذف نهائي</button>
      </div>
    </section>

    <section class="detail-section">
      <h3>رسالة واتساب جاهزة</h3>
      <div class="message-template-row">
        <select data-message-template>${messageTemplates.map((template, index) => `<option value="${index}">${esc(template.label)}</option>`).join('')}</select>
        <button class="admin-button secondary" type="button" data-copy-template>نسخ الرسالة</button>
        <button class="admin-button primary" type="button" data-open-template>فتحها في واتساب</button>
      </div>
      <textarea class="template-preview" rows="4" readonly data-template-preview></textarea>
    </section>

    <section class="detail-section">
      <h3>الملاحظات الداخلية</h3>
      <div class="timeline">${payload.notes.length ? payload.notes.map((note) => `<article><time>${esc(formatDate(note.created_at))}</time><p>${esc(note.note)}</p></article>`).join('') : '<p>لا توجد ملاحظات بعد.</p>'}</div>
    </section>

    <section class="detail-section">
      <h3>سجل النشاط</h3>
      <div class="timeline">${payload.activity.length ? payload.activity.map((entry) => `<article><time>${esc(formatDate(entry.created_at))}</time><strong>${esc(activityLabel(entry.action))}</strong><p>${esc(entry.details)}</p></article>`).join('') : '<p>لا يوجد نشاط مسجل.</p>'}</div>
    </section>`;
  updateTemplatePreview();
}

const currentTemplate = () => {
  if (!selected) return '';
  const index = Number($<HTMLSelectElement>('[data-message-template]')?.value || 0);
  return (messageTemplates[index] || messageTemplates[0]).value(selected);
};
const updateTemplatePreview = () => {
  const preview = $('[data-template-preview]') as HTMLTextAreaElement | null;
  if (preview) preview.value = currentTemplate();
};

async function openRequest(id: number) {
  try {
    setMessage('جارٍ فتح الطلب…');
    const payload = await api<{ item: ConsultationRow; notes: ConsultationRow[]; activity: ConsultationRow[] }>(`/api/admin/consultations/${id}`);
    renderDetail(payload);
    requestDialog.showModal();
    setMessage('');
    await loadRequests(true);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : 'تعذر فتح الطلب.', 'error');
  }
}

async function patchSelected(update: Record<string, unknown>) {
  if (!selected) return;
  const id = Number(selected.id);
  const result = await api<{ item: ConsultationRow; notes: ConsultationRow[]; activity: ConsultationRow[] }>(
    `/api/admin/consultations/${id}`,
    { method: 'PATCH', body: JSON.stringify(update) }
  );
  renderDetail(result);
  await loadRequests(true);
}

$('[data-login-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const output = $('[data-login-message]')!;
  const button = form.querySelector<HTMLButtonElement>('button')!;
  button.disabled = true;
  output.textContent = 'جارٍ التحقق…';
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: new FormData(form).get('password') })
    });
    form.reset();
    showAdmin();
    await loadRequests();
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : 'تعذر تسجيل الدخول.';
  } finally {
    button.disabled = false;
  }
});

filterForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  currentPage = 1;
  loadRequests();
});

document.addEventListener('change', (event) => {
  const target = event.target as HTMLElement;
  if (target.matches('[data-message-template]')) updateTemplatePreview();
});

document.addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('button, [data-open-request]');
  if (!button) return;
  if (button.dataset.openRequest) return openRequest(Number(button.dataset.openRequest));
  if (button.dataset.page) {
    currentPage = Number(button.dataset.page);
    return loadRequests();
  }
  if (button.hasAttribute('data-refresh')) return loadRequests();
  if (button.hasAttribute('data-reset-filters')) {
    filterForm.reset();
    currentPage = 1;
    return loadRequests();
  }
  if (button.hasAttribute('data-close-dialog')) return requestDialog.close();
  if (button.hasAttribute('data-logout')) {
    await api('/api/admin/logout', { method: 'POST', body: '{}' }).catch(() => {});
    return showLogin();
  }
  if (button.hasAttribute('data-export')) {
    try {
      const archived = (filterForm.elements.namedItem('archived') as HTMLInputElement)?.checked ? '1' : '0';
      const response = await fetch(`/api/admin/consultations/export?archived=${archived}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('تعذر تصدير الملف.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `consultations-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('تم تجهيز ملف CSV.', 'success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر التصدير.', 'error');
    }
    return;
  }
  if (button.hasAttribute('data-copy-phone') && selected) {
    await navigator.clipboard.writeText(String(selected.phone_normalized || selected.phone || ''));
    return setMessage('تم نسخ رقم الهاتف.', 'success');
  }
  if (button.hasAttribute('data-save-detail')) {
    try {
      await patchSelected({
        status: $<HTMLSelectElement>('[data-detail-status]')!.value,
        note: $<HTMLTextAreaElement>('[data-detail-note]')!.value
      });
      setMessage('تم حفظ تحديثات الطلب.', 'success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر الحفظ.', 'error');
    }
    return;
  }
  if (button.hasAttribute('data-toggle-archive') && selected) {
    try {
      const restoring = Number(selected.archived) === 1;
      await patchSelected({ archived: !restoring });
      requestDialog.close();
      setMessage(restoring ? 'تمت استعادة الطلب.' : 'تمت أرشفة الطلب.', 'success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تحديث الأرشيف.', 'error');
    }
    return;
  }
  if (button.hasAttribute('data-delete-request') && selected) {
    const reference = String(selected.reference);
    if (!window.confirm(`سيُحذف الطلب ${reference} نهائياً مع ملاحظاته وسجله. هل تريد المتابعة؟`)) return;
    try {
      await api(`/api/admin/consultations/${selected.id}`, {
        method: 'DELETE',
        headers: { 'x-confirm-reference': reference }
      });
      requestDialog.close();
      selected = null;
      setMessage(`تم حذف الطلب ${reference} نهائياً.`, 'success');
      await loadRequests(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر حذف الطلب.', 'error');
    }
    return;
  }
  if (button.hasAttribute('data-copy-template')) {
    await navigator.clipboard.writeText(currentTemplate());
    return setMessage('تم نسخ رسالة واتساب.', 'success');
  }
  if (button.hasAttribute('data-open-template') && selected) {
    window.open(`https://wa.me/${phoneDigits(selected.phone_normalized)}?text=${encodeURIComponent(currentTemplate())}`, '_blank', 'noopener');
  }
});

requestDialog.addEventListener('click', (event) => {
  if (event.target === requestDialog) requestDialog.close();
});

async function initialize() {
  try {
    await api('/api/admin/session');
    showAdmin();
    await loadRequests();
    window.setInterval(() => {
      if (!document.hidden && !requestDialog.open) loadRequests(true);
    }, 60_000);
  } catch {
    showLogin();
  }
}

initialize();
export {};
