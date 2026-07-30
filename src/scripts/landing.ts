const form = document.querySelector<HTMLFormElement>('[data-consultation-form]');
const consultationSection = document.getElementById('consultation');
const track = (event: string, properties: Record<string, unknown> = {}) => {
  window.dispatchEvent(new CustomEvent('rajab:analytics', { detail: { event, properties } }));
  const zaraz = (window as Window & { zaraz?: { track?: (name: string, values?: Record<string, unknown>) => void } }).zaraz;
  zaraz?.track?.(event, properties);
};

document.querySelectorAll<HTMLImageElement>('[data-service-media-image]').forEach((image) => {
  const showFallback = () => {
    image.hidden = true;
    image.parentElement?.querySelector<HTMLElement>('[data-service-media-fallback]')?.removeAttribute('hidden');
  };
  image.addEventListener('error', showFallback, { once: true });
  if (image.complete && image.naturalWidth === 0) showFallback();
});

document.querySelectorAll<HTMLButtonElement>('[data-reveal]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.reveal || '');
    if (!target) return;
    const expanded = button.getAttribute('aria-expanded') === 'true';
    target.querySelectorAll<HTMLElement>('[data-reveal-item]').forEach((item, index) => {
      if (index >= 3) item.hidden = expanded;
    });
    button.setAttribute('aria-expanded', String(!expanded));
    button.textContent = expanded ? button.dataset.moreLabel || 'إظهار المزيد' : button.dataset.lessLabel || 'إظهار أقل';
  });
});

