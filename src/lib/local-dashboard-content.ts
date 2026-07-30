import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type {
  Achievement,
  CaseDisplayType,
  CaseStudy,
  DashboardContent,
  DisplayFieldDefinition,
  FieldModel,
  HomeSectionId,
  ManagedPage,
  NavigationItem,
  PageSection,
  PageSectionStyle,
  PageSectionType,
  Policy,
  PublicContent,
  Service,
  ServiceFieldDefinition,
  ServiceMediaType,
  ConsultationFieldDefinition,
  ContentFieldType,
  ThemeSettings
} from '../types';
import { CONSULTATION_TYPES, SYRIAN_PROVINCES } from './consultation-options';

const root = resolve(process.cwd());
const contentRoot = join(root, 'content');
const allowedIcons = ['sparkles', 'leaf', 'droplet'] as const;
const sectionIds: HomeSectionId[] = ['banner', 'profile', 'quick-start', 'consultation', 'services', 'cases'];
const sectionLabels: Record<HomeSectionId, string> = {
  banner: 'الواجهة الرئيسية',
  profile: 'بطاقة رجب العبود',
  'quick-start': 'ابدأ من هنا',
  consultation: 'نموذج الاستشارة',
  services: 'الخدمات',
  cases: 'معرض الأعمال'
};
const pageSectionTypes: PageSectionType[] = [
  'hero', 'text-image', 'services-grid', 'steps', 'cases-gallery', 'about-profile',
  'features', 'faq', 'testimonials', 'gallery', 'stats', 'logos', 'cta',
  'consultation-form', 'contact'
];
const defaultTheme: ThemeSettings = {
  preset: 'lavender',
  primary: '#5a2f73',
  primaryStrong: '#321743',
  primarySoft: '#7b4b92',
  secondary: '#c8add8',
  secondarySoft: '#eee5f3',
  accent: '#b36fd0',
  background: '#fcfafd',
  surface: '#ffffff',
  surfaceAlt: '#f5f0f8',
  text: '#241b2b',
  muted: '#665e6d',
  border: '#e2d7e8',
  success: '#276749',
  warning: '#825111',
  error: '#a61b1b',
  info: '#245e8a',
  buttonText: '#ffffff',
  focus: '#b36fd0'
};
const defaultNavigation: NavigationItem[] = [
  { id: 'home', label: 'الرئيسية', url: '/#top', visible: true, primary: false },
  { id: 'consultation', label: 'طلب استشارة', url: '/#consultation', visible: true, primary: true },
  { id: 'services', label: 'الخدمات', url: '/#services', visible: true, primary: false },
  { id: 'cases', label: 'معرض الأعمال', url: '/#cases', visible: true, primary: false }
];
const defaultFieldModel: FieldModel = {
  serviceFields: [
    { id: 'category', label: 'التصنيف', type: 'text', placement: 'card', required: true, visible: true, builtin: true, order: 5 },
    { id: 'summary', label: 'الوصف المختصر', type: 'textarea', placement: 'card', required: true, visible: true, builtin: true, order: 10 },
    { id: 'description', label: 'الوصف التفصيلي', type: 'textarea', placement: 'details', required: true, visible: true, builtin: true, order: 20 },
    { id: 'suitableFor', label: 'الفئة المستهدفة', type: 'textarea', placement: 'details', required: false, visible: true, builtin: true, order: 30 },
    { id: 'notes', label: 'الملاحظات والتنبيهات', type: 'textarea', placement: 'details', required: false, visible: true, builtin: true, order: 40 }
  ],
  consultationFields: [
    { id: 'name', label: 'الاسم الكامل', type: 'text', placeholder: '', helpText: '', options: [], required: true, visible: true, fullWidth: false, builtin: true, order: 10 },
    { id: 'phone', label: 'رقم الهاتف أو واتساب', type: 'tel', placeholder: '+963 9XX XXX XXX', helpText: 'الافتراضي سوريا، ويمكن إدخال أي رقم دولي مسبوقاً برمز الدولة.', options: [], required: true, visible: true, fullWidth: false, builtin: true, order: 20 },
    { id: 'city', label: 'المحافظة', type: 'select', placeholder: 'اختر المحافظة', helpText: '', options: [...SYRIAN_PROVINCES], required: true, visible: true, fullWidth: false, builtin: true, order: 30 },
    { id: 'consultationType', label: 'نوع الاستشارة', type: 'select', placeholder: 'اختر نوع الاستشارة', helpText: '', options: [...CONSULTATION_TYPES], required: true, visible: true, fullWidth: true, builtin: true, order: 40 },
    { id: 'subject', label: 'الخدمة أو المشكلة المطلوبة', type: 'text', placeholder: 'مثال: روتين لبشرة دهنية أو استفسار عن الليزر', helpText: '', options: [], required: true, visible: true, fullWidth: true, builtin: true, order: 50 },
    { id: 'description', label: 'وصف مختصر', type: 'textarea', placeholder: 'اكتب احتياجك باختصار، من دون معلومات صحية حساسة.', helpText: 'هذا الحقل اختياري. لا يمكن رفع الصور حالياً؛ يمكن إرسالها لاحقاً عبر واتساب عند الحاجة.', options: [], required: false, visible: true, fullWidth: true, builtin: true, order: 60 },
    { id: 'privacy', label: 'أوافق على استخدام بياناتي لمعالجة طلب الاستشارة والتواصل بشأنه عبر واتساب عند الحاجة.', type: 'checkbox', placeholder: '', helpText: '', options: [], required: true, visible: true, fullWidth: true, builtin: true, order: 70 }
  ]
};
const defaultCaseFields: DisplayFieldDefinition[] = [
  { id: 'procedure', label: 'الخدمة أو الإجراء', type: 'text', placement: 'card', required: true, visible: true, builtin: true, order: 10 },
  { id: 'description', label: 'الوصف', type: 'textarea', placement: 'card', required: true, visible: true, builtin: true, order: 20 },
  { id: 'performed', label: 'ما تم تنفيذه', type: 'textarea', placement: 'details', required: false, visible: true, builtin: true, order: 30 },
  { id: 'procedureDate', label: 'تاريخ الإجراء', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 40 },
  { id: 'sessions', label: 'عدد الجلسات', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 50 },
  { id: 'duration', label: 'مدة ظهور النتيجة', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 60 },
  { id: 'notes', label: 'ملاحظات', type: 'textarea', placement: 'details', required: false, visible: true, builtin: true, order: 70 }
];
const defaultAchievementFields: DisplayFieldDefinition[] = [
  { id: 'year', label: 'السنة', type: 'text', placement: 'card', required: false, visible: true, builtin: true, order: 10 },
  { id: 'description', label: 'الوصف', type: 'textarea', placement: 'card', required: false, visible: true, builtin: true, order: 20 }
];
const defaultAboutFields: DisplayFieldDefinition[] = [
  { id: 'qualification', label: 'المؤهل', type: 'text', placement: 'card', required: true, visible: true, builtin: true, order: 10 },
  { id: 'university', label: 'الجامعة', type: 'text', placement: 'details', required: true, visible: true, builtin: true, order: 20 },
  { id: 'graduationYear', label: 'سنة التخرج', type: 'text', placement: 'details', required: true, visible: true, builtin: true, order: 30 },
  { id: 'graduationProject', label: 'مشروع التخرج', type: 'textarea', placement: 'details', required: true, visible: true, builtin: true, order: 40 },
  { id: 'experienceAreas', label: 'مجالات الخبرة', type: 'textarea', placement: 'details', required: false, visible: true, builtin: true, order: 50 }
];
const defaultSectionFields: DisplayFieldDefinition[] = [
  { id: 'eyebrow', label: 'السطر التعريفي', type: 'text', placement: 'card', required: false, visible: true, builtin: true, order: 10 },
  { id: 'title', label: 'العنوان', type: 'text', placement: 'card', required: true, visible: true, builtin: true, order: 20 },
  { id: 'description', label: 'الوصف', type: 'textarea', placement: 'card', required: false, visible: true, builtin: true, order: 30 },
  { id: 'image', label: 'مسار الصورة الرئيسية', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 40 },
  { id: 'imageAlt', label: 'النص البديل للصورة', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 50 },
  { id: 'buttonLabel', label: 'نص الزر الرئيسي', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 60 },
  { id: 'buttonUrl', label: 'رابط الزر الرئيسي', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 70 },
  { id: 'secondaryButtonLabel', label: 'نص الزر الثانوي', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 80 },
  { id: 'secondaryButtonUrl', label: 'رابط الزر الثانوي', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 90 }
];
const defaultPageItemFields: DisplayFieldDefinition[] = [
  { id: 'title', label: 'العنوان', type: 'text', placement: 'card', required: false, visible: true, builtin: true, order: 10 },
  { id: 'value', label: 'القيمة الرقمية', type: 'text', placement: 'card', required: false, visible: true, builtin: true, order: 20 },
  { id: 'label', label: 'التسمية', type: 'text', placement: 'card', required: false, visible: true, builtin: true, order: 30 },
  { id: 'text', label: 'النص', type: 'textarea', placement: 'card', required: false, visible: true, builtin: true, order: 40 },
  { id: 'image', label: 'مسار الصورة', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 50 },
  { id: 'imageAlt', label: 'النص البديل للصورة', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 60 },
  { id: 'url', label: 'الرابط', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 70 }
];
const builtinServiceFields = new Set(defaultFieldModel.serviceFields.map((field) => field.id.toLowerCase()));
const builtinConsultationFields = new Set(defaultFieldModel.consultationFields.map((field) => field.id.toLowerCase()));
const allowedConsultationFieldTypes: ContentFieldType[] = ['text', 'textarea', 'tel', 'select', 'checkbox'];

const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(join(root, path), 'utf8')) as T;
const readCollection = async <T>(path: string): Promise<T[]> => {
  const directory = join(root, path);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(files.map((file) => readJson<T>(join(path, file))));
};

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);
const multiline = (value: unknown, max = 3000) => String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const bool = (value: unknown) => value === true;
const required = (value: unknown, label: string, max = 500, long = false) => {
  const result = long ? multiline(value, max) : text(value, max);
  if (!result) throw new Error(`حقل «${label}» مطلوب.`);
  return result;
};
const identifier = (value: unknown, label = 'الرابط المختصر') => {
  const result = text(value, 100).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) {
    throw new Error(`${label} غير صالح. استخدم حروفاً إنجليزية صغيرة وأرقاماً وشرطات فقط.`);
  }
  return result;
};
const imagePath = (value: unknown, label: string, optional = false) => {
  const result = text(value, 500);
  if (!result && optional) return '';
  if (!result.startsWith('/images/') || result.includes('..') || result.includes('\\')) {
    throw new Error(`مسار «${label}» يجب أن يبدأ بـ /images/ وألا يحتوي مساراً نسبياً.`);
  }
  return result;
};
const safeUrl = (value: unknown, label: string) => {
  const result = text(value, 500);
  if (!result) return '';
  try {
    const url = new URL(result);
    if (url.protocol !== 'https:') throw new Error();
    return url.toString();
  } catch {
    throw new Error(`رابط «${label}» غير صالح أو لا يستخدم HTTPS.`);
  }
};
const linkUrl = (value: unknown, label: string, optional = true) => {
  const result = text(value, 500);
  if (!result && optional) return '';
  if (/^(?:\/(?!\/)|#)[^\s]*$/.test(result)) return result;
  try {
    const url = new URL(result);
    if (url.protocol !== 'https:') throw new Error();
    return url.toString();
  } catch {
    throw new Error(`رابط «${label}» غير صالح. استخدم مساراً داخلياً يبدأ بـ/ أو #، أو رابط HTTPS.`);
  }
};
const color = (value: unknown, label: string, optional = false) => {
  const result = text(value, 20).toLowerCase();
  if (!result && optional) return '';
  if (!/^#[0-9a-f]{6}$/.test(result)) throw new Error(`لون «${label}» غير صالح. استخدم الصيغة #RRGGBB.`);
  return result;
};
const email = (value: unknown) => {
  const result = required(value, 'البريد الإلكتروني', 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error('صيغة البريد الإلكتروني غير صالحة.');
  return result;
};
const phoneLink = (value: unknown) => {
  const result = required(value, 'الهاتف القابل للنقر', 30).replace(/[()\s-]/g, '');
  if (!/^\+?[0-9]{7,18}$/.test(result)) throw new Error('الهاتف القابل للنقر يجب أن يكون رقماً دولياً صالحاً.');
  return result;
};
const whatsapp = (value: unknown) => {
  const result = text(value, 30).replace(/\D/g, '');
  if (!/^[0-9]{7,18}$/.test(result)) throw new Error('رقم واتساب الدولي غير صالح.');
  return result;
};
const containsPlaceholderImage = (paths: string[]) => paths.some((path) => path.includes('/placeholders/'));
const numericOrder = (value: unknown, fallback: number) => {
  const order = Number(value);
  return Number.isFinite(order) ? Math.max(0, Math.trunc(order)) : fallback;
};
const byDisplayOrder = <T extends { order: number }>(label: (item: T) => string) => (a: T, b: T) =>
  a.order - b.order || label(a).localeCompare(label(b), 'ar');

function sanitizeNavigation(raw: unknown): NavigationItem[] {
  const source = Array.isArray(raw) ? raw.slice(0, 30) : defaultNavigation;
  const items = source.map((entry, index) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return {
      id: identifier(item.id || `navigation-${index + 1}`, `معرّف رابط الهيدر ${index + 1}`),
      label: required(item.label, `عنوان رابط الهيدر ${index + 1}`, 100),
      url: linkUrl(item.url, `رابط الهيدر ${index + 1}`, false),
      visible: item.visible !== false,
      primary: bool(item.primary)
    };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error('يوجد معرّف مكرر بين روابط الهيدر.');
  return items;
}

function sanitizeServiceFields(raw: unknown): ServiceFieldDefinition[] {
  const source = Array.isArray(raw) ? raw.slice(0, 24) : [];
  const incoming = new Map(source.map((entry) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return [text(item.id, 100).toLowerCase(), item] as const;
  }));
  const builtins = defaultFieldModel.serviceFields.map((fallback) => {
    const item = incoming.get(fallback.id.toLowerCase()) || {};
    return {
      ...fallback,
      label: required(item.label ?? fallback.label, `عنوان حقل الخدمة ${fallback.id}`, 120),
      type: item.type === 'text' ? 'text' as const : 'textarea' as const,
      placement: item.placement === 'card' ? 'card' as const : 'details' as const,
      required: item.required === undefined ? fallback.required : item.required === true,
      visible: item.visible === undefined ? fallback.visible : item.visible !== false,
      builtin: true,
      order: numericOrder(item.order, fallback.order)
    };
  });
  const custom = source.flatMap((entry, index) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const id = text(item.id, 100).toLowerCase();
    if (!id || builtinServiceFields.has(id)) return [];
    return [{
      id: identifier(id, `معرّف حقل الخدمة الإضافي ${index + 1}`),
      label: required(item.label, `عنوان حقل الخدمة الإضافي ${index + 1}`, 120),
      type: item.type === 'text' ? 'text' as const : 'textarea' as const,
      placement: item.placement === 'card' ? 'card' as const : 'details' as const,
      required: item.required === true,
      visible: item.visible !== false,
      builtin: false,
      order: numericOrder(item.order, 100 + index * 10)
    }];
  });
  const fields = [...builtins, ...custom].sort((a, b) => a.order - b.order);
  if (new Set(fields.map((field) => field.id)).size !== fields.length) throw new Error('يوجد معرّف مكرر في حقول الخدمات.');
  return fields.map((field, index) => ({ ...field, order: (index + 1) * 10 }));
}

function sanitizeDisplayFields(
  raw: unknown,
  defaults: DisplayFieldDefinition[],
  ownerLabel: string
): DisplayFieldDefinition[] {
  const source = Array.isArray(raw) ? raw.slice(0, 30) : [];
  const incoming = new Map(source.map((entry) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return [text(item.id, 100).toLowerCase(), item] as const;
  }));
  const builtinIds = new Set(defaults.map((field) => field.id.toLowerCase()));
  const builtins = defaults.map((fallback) => {
    const item = incoming.get(fallback.id.toLowerCase()) || {};
    return {
      ...fallback,
      label: required(item.label ?? fallback.label, `عنوان حقل ${ownerLabel}`, 120),
      type: item.type === 'text' ? 'text' as const : item.type === 'textarea' ? 'textarea' as const : fallback.type,
      placement: item.placement === 'card' ? 'card' as const : item.placement === 'details' ? 'details' as const : fallback.placement,
      required: item.required === undefined ? fallback.required : item.required === true,
      visible: item.visible === undefined ? fallback.visible : item.visible !== false,
      builtin: true,
      order: numericOrder(item.order, fallback.order)
    };
  });
  const custom = source.flatMap((entry, index) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const rawId = text(item.id, 100);
    const normalizedId = rawId.toLowerCase();
    if (!rawId || builtinIds.has(normalizedId)) return [];
    return [{
      id: identifier(normalizedId, `معرّف حقل ${ownerLabel} الإضافي ${index + 1}`),
      label: required(item.label, `عنوان حقل ${ownerLabel} الإضافي ${index + 1}`, 120),
      type: item.type === 'text' ? 'text' as const : 'textarea' as const,
      placement: item.placement === 'card' ? 'card' as const : 'details' as const,
      required: item.required === true,
      visible: item.visible !== false,
      builtin: false,
      order: numericOrder(item.order, 100 + index * 10)
    }];
  });
  const fields = [...builtins, ...custom].sort((a, b) => a.order - b.order);
  if (new Set(fields.map((field) => field.id.toLowerCase())).size !== fields.length) {
    throw new Error(`يوجد معرّف حقل مكرر في ${ownerLabel}.`);
  }
  return fields.map((field, index) => ({ ...field, order: (index + 1) * 10 }));
}

function sanitizeCustomFieldValues(
  raw: unknown,
  fields: DisplayFieldDefinition[]
): Record<string, string> {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return Object.fromEntries(
    fields
      .filter((field) => !field.builtin)
      .map((field) => [field.id, multiline(source[field.id], 2400)])
  );
}

function sanitizeConsultationFields(raw: unknown): ConsultationFieldDefinition[] {
  const source = Array.isArray(raw) ? raw.slice(0, 30) : [];
  const incoming = new Map(source.map((entry) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return [text(item.id, 100).toLowerCase(), item] as const;
  }));
  const normalize = (
    item: Record<string, unknown>,
    fallback: ConsultationFieldDefinition,
    index: number,
    builtin: boolean
  ): ConsultationFieldDefinition => {
    const id = builtin ? fallback.id : identifier(item.id, `معرّف حقل الاستشارة الإضافي ${index + 1}`);
    const type = allowedConsultationFieldTypes.includes(item.type as ContentFieldType)
      ? item.type as ContentFieldType
      : fallback.type;
    const locked = id === 'phone' || id === 'privacy';
    const options = type === 'select'
      ? (Array.isArray(item.options) ? item.options : fallback.options).slice(0, 40).map((value) => text(value, 120)).filter(Boolean)
      : [];
    if (type === 'select' && options.length === 0) throw new Error(`الحقل «${text(item.label) || fallback.label}» يحتاج إلى خيار واحد على الأقل.`);
    return {
      id,
      label: required(item.label ?? fallback.label, `عنوان حقل الاستشارة ${index + 1}`, 220),
      type,
      placeholder: text(item.placeholder ?? fallback.placeholder, 220),
      helpText: multiline(item.helpText ?? fallback.helpText, 500),
      options,
      required: locked || (item.required === undefined ? fallback.required : item.required === true),
      visible: locked || (item.visible === undefined ? fallback.visible : item.visible !== false),
      fullWidth: item.fullWidth === undefined
        ? fallback.fullWidth || type === 'textarea' || type === 'checkbox'
        : item.fullWidth === true || type === 'textarea' || type === 'checkbox',
      builtin,
      order: numericOrder(item.order, fallback.order)
    };
  };
  const builtins = defaultFieldModel.consultationFields.map((fallback, index) =>
    normalize(incoming.get(fallback.id.toLowerCase()) || {}, fallback, index, true)
  );
  const custom = source.flatMap((entry, index) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const id = text(item.id, 100).toLowerCase();
    if (!id || builtinConsultationFields.has(id)) return [];
    const fallback: ConsultationFieldDefinition = {
      id,
      label: `حقل إضافي ${index + 1}`,
      type: 'text',
      placeholder: '',
      helpText: '',
      options: [],
      required: false,
      visible: true,
      fullWidth: false,
      builtin: false,
      order: 100 + index * 10
    };
    return [normalize(item, fallback, index, false)];
  });
  const fields = [...builtins, ...custom].sort((a, b) => a.order - b.order);
  if (new Set(fields.map((field) => field.id)).size !== fields.length) throw new Error('يوجد معرّف مكرر في حقول نموذج الاستشارة.');
  return fields.map((field, index) => ({ ...field, order: (index + 1) * 10 }));
}