if (form) {
  const modeInput = form.querySelector<HTMLInputElement>('[data-request-mode]')!;
  const consultationType = form.querySelector<HTMLSelectElement>('[data-consultation-type]');
  const consultationTypeField = form.querySelector<HTMLElement>('[data-consultation-type-field]');
  const serviceSelect = form.querySelector<HTMLSelectElement>('[data-service-select]')!;
  const serviceField = form.querySelector<HTMLElement>('[data-service-field]')!;
  const subject = form.querySelector<HTMLInputElement>('[name="subject"]');
  const subjectLabel = form.querySelector<HTMLElement>('[data-subject-label]');
  const serviceNotice = form.querySelector<HTMLElement>('[data-service-mode-notice]')!;
  const submitButton = form.querySelector<HTMLButtonElement>('[data-submit-button]')!;
  const status = form.querySelector<HTMLElement>('[data-form-status]')!;
  let submitting = false;

  form.addEventListener('focusin', () => document.body.classList.add('form-interacting'));
  form.addEventListener('focusout', () => requestAnimationFrame(() => {
    if (!form.contains(document.activeElement)) document.body.classList.remove('form-interacting');
  }));

  const errorFor = (name: string) => form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
  const setError = (field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, message: string) => {
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    const output = errorFor(field.name);
    if (output) output.textContent = message;
  };
  const fieldMessage = (field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    if (field.validity.valueMissing) return field.type === 'checkbox' ? 'يجب الموافقة قبل الإرسال.' : 'هذا الحقل مطلوب.';
    if (field.validity.tooShort) return 'يرجى إدخال قيمة أوضح.';
    if (field.validity.patternMismatch) return 'تحقق من صيغة رقم الهاتف.';
    return '';
  };
  const validateField = (field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    if (field.disabled || field.hidden) return true;
    const valid = field.checkValidity();
    setError(field, valid ? '' : fieldMessage(field));
    return valid;
  };
  const activeFields = () => Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))
    .filter((field) => !field.disabled && field.type !== 'hidden' && !field.classList.contains('honeypot'));

  const setMode = (mode: 'consultation' | 'service', serviceSlug = '') => {
    const serviceMode = mode === 'service';
    modeInput.value = mode;
    if (consultationTypeField) consultationTypeField.hidden = serviceMode;
    if (consultationType) {
      consultationType.disabled = serviceMode;
      consultationType.required = !serviceMode && consultationType.dataset.configRequired !== 'false';
    }
    serviceField.hidden = !serviceMode;
    serviceSelect.disabled = !serviceMode;
    serviceSelect.required = serviceMode;
    serviceSelect.value = serviceMode ? serviceSlug : '';
    if (serviceMode) {
      const option = serviceSelect.selectedOptions[0];
      if (option?.textContent && subject && !subject.value.trim()) subject.value = option.textContent.trim();
    }
    if (subjectLabel?.firstChild) subjectLabel.firstChild.textContent = serviceMode ? 'ما الذي تريد مناقشته حول الخدمة ' : 'الخدمة أو المشكلة المطلوبة ';
    serviceNotice.hidden = !serviceMode;
    const consultationError = errorFor('consultationType');
    const serviceError = errorFor('serviceSlug');
    if (consultationError) consultationError.hidden = serviceMode;
    if (serviceError) {
      serviceError.hidden = !serviceMode;
      if (!serviceMode) serviceError.textContent = '';
    }
    if (consultationType) setError(consultationType, '');
    setError(serviceSelect, '');
  };

  form.addEventListener('input', (event) => {
    const field = event.target;
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) validateField(field);
  });
  form.addEventListener('change', (event) => {
    const field = event.target;
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) validateField(field);
  });

  document.querySelectorAll<HTMLElement>('[data-service-request]').forEach((button) => {
    button.addEventListener('click', () => {
      const slug = button.dataset.serviceRequest || '';
      button.closest<HTMLDialogElement>('dialog')?.close();
      setMode('service', slug);
      requestAnimationFrame(() => {
        consultationSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        serviceSelect.focus({ preventScroll: true });
      });
    });
  });

  form.querySelector<HTMLElement>('[data-reset-consultation]')?.addEventListener('click', () => {
    setMode('consultation');
    (consultationType || form.querySelector<HTMLElement>('[name="name"]'))?.focus();
  });

  document.querySelectorAll<HTMLElement>('[data-consultation-focus]').forEach((link) => {
    link.addEventListener('click', () => {
      link.closest<HTMLDialogElement>('dialog')?.close();
      setMode('consultation');
      requestAnimationFrame(() => form.querySelector<HTMLInputElement>('[name="name"]')?.focus({ preventScroll: true }));
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    const fields = activeFields();
    const valid = fields.map(validateField).every(Boolean);
    if (!valid) {
      fields.find((field) => field.getAttribute('aria-invalid') === 'true')?.focus();
      status.className = 'form-status notice notice-danger';
      status.textContent = 'تحقق من الحقول الموضحة ثم أعد الإرسال.';
      return;
    }

    submitting = true;
    submitButton.disabled = true;
    submitButton.classList.add('is-loading');
    status.className = 'form-status';
    status.textContent = 'جارٍ تسجيل الطلب…';
    const values = new FormData(form);
    const requestMode = modeInput.value === 'service' ? 'service' : 'consultation';
    const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    const deviceKey = 'rajab-consultation-device-id';
    let deviceId = localStorage.getItem(deviceKey) || '';
    if (!/^[0-9a-z-]{12,100}$/i.test(deviceId)) {
      deviceId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(deviceKey, deviceId);
    }
    const query = new URLSearchParams(location.search);
    const utmSource = query.get('utm_source') || '';
    const utmMedium = query.get('utm_medium') || '';
    const utmCampaign = query.get('utm_campaign') || '';
    const referralHost = (() => {
      try { return document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ''; }
      catch { return ''; }
    })();
    const source = query.has('fbclid') || utmMedium || utmCampaign
      ? 'إعلان'
      : /instagram/.test(utmSource) || referralHost.includes('instagram.')
        ? 'إنستغرام'
        : /facebook|fb/.test(utmSource) || referralHost.includes('facebook.')
          ? 'فيسبوك'
          : /whatsapp|wa/.test(utmSource) || referralHost.includes('whatsapp.')
            ? 'واتساب'
            : referralHost && !referralHost.includes(location.hostname)
              ? 'إحالة'
              : 'الموقع';
    const selectedService = serviceSelect.selectedOptions[0];
    const extraFields = Object.fromEntries(
      Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-custom-field]'))
        .map((field) => [
          field.dataset.customField || field.name,
          field.type === 'checkbox' ? (field as HTMLInputElement).checked : String(values.get(field.name) || '')
        ])
    );
    const payload = {
      kind: 'consultation',
      clientRequestId: requestId,
      deviceId,
      turnstileToken: String(values.get('cf-turnstile-response') || ''),
      consultation: {
        name: String(values.get('name') || ''),
        phone: String(values.get('phone') || ''),
        city: String(values.get('city') || ''),
        requestMode,
        consultationType: requestMode === 'consultation' ? String(values.get('consultationType') || '') : '',
        serviceSlug: requestMode === 'service' ? String(values.get('serviceSlug') || '') : '',
        serviceName: requestMode === 'service' ? String(selectedService?.textContent || '') : '',
        subject: String(values.get('subject') || ''),
        description: String(values.get('description') || ''),
        extraFields
      },
      tracking: {
        source,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent: query.get('utm_content') || '',
        utmTerm: query.get('utm_term') || ''
      },
      consents: { privacy: values.get('privacy') === 'on' }
    };

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json() as { ok?: boolean; message?: string; reference?: string; whatsappUrl?: string; notificationStatus?: string };
      if (!response.ok || !result.ok) throw new Error(result.message || 'تعذر تسجيل الطلب.');

      status.className = 'form-status notice notice-success';
      status.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = 'تم تسجيل طلبك بنجاح.';
      const reference = document.createElement('p');
      reference.textContent = `رقم المتابعة: ${result.reference || '—'}`;
      const note = document.createElement('p');
      note.textContent = result.notificationStatus === 'failed'
        ? 'تم حفظ الطلب، لكن تعذر إرسال إشعار البريد. استخدم زر واتساب لإكمال التواصل.'
        : 'يمكنك الآن متابعة التواصل وإرسال الصور عند الحاجة عبر واتساب.';
      status.append(title, reference, note);
      if (result.whatsappUrl?.startsWith('https://wa.me/')) {
        const whatsapp = document.createElement('a');
        whatsapp.className = 'button button-primary';
        whatsapp.href = result.whatsappUrl;
        whatsapp.target = '_blank';
        whatsapp.rel = 'noopener';
        whatsapp.textContent = 'متابعة عبر واتساب';
        status.append(whatsapp);
      }
      form.reset();
      setMode('consultation');
      track('consultation_submit', { requestMode, source });
      const turnstile = (window as Window & { turnstile?: { reset?: () => void } }).turnstile;
      turnstile?.reset?.();
    } catch (error) {
      status.className = 'form-status notice notice-danger';
      status.textContent = error instanceof Error ? error.message : 'تعذر الاتصال. تحقق من الإنترنت وحاول مجدداً.';
    } finally {
      submitting = false;
      submitButton.disabled = false;
      submitButton.classList.remove('is-loading');
    }
  });
}

document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-analytics-event]');
  if (target?.dataset.analyticsEvent) track(target.dataset.analyticsEvent, {
    href: target.getAttribute('href') || '',
    label: target.dataset.analyticsLabel || ''
  });
});

export {};