function sanitizeFieldModel(raw: unknown): FieldModel {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Partial<FieldModel>;
  return {
    serviceFields: sanitizeServiceFields(item.serviceFields),
    consultationFields: sanitizeConsultationFields(item.consultationFields)
  };
}

function sanitizeService(raw: unknown, index: number, fields: ServiceFieldDefinition[]): Service {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mediaType: ServiceMediaType = item.mediaType === 'image' ? 'image' : 'icon';
  const displayFields = sanitizeDisplayFields(item.fields, fields, `الخدمة ${index + 1}`);
  const rawCustom = item.customFields && typeof item.customFields === 'object' && !Array.isArray(item.customFields)
    ? item.customFields as Record<string, unknown>
    : {};
  const customFields = sanitizeCustomFieldValues(rawCustom, displayFields);
  for (const field of displayFields) {
    const value = field.builtin ? item[field.id] : rawCustom[field.id];
    if (field.required && !multiline(value, 1600)) {
      throw new Error(`حقل «${field.label}» مطلوب في الخدمة ${index + 1}.`);
    }
  }
  return {
    slug: identifier(item.slug, `الرابط المختصر للخدمة ${index + 1}`),
    name: required(item.name, `اسم الخدمة ${index + 1}`, 140),
    category: required(item.category, `تصنيف الخدمة ${index + 1}`, 100),
    summary: required(item.summary, `ملخص الخدمة ${index + 1}`, 500, true),
    description: required(item.description, `وصف الخدمة ${index + 1}`, 1600, true),
    suitableFor: multiline(item.suitableFor, 800),
    notes: multiline(item.notes, 1000),
    fields: displayFields,
    customFields,
    mediaType,
    icon: allowedIcons.includes(text(item.icon, 30) as (typeof allowedIcons)[number]) ? text(item.icon, 30) : 'sparkles',
    image: imagePath(item.image, `صورة الخدمة ${index + 1}`, true),
    featured: bool(item.featured),
    placeholder: bool(item.placeholder),
    order: numericOrder(item.order, (index + 1) * 10),
    visible: item.visible !== false
  };
}

function sanitizeCase(raw: unknown, index: number): CaseStudy {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fields = sanitizeDisplayFields(item.fields, defaultCaseFields, `الحالة ${index + 1}`);
  const customFields = sanitizeCustomFieldValues(item.customFields, fields);
  for (const field of fields) {
    const value = field.builtin ? item[field.id] : customFields[field.id];
    if (field.required && !multiline(value, 1600)) {
      throw new Error(`حقل «${field.label}» مطلوب في الحالة ${index + 1}.`);
    }
  }
  const displayType: CaseDisplayType = item.displayType === 'single-result'
    ? 'single-result'
    : item.displayType === 'before-after-gallery'
      ? 'before-after-gallery'
      : 'before-after';
  const beforeImage = imagePath(item.beforeImage, `صورة قبل للحالة ${index + 1}`, displayType === 'single-result');
  const afterImage = imagePath(item.afterImage, `صورة بعد للحالة ${index + 1}`, displayType === 'single-result');
  const resultSource = item.resultImage || (displayType === 'single-result' ? item.afterImage : '');
  const resultImage = imagePath(resultSource, `الصورة النهائية للحالة ${index + 1}`, displayType !== 'single-result');
  const placeholder = bool(item.placeholder);
  const additionalImages = (Array.isArray(item.additionalImages) ? item.additionalImages : [])
    .slice(0, 20)
    .map((path, imageIndex) => imagePath(path, `الصورة الإضافية ${imageIndex + 1} للحالة ${index + 1}`, true));
  const displayedImages = displayType === 'single-result'
    ? [resultImage]
    : [beforeImage, afterImage, ...additionalImages.filter(Boolean)];
  if (!placeholder && containsPlaceholderImage(displayedImages)) {
    throw new Error(`لا يمكن اعتماد الحالة «${text(item.title, 160) || index + 1}» كحالة حقيقية ما دامت تستخدم صوراً نائبة. استبدل الصور أو فعّل وسم «حالة تجريبية».`);
  }
  return {
    slug: identifier(item.slug, `الرابط المختصر للحالة ${index + 1}`),
    title: required(item.title, `عنوان الحالة ${index + 1}`, 160),
    category: required(item.category || item.procedure, `تصنيف الحالة ${index + 1}`, 120),
    procedure: required(item.procedure, `الخدمة أو الإجراء للحالة ${index + 1}`, 120),
    description: required(item.description, `وصف الحالة ${index + 1}`, 1000, true),
    performed: multiline(item.performed, 1000),
    procedureDate: text(item.procedureDate, 80),
    sessions: text(item.sessions, 100),
    duration: text(item.duration, 100),
    displayType,
    beforeImage,
    afterImage,
    resultImage,
    additionalImages: displayType === 'before-after-gallery' ? (additionalImages.length ? additionalImages : ['']) : additionalImages,
    notes: multiline(item.notes, 1000),
    fields,
    customFields,
    status: item.status === 'draft' ? 'draft' : 'published',
    featured: bool(item.featured),
    placeholder,
    order: numericOrder(item.order, (index + 1) * 10),
    visible: item.visible !== false
  };
}

function sanitizeAchievement(raw: unknown, index: number): Achievement {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fields = sanitizeDisplayFields(item.fields, defaultAchievementFields, `الإنجاز ${index + 1}`);
  return {
    id: identifier(item.id, `معرّف الإنجاز ${index + 1}`),
    title: required(item.title, `عنوان الإنجاز ${index + 1}`, 180),
    year: text(item.year, 50),
    description: multiline(item.description, 1200),
    image: imagePath(item.image, `صورة الإنجاز ${index + 1}`),
    fields,
    customFields: sanitizeCustomFieldValues(item.customFields, fields),
    placeholder: bool(item.placeholder),
    order: numericOrder(item.order, (index + 1) * 10),
    visible: item.visible !== false
  };
}

function sanitizePolicy(raw: unknown, expectedSlug: 'privacy' | 'disclaimer'): Policy {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawSections = Array.isArray(item.sections) ? item.sections.slice(0, 20) : [];
  if (!rawSections.length) throw new Error(`يجب أن تحتوي سياسة «${expectedSlug === 'privacy' ? 'الخصوصية' : 'إخلاء المسؤولية'}» فقرة واحدة على الأقل.`);
  return {
    slug: expectedSlug,
    title: required(item.title, expectedSlug === 'privacy' ? 'عنوان سياسة الخصوصية' : 'عنوان إخلاء المسؤولية', 140),
    description: required(item.description, 'وصف السياسة', 800, true),
    updated: required(item.updated, 'تاريخ تحديث السياسة', 80),
    alert: multiline(item.alert, 800) || undefined,
    sections: rawSections.map((section, index) => {
      const entry = (section && typeof section === 'object' ? section : {}) as Record<string, unknown>;
      return {
        heading: required(entry.heading, `عنوان فقرة السياسة ${index + 1}`, 180),
        body: required(entry.body, `نص فقرة السياسة ${index + 1}`, 1800, true)
      };
    })
  };
}

const defaultSectionStyle = (): PageSectionStyle => ({
  background: 'default',
  backgroundColor: '',
  textColor: '',
  accentColor: '',
  buttonColor: '',
  width: 'normal',
  spacing: 'normal',
  alignment: 'start',
  imagePosition: 'end',
  columns: 3
});

function sanitizeTheme(raw: unknown): ThemeSettings {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Partial<ThemeSettings>;
  const presets = ['lavender', 'rose', 'ocean', 'forest', 'custom'] as const;
  return {
    preset: presets.includes(item.preset as (typeof presets)[number]) ? item.preset as ThemeSettings['preset'] : 'custom',
    primary: color(item.primary ?? defaultTheme.primary, 'اللون الأساسي'),
    primaryStrong: color(item.primaryStrong ?? defaultTheme.primaryStrong, 'اللون الأساسي الداكن'),
    primarySoft: color(item.primarySoft ?? defaultTheme.primarySoft, 'اللون الأساسي الفاتح'),
    secondary: color(item.secondary ?? defaultTheme.secondary, 'اللون الثانوي'),
    secondarySoft: color(item.secondarySoft ?? defaultTheme.secondarySoft, 'خلفية اللون الثانوي'),
    accent: color(item.accent ?? defaultTheme.accent, 'لون الإبراز'),
    background: color(item.background ?? defaultTheme.background, 'خلفية الموقع'),
    surface: color(item.surface ?? defaultTheme.surface, 'خلفية البطاقات'),
    surfaceAlt: color(item.surfaceAlt ?? defaultTheme.surfaceAlt, 'الخلفية البديلة'),
    text: color(item.text ?? defaultTheme.text, 'لون النص'),
    muted: color(item.muted ?? defaultTheme.muted, 'لون النص الثانوي'),
    border: color(item.border ?? defaultTheme.border, 'لون الحدود'),
    success: color(item.success ?? defaultTheme.success, 'لون النجاح'),
    warning: color(item.warning ?? defaultTheme.warning, 'لون التحذير'),
    error: color(item.error ?? defaultTheme.error, 'لون الخطأ'),
    info: color(item.info ?? defaultTheme.info, 'لون المعلومات'),
    buttonText: color(item.buttonText ?? defaultTheme.buttonText, 'نص الزر'),
    focus: color(item.focus ?? defaultTheme.focus, 'حد التركيز')
  };
}

function sanitizePageSection(raw: unknown, index: number, pageLabel: string): PageSection {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawStyle = (item.style && typeof item.style === 'object' ? item.style : {}) as Record<string, unknown>;
  const rawContent = (item.content && typeof item.content === 'object' ? item.content : {}) as Record<string, unknown>;
  const type = pageSectionTypes.includes(item.type as PageSectionType) ? item.type as PageSectionType : 'text-image';
  const backgrounds = ['default', 'surface', 'primary', 'dark', 'custom'] as const;
  const widths = ['wide', 'normal', 'narrow'] as const;
  const spacings = ['small', 'normal', 'large'] as const;
  const alignments = ['start', 'center'] as const;
  const positions = ['start', 'end'] as const;
  const sources = ['manual', 'services', 'cases', 'about', 'contact'] as const;
  const rawItems = Array.isArray(rawContent.items) ? rawContent.items.slice(0, 30) : [];
  const sectionId = identifier(item.id || `section-${index + 1}`, `معرّف القسم ${index + 1} في ${pageLabel}`);
  const rawLimit = Number(rawContent.limit);
  const limit = rawLimit === 0
    ? 0
    : Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 6));
  const fields = sanitizeDisplayFields(item.fields, defaultSectionFields, `القسم ${index + 1} في ${pageLabel}`);
  return {
    id: sectionId,
    type,
    name: required(item.name || `قسم ${index + 1}`, `اسم القسم ${index + 1} في ${pageLabel}`, 120),
    visible: item.visible !== false,
    fields,
    customFields: sanitizeCustomFieldValues(item.customFields, fields),
    style: {
      ...defaultSectionStyle(),
      background: backgrounds.includes(rawStyle.background as (typeof backgrounds)[number]) ? rawStyle.background as PageSectionStyle['background'] : 'default',
      backgroundColor: color(rawStyle.backgroundColor, `خلفية القسم ${index + 1}`, true),
      textColor: color(rawStyle.textColor, `نص القسم ${index + 1}`, true),
      accentColor: color(rawStyle.accentColor, `إبراز القسم ${index + 1}`, true),
      buttonColor: color(rawStyle.buttonColor, `زر القسم ${index + 1}`, true),
      width: widths.includes(rawStyle.width as (typeof widths)[number]) ? rawStyle.width as PageSectionStyle['width'] : 'normal',
      spacing: spacings.includes(rawStyle.spacing as (typeof spacings)[number]) ? rawStyle.spacing as PageSectionStyle['spacing'] : 'normal',
      alignment: alignments.includes(rawStyle.alignment as (typeof alignments)[number]) ? rawStyle.alignment as PageSectionStyle['alignment'] : 'start',
      imagePosition: positions.includes(rawStyle.imagePosition as (typeof positions)[number]) ? rawStyle.imagePosition as PageSectionStyle['imagePosition'] : 'end',
      columns: [2, 3, 4].includes(Number(rawStyle.columns)) ? Number(rawStyle.columns) as 2 | 3 | 4 : 3
    },
    content: {
      eyebrow: text(rawContent.eyebrow, 120),
      title: required(rawContent.title || item.name || `قسم ${index + 1}`, `عنوان القسم ${index + 1} في ${pageLabel}`, 220),
      description: multiline(rawContent.description, 2400),
      image: imagePath(rawContent.image, `صورة القسم ${index + 1}`, true),
      imageAlt: text(rawContent.imageAlt, 220),
      buttonLabel: text(rawContent.buttonLabel, 100),
      buttonUrl: linkUrl(rawContent.buttonUrl, `زر القسم ${index + 1}`),
      secondaryButtonLabel: text(rawContent.secondaryButtonLabel, 100),
      secondaryButtonUrl: linkUrl(rawContent.secondaryButtonUrl, `الزر الثانوي للقسم ${index + 1}`),
      source: sources.includes(rawContent.source as (typeof sources)[number]) ? rawContent.source as PageSection['content']['source'] : 'manual',
      limit,
      items: rawItems.map((entry, itemIndex) => {
        const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
        const fields = sanitizeDisplayFields(row.fields, defaultPageItemFields, `العنصر ${itemIndex + 1} في القسم ${index + 1}`);
        return {
          id: identifier(row.id || `item-${itemIndex + 1}`, `معرّف العنصر ${itemIndex + 1} في القسم ${index + 1}`),
          title: text(row.title, 180),
          text: multiline(row.text, 1000),
          image: imagePath(row.image, `صورة العنصر ${itemIndex + 1}`, true),
          imageAlt: text(row.imageAlt, 200),
          value: text(row.value, 80),
          label: text(row.label, 120),
          url: linkUrl(row.url, `رابط العنصر ${itemIndex + 1}`),
          fields,
          customFields: sanitizeCustomFieldValues(row.customFields, fields)
        };
      })
    }
  };
}

function legacyHomepage(input: Partial<DashboardContent>): ManagedPage {
  const style = defaultSectionStyle();
  const section = (id: string, type: PageSectionType, name: string, title: string, description: string, source: PageSection['content']['source'] = 'manual'): PageSection => ({
    id,
    type,
    name,
    visible: true,
    style: { ...style },
    fields: defaultSectionFields.map((field) => ({ ...field })),
    customFields: {},
    content: {
      eyebrow: '', title, description, image: '', imageAlt: '', buttonLabel: '',
      buttonUrl: '', secondaryButtonLabel: '', secondaryButtonUrl: '', source, limit: 6, items: []
    }
  });
  return {
    id: 'home',
    title: 'الصفحة الرئيسية',
    slug: 'home',
    navigationLabel: 'الرئيسية',
    status: 'published',
    pageKind: 'standard',
    isHomepage: true,
    showInNavigation: true,
    headerMode: 'full',
    footerMode: 'full',
    seo: {
      title: text(input.home?.banner?.title, 180) || text(input.site?.name, 100) || 'الصفحة الرئيسية',
      description: multiline(input.home?.banner?.description, 320),
      image: text(input.site?.portrait, 500) || '/images/placeholders/portrait.svg',
      noindex: false
    },
    sections: [
      section('home-hero', 'hero', 'الواجهة الرئيسية', text(input.home?.banner?.title) || 'الواجهة الرئيسية', multiline(input.home?.banner?.description)),
      section('home-about', 'about-profile', 'نبذة شخصية', text(input.site?.name) || 'نبذة شخصية', multiline(input.about?.biography), 'about'),
      section('home-consultation', 'consultation-form', 'نموذج الاستشارة', text(input.home?.consultation?.title) || 'طلب استشارة', multiline(input.home?.consultation?.description), 'contact'),
      section('home-services', 'services-grid', 'الخدمات', text(input.home?.services?.title) || 'الخدمات', multiline(input.home?.services?.description), 'services'),
      section('home-cases', 'cases-gallery', 'معرض الأعمال', text(input.home?.cases?.title) || 'معرض الأعمال', multiline(input.home?.cases?.description), 'cases')
    ],
    updatedAt: new Date().toISOString()
  };
}

function sanitizePage(raw: unknown, index: number): ManagedPage {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawSeo = (item.seo && typeof item.seo === 'object' ? item.seo : {}) as Record<string, unknown>;
  const titleValue = required(item.title, `عنوان الصفحة ${index + 1}`, 180);
  const sections = (Array.isArray(item.sections) ? item.sections : []).slice(0, 60).map((entry, sectionIndex) => sanitizePageSection(entry, sectionIndex, titleValue));
  if (new Set(sections.map((section) => section.id)).size !== sections.length) throw new Error(`يوجد معرّف قسم مكرر في الصفحة «${titleValue}».`);
  if (sections.filter((section) => section.visible && section.type === 'consultation-form').length > 1) throw new Error(`الصفحة «${titleValue}» لا يمكن أن تحتوي أكثر من نموذج استشارة ظاهر واحد.`);
  const slugValue = item.isHomepage === true ? 'home' : text(item.slug, 160).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(slugValue)) {
    throw new Error(`رابط الصفحة «${titleValue}» غير صالح.`);
  }
  return {
    id: identifier(item.id || `page-${index + 1}`, `معرّف الصفحة ${index + 1}`),
    title: titleValue,
    slug: slugValue,
    navigationLabel: text(item.navigationLabel, 80) || titleValue,
    status: item.status === 'published' ? 'published' : 'draft',
    pageKind: item.pageKind === 'landing' ? 'landing' : 'standard',
    isHomepage: item.isHomepage === true,
    showInNavigation: item.showInNavigation === true,
    headerMode: item.headerMode === 'hidden' ? 'hidden' : item.headerMode === 'minimal' ? 'minimal' : 'full',
    footerMode: item.footerMode === 'hidden' ? 'hidden' : item.footerMode === 'minimal' ? 'minimal' : 'full',
    seo: {
      title: text(rawSeo.title, 180) || titleValue,
      description: multiline(rawSeo.description, 320),
      image: imagePath(rawSeo.image, `صورة مشاركة الصفحة ${titleValue}`, true),
      noindex: rawSeo.noindex === true || item.status !== 'published'
    },
    sections,
    updatedAt: text(item.updatedAt, 80) || new Date().toISOString()
  };
}

function sanitizeContent(raw: unknown): DashboardContent {
  if (!raw || typeof raw !== 'object') throw new Error('ملف المحتوى غير صالح.');
  const input = raw as Partial<DashboardContent>;
  const sections = Array.isArray(input.home?.sections) ? input.home.sections : [];
  const normalizedSections = sectionIds.map((id) => {
    const found = sections.find((section) => section?.id === id);
    return {
      id,
      label: text(found?.label, 100) || sectionLabels[id],
      visible: found?.visible !== false
    };
  }).sort((a, b) => {
    const ai = sections.findIndex((section) => section?.id === a.id);
    const bi = sections.findIndex((section) => section?.id === b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  if (!Array.isArray(input.services) || !Array.isArray(input.cases)) {
    throw new Error('قائمتا الخدمات والحالات مطلوبتان.');
  }
  const fieldModel = sanitizeFieldModel(input.fieldModel);
  const services = input.services
    .slice(0, 80)
    .map((item, index) => sanitizeService(item, index, fieldModel.serviceFields))
    .sort(byDisplayOrder((item) => item.name));
  const cases = input.cases.slice(0, 60).map(sanitizeCase).sort(byDisplayOrder((item) => item.title));
  const achievements = (Array.isArray(input.achievements) ? input.achievements : [])
    .slice(0, 60)
    .map(sanitizeAchievement)
    .sort(byDisplayOrder((item) => item.title));
  const pages = (Array.isArray(input.pages) && input.pages.length ? input.pages : [legacyHomepage(input)]).slice(0, 50).map(sanitizePage);
  if (new Set(services.map((item) => item.slug)).size !== services.length) throw new Error('يوجد رابط مختصر مكرر بين الخدمات.');
  if (new Set(cases.map((item) => item.slug)).size !== cases.length) throw new Error('يوجد رابط مختصر مكرر بين الحالات.');
  if (new Set(achievements.map((item) => item.id)).size !== achievements.length) throw new Error('يوجد معرّف مكرر بين الإنجازات.');
  if (new Set(pages.map((item) => item.id)).size !== pages.length) throw new Error('يوجد معرّف مكرر بين الصفحات.');
  if (new Set(pages.map((item) => item.slug)).size !== pages.length) throw new Error('يوجد رابط مختصر مكرر بين الصفحات.');
  if (pages.filter((item) => item.isHomepage).length !== 1) throw new Error('يجب تحديد صفحة رئيسية واحدة فقط.');

  return {
    site: {
      name: required(input.site?.name, 'الاسم', 100),
      title: required(input.site?.title, 'الصفة المهنية', 140),
      phoneDisplay: required(input.site?.phoneDisplay, 'الهاتف الظاهر', 40),
      phoneLink: phoneLink(input.site?.phoneLink),
      whatsapp: whatsapp(input.site?.whatsapp),
      email: email(input.site?.email),
      facebook: safeUrl(input.site?.facebook, 'فيسبوك'),
      instagram: safeUrl(input.site?.instagram, 'إنستغرام'),
      portrait: imagePath(input.site?.portrait, 'الصورة الشخصية'),
      navigation: sanitizeNavigation(input.site?.navigation)
    },
    about: (() => {
      const fields = sanitizeDisplayFields(input.about?.fields, defaultAboutFields, 'بطاقة التعريف');
      return {
      biography: required(input.about?.biography, 'النبذة المختصرة', 1000, true),
      expandedBiography: required(input.about?.expandedBiography, 'النبذة الموسعة', 2200, true),
      university: required(input.about?.university, 'الجامعة', 200),
      graduationYear: required(input.about?.graduationYear, 'سنة التخرج', 50),
      qualification: required(input.about?.qualification, 'المؤهل', 240),
      graduationProject: required(input.about?.graduationProject, 'مشروع التخرج', 2200, true),
      experienceAreas: Array.isArray(input.about?.experienceAreas)
        ? input.about.experienceAreas.slice(0, 12).map((item) => text(item, 180)).filter(Boolean)
        : [],
      workplaces: Array.isArray(input.about?.workplaces)
        ? input.about.workplaces.slice(0, 12).map((item) => text(item, 180)).filter(Boolean)
        : [],
      fields,
      customFields: sanitizeCustomFieldValues(input.about?.customFields, fields)
      };
    })(),
    home: {
      banner: {
        eyebrow: required(input.home?.banner?.eyebrow, 'السطر التعريفي للواجهة', 100),
        title: required(input.home?.banner?.title, 'عنوان الواجهة', 180),
        description: required(input.home?.banner?.description, 'وصف الواجهة', 900, true),
        ctaLabel: required(input.home?.banner?.ctaLabel, 'نص زر الواجهة', 100)
      },
      profile: {
        eyebrow: required(input.home?.profile?.eyebrow, 'السطر التعريفي للملف الشخصي', 100),
        credentialLabel: required(input.home?.profile?.credentialLabel, 'تسمية المؤهل', 120),
        moreLabel: required(input.home?.profile?.moreLabel, 'نص عرض المزيد في الملف الشخصي', 80),
        lessLabel: required(input.home?.profile?.lessLabel, 'نص عرض الأقل في الملف الشخصي', 80)
      },
      quickStart: {
        eyebrow: required(input.home?.quickStart?.eyebrow, 'السطر التعريفي لقسم ابدأ من هنا', 100),
        title: required(input.home?.quickStart?.title, 'عنوان قسم ابدأ من هنا', 180),
        description: required(input.home?.quickStart?.description, 'وصف قسم ابدأ من هنا', 600, true)
      },
      consultation: {
        eyebrow: required(input.home?.consultation?.eyebrow, 'السطر التعريفي للاستشارة', 100),
        title: required(input.home?.consultation?.title, 'عنوان الاستشارة', 180),
        description: required(input.home?.consultation?.description, 'وصف الاستشارة', 700, true),
        submitLabel: required(input.home?.consultation?.submitLabel, 'نص زر إرسال الاستشارة', 100)
      },
      services: {
        eyebrow: required(input.home?.services?.eyebrow, 'السطر التعريفي للخدمات', 100),
        title: required(input.home?.services?.title, 'عنوان الخدمات', 180),
        description: required(input.home?.services?.description, 'وصف الخدمات', 700, true),
        showMoreLabel: required(input.home?.services?.showMoreLabel, 'نص إظهار المزيد للخدمات', 80),
        showLessLabel: required(input.home?.services?.showLessLabel, 'نص إظهار الأقل للخدمات', 80),
        requestLabel: required(input.home?.services?.requestLabel, 'نص زر طلب الخدمة', 100)
      },
      cases: {
        eyebrow: required(input.home?.cases?.eyebrow, 'السطر التعريفي لمعرض الأعمال', 100),
        title: required(input.home?.cases?.title, 'عنوان معرض الأعمال', 180),
        description: required(input.home?.cases?.description, 'وصف معرض الأعمال', 700, true),
        showMoreLabel: required(input.home?.cases?.showMoreLabel, 'نص إظهار المزيد للحالات', 80),
        showLessLabel: required(input.home?.cases?.showLessLabel, 'نص إظهار الأقل للحالات', 80),
        consultationLabel: required(input.home?.cases?.consultationLabel, 'نص زر استشارة الحالة', 100)
      },
      footer: {
        biography: required(input.home?.footer?.biography, 'نبذة التذييل', 700, true)
      },
      sections: normalizedSections
    },
    theme: sanitizeTheme(input.theme),
    pages,
    achievements,
    services,
    cases,
    fieldModel,
    privacy: sanitizePolicy(input.privacy, 'privacy'),
    disclaimer: sanitizePolicy(input.disclaimer, 'disclaimer')
  };
}

export async function readDashboardContent(): Promise<DashboardContent> {
  const [site, about, home, theme, fieldModel, pages, achievements, services, cases, policies] = await Promise.all([
    readJson('content/settings/site.json'),
    readJson('content/settings/about.json'),
    readJson('content/settings/home.json'),
    readJson('content/settings/theme.json').catch(() => defaultTheme),
    readJson('content/settings/field-model.json').catch(() => defaultFieldModel),
    readCollection<ManagedPage>('content/pages').catch(() => []),
    readJson('content/settings/achievements.json'),
    readCollection('content/services'),
    readCollection('content/cases'),
    readCollection<Policy>('content/policies')
  ]);
  const privacy = policies.find((policy) => policy.slug === 'privacy');
  const disclaimer = policies.find((policy) => policy.slug === 'disclaimer');
  if (!privacy || !disclaimer) throw new Error('ملفا سياسة الخصوصية وإخلاء المسؤولية مطلوبان.');
  return sanitizeContent({ site, about, home, theme, fieldModel, pages, achievements, services, cases, privacy, disclaimer });
}

const writeJson = async (path: string, value: unknown) => {
  const target = resolve(root, path);
  const relativeTarget = relative(contentRoot, target);
  const outsideContent =
    relativeTarget === '..'
    || relativeTarget.startsWith(`..${sep}`)
    || isAbsolute(relativeTarget);
  if (outsideContent) throw new Error('مسار الحفظ غير مسموح.');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const removeStaleCollectionFiles = async (directory: 'services' | 'cases', slugs: string[]) => {
  const folder = join(contentRoot, directory);
  const keep = new Set(slugs.map((item) => `${item}.json`));
  const files = (await readdir(folder)).filter((file) => file.endsWith('.json'));
  await Promise.all(files.filter((file) => !keep.has(file)).map((file) => unlink(join(folder, file))));
};
const removeStalePageFiles = async (slugs: string[]) => {
  const folder = join(contentRoot, 'pages');
  await mkdir(folder, { recursive: true });
  const keep = new Set(slugs.map((item) => `${item.replaceAll('/', '--')}.json`));
  const files = (await readdir(folder)).filter((file) => file.endsWith('.json'));
  await Promise.all(files.filter((file) => !keep.has(file)).map((file) => unlink(join(folder, file))));
};

export async function saveDashboardContent(raw: unknown): Promise<DashboardContent> {
  const content = sanitizeContent(raw);
  await Promise.all([
    writeJson('content/settings/site.json', content.site),
    writeJson('content/settings/about.json', content.about),
    writeJson('content/settings/home.json', content.home),
    writeJson('content/settings/theme.json', content.theme),
    writeJson('content/settings/field-model.json', content.fieldModel),
    writeJson('content/settings/achievements.json', content.achievements),
    writeJson('content/policies/privacy.json', content.privacy),
    writeJson('content/policies/disclaimer.json', content.disclaimer),
    ...content.services.map((item) => writeJson(`content/services/${item.slug}.json`, item)),
    ...content.cases.map((item) => writeJson(`content/cases/${item.slug}.json`, item))
    ,
    ...content.pages.map((item) => writeJson(`content/pages/${item.slug.replaceAll('/', '--')}.json`, { ...item, updatedAt: new Date().toISOString() }))
  ]);
  await Promise.all([
    removeStaleCollectionFiles('services', content.services.map((item) => item.slug)),
    removeStaleCollectionFiles('cases', content.cases.map((item) => item.slug)),
    removeStalePageFiles(content.pages.map((item) => item.slug))
  ]);

  const policies = await readCollection<Policy>('content/policies');
  const generated: PublicContent = {
    site: content.site,
    about: content.about,
    home: content.home,
    theme: content.theme,
    pages: content.pages,
    achievements: content.achievements,
    services: content.services,
    cases: content.cases,
    policies,
    fieldModel: content.fieldModel
  };
  await writeFile(
    join(root, 'src/generated/default-content.ts'),
    `/* Generated from /content. Do not edit manually. */\nexport const DEFAULT_CONTENT = ${JSON.stringify(generated, null, 2)} as const;\n`,
    'utf8'
  );
  return content;
}
