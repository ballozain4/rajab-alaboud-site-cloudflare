import type {
  Achievement,
  CaseStudy,
  ConsultationFieldDefinition,
  DashboardContent,
  DisplayFieldDefinition,
  FieldModel,
  ManagedPage,
  NavigationItem,
  PageSection,
  PageSectionItem,
  PageSectionStyle,
  PageSectionType,
  Policy,
  Service,
  ServiceFieldDefinition,
  SiteSettings,
  ThemeSettings
} from '../types';

type CollectionName = 'services' | 'cases' | 'achievements';
type DisplayFieldScope = CollectionName | 'about' | 'page-section' | 'page-item';
type FieldEditorTarget = {
  scope: DisplayFieldScope;
  ownerIndex: number;
  sectionIndex: number;
  itemIndex: number;
  fieldIndex: number;
};
type ImageTarget = { arrayIndex?: number } & (
  | { collection: 'site'; item: SiteSettings; key: 'portrait' }
  | { collection: 'services'; item: Service; key: 'image' }
  | { collection: 'cases'; item: CaseStudy; key: 'beforeImage' | 'afterImage' | 'resultImage' | 'additionalImages' }
  | { collection: 'achievements'; item: Achievement; key: 'image' }
  | { collection: 'pages'; item: PageSection | PageSectionItem; key: 'image' }
);
type PendingImage = ImageTarget & { file: File; previewUrl: string };

const draftKey = 'rajab-local-dashboard-draft-v3';
const legacyDraftKey = 'rajab-local-dashboard-draft-v2';
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const placeholderImages = {
  beforeImage: '/images/placeholders/before.svg',
  afterImage: '/images/placeholders/after.svg',
  resultImage: '/images/placeholders/after.svg',
  achievement: '/images/placeholders/certificate.svg'
} as const;
const defaultNavigation: NavigationItem[] = [
  { id: 'home', label: 'الرئيسية', url: '/#top', visible: true, primary: false },
  { id: 'consultation', label: 'طلب استشارة', url: '/#consultation', visible: true, primary: true },
  { id: 'services', label: 'الخدمات', url: '/#services', visible: true, primary: false },
  { id: 'cases', label: 'معرض الأعمال', url: '/#cases', visible: true, primary: false }
];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fieldIdPattern = /^[a-z][a-zA-Z0-9]*(?:-[a-z0-9]+)*$/;
const collapsedItems = new WeakSet<object>();

let state: DashboardContent | null = null;
let baseline = '';
let dirty = false;
let imageTarget: ImageTarget | null = null;
let pendingImages: PendingImage[] = [];
let draftTimer: number | undefined;
const filters: Record<CollectionName, string> = { services: '', cases: '', achievements: '' };
let draggedCollection: 'services' | 'cases' | null = null;
let draggedIndex = -1;
let fieldEditorTarget: FieldEditorTarget | null = null;
let draggedDisplayField: FieldEditorTarget | null = null;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);
const message = $('[data-dashboard-message]') as HTMLElement;
const imageInput = $('[data-image-input]') as HTMLInputElement;
const fieldEditorDialog = $('[data-field-editor-dialog]') as HTMLDialogElement;
const fieldEditorForm = $('[data-field-editor-form]') as HTMLFormElement;
const fieldEditorLabel = $('[data-field-editor-label]') as HTMLInputElement;
const fieldEditorType = $('[data-field-editor-type]') as HTMLSelectElement;
const fieldEditorPlacement = $('[data-field-editor-placement]') as HTMLSelectElement;
const fieldEditorVisible = $('[data-field-editor-visible]') as HTMLInputElement;
const fieldEditorRequired = $('[data-field-editor-required]') as HTMLInputElement;
const deleteDisplayFieldButton = $('[data-delete-display-field]') as HTMLButtonElement;
const esc = (value: unknown) => String(value ?? '').replace(
  /[&<>'"]/g,
  (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character
);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const field = (
  label: string,
  path: string,
  value: unknown,
  options: { textarea?: boolean; type?: string; full?: boolean; hint?: string; readonly?: boolean; required?: boolean } = {}
) => `
  <label class="dashboard-field${options.full ? ' full' : ''}">
    <span>${esc(label)}${options.required ? ' <b aria-hidden="true">*</b>' : ''}</span>
    ${options.textarea
      ? `<textarea data-path="${esc(path)}" rows="4"${options.readonly ? ' readonly' : ''}${options.required ? ' required' : ''}>${esc(value)}</textarea>`
      : `<input data-path="${esc(path)}" type="${options.type || 'text'}" value="${esc(value)}"${options.readonly ? ' readonly' : ''}${options.required ? ' required' : ''} />`}
    ${options.hint ? `<small>${esc(options.hint)}</small>` : ''}
  </label>`;

const collectionInput = (
  collection: CollectionName,
  index: number,
  key: string,
  label: string,
  value: unknown,
  options: { textarea?: boolean; full?: boolean; type?: string; hint?: string; required?: boolean; imagePath?: boolean } = {}
) => `
  <label class="dashboard-field${options.full ? ' full' : ''}">
    <span>${esc(label)}${options.required ? ' <b aria-hidden="true">*</b>' : ''}</span>
    ${options.textarea
      ? `<textarea rows="3" data-collection="${collection}" data-index="${index}" data-key="${key}"${options.required ? ' required' : ''}>${esc(value)}</textarea>`
      : `<input type="${options.type || 'text'}" data-collection="${collection}" data-index="${index}" data-key="${key}" value="${esc(value)}"${options.required ? ' required' : ''}${options.imagePath ? ' data-image-path' : ''} />`}
    ${options.hint ? `<small>${esc(options.hint)}</small>` : ''}
  </label>`;

const fieldToken = (
  scope: DisplayFieldScope,
  fieldIndex: number,
  ownerIndex = -1,
  sectionIndex = -1,
  itemIndex = -1
) => [scope, ownerIndex, sectionIndex, itemIndex, fieldIndex].join(':');

const parseFieldToken = (token = ''): FieldEditorTarget | null => {
  const [scope, ownerIndex, sectionIndex, itemIndex, fieldIndex] = token.split(':');
  if (!['services', 'cases', 'achievements', 'about', 'page-section', 'page-item'].includes(scope)) return null;
  const target = {
    scope: scope as DisplayFieldScope,
    ownerIndex: Number(ownerIndex),
    sectionIndex: Number(sectionIndex),
    itemIndex: Number(itemIndex),
    fieldIndex: Number(fieldIndex)
  };
  return [target.ownerIndex, target.sectionIndex, target.itemIndex, target.fieldIndex].every(Number.isInteger) ? target : null;
};

const managedFieldHeading = (
  definition: DisplayFieldDefinition,
  token: string,
  index: number,
  total: number
) => `<div class="managed-field-heading">
  <span class="field-drag-handle" draggable="true" data-field-drag-handle="${esc(token)}" role="button" tabindex="0" aria-label="اسحب الحقل لتغيير ترتيبه" title="اسحب لتغيير ترتيب الحقل">⋮⋮</span>
  <strong>${esc(definition.label)}${definition.required ? ' <b aria-hidden="true">*</b>' : ''}</strong>
  <button class="field-edit-button" type="button" data-edit-display-field="${esc(token)}" aria-label="تعديل عنوان حقل ${esc(definition.label)}" title="تعديل عنوان الحقل">✎</button>
  <span class="field-order-buttons">
    <button type="button" data-move-display-field="up" data-field-token="${esc(token)}" aria-label="نقل الحقل إلى أعلى" ${index === 0 ? 'disabled' : ''}>↑</button>
    <button type="button" data-move-display-field="down" data-field-token="${esc(token)}" aria-label="نقل الحقل إلى أسفل" ${index === total - 1 ? 'disabled' : ''}>↓</button>
  </span>
  ${definition.visible ? '' : '<em>مخفي</em>'}
</div>`;

const managedCollectionField = (
  collection: CollectionName,
  ownerIndex: number,
  definition: DisplayFieldDefinition,
  fieldIndex: number,
  total: number,
  value: string
) => {
  const token = fieldToken(collection, fieldIndex, ownerIndex);
  const key = definition.builtin ? definition.id : `customFields.${definition.id}`;
  return `<div class="dashboard-field managed-field-row full" data-field-row="${esc(token)}" data-field-id="${esc(definition.id)}">
    ${managedFieldHeading(definition, token, fieldIndex, total)}
    ${definition.type === 'textarea'
      ? `<textarea rows="3" data-collection="${collection}" data-index="${ownerIndex}" data-key="${esc(key)}"${definition.required ? ' required' : ''}>${esc(value)}</textarea>`
      : `<input type="text" data-collection="${collection}" data-index="${ownerIndex}" data-key="${esc(key)}" value="${esc(value)}"${definition.required ? ' required' : ''} />`}
  </div>`;
};

const managedPathField = (
  scope: 'about',
  definition: DisplayFieldDefinition,
  fieldIndex: number,
  total: number,
  value: string,
  path: string
) => {
  const token = fieldToken(scope, fieldIndex);
  return `<div class="dashboard-field managed-field-row full" data-field-row="${esc(token)}" data-field-id="${esc(definition.id)}">
    ${managedFieldHeading(definition, token, fieldIndex, total)}
    ${definition.type === 'textarea'
      ? `<textarea data-path="${esc(path)}" rows="4"${definition.required ? ' required' : ''}>${esc(value)}</textarea>`
      : `<input data-path="${esc(path)}" type="text" value="${esc(value)}"${definition.required ? ' required' : ''} />`}
  </div>`;
};

const addFieldButton = (
  scope: DisplayFieldScope,
  ownerIndex = -1,
  sectionIndex = -1,
  itemIndex = -1
) => `<button class="dashboard-button primary-soft add-inline-field" type="button" data-add-display-field="${esc(fieldToken(scope, -1, ownerIndex, sectionIndex, itemIndex))}">إضافة حقل إلى هذا العنصر</button>`;

const setMessage = (text: string, kind: 'neutral' | 'success' | 'error' = 'neutral') => {
  message.textContent = text;
  message.dataset.kind = kind;
};

const setDirty = (value = true) => {
  dirty = value;
  const indicator = $('[data-unsaved]');
  if (dirty) indicator?.removeAttribute('hidden');
  else indicator?.setAttribute('hidden', '');
};

const scheduleDraftSave = () => {
  if (!state) return;
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    if (!state || !dirty) return;
    localStorage.setItem(draftKey, JSON.stringify(state));
    $('[data-draft-banner]')?.removeAttribute('hidden');
  }, 650);
};

const markDirty = () => {
  setDirty(!state || JSON.stringify(state) !== baseline || pendingImages.length > 0);
  if (dirty) scheduleDraftSave();
};

const setByPath = (path: string, value: unknown) => {
  if (!state) return;
  const parts = path.split('.');
  let target: Record<string, unknown> | unknown[] = state as unknown as Record<string, unknown>;
  parts.slice(0, -1).forEach((part) => {
    target = (target as Record<string, unknown>)[part] as Record<string, unknown> | unknown[];
  });
  (target as Record<string, unknown>)[parts.at(-1)!] = value;
};

const itemLabel = (collection: CollectionName, item: Service | CaseStudy | Achievement) => {
  if (collection === 'services') return (item as Service).name;
  if (collection === 'cases') return (item as CaseStudy).title;
  return (item as Achievement).title;
};

const itemIdentifier = (collection: CollectionName, item: Service | CaseStudy | Achievement) =>
  collection === 'achievements' ? (item as Achievement).id : (item as Service | CaseStudy).slug;

const transliteration: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'a', آ: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'th', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z',
  ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w',
  ي: 'y', ى: 'a', ة: 'a', ؤ: 'w', ئ: 'y', ء: ''
};

const makeSlug = (value: string, fallbackPrefix: string) => {
  const latin = value
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .split('')
    .map((character) => transliteration[character] ?? character)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return latin || `${fallbackPrefix}-${Date.now()}`;
};

const pageSectionLabels: Record<PageSectionType, string> = {
  hero: 'واجهة رئيسية Hero',
  'text-image': 'نص مع صورة',
  'services-grid': 'شبكة خدمات',
  steps: 'خطوات العمل',
  'cases-gallery': 'معرض الحالات',
  'about-profile': 'نبذة شخصية',
  features: 'المميزات',
  faq: 'الأسئلة الشائعة',
  testimonials: 'آراء وتجارب',
  gallery: 'معرض صور',
  stats: 'أرقام وإحصاءات',
  logos: 'شعارات شركاء',
  cta: 'دعوة إلى إجراء',
  'consultation-form': 'نموذج استشارة',
  contact: 'بيانات التواصل'
};
const pageSectionTypes = Object.keys(pageSectionLabels) as PageSectionType[];
const itemSectionTypes = new Set<PageSectionType>(['services-grid', 'steps', 'cases-gallery', 'features', 'faq', 'testimonials', 'gallery', 'stats', 'logos']);
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
const themePresets: Record<Exclude<ThemeSettings['preset'], 'custom'>, ThemeSettings> = {
  lavender: { ...defaultTheme },
  rose: {
    ...defaultTheme, preset: 'rose', primary: '#7d3455', primaryStrong: '#481b31', primarySoft: '#a95f80',
    secondary: '#e1b6c8', secondarySoft: '#f7eaf0', accent: '#c75888', background: '#fffafb',
    surfaceAlt: '#f9f0f4', text: '#2d1d24', muted: '#706069', border: '#ead8e0', focus: '#c75888'
  },
  ocean: {
    ...defaultTheme, preset: 'ocean', primary: '#155f74', primaryStrong: '#083947', primarySoft: '#39849a',
    secondary: '#a9d3dc', secondarySoft: '#e7f4f6', accent: '#1d8ca5', background: '#f8fcfd',
    surfaceAlt: '#edf7f8', text: '#16272c', muted: '#586b70', border: '#d3e6ea', focus: '#1d8ca5'
  },
  forest: {
    ...defaultTheme, preset: 'forest', primary: '#35624a', primaryStrong: '#1d3b2b', primarySoft: '#5f8870',
    secondary: '#bdd3c4', secondarySoft: '#eaf3ed', accent: '#4c8c68', background: '#fbfdfb',
    surfaceAlt: '#f0f6f2', text: '#1d2922', muted: '#5e6d64', border: '#d9e5dc', focus: '#4c8c68'
  }
};

const defaultPageStyle = (): PageSectionStyle => ({
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
const newSectionFields = (): DisplayFieldDefinition[] => [
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
const newPageItemFields = (): DisplayFieldDefinition[] => [
  { id: 'title', label: 'العنوان', type: 'text', placement: 'card', required: false, visible: true, builtin: true, order: 10 },
  { id: 'value', label: 'القيمة الرقمية', type: 'text', placement: 'card', required: false, visible: true, builtin: true, order: 20 },
  { id: 'label', label: 'التسمية', type: 'text', placement: 'card', required: false, visible: true, builtin: true, order: 30 },
  { id: 'text', label: 'النص', type: 'textarea', placement: 'card', required: false, visible: true, builtin: true, order: 40 },
  { id: 'image', label: 'مسار الصورة', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 50 },
  { id: 'imageAlt', label: 'النص البديل للصورة', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 60 },
  { id: 'url', label: 'الرابط', type: 'text', placement: 'details', required: false, visible: true, builtin: true, order: 70 }
];
const makePageItem = (index = 0): PageSectionItem => ({
  id: `item-${Date.now()}-${index + 1}`,
  title: `[عنوان العنصر ${index + 1}]`,
  text: '[نص مختصر وواضح]',
  image: '',
  imageAlt: '',
  value: '',
  label: '',
  url: '',
  fields: newPageItemFields(),
  customFields: {}
});
const makePageSection = (type: PageSectionType): PageSection => {
  const source = type === 'services-grid' ? 'services' : type === 'cases-gallery' ? 'cases' : type === 'about-profile' ? 'about' : type === 'contact' || type === 'consultation-form' ? 'contact' : 'manual';
  const itemCount = ['features', 'steps', 'faq', 'stats'].includes(type) ? 3 : itemSectionTypes.has(type) && source === 'manual' ? 2 : 0;
  return {
    id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    name: pageSectionLabels[type],
    visible: true,
    fields: newSectionFields(),
    customFields: {},
    style: {
      ...defaultPageStyle(),
      background: type === 'hero' || type === 'cta' ? 'primary' : type === 'consultation-form' || type === 'cases-gallery' ? 'surface' : 'default',
      width: ['hero', 'services-grid', 'cases-gallery', 'gallery'].includes(type) ? 'wide' : 'normal',
      spacing: type === 'hero' ? 'large' : 'normal',
      alignment: type === 'cta' || type === 'stats' || type === 'logos' ? 'center' : 'start'
    },
    content: {
      eyebrow: '',
      title: pageSectionLabels[type],
      description: '',
      image: '',
      imageAlt: '',
      buttonLabel: type === 'consultation-form' ? 'تسجيل طلب الاستشارة' : type === 'hero' || type === 'cta' ? 'اطلب استشارة' : '',
      buttonUrl: type === 'hero' || type === 'cta' ? '#consultation' : '',
      secondaryButtonLabel: '',
      secondaryButtonUrl: '',
      source,
      limit: 6,
      items: Array.from({ length: itemCount }, (_, index) => makePageItem(index))
    }
  };
};
const makeManagedPage = (template: 'blank' | 'service' | 'consultation' | 'campaign' = 'blank'): ManagedPage => {
  const timestamp = Date.now();
  const title = template === 'service' ? 'صفحة خدمة جديدة' : template === 'consultation' ? 'صفحة استشارة' : template === 'campaign' ? 'صفحة حملة جديدة' : 'صفحة جديدة';
  const sections = template === 'service'
    ? [makePageSection('hero'), makePageSection('features'), makePageSection('steps'), makePageSection('cases-gallery'), makePageSection('faq'), makePageSection('cta')]
    : template === 'consultation'
      ? [makePageSection('hero'), makePageSection('steps'), makePageSection('consultation-form'), makePageSection('faq')]
      : template === 'campaign'
        ? [makePageSection('hero'), makePageSection('features'), makePageSection('testimonials'), makePageSection('stats'), makePageSection('cta')]
        : [makePageSection('hero')];
  return {
    id: `page-${timestamp}`,
    title,
    slug: `page-${timestamp}`,
    navigationLabel: title,
    status: 'draft',
    pageKind: template === 'blank' ? 'standard' : 'landing',
    isHomepage: false,
    showInNavigation: false,
    headerMode: template === 'blank' ? 'full' : 'minimal',
    footerMode: template === 'blank' ? 'full' : 'minimal',
    seo: { title, description: '', image: '', noindex: true },
    sections,
    updatedAt: new Date().toISOString()
  };
};

let selectedPageId = '';
let pageFilter = '';
let previewSize: 'desktop' | 'mobile' = 'desktop';
const pageUndo = new Map<string, string[]>();
const pageRedo = new Map<string, string[]>();
let recordedFocus: Element | null = null;

const currentPage = () => state?.pages.find((page) => page.id === selectedPageId) || state?.pages[0];
const resolveFieldOwner = (target: FieldEditorTarget): { fields: DisplayFieldDefinition[]; customFields: Record<string, string> } | null => {
  if (!state) return null;
  if (target.scope === 'about') return state.about;
  if (target.scope === 'services' || target.scope === 'cases' || target.scope === 'achievements') {
    return state[target.scope][target.ownerIndex] || null;
  }
  const section = currentPage()?.sections[target.sectionIndex];
  if (!section) return null;
  if (target.scope === 'page-section') return section;
  return section.content.items[target.itemIndex] || null;
};

const normalizeDisplayFieldOrder = (fields: DisplayFieldDefinition[]) =>
  fields.forEach((field, index) => { field.order = (index + 1) * 10; });

const rerenderFieldOwner = (scope: DisplayFieldScope) => {
  if (scope === 'services') renderServices();
  else if (scope === 'cases') renderCases();
  else if (scope === 'achievements') renderAchievements();
  else if (scope === 'about') renderProfile();
  else renderPages();
};

const uniqueDisplayFieldId = (owner: { fields: DisplayFieldDefinition[] }, scope: DisplayFieldScope) => {
  const prefix = scope === 'about' ? 'profile-field' : scope === 'page-section' ? 'section-field' : scope === 'page-item' ? 'item-field' : `${scope.slice(0, -1)}-field`;
  const used = new Set(owner.fields.map((field) => field.id.toLowerCase()));
  let id = `${prefix}-${Date.now()}`;
  let suffix = 2;
  while (used.has(id.toLowerCase())) id = `${prefix}-${Date.now()}-${suffix++}`;
  return id;
};

const openFieldEditor = (target: FieldEditorTarget) => {
  const owner = resolveFieldOwner(target);
  const definition = owner?.fields[target.fieldIndex];
  if (!owner || !definition) return;
  fieldEditorTarget = target;
  fieldEditorLabel.value = definition.label;
  fieldEditorType.value = definition.type;
  fieldEditorPlacement.value = definition.placement;
  fieldEditorVisible.checked = definition.visible;
  fieldEditorRequired.checked = definition.required;
  deleteDisplayFieldButton.hidden = definition.builtin;
  fieldEditorDialog.showModal();
  requestAnimationFrame(() => fieldEditorLabel.focus());
};

const closeFieldEditor = () => {
  fieldEditorTarget = null;
  if (fieldEditorDialog.open) fieldEditorDialog.close();
};
const syncLegacyPathToHomepage = (path: string, value: unknown) => {
  if (!state) return;
  const homepage = state.pages.find((page) => page.isHomepage);
  if (!homepage) return;
  const mapping: Array<[string, string, string]> = [
    ['home.banner.', 'home-hero', 'content.'],
    ['home.quickStart.', 'quick-start', 'content.'],
    ['home.consultation.', 'consultation', 'content.'],
    ['home.services.', 'services', 'content.'],
    ['home.cases.', 'cases', 'content.']
  ];
  const match = mapping.find(([prefix]) => path.startsWith(prefix));
  if (match) {
    const [prefix, sectionId, targetPrefix] = match;
    const section = homepage.sections.find((item) => item.id === sectionId);
    if (!section) return;
    const rawKey = path.slice(prefix.length);
    const keyMap: Record<string, string> = {
      ctaLabel: 'buttonLabel',
      submitLabel: 'buttonLabel',
      requestLabel: 'buttonLabel',
      consultationLabel: 'buttonLabel',
      showMoreLabel: '',
      showLessLabel: ''
    };
    const targetKey = keyMap[rawKey] ?? rawKey;
    if (targetKey) setNestedValue(section as unknown as Record<string, unknown>, `${targetPrefix}${targetKey}`, value);
    return;
  }
  const aboutSection = homepage.sections.find((item) => item.type === 'about-profile');
  if (!aboutSection) return;
  if (path === 'site.name') aboutSection.content.title = String(value);
  if (path === 'about.biography') aboutSection.content.description = String(value);
  if (path === 'site.portrait') aboutSection.content.image = String(value);
};
const pushPageHistory = () => {
  const page = currentPage();
  if (!page) return;
  const stack = pageUndo.get(page.id) || [];
  const snapshot = JSON.stringify(page);
  if (stack.at(-1) !== snapshot) stack.push(snapshot);
  if (stack.length > 60) stack.shift();
  pageUndo.set(page.id, stack);
  pageRedo.set(page.id, []);
  updateHistoryButtons();
};
const updateHistoryButtons = () => {
  const page = currentPage();
  const undo = $('[data-page-undo]') as HTMLButtonElement | null;
  const redo = $('[data-page-redo]') as HTMLButtonElement | null;
  if (undo) undo.disabled = !page || !(pageUndo.get(page.id)?.length);
  if (redo) redo.disabled = !page || !(pageRedo.get(page.id)?.length);
};

const uniqueIdentifier = (collection: CollectionName, proposed: string, current?: object) => {
  if (!state) return proposed;
  const used = new Set(
    state[collection]
      .filter((item) => item !== current)
      .map((item) => itemIdentifier(collection, item as Service | CaseStudy | Achievement))
  );
  let result = proposed;
  let suffix = 2;
  while (used.has(result)) result = `${proposed}-${suffix++}`;
  return result;
};

const getPending = (target: ImageTarget) => pendingImages.find(
  (entry) =>
    entry.collection === target.collection
    && entry.item === target.item
    && entry.key === target.key
    && (entry.arrayIndex ?? -1) === (target.arrayIndex ?? -1)
);

const clearPending = (target: ImageTarget) => {
  const pending = getPending(target);
  if (!pending) return;
  URL.revokeObjectURL(pending.previewUrl);
  pendingImages = pendingImages.filter((entry) => entry !== pending);
};

const clearAllPending = () => {
  pendingImages.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
  pendingImages = [];
  imageTarget = null;
};

const effectiveImage = (target: ImageTarget, current: string) => getPending(target)?.previewUrl || current;

const imageEditor = (
  collection: Exclude<ImageTarget['collection'], 'site'>,
  index: number,
  item: Service | CaseStudy | Achievement,
  key: 'image' | 'beforeImage' | 'afterImage' | 'resultImage' | 'additionalImages',
  label: string,
  current: string,
  emptyLabel = 'لا توجد صورة محددة',
  arrayIndex?: number
) => {
  const target = { collection, item, key, arrayIndex } as ImageTarget;
  const pending = getPending(target);
  const source = effectiveImage(target, current);
  const imageIndex = Number.isInteger(arrayIndex) ? ` data-image-index="${arrayIndex}"` : '';
  return `
    <div class="collection-image-editor" data-image-editor>
      ${source
        ? `<img src="${esc(source)}" alt="معاينة ${esc(label)}" />`
        : `<div class="empty-image">${esc(emptyLabel)}</div>`}
      <div class="image-editor-details">
        <strong>${esc(label)}</strong>
        <code>${pending ? 'بانتظار الحفظ في ملفات المشروع' : esc(current || '—')}</code>
        <div class="image-actions">
          <button class="dashboard-button secondary" type="button" data-upload-collection="${collection}" data-index="${index}" data-image-key="${key}"${imageIndex}>اختيار صورة</button>
          <button class="dashboard-button danger-soft" type="button" data-remove-image="${collection}" data-index="${index}" data-image-key="${key}"${imageIndex}>إزالة الصورة</button>
        </div>
      </div>
    </div>`;
};

const actionButtons = (collection: CollectionName, index: number, length: number, item: object) => `
  <div class="collection-actions">
    ${collection === 'services' || collection === 'cases'
      ? `<span class="drag-handle" draggable="true" data-drag-handle data-drag-collection="${collection}" data-index="${index}" role="button" tabindex="0" aria-label="اسحب لتغيير الترتيب" title="اسحب لتغيير الترتيب">⋮⋮</span>`
      : ''}
    <button type="button" data-move-item="up" data-collection-name="${collection}" data-index="${index}" aria-label="نقل إلى أعلى" ${index === 0 ? 'disabled' : ''}>↑</button>
    <button type="button" data-move-item="down" data-collection-name="${collection}" data-index="${index}" aria-label="نقل إلى أسفل" ${index === length - 1 ? 'disabled' : ''}>↓</button>
    <button type="button" data-duplicate-item="${collection}" data-index="${index}" aria-label="تكرار العنصر">⧉</button>
    <button type="button" data-toggle-item="${collection}" data-index="${index}" aria-expanded="${String(!collapsedItems.has(item))}" aria-label="${collapsedItems.has(item) ? 'فتح بطاقة التحرير' : 'طي بطاقة التحرير'}">${collapsedItems.has(item) ? '＋' : '−'}</button>
    <button class="danger" type="button" data-delete-item="${collection}" data-index="${index}" aria-label="حذف العنصر">×</button>
  </div>`;

const slugNotice = (collection: CollectionName, value: string, current: object) => {
  if (!slugPattern.test(value)) return '<p class="validation-note error">غير صالح: استخدم حروفاً إنجليزية صغيرة وأرقاماً وشرطات فقط.</p>';
  if (!state) return '';
  const duplicate = state[collection].some(
    (item) => item !== current && itemIdentifier(collection, item as Service | CaseStudy | Achievement) === value
  );
  return duplicate
    ? '<p class="validation-note error">هذا المعرّف مستخدم في عنصر آخر.</p>'
    : '<p class="validation-note success">المعرّف صالح وغير مكرر.</p>';
};

function renderNavigation() {
  if (!state) return;
  const target = $('[data-panel="navigation"]');
  if (!target) return;
  target.innerHTML = state.site.navigation.length
    ? state.site.navigation.map((item, index) => `
      <article class="navigation-item" data-navigation-item="${index}">
        <header>
          <div><span>رابط ${index + 1} · ${item.visible ? 'ظاهر' : 'مخفي'}${item.primary ? ' · زر بارز' : ''}</span><strong>${esc(item.label)}</strong></div>
          <div class="collection-actions">
            <button type="button" data-move-navigation="up" data-index="${index}" aria-label="نقل الرابط إلى أعلى" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" data-move-navigation="down" data-index="${index}" aria-label="نقل الرابط إلى أسفل" ${index === state!.site.navigation.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" data-duplicate-navigation data-index="${index}" aria-label="تكرار الرابط">⧉</button>
            <button class="danger" type="button" data-delete-navigation data-index="${index}" aria-label="حذف الرابط">×</button>
          </div>
        </header>
        <div class="dashboard-form-grid compact">
          <label class="dashboard-field"><span>العنوان الظاهر</span><input type="text" data-navigation-index="${index}" data-navigation-key="label" value="${esc(item.label)}" required /></label>
          <label class="dashboard-field"><span>الرابط</span><input type="text" data-navigation-index="${index}" data-navigation-key="url" value="${esc(item.url)}" placeholder="/#services أو /page/" required /></label>
          <div class="check-row full">
            <label><input type="checkbox" data-navigation-index="${index}" data-navigation-key="visible" ${item.visible ? 'checked' : ''} /> إظهار في الهيدر</label>
            <label><input type="checkbox" data-navigation-index="${index}" data-navigation-key="primary" ${item.primary ? 'checked' : ''} /> إظهاره كزر بارز</label>
          </div>
        </div>
      </article>`).join('')
    : '<div class="empty-collection"><p>لا توجد روابط في الهيدر. يمكنك إضافة رابط جديد، أو إبقاء القائمة فارغة.</p></div>';
}

function renderProfile() {
  if (!state) return;
  const target = $('[data-panel="profile"]')!;
  const portraitTarget: ImageTarget = { collection: 'site', item: state.site, key: 'portrait' };
  const portrait = effectiveImage(portraitTarget, state.site.portrait);
  const pending = getPending(portraitTarget);
  const managedAboutFields = state.about.fields.map((definition, index, fields) => {
    const value = definition.builtin
      ? definition.id === 'experienceAreas'
        ? state!.about.experienceAreas.join('\n')
        : String((state!.about as unknown as Record<string, unknown>)[definition.id] || '')
      : String(state!.about.customFields?.[definition.id] || '');
    const path = definition.builtin
      ? definition.id === 'experienceAreas' ? 'about.experienceAreasText' : `about.${definition.id}`
      : `about.customFields.${definition.id}`;
    return managedPathField('about', definition, index, fields.length, value, path);
  }).join('');
  target.innerHTML = `
    <div class="image-editor full">
      <img src="${esc(portrait)}" alt="معاينة الصورة الشخصية" />
      <div>
        <strong>الصورة الشخصية</strong>
        <code>${pending ? 'بانتظار الحفظ في ملفات المشروع' : esc(state.site.portrait)}</code>
        <button class="dashboard-button secondary" type="button" data-upload-image="portrait">اختيار صورة</button>
      </div>
    </div>
    ${field('الاسم', 'site.name', state.site.name, { required: true })}
    ${field('الصفة المهنية', 'site.title', state.site.title, { required: true })}
    ${field('النبذة المختصرة', 'about.biography', state.about.biography, { textarea: true, full: true, required: true })}
    ${field('النبذة الموسعة', 'about.expandedBiography', state.about.expandedBiography, { textarea: true, full: true, required: true })}
    ${field('نص زر إظهار التفاصيل', 'home.profile.moreLabel', state.home.profile.moreLabel, { required: true })}
    ${field('نص زر إخفاء التفاصيل', 'home.profile.lessLabel', state.home.profile.lessLabel, { required: true })}
    <div class="full inline-fields-toolbar"><strong>حقول بطاقة التعريف</strong>${addFieldButton('about')}</div>
    ${managedAboutFields}
    ${field('أسماء أماكن العمل — كل مركز في سطر', 'about.workplacesText', state.about.workplaces.join('\n'), { textarea: true, full: true, hint: 'لن يظهر القسم إذا بقيت القائمة فارغة.' })}`;
}

const fieldModelActions = (group: keyof FieldModel, index: number, total: number, builtin: boolean) => `
  <div class="item-actions">
    <button type="button" data-move-model="up" data-model-group="${group}" data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="تحريك الحقل إلى أعلى">↑</button>
    <button type="button" data-move-model="down" data-model-group="${group}" data-index="${index}" ${index === total - 1 ? 'disabled' : ''} aria-label="تحريك الحقل إلى أسفل">↓</button>
    ${builtin ? '' : `<button class="danger" type="button" data-delete-model data-model-group="${group}" data-index="${index}">حذف</button>`}
  </div>`;

function renderConsultationFields() {
  if (!state) return;
  const target = $('[data-panel="consultation-fields"]')!;
  target.innerHTML = state.fieldModel.consultationFields.map((item, index, fields) => {
    const locked = item.id === 'phone' || item.id === 'privacy';
    return `
      <article class="collection-card field-model-card" data-model-card="consultationFields">
        <header>
          <div><span>${item.builtin ? 'حقل أساسي' : 'حقل إضافي'} · ${item.required ? 'إلزامي' : 'اختياري'} · ${item.visible ? 'ظاهر' : 'مخفي'}</span><h3>${esc(item.label)}</h3><code>${esc(item.id)}</code></div>
          ${fieldModelActions('consultationFields', index, fields.length, item.builtin)}
        </header>
        <div class="collection-body">
          <div class="dashboard-form-grid compact">
            ${field('عنوان الحقل', `fieldModel.consultationFields.${index}.label`, item.label, { full: true, required: true })}
            ${field('المعرّف الداخلي', `fieldModel.consultationFields.${index}.id`, item.id, { readonly: true, required: true, hint: 'يُنشأ تلقائياً ويبقى ثابتاً لحماية الطلبات المحفوظة.' })}
            <label class="dashboard-field"><span>نوع الحقل</span><select data-model-group="consultationFields" data-index="${index}" data-model-key="type" ${item.builtin ? 'disabled' : ''}><option value="text" ${item.type === 'text' ? 'selected' : ''}>نص</option><option value="textarea" ${item.type === 'textarea' ? 'selected' : ''}>نص طويل</option><option value="tel" ${item.type === 'tel' ? 'selected' : ''}>هاتف</option><option value="select" ${item.type === 'select' ? 'selected' : ''}>قائمة اختيار</option><option value="checkbox" ${item.type === 'checkbox' ? 'selected' : ''}>مربع موافقة</option></select></label>
            ${item.type !== 'checkbox' ? field('النص الإرشادي داخل الحقل', `fieldModel.consultationFields.${index}.placeholder`, item.placeholder, { full: true }) : ''}
            ${field('ملاحظة مساعدة أسفل الحقل', `fieldModel.consultationFields.${index}.helpText`, item.helpText, { textarea: true, full: true })}
            ${item.type === 'select' ? field('خيارات القائمة — خيار في كل سطر', `fieldModel.consultationFields.${index}.optionsText`, item.options.join('\n'), { textarea: true, full: true, required: true }) : ''}
            <div class="check-row full">
              <label><input type="checkbox" data-model-group="consultationFields" data-index="${index}" data-model-key="visible" ${item.visible ? 'checked' : ''} ${locked ? 'disabled' : ''} /> يظهر في النموذج</label>
              <label><input type="checkbox" data-model-group="consultationFields" data-index="${index}" data-model-key="required" ${item.required ? 'checked' : ''} ${locked ? 'disabled' : ''} /> إلزامي</label>
              <label><input type="checkbox" data-model-group="consultationFields" data-index="${index}" data-model-key="fullWidth" ${item.fullWidth ? 'checked' : ''} /> بعرض كامل</label>
            </div>
            ${locked ? '<p class="panel-notice full">هذا الحقل محمي من الإخفاء أو التحويل إلى اختياري لأنه ضروري لمتابعة الطلب وحماية الموافقة.</p>' : ''}
          </div>
        </div>
      </article>`;
  }).join('');
}

const serviceFieldValue = (service: Service, item: ServiceFieldDefinition) =>
  item.builtin
    ? String(service[item.id as 'category' | 'summary' | 'description' | 'suitableFor' | 'notes'] || '')
    : String(service.customFields?.[item.id] || '');

const serviceModelInput = (service: Service, index: number, item: ServiceFieldDefinition, fieldIndex: number) =>
  managedCollectionField('services', index, item, fieldIndex, service.fields.length, serviceFieldValue(service, item));

function serviceCard(service: Service, index: number) {
  const mediaImage = service.mediaType === 'image'
    ? imageEditor('services', index, service, 'image', 'صورة بطاقة الخدمة', service.image, 'لم تُحدد صورة؛ ستظهر الأيقونة كبديل.')
    : '';
  return `<article class="collection-card" data-item-card="services" data-index="${index}">
    <header>
      <div><span>خدمة ${index + 1} · ${service.visible ? 'ظاهرة' : 'مخفية'}</span><h3 data-card-title>${esc(service.name)}</h3><code data-card-identifier>${esc(service.slug)}</code></div>
      ${actionButtons('services', index, state!.services.length, service)}
    </header>
    <div class="collection-body" ${collapsedItems.has(service) ? 'hidden' : ''}>
      <div class="dashboard-form-grid compact">
        ${collectionInput('services', index, 'name', 'اسم الخدمة', service.name, { required: true })}
        <div class="slug-field full">
          ${collectionInput('services', index, 'slug', 'الرابط المختصر الداخلي (Slug)', service.slug, { required: true, hint: 'يتولد تلقائياً من الاسم ويمكن تعديله بحروف إنجليزية صغيرة وأرقام وشرطات.' })}
          <button class="mini-button" type="button" data-generate-slug="services" data-index="${index}">إعادة توليده من الاسم</button>
          <div data-slug-notice>${slugNotice('services', service.slug, service)}</div>
        </div>
        <div class="full inline-fields-toolbar"><strong>حقول هذه الخدمة فقط</strong>${addFieldButton('services', index)}</div>
        ${service.fields.map((item, fieldIndex) => serviceModelInput(service, index, item, fieldIndex)).join('')}
        <label class="dashboard-field"><span>نوع الوسائط</span><select data-collection="services" data-index="${index}" data-key="mediaType"><option value="icon" ${service.mediaType !== 'image' ? 'selected' : ''}>أيقونة</option><option value="image" ${service.mediaType === 'image' ? 'selected' : ''}>صورة</option></select></label>
        ${service.mediaType !== 'image' ? `<label class="dashboard-field"><span>الأيقونة</span><select data-collection="services" data-index="${index}" data-key="icon"><option value="sparkles" ${service.icon === 'sparkles' ? 'selected' : ''}>لمعان ✦</option><option value="leaf" ${service.icon === 'leaf' ? 'selected' : ''}>ورقة ◇</option><option value="droplet" ${service.icon === 'droplet' ? 'selected' : ''}>قطرة ●</option></select><span class="icon-live-preview" aria-label="معاينة الأيقونة">${service.icon === 'leaf' ? '◇' : service.icon === 'droplet' ? '●' : '✦'}</span></label>` : ''}
        ${service.mediaType === 'image' ? `<div class="full">${mediaImage}</div>${collectionInput('services', index, 'image', 'مسار الصورة داخل /images/', service.image, { full: true, imagePath: true, hint: 'يمكن تركه فارغاً لاستخدام الأيقونة تلقائياً.' })}` : ''}
        <div class="check-row">
          <label><input type="checkbox" data-collection="services" data-index="${index}" data-key="featured" ${service.featured ? 'checked' : ''} /> مميزة ضمن العناصر الأولى</label>
          <label><input type="checkbox" data-collection="services" data-index="${index}" data-key="visible" ${service.visible ? 'checked' : ''} /> ظاهرة</label>
          <label><input type="checkbox" data-collection="services" data-index="${index}" data-key="placeholder" ${service.placeholder ? 'checked' : ''} /> بيانات مؤقتة/تجريبية</label>
        </div>
      </div>
    </div>
  </article>`;
}

function renderServices() {
  if (!state) return;
  const query = filters.services.trim().toLocaleLowerCase('ar');
  const matches = state.services
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !query || `${item.name} ${item.category} ${item.slug}`.toLocaleLowerCase('ar').includes(query));
  $('[data-services-count]')!.textContent = `عرض ${matches.length} من أصل ${state.services.length} خدمة.`;
  $('[data-panel="services"]')!.innerHTML = matches.length
    ? matches.map(({ item, index }) => serviceCard(item, index)).join('')
    : '<p class="empty-collection">لا توجد خدمات تطابق البحث.</p>';
}

function caseCard(item: CaseStudy, index: number) {
  const single = item.displayType === 'single-result';
  const gallery = item.displayType === 'before-after-gallery';
  const displayedPaths = single
    ? [item.resultImage || item.afterImage]
    : [item.beforeImage, item.afterImage, ...(gallery ? item.additionalImages.filter(Boolean) : [])];
  const unsafeReal = !item.placeholder && displayedPaths.some((path) => path.includes('/placeholders/'));
  return `<article class="collection-card" data-item-card="cases" data-index="${index}">
    <header>
      <div><span>حالة ${index + 1} · ${item.status === 'published' && item.visible ? 'منشورة' : 'مسودة/مخفية'} · ${single ? 'نتيجة نهائية' : gallery ? 'قبل وبعد + معرض' : 'قبل وبعد'}</span><h3 data-card-title>${esc(item.title)}</h3><code data-card-identifier>${esc(item.slug)}</code></div>
      ${actionButtons('cases', index, state!.cases.length, item)}
    </header>
    <div class="collection-body" ${collapsedItems.has(item) ? 'hidden' : ''}>
      ${item.placeholder ? '<p class="item-warning">هذه الحالة موسومة بوضوح كحالة تجريبية في الموقع.</p>' : ''}
      ${unsafeReal ? '<p class="item-warning error">لا يمكن حفظ الحالة كحقيقية قبل استبدال الصور النائبة أو إعادة تفعيل وسم «حالة تجريبية».</p>' : ''}
      <div class="dashboard-form-grid compact">
        ${collectionInput('cases', index, 'title', 'عنوان الحالة', item.title, { required: true })}
        ${collectionInput('cases', index, 'category', 'التصنيف الداخلي', item.category, { required: true, hint: 'يُستخدم للبحث والتنظيم داخل اللوحة، ولا يظهر كحقل مستقل للزائر.' })}
        <div class="slug-field full">
          ${collectionInput('cases', index, 'slug', 'الرابط المختصر الداخلي (Slug)', item.slug, { required: true })}
          <button class="mini-button" type="button" data-generate-slug="cases" data-index="${index}">إعادة توليده من العنوان</button>
          <div data-slug-notice>${slugNotice('cases', item.slug, item)}</div>
        </div>
        <div class="full inline-fields-toolbar"><strong>حقول هذه الحالة فقط</strong>${addFieldButton('cases', index)}</div>
        ${item.fields.map((definition, fieldIndex, fields) => {
          const value = definition.builtin
            ? String((item as unknown as Record<string, unknown>)[definition.id] || '')
            : String(item.customFields?.[definition.id] || '');
          return managedCollectionField('cases', index, definition, fieldIndex, fields.length, value);
        }).join('')}
        <label class="dashboard-field full"><span>نمط بطاقة الحالة</span><select data-collection="cases" data-index="${index}" data-key="displayType"><option value="before-after" ${!single && !gallery ? 'selected' : ''}>قبل وبعد</option><option value="single-result" ${single ? 'selected' : ''}>صورة واحدة — النتيجة النهائية</option><option value="before-after-gallery" ${gallery ? 'selected' : ''}>قبل وبعد + صور إضافية داخل التفاصيل</option></select></label>
        <div class="case-images full">
          ${single
            ? imageEditor('cases', index, item, 'resultImage', 'الصورة النهائية', item.resultImage || item.afterImage)
            : `${imageEditor('cases', index, item, 'beforeImage', 'صورة قبل', item.beforeImage)}${imageEditor('cases', index, item, 'afterImage', 'صورة بعد', item.afterImage)}`}
        </div>
        ${single
          ? collectionInput('cases', index, 'resultImage', 'مسار الصورة النهائية', item.resultImage || item.afterImage, { full: true, required: true, imagePath: true })
          : `${collectionInput('cases', index, 'beforeImage', 'مسار صورة قبل', item.beforeImage, { required: true, imagePath: true })}${collectionInput('cases', index, 'afterImage', 'مسار صورة بعد', item.afterImage, { required: true, imagePath: true })}`}
        ${gallery ? `<div class="case-gallery-editor full">
          <div class="case-gallery-heading"><div><strong>الصور الإضافية داخل التفاصيل</strong><small>يمكن إضافة حتى 20 صورة. لا تظهر الخانات الفارغة للزائر.</small></div><button class="dashboard-button primary-soft" type="button" data-add-case-gallery data-index="${index}" ${item.additionalImages.length >= 20 ? 'disabled' : ''}>إضافة صورة</button></div>
          <div class="case-gallery-slots">
            ${item.additionalImages.map((path, imageIndex) => `<div data-gallery-slot="${imageIndex}">${imageEditor('cases', index, item, 'additionalImages', `صورة إضافية ${imageIndex + 1}`, path, 'اختر صورة لهذه الخانة.', imageIndex)}<button class="dashboard-button danger-soft gallery-slot-delete" type="button" data-delete-case-gallery data-index="${index}" data-image-index="${imageIndex}">حذف الخانة</button></div>`).join('')}
          </div>
        </div>` : ''}
        <label class="dashboard-field"><span>حالة النشر</span><select data-collection="cases" data-index="${index}" data-key="status"><option value="draft" ${item.status === 'draft' ? 'selected' : ''}>مسودة</option><option value="published" ${item.status === 'published' ? 'selected' : ''}>منشورة</option></select></label>
        <div class="check-row">
          <label><input type="checkbox" data-collection="cases" data-index="${index}" data-key="featured" ${item.featured ? 'checked' : ''} /> مميزة ضمن أول ثلاث حالات</label>
          <label><input type="checkbox" data-collection="cases" data-index="${index}" data-key="visible" ${item.visible ? 'checked' : ''} /> مسموح بعرضها عند النشر</label>
          <label><input type="checkbox" data-collection="cases" data-index="${index}" data-key="placeholder" ${item.placeholder ? 'checked' : ''} /> حالة تجريبية</label>
        </div>
      </div>
    </div>
  </article>`;
}

function renderCases() {
  if (!state) return;
  const query = filters.cases.trim().toLocaleLowerCase('ar');
  const matches = state.cases
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !query || `${item.title} ${item.procedure} ${item.slug}`.toLocaleLowerCase('ar').includes(query));
  $('[data-cases-count]')!.textContent = `عرض ${matches.length} من أصل ${state.cases.length} حالة.`;
  $('[data-panel="cases"]')!.innerHTML = matches.length
    ? matches.map(({ item, index }) => caseCard(item, index)).join('')
    : '<p class="empty-collection">لا توجد حالات تطابق البحث.</p>';
}

function achievementCard(item: Achievement, index: number) {
  return `<article class="collection-card" data-item-card="achievements" data-index="${index}">
    <header>
      <div><span>إنجاز ${index + 1} · ${item.visible ? 'ظاهر' : 'مخفي'}</span><h3 data-card-title>${esc(item.title)}</h3><code data-card-identifier>${esc(item.id)}</code></div>
      ${actionButtons('achievements', index, state!.achievements.length, item)}
    </header>
    <div class="collection-body" ${collapsedItems.has(item) ? 'hidden' : ''}>
      <div class="dashboard-form-grid compact">
        ${collectionInput('achievements', index, 'title', 'اسم الإنجاز أو الشهادة', item.title, { required: true })}
        <div class="slug-field full">
          ${collectionInput('achievements', index, 'id', 'المعرّف الداخلي', item.id, { required: true })}
          <button class="mini-button" type="button" data-generate-slug="achievements" data-index="${index}">إعادة توليده من العنوان</button>
          <div data-slug-notice>${slugNotice('achievements', item.id, item)}</div>
        </div>
        <div class="full inline-fields-toolbar"><strong>حقول هذا الإنجاز فقط</strong>${addFieldButton('achievements', index)}</div>
        ${item.fields.map((definition, fieldIndex, fields) => {
          const value = definition.builtin
            ? String((item as unknown as Record<string, unknown>)[definition.id] || '')
            : String(item.customFields?.[definition.id] || '');
          return managedCollectionField('achievements', index, definition, fieldIndex, fields.length, value);
        }).join('')}
        <div class="full">${imageEditor('achievements', index, item, 'image', 'صورة الإنجاز أو الشهادة', item.image)}</div>
        ${collectionInput('achievements', index, 'image', 'مسار الصورة', item.image, { full: true, required: true, imagePath: true })}
        <div class="check-row">
          <label><input type="checkbox" data-collection="achievements" data-index="${index}" data-key="visible" ${item.visible ? 'checked' : ''} /> ظاهر</label>
          <label><input type="checkbox" data-collection="achievements" data-index="${index}" data-key="placeholder" ${item.placeholder ? 'checked' : ''} /> بيانات تجريبية</label>
        </div>
      </div>
    </div>
  </article>`;
}

function renderAchievements() {
  if (!state) return;
  const query = filters.achievements.trim().toLocaleLowerCase('ar');
  const matches = state.achievements
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !query || `${item.title} ${item.year} ${item.id}`.toLocaleLowerCase('ar').includes(query));
  $('[data-achievements-count]')!.textContent = `عرض ${matches.length} من أصل ${state.achievements.length} إنجاز.`;
  $('[data-panel="achievements"]')!.innerHTML = matches.length
    ? matches.map(({ item, index }) => achievementCard(item, index)).join('')
    : '<p class="empty-collection">لا توجد إنجازات تطابق البحث.</p>';
}

function renderContact() {
  if (!state) return;
  $('[data-panel="contact"]')!.innerHTML = [
    field('البريد الإلكتروني', 'site.email', state.site.email, { type: 'email', required: true }),
    field('رقم الهاتف الظاهر', 'site.phoneDisplay', state.site.phoneDisplay, { required: true }),
    field('الهاتف القابل للنقر بصيغة دولية', 'site.phoneLink', state.site.phoneLink, { required: true }),
    field('رقم واتساب الدولي من دون +', 'site.whatsapp', state.site.whatsapp, { required: true }),
    field('رابط إنستغرام', 'site.instagram', state.site.instagram, { full: true }),
    field('رابط فيسبوك', 'site.facebook', state.site.facebook, { full: true }),
    field('نبذة التذييل', 'home.footer.biography', state.home.footer.biography, { textarea: true, full: true, required: true })
  ].join('');
}

function renderPolicy(key: 'privacy' | 'disclaimer') {
  if (!state) return;
  const policy = state[key];
  const target = $(`[data-panel="${key}"]`)!;
  target.innerHTML = `
    <div class="dashboard-form-grid">
      ${field('عنوان السياسة', `${key}.title`, policy.title, { required: true })}
      ${field('تاريخ التحديث', `${key}.updated`, policy.updated, { required: true })}
      ${field('الوصف', `${key}.description`, policy.description, { textarea: true, full: true, required: true })}
      ${field('تنبيه أعلى السياسة', `${key}.alert`, policy.alert || '', { textarea: true, full: true })}
    </div>
    <div class="policy-toolbar"><strong>فقرات السياسة</strong><button class="dashboard-button primary-soft" type="button" data-add-policy-section="${key}">إضافة فقرة</button></div>
    <div class="privacy-sections">
      ${policy.sections.map((section, index) => `
        <div class="privacy-section">
          <div class="policy-section-header">
            <strong>فقرة ${index + 1}</strong>
            <div class="collection-actions">
              <button type="button" data-move-policy-section="up" data-policy="${key}" data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="نقل الفقرة إلى أعلى">↑</button>
              <button type="button" data-move-policy-section="down" data-policy="${key}" data-index="${index}" ${index === policy.sections.length - 1 ? 'disabled' : ''} aria-label="نقل الفقرة إلى أسفل">↓</button>
              <button class="danger" type="button" data-delete-policy-section="${key}" data-index="${index}" aria-label="حذف الفقرة">×</button>
            </div>
          </div>
          ${field('العنوان', `${key}.sections.${index}.heading`, section.heading, { required: true })}
          ${field('النص', `${key}.sections.${index}.body`, section.body, { textarea: true, full: true, required: true })}
        </div>`).join('')}
    </div>`;
}

const hexLuminance = (hex: string) => {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
};
const contrastRatio = (foreground: string, background: string) => {
  const values = [hexLuminance(foreground), hexLuminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
};
const themeField = (key: keyof ThemeSettings, label: string, value: string) => `
  <label class="theme-color-field">
    <span>${esc(label)}</span>
    <span class="theme-color-control">
      <input type="color" value="${esc(value)}" data-theme-key="${esc(key)}" aria-label="${esc(label)} — منتقي اللون" />
      <input type="text" value="${esc(value)}" data-theme-key="${esc(key)}" pattern="^#[0-9A-Fa-f]{6}$" aria-label="${esc(label)} — القيمة السداسية" />
    </span>
  </label>`;

function renderTheme() {
  if (!state) return;
  const target = $('[data-panel="theme"]');
  if (!target) return;
  const theme = state.theme;
  const bodyContrast = contrastRatio(theme.text, theme.background);
  const buttonContrast = contrastRatio(theme.buttonText, theme.primary);
  target.innerHTML = `
    <div class="theme-presets" role="group" aria-label="لوحات ألوان جاهزة">
      ${(['lavender', 'rose', 'ocean', 'forest'] as const).map((preset) => `<button type="button" data-theme-preset="${preset}" class="${theme.preset === preset ? 'active' : ''}"><span style="--swatch-a:${themePresets[preset].primary};--swatch-b:${themePresets[preset].secondary};--swatch-c:${themePresets[preset].background}"></span>${preset === 'lavender' ? 'لافندر الأصلية' : preset === 'rose' ? 'وردي هادئ' : preset === 'ocean' ? 'أزرق طبي' : 'أخضر طبيعي'}</button>`).join('')}
      <button type="button" data-reset-theme>استعادة الهوية الأصلية</button>
    </div>
    <div class="theme-editor-layout">
      <div class="theme-color-groups">
        <fieldset><legend>ألوان العلامة</legend><div class="theme-fields">
          ${themeField('primary', 'الأساسي', theme.primary)}
          ${themeField('primaryStrong', 'الأساسي الداكن', theme.primaryStrong)}
          ${themeField('primarySoft', 'الأساسي الفاتح', theme.primarySoft)}
          ${themeField('secondary', 'الثانوي', theme.secondary)}
          ${themeField('secondarySoft', 'خلفية الثانوي', theme.secondarySoft)}
          ${themeField('accent', 'الإبراز', theme.accent)}
        </div></fieldset>
        <fieldset><legend>الخلفيات والنصوص</legend><div class="theme-fields">
          ${themeField('background', 'خلفية الموقع', theme.background)}
          ${themeField('surface', 'البطاقات', theme.surface)}
          ${themeField('surfaceAlt', 'الخلفية البديلة', theme.surfaceAlt)}
          ${themeField('text', 'النص الأساسي', theme.text)}
          ${themeField('muted', 'النص الثانوي', theme.muted)}
          ${themeField('border', 'الحدود', theme.border)}
        </div></fieldset>
        <fieldset><legend>الأزرار والحالات</legend><div class="theme-fields">
          ${themeField('buttonText', 'نص الزر', theme.buttonText)}
          ${themeField('focus', 'حد التركيز', theme.focus)}
          ${themeField('success', 'النجاح', theme.success)}
          ${themeField('warning', 'التحذير', theme.warning)}
          ${themeField('error', 'الخطأ', theme.error)}
          ${themeField('info', 'المعلومات', theme.info)}
        </div></fieldset>
      </div>
      <aside class="theme-live-preview" style="--demo-primary:${theme.primary};--demo-primary-strong:${theme.primaryStrong};--demo-secondary:${theme.secondarySoft};--demo-bg:${theme.background};--demo-surface:${theme.surface};--demo-text:${theme.text};--demo-muted:${theme.muted};--demo-border:${theme.border};--demo-button-text:${theme.buttonText}">
        <span class="theme-preview-kicker">معاينة الهوية</span><h3>عنوان تجريبي للموقع</h3><p>فقرة قصيرة لمراجعة النص والخلفية والحدود قبل اعتماد الألوان.</p><button type="button">زر رئيسي</button><div class="theme-preview-card">بطاقة ومحتوى ثانوي</div>
        <dl class="contrast-results">
          <div class="${bodyContrast >= 4.5 ? 'pass' : 'fail'}"><dt>تباين النص</dt><dd>${bodyContrast.toFixed(2)}:1 ${bodyContrast >= 4.5 ? 'مناسب' : 'يحتاج تحسيناً'}</dd></div>
          <div class="${buttonContrast >= 4.5 ? 'pass' : 'fail'}"><dt>تباين الزر</dt><dd>${buttonContrast.toFixed(2)}:1 ${buttonContrast >= 4.5 ? 'مناسب' : 'يحتاج تحسيناً'}</dd></div>
        </dl>
      </aside>
    </div>`;
}

const pageInput = (label: string, key: string, value: unknown, options: { textarea?: boolean; type?: string; full?: boolean; hint?: string } = {}) => `
  <label class="dashboard-field${options.full ? ' full' : ''}">
    <span>${esc(label)}</span>
    ${options.textarea
      ? `<textarea rows="3" data-page-key="${esc(key)}">${esc(value)}</textarea>`
      : `<input type="${options.type || 'text'}" value="${esc(value)}" data-page-key="${esc(key)}" />`}
    ${options.hint ? `<small>${esc(options.hint)}</small>` : ''}
  </label>`;
const sectionInput = (
  label: string,
  index: number,
  key: string,
  value: unknown,
  options: { textarea?: boolean; type?: string; full?: boolean; image?: boolean; min?: number; max?: number; hint?: string } = {}
) => `
  <label class="dashboard-field${options.full ? ' full' : ''}">
    <span>${esc(label)}</span>
    ${options.textarea
      ? `<textarea rows="3" data-section-index="${index}" data-section-key="${esc(key)}">${esc(value)}</textarea>`
      : `<input type="${options.type || 'text'}" value="${esc(value)}" data-section-index="${index}" data-section-key="${esc(key)}"${options.image ? ' data-page-image-path' : ''}${options.min !== undefined ? ` min="${options.min}"` : ''}${options.max !== undefined ? ` max="${options.max}"` : ''} />`}
    ${options.hint ? `<small>${esc(options.hint)}</small>` : ''}
  </label>`;
const optionList = (values: Array<[string, string]>, current: string) => values.map(([value, label]) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`).join('');

const managedSectionField = (
  section: PageSection,
  sectionIndex: number,
  definition: DisplayFieldDefinition,
  fieldIndex: number
) => {
  const token = fieldToken('page-section', fieldIndex, -1, sectionIndex);
  const key = definition.builtin ? `content.${definition.id}` : `customFields.${definition.id}`;
  const value = definition.builtin
    ? String((section.content as unknown as Record<string, unknown>)[definition.id] || '')
    : String(section.customFields?.[definition.id] || '');
  return `<div class="dashboard-field managed-field-row full" data-field-row="${esc(token)}" data-field-id="${esc(definition.id)}">
    ${managedFieldHeading(definition, token, fieldIndex, section.fields.length)}
    ${definition.type === 'textarea'
      ? `<textarea rows="3" data-section-index="${sectionIndex}" data-section-key="${esc(key)}"${definition.required ? ' required' : ''}>${esc(value)}</textarea>`
      : `<input type="text" value="${esc(value)}" data-section-index="${sectionIndex}" data-section-key="${esc(key)}"${definition.id === 'image' ? ' data-page-image-path' : ''}${definition.required ? ' required' : ''} />`}
  </div>`;
};

const managedPageItemField = (
  sectionIndex: number,
  item: PageSectionItem,
  itemIndex: number,
  definition: DisplayFieldDefinition,
  fieldIndex: number
) => {
  const token = fieldToken('page-item', fieldIndex, -1, sectionIndex, itemIndex);
  const key = definition.builtin
    ? `items.${itemIndex}.${definition.id}`
    : `items.${itemIndex}.customFields.${definition.id}`;
  const value = definition.builtin
    ? String((item as unknown as Record<string, unknown>)[definition.id] || '')
    : String(item.customFields?.[definition.id] || '');
  return `<div class="dashboard-field managed-field-row full" data-field-row="${esc(token)}" data-field-id="${esc(definition.id)}">
    ${managedFieldHeading(definition, token, fieldIndex, item.fields.length)}
    ${definition.type === 'textarea'
      ? `<textarea rows="3" data-section-index="${sectionIndex}" data-section-key="${esc(key)}"${definition.required ? ' required' : ''}>${esc(value)}</textarea>`
      : `<input type="text" value="${esc(value)}" data-section-index="${sectionIndex}" data-section-key="${esc(key)}"${definition.id === 'image' ? ' data-page-image-path' : ''}${definition.required ? ' required' : ''} />`}
  </div>`;
};

const renderPageItemEditor = (section: PageSection, sectionIndex: number, item: PageSectionItem, itemIndex: number) => {
  const imageTarget: ImageTarget = { collection: 'pages', item, key: 'image' };
  const image = effectiveImage(imageTarget, item.image);
  return `<div class="page-item-editor">
    <div class="page-item-header"><strong>عنصر ${itemIndex + 1}</strong><div class="collection-actions">
      <button type="button" data-move-page-item="up" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" ${itemIndex === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" data-move-page-item="down" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" ${itemIndex === section.content.items.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="danger" type="button" data-delete-page-item data-section-index="${sectionIndex}" data-item-index="${itemIndex}">×</button>
    </div></div>
    <div class="inline-fields-toolbar"><strong>حقول هذا العنصر فقط</strong>${addFieldButton('page-item', -1, sectionIndex, itemIndex)}</div>
    <div class="dashboard-form-grid">
      ${item.fields.map((definition, fieldIndex) =>
        managedPageItemField(sectionIndex, item, itemIndex, definition, fieldIndex)
      ).join('')}
    </div>
    <div class="page-image-row">${image ? `<img src="${esc(image)}" alt="" />` : '<span>لا توجد صورة</span>'}<button class="dashboard-button secondary" type="button" data-upload-page-item data-section-index="${sectionIndex}" data-item-index="${itemIndex}">اختيار صورة</button></div>
  </div>`;
};

const renderPageSectionEditor = (page: ManagedPage, section: PageSection, index: number) => {
  const collapsed = collapsedItems.has(section);
  const managedProfileDetails = section.type === 'about-profile' && section.content.source === 'about';
  const sectionImageTarget: ImageTarget = { collection: 'pages', item: section, key: 'image' };
  const sectionImage = effectiveImage(sectionImageTarget, section.content.image);
  return `<article class="page-section-editor${collapsed ? ' collapsed' : ''}" data-page-section-card>
    <header>
      <div><span class="section-type-pill">${esc(pageSectionLabels[section.type])}</span><strong data-section-name>${esc(section.name)}</strong><code>${esc(section.id)}</code></div>
      <div class="collection-actions">
        <button type="button" data-move-page-section="up" data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="نقل القسم إلى أعلى">↑</button>
        <button type="button" data-move-page-section="down" data-index="${index}" ${index === page.sections.length - 1 ? 'disabled' : ''} aria-label="نقل القسم إلى أسفل">↓</button>
        <button type="button" data-duplicate-page-section data-index="${index}" aria-label="تكرار القسم">⧉</button>
        <button type="button" data-toggle-page-section data-index="${index}" aria-expanded="${String(!collapsed)}">${collapsed ? '＋' : '−'}</button>
        <button class="danger" type="button" data-delete-page-section data-index="${index}" aria-label="حذف القسم">×</button>
      </div>
    </header>
    ${collapsed ? '' : `<div class="page-section-body">
      <div class="dashboard-form-grid">
        ${sectionInput('اسم القسم داخل اللوحة', index, 'name', section.name)}
        <label class="dashboard-field"><span>نوع القسم</span><select data-section-index="${index}" data-section-key="type">${optionList(pageSectionTypes.map((type) => [type, pageSectionLabels[type]]), section.type)}</select></label>
        <div class="full inline-fields-toolbar"><strong>حقول هذا القسم فقط</strong>${addFieldButton('page-section', -1, index)}</div>
        ${section.fields.map((definition, fieldIndex) =>
          managedSectionField(section, index, definition, fieldIndex)
        ).join('')}
        ${managedProfileDetails ? '<p class="field-guidance full">بطاقة رجب تستخدم زر «إظهار المزيد» داخل البطاقة ولا تنقل إلى صفحة أخرى. عدّل نص الزر والنبذة الموسعة من قسم «بيانات رجب العبود».</p>' : ''}
      </div>
      <div class="page-image-row">${sectionImage ? `<img src="${esc(sectionImage)}" alt="" />` : '<span>لا توجد صورة رئيسية</span>'}<button class="dashboard-button secondary" type="button" data-upload-page-section data-index="${index}">اختيار صورة</button><button class="dashboard-button danger-soft" type="button" data-remove-page-section-image data-index="${index}">إزالة</button></div>
      <fieldset class="section-style-editor"><legend>تصميم القسم</legend><div class="dashboard-form-grid">
        <label class="dashboard-field"><span>الخلفية</span><select data-section-index="${index}" data-section-style="background">${optionList([['default','خلفية الموقع'],['surface','خلفية بديلة'],['primary','لون أساسي'],['dark','داكنة'],['custom','لون مخصص']], section.style.background)}</select></label>
        <label class="dashboard-field"><span>عرض المحتوى</span><select data-section-index="${index}" data-section-style="width">${optionList([['wide','واسع'],['normal','متوسط'],['narrow','ضيق']], section.style.width)}</select></label>
        <label class="dashboard-field"><span>المسافات</span><select data-section-index="${index}" data-section-style="spacing">${optionList([['small','صغيرة'],['normal','متوسطة'],['large','كبيرة']], section.style.spacing)}</select></label>
        <label class="dashboard-field"><span>المحاذاة</span><select data-section-index="${index}" data-section-style="alignment">${optionList([['start','بداية السطر'],['center','وسط']], section.style.alignment)}</select></label>
        <label class="dashboard-field"><span>موضع الصورة</span><select data-section-index="${index}" data-section-style="imagePosition">${optionList([['start','البداية'],['end','النهاية']], section.style.imagePosition)}</select></label>
        <label class="dashboard-field"><span>عدد الأعمدة</span><select data-section-index="${index}" data-section-style="columns">${optionList([['2','عمودان'],['3','3 أعمدة'],['4','4 أعمدة']], String(section.style.columns))}</select></label>
        ${sectionInput('لون الخلفية المخصص', index, 'style.backgroundColor', section.style.backgroundColor, { type: 'color' })}
        ${sectionInput('لون النص الخاص', index, 'style.textColor', section.style.textColor || '#241b2b', { type: 'color' })}
        ${sectionInput('لون الإبراز الخاص', index, 'style.accentColor', section.style.accentColor || '#5a2f73', { type: 'color' })}
        ${sectionInput('لون الزر الخاص', index, 'style.buttonColor', section.style.buttonColor || '#5a2f73', { type: 'color' })}
      </div></fieldset>
      ${['services-grid','cases-gallery'].includes(section.type) ? `<div class="dashboard-form-grid"><label class="dashboard-field"><span>مصدر العناصر</span><select data-section-index="${index}" data-section-key="content.source">${optionList([['manual','إدخال يدوي'],[section.type === 'services-grid' ? 'services' : 'cases', section.type === 'services-grid' ? 'الخدمات المحفوظة' : 'الحالات المحفوظة']], section.content.source)}</select></label></div>` : ''}
      ${itemSectionTypes.has(section.type) ? `<div class="dashboard-form-grid display-count-control">${sectionInput('عدد العناصر المعروضة', index, 'content.limit', section.content.limit, { type: 'number', min: 0, max: 100, hint: 'القيمة الافتراضية 6. أدخل 9 أو 10 أو أي عدد حتى 100، واستخدم 0 لعرض جميع العناصر الحالية والمضافة مستقبلاً.' })}</div>` : ''}
      ${itemSectionTypes.has(section.type) && section.content.source === 'manual' ? `<div class="page-items-toolbar"><strong>عناصر القسم</strong><button class="dashboard-button primary-soft" type="button" data-add-page-item data-index="${index}">إضافة عنصر</button></div><div class="page-items-list">${section.content.items.map((item, itemIndex) => renderPageItemEditor(section, index, item, itemIndex)).join('')}</div>` : ''}
      <div class="copy-section-row"><label>نسخ القسم إلى صفحة <select data-copy-target="${index}">${state?.pages.filter((candidate) => candidate.id !== page.id).map((candidate) => `<option value="${candidate.id}">${esc(candidate.title)}</option>`).join('') || '<option value="">لا توجد صفحة أخرى</option>'}</select></label><button class="dashboard-button secondary" type="button" data-copy-page-section="${index}">نسخ</button></div>
    </div>`}
  </article>`;
};

function renderPagePreview() {
  if (!state) return;
  const dashboardState = state;
  const page = currentPage();
  const target = $('[data-page-preview]') as HTMLElement | null;
  if (!page || !target) return;
  const theme = state.theme;
  target.setAttribute('style', `--p-primary:${theme.primary};--p-primary-strong:${theme.primaryStrong};--p-secondary:${theme.secondarySoft};--p-bg:${theme.background};--p-surface:${theme.surface};--p-text:${theme.text};--p-muted:${theme.muted};--p-border:${theme.border};--p-button-text:${theme.buttonText}`);
  target.innerHTML = page.sections.filter((section) => section.visible).map((section) => {
    const sectionImage = effectiveImage({ collection: 'pages', item: section, key: 'image' }, section.content.image);
    const background = section.style.background === 'primary' ? `linear-gradient(135deg,${theme.primaryStrong},${theme.primary})`
      : section.style.background === 'dark' ? theme.primaryStrong
        : section.style.background === 'surface' ? theme.surfaceAlt
          : section.style.background === 'custom' && section.style.backgroundColor ? section.style.backgroundColor : theme.background;
    const sectionText = section.style.textColor || (['primary', 'dark'].includes(section.style.background) ? theme.buttonText : theme.text);
    const previewLimit = section.content.limit === 0 ? 4 : Math.min(Math.max(1, section.content.limit || 6), 4);
    const itemMarkup = section.content.source === 'services'
      ? dashboardState.services.slice(0, previewLimit).map((item) => {
          const image = item.mediaType === 'image' ? effectiveImage({ collection: 'services', item, key: 'image' }, item.image) : '';
          return `<div class="preview-block-card">${image ? `<img src="${esc(image)}" alt="" />` : ''}<strong>${esc(item.name)}</strong><span>${esc(item.summary)}</span></div>`;
        }).join('')
      : section.content.source === 'cases'
        ? dashboardState.cases.slice(0, previewLimit).map((item) => {
            const key = item.displayType === 'single-result' ? 'resultImage' : 'afterImage';
            const fallback = item.displayType === 'single-result' ? item.resultImage || item.afterImage : item.afterImage;
            const image = effectiveImage({ collection: 'cases', item, key }, fallback);
            return `<div class="preview-block-card">${image ? `<img src="${esc(image)}" alt="" />` : ''}<strong>${esc(item.title)}</strong><span>${esc(item.procedure)}</span></div>`;
          }).join('')
        : section.content.items.slice(0, previewLimit).map((item) => `<div class="preview-block-card">${effectiveImage({ collection: 'pages', item, key: 'image' }, item.image) ? `<img src="${esc(effectiveImage({ collection: 'pages', item, key: 'image' }, item.image))}" alt="" />` : ''}<strong>${esc(item.value || item.title)}</strong><span>${esc(item.label || item.text)}</span></div>`).join('');
    const isGrid = itemSectionTypes.has(section.type);
    return `<section class="preview-page-section" style="background:${background};color:${sectionText};text-align:${section.style.alignment === 'center' ? 'center' : 'start'}">
      <small>${esc(section.content.eyebrow)}</small><h3>${esc(section.content.title)}</h3><p>${esc(section.content.description)}</p>
      ${sectionImage ? `<img class="preview-section-image" src="${esc(sectionImage)}" alt="" />` : ''}
      ${isGrid ? `<div class="preview-page-grid">${itemMarkup}</div>` : ''}
      ${section.type === 'consultation-form' ? '<div class="preview-form-placeholder"><span></span><span></span><button>نموذج الاستشارة</button></div>' : ''}
      ${section.content.buttonLabel ? `<b class="preview-page-button">${esc(section.content.buttonLabel)}</b>` : ''}
    </section>`;
  }).join('') || '<p class="empty-preview">لا توجد أقسام ظاهرة في هذه الصفحة.</p>';
  target.classList.toggle('mobile', previewSize === 'mobile');
}

function renderPages() {
  if (!state) return;
  if (!selectedPageId || !state.pages.some((page) => page.id === selectedPageId)) selectedPageId = state.pages[0]?.id || '';
  const page = currentPage();
  const list = $('[data-page-list]');
  const editor = $('[data-page-editor]');
  if (!list || !editor) return;
  const query = pageFilter.trim().toLowerCase();
  const shownPages = state.pages.filter((item) => `${item.title} ${item.slug}`.toLowerCase().includes(query));
  list.innerHTML = shownPages.map((item) => `<button type="button" data-select-page="${item.id}" class="${item.id === page?.id ? 'active' : ''}"><span><strong>${esc(item.title)}</strong><code>${item.isHomepage ? '/' : `/${esc(item.slug)}/`}</code></span><em class="${item.status}">${item.status === 'published' ? 'منشورة' : 'مسودة'}</em></button>`).join('') || '<p>لا توجد نتائج.</p>';
  if (!page) {
    editor.innerHTML = '<div class="empty-page-state"><h3>أنشئ صفحتك الأولى</h3><p>ابدأ بصفحة فارغة أو استخدم أحد القوالب الجاهزة.</p></div>';
    return;
  }
  editor.innerHTML = `
    <div class="page-editor-header"><div><span>${page.pageKind === 'landing' ? 'صفحة هبوط' : 'صفحة عادية'}</span><h3>${esc(page.title)}</h3><code>${page.isHomepage ? '/' : `/${esc(page.slug)}/`}</code></div><div>
      ${!page.isHomepage ? '<button class="dashboard-button secondary" type="button" data-set-homepage>تعيين كرئيسية</button>' : '<span class="homepage-badge">الصفحة الرئيسية</span>'}
      <button class="dashboard-button secondary" type="button" data-duplicate-page>تكرار الصفحة</button>
      <button class="dashboard-button danger-soft" type="button" data-delete-page ${page.isHomepage ? 'disabled' : ''}>حذف</button>
    </div></div>
    <fieldset class="dashboard-field-group"><legend>إعدادات الصفحة</legend><div class="dashboard-form-grid">
      ${pageInput('اسم الصفحة', 'title', page.title)}
      ${pageInput('الرابط المختصر', 'slug', page.slug, { hint: page.isHomepage ? 'الرئيسية تستخدم / دائماً.' : 'حروف إنجليزية صغيرة وأرقام وشرطات، ويمكن استخدام / للمسارات المتداخلة.' })}
      <label class="dashboard-field"><span>الحالة</span><select data-page-key="status">${optionList([['draft','مسودة'],['published','منشورة']], page.status)}</select></label>
      <label class="dashboard-field"><span>نوع الصفحة</span><select data-page-key="pageKind">${optionList([['standard','صفحة عادية'],['landing','صفحة هبوط']], page.pageKind)}</select></label>
      <label class="dashboard-field"><span>الهيدر</span><select data-page-key="headerMode">${optionList([['full','كامل'],['minimal','مبسّط'],['hidden','مخفي']], page.headerMode)}</select></label>
      <label class="dashboard-field"><span>الفوتر</span><select data-page-key="footerMode">${optionList([['full','كامل'],['minimal','مبسّط'],['hidden','مخفي']], page.footerMode)}</select></label>
      <p class="field-guidance full">لإضافة هذه الصفحة إلى الهيدر، استخدم قسم «الهيدر وقائمة التنقل» وحدد عنوان الرابط ومساره.</p>
    </div></fieldset>
    <details class="page-seo-settings"><summary>إعدادات SEO والمشاركة</summary><div class="dashboard-form-grid">
      ${pageInput('عنوان SEO', 'seo.title', page.seo.title)}
      ${pageInput('وصف SEO', 'seo.description', page.seo.description, { textarea: true, full: true })}
      ${pageInput('صورة المشاركة', 'seo.image', page.seo.image, { full: true })}
      <label class="dashboard-checkbox"><input type="checkbox" data-page-key="seo.noindex"${page.seo.noindex ? ' checked' : ''} /><span>منع الأرشفة مؤقتاً</span></label>
    </div></details>
    <div class="page-sections-toolbar"><div><strong>أقسام الصفحة</strong><span>${page.sections.length} قسم</span></div><div><select data-section-library>${optionList(pageSectionTypes.map((type) => [type, pageSectionLabels[type]]), 'hero')}</select><button class="dashboard-button primary-soft" type="button" data-add-page-section>إضافة القسم</button></div></div>
    <div class="page-sections-list">${page.sections.map((section, index) => renderPageSectionEditor(page, section, index)).join('')}</div>`;
  updateHistoryButtons();
  renderPagePreview();
}

function renderAll() {
  renderTheme();
  renderPages();
  renderNavigation();
  renderProfile();
  renderServices();
  renderConsultationFields();
  renderCases();
  renderAchievements();
  renderContact();
  renderPolicy('privacy');
  renderPolicy('disclaimer');
}

const hasPendingFor = (target: ImageTarget) => Boolean(getPending(target));
const effectiveValidationPath = (target: ImageTarget, current: string) =>
  hasPendingFor(target) ? '/images/uploads/pending-image.jpg' : current;
const validImagePath = (value: string, optional = false) =>
  (optional && !value) || (value.startsWith('/images/') && !value.includes('..') && !value.includes('\\'));

const validateDisplayFields = (
  fields: DisplayFieldDefinition[],
  customFields: Record<string, string>,
  label: string,
  builtinValues: Record<string, unknown>
) => {
  const ids = fields.map((field) => field.id);
  if (
    ids.some((id) => !fieldIdPattern.test(id))
    || new Set(ids.map((id) => id.toLowerCase())).size !== ids.length
  ) throw new Error(`توجد معرّفات حقول غير صالحة أو مكررة في ${label}.`);
  if (fields.some((field) => !field.label.trim())) throw new Error(`يوجد عنوان حقل فارغ في ${label}.`);
  fields.forEach((field) => {
    const value = field.builtin ? builtinValues[field.id] : customFields[field.id];
    if (field.required && !String(value ?? '').trim()) throw new Error(`حقل «${field.label}» مطلوب في ${label}.`);
  });
};

function validateState() {
  if (!state) throw new Error('المحتوى غير محمّل.');
  const requiredValues: Array<[unknown, string]> = [
    [state.site.name, 'الاسم'],
    [state.site.title, 'الصفة المهنية'],
    [state.site.email, 'البريد الإلكتروني'],
    [state.site.phoneDisplay, 'الهاتف الظاهر'],
    [state.site.phoneLink, 'الهاتف القابل للنقر'],
    [state.site.whatsapp, 'واتساب'],
    [state.about.biography, 'النبذة المختصرة'],
    [state.about.expandedBiography, 'النبذة الموسعة'],
    [state.about.qualification, 'المؤهل'],
    [state.about.university, 'الجامعة'],
    [state.about.graduationYear, 'سنة التخرج'],
    [state.about.graduationProject, 'مشروع التخرج'],
    [state.home.banner.title, 'عنوان الواجهة'],
    [state.home.quickStart.title, 'عنوان ابدأ من هنا'],
    [state.home.consultation.title, 'عنوان الاستشارة'],
    [state.home.services.title, 'عنوان الخدمات'],
    [state.home.cases.title, 'عنوان معرض الأعمال'],
    [state.home.footer.biography, 'نبذة التذييل']
  ];
  const missing = requiredValues.find(([value]) => !String(value ?? '').trim());
  if (missing) throw new Error(`حقل «${missing[1]}» مطلوب.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.site.email)) throw new Error('صيغة البريد الإلكتروني غير صالحة.');
  for (const [label, url] of [['إنستغرام', state.site.instagram], ['فيسبوك', state.site.facebook]] as const) {
    if (url) {
      try {
        if (new URL(url).protocol !== 'https:') throw new Error();
      } catch {
        throw new Error(`رابط ${label} غير صالح أو لا يستخدم HTTPS.`);
      }
    }
  }
  const navigationIds = state.site.navigation.map((item) => item.id);
  if (navigationIds.some((id) => !slugPattern.test(id)) || new Set(navigationIds).size !== navigationIds.length) {
    throw new Error('تحتوي روابط الهيدر على معرّف غير صالح أو مكرر.');
  }
  state.site.navigation.forEach((item, index) => {
    if (!item.label.trim()) throw new Error(`عنوان رابط الهيدر ${index + 1} مطلوب.`);
    if (!/^(?:\/(?!\/)|#)[^\s]*$/.test(item.url)) {
      try {
        if (new URL(item.url).protocol !== 'https:') throw new Error();
      } catch {
        throw new Error(`رابط الهيدر «${item.label}» غير صالح.`);
      }
    }
  });
  const portraitTarget: ImageTarget = { collection: 'site', item: state.site, key: 'portrait' };
  if (!validImagePath(effectiveValidationPath(portraitTarget, state.site.portrait))) throw new Error('مسار الصورة الشخصية غير صالح.');
  validateDisplayFields(
    state.about.fields,
    state.about.customFields,
    'بطاقة التعريف',
    state.about as unknown as Record<string, unknown>
  );

  for (const [label, fields] of [
    ['حقول نموذج الاستشارة', state.fieldModel.consultationFields]
  ] as const) {
    const ids = fields.map((item) => item.id);
    const comparableIds = ids.map((id) => id.toLowerCase());
    if (ids.some((id) => !fieldIdPattern.test(id)) || new Set(comparableIds).size !== ids.length) {
      throw new Error(`توجد معرّفات غير صالحة أو مكررة في ${label}.`);
    }
    if (fields.some((item) => !item.label.trim())) throw new Error(`يوجد عنوان حقل فارغ في ${label}.`);
  }
  state.fieldModel.consultationFields.forEach((item) => {
    if (item.type === 'select' && item.options.filter((option) => option.trim()).length === 0) {
      throw new Error(`أضف خياراً واحداً على الأقل للحقل «${item.label}».`);
    }
  });
  for (const lockedId of ['phone', 'privacy']) {
    const locked = state.fieldModel.consultationFields.find((item) => item.id === lockedId);
    if (!locked || !locked.visible || !locked.required) throw new Error('يجب إبقاء الهاتف والموافقة على الخصوصية ظاهرين وإلزاميين.');
  }

  for (const collection of ['services', 'cases', 'achievements'] as const) {
    const ids = state[collection].map((item) => itemIdentifier(collection, item as Service | CaseStudy | Achievement));
    if (ids.some((id) => !slugPattern.test(id))) throw new Error(`يوجد معرّف غير صالح في ${collection === 'services' ? 'الخدمات' : collection === 'cases' ? 'الحالات' : 'الإنجازات'}.`);
    if (new Set(ids).size !== ids.length) throw new Error(`يوجد معرّف مكرر في ${collection === 'services' ? 'الخدمات' : collection === 'cases' ? 'الحالات' : 'الإنجازات'}.`);
  }

  state.services.forEach((item, index) => {
    if (![item.name, item.category].every((value) => String(value).trim())) {
      throw new Error(`أكمل الحقول المطلوبة في الخدمة ${index + 1}.`);
    }
    validateDisplayFields(item.fields, item.customFields, `الخدمة ${index + 1}`, item as unknown as Record<string, unknown>);
    const target: ImageTarget = { collection: 'services', item, key: 'image' };
    if (!validImagePath(effectiveValidationPath(target, item.image), true)) throw new Error(`مسار صورة الخدمة ${index + 1} غير صالح.`);
  });

  state.cases.forEach((item, index) => {
    if (![item.title, item.category].every((value) => String(value).trim())) {
      throw new Error(`أكمل الحقول المطلوبة في الحالة ${index + 1}.`);
    }
    validateDisplayFields(item.fields, item.customFields, `الحالة ${index + 1}`, item as unknown as Record<string, unknown>);
    const single = item.displayType === 'single-result';
    const requiredPaths = single
      ? [effectiveValidationPath({ collection: 'cases', item, key: 'resultImage' }, item.resultImage || item.afterImage)]
      : [
          effectiveValidationPath({ collection: 'cases', item, key: 'beforeImage' }, item.beforeImage),
          effectiveValidationPath({ collection: 'cases', item, key: 'afterImage' }, item.afterImage)
        ];
    const galleryPaths = item.displayType === 'before-after-gallery'
      ? item.additionalImages.map((path, imageIndex) =>
          effectiveValidationPath({ collection: 'cases', item, key: 'additionalImages', arrayIndex: imageIndex }, path)
        )
      : [];
    if (requiredPaths.some((path) => !validImagePath(path))) throw new Error(`أكمل صور الحالة ${index + 1} بمسارات صحيحة داخل /images/.`);
    if (galleryPaths.some((path) => !validImagePath(path, true))) throw new Error(`توجد صورة إضافية بمسار غير صالح في الحالة ${index + 1}.`);
    if (!item.placeholder && [...requiredPaths, ...galleryPaths.filter(Boolean)].some((path) => path.includes('/placeholders/'))) {
      throw new Error(`لا يمكن اعتماد الحالة «${item.title}» كحالة حقيقية وهي تستخدم صوراً نائبة.`);
    }
  });

  state.achievements.forEach((item, index) => {
    const target: ImageTarget = { collection: 'achievements', item, key: 'image' };
    if (!item.title.trim() || !validImagePath(effectiveValidationPath(target, item.image))) {
      throw new Error(`أكمل عنوان وصورة الإنجاز ${index + 1}.`);
    }
    validateDisplayFields(item.fields, item.customFields, `الإنجاز ${index + 1}`, item as unknown as Record<string, unknown>);
  });

  const themeColors = Object.entries(state.theme).filter(([key]) => key !== 'preset') as Array<[string, string]>;
  if (themeColors.some(([, value]) => !/^#[0-9a-fA-F]{6}$/.test(value))) throw new Error('توجد قيمة لون غير صالحة. استخدم الصيغة #RRGGBB.');
  if (contrastRatio(state.theme.text, state.theme.background) < 4.5) throw new Error('تباين النص الأساسي مع خلفية الموقع أقل من الحد المناسب للقراءة (4.5:1).');
  if (contrastRatio(state.theme.buttonText, state.theme.primary) < 4.5) throw new Error('تباين نص الزر مع اللون الأساسي أقل من الحد المناسب للقراءة (4.5:1).');

  if (!state.pages.length) throw new Error('يجب إبقاء صفحة واحدة على الأقل.');
  if (state.pages.filter((page) => page.isHomepage).length !== 1) throw new Error('يجب تحديد صفحة رئيسية واحدة فقط.');
  const homepage = state.pages.find((page) => page.isHomepage);
  if (!homepage || homepage.status !== 'published') throw new Error('يجب أن تبقى الصفحة الرئيسية منشورة.');
  const pageIds = state.pages.map((page) => page.id);
  const pageSlugs = state.pages.map((page) => page.slug);
  if (new Set(pageIds).size !== pageIds.length) throw new Error('يوجد معرّف صفحة مكرر.');
  if (new Set(pageSlugs).size !== pageSlugs.length) throw new Error('يوجد رابط صفحة مكرر.');
  const reservedSlugs = new Set(['achievements', 'policies', 'local-dashboard', 'admin', 'api']);
  state.pages.forEach((page, pageIndex) => {
    if (!page.title.trim()) throw new Error(`عنوان الصفحة ${pageIndex + 1} مطلوب.`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(page.slug)) throw new Error(`رابط الصفحة «${page.title}» غير صالح.`);
    if (!page.isHomepage && reservedSlugs.has(page.slug.split('/')[0])) throw new Error(`رابط الصفحة «${page.slug}» محجوز لصفحة نظام.`);
    if (page.status === 'published' && !page.sections.some((section) => section.visible)) throw new Error(`الصفحة المنشورة «${page.title}» تحتاج إلى قسم ظاهر واحد على الأقل.`);
    if (page.sections.filter((section) => section.visible && section.type === 'consultation-form').length > 1) throw new Error(`الصفحة «${page.title}» لا يمكن أن تحتوي أكثر من نموذج استشارة ظاهر واحد.`);
    const sectionIds = page.sections.map((section) => section.id);
    if (new Set(sectionIds).size !== sectionIds.length) throw new Error(`يوجد معرّف قسم مكرر في الصفحة «${page.title}».`);
    page.sections.forEach((section, sectionIndex) => {
      if (!section.name.trim() || !section.content.title.trim()) throw new Error(`أكمل اسم وعنوان القسم ${sectionIndex + 1} في الصفحة «${page.title}».`);
      validateDisplayFields(section.fields, section.customFields, `القسم «${section.name}»`, section.content as unknown as Record<string, unknown>);
      if (itemSectionTypes.has(section.type) && (!Number.isInteger(section.content.limit) || section.content.limit < 0 || section.content.limit > 100)) {
        throw new Error(`عدد العناصر في القسم «${section.name}» يجب أن يكون بين 0 و100، حيث 0 يعني عرض الكل.`);
      }
      for (const [label, url] of [['الزر الرئيسي', section.content.buttonUrl], ['الزر الثانوي', section.content.secondaryButtonUrl]] as const) {
        if (url && !/^(?:\/(?!\/)|#)[^\s]*$/.test(url)) {
          try { if (new URL(url).protocol !== 'https:') throw new Error(); }
          catch { throw new Error(`رابط ${label} في القسم «${section.name}» غير صالح.`); }
        }
      }
      const image = effectiveValidationPath({ collection: 'pages', item: section, key: 'image' }, section.content.image);
      if (!validImagePath(image, true)) throw new Error(`مسار الصورة في القسم «${section.name}» غير صالح.`);
      section.content.items.forEach((item, itemIndex) => {
        validateDisplayFields(item.fields, item.customFields, `العنصر ${itemIndex + 1} في القسم «${section.name}»`, item as unknown as Record<string, unknown>);
        const itemImage = effectiveValidationPath({ collection: 'pages', item, key: 'image' }, item.image);
        if (!validImagePath(itemImage, true)) throw new Error(`مسار صورة العنصر ${itemIndex + 1} في القسم «${section.name}» غير صالح.`);
      });
    });
  });

  for (const [label, policy] of [['سياسة الخصوصية', state.privacy], ['إخلاء المسؤولية', state.disclaimer]] as Array<[string, Policy]>) {
    if (!policy.title.trim() || !policy.description.trim() || !policy.updated.trim() || !policy.sections.length) {
      throw new Error(`أكمل الحقول الأساسية في ${label}.`);
    }
    if (policy.sections.some((section) => !section.heading.trim() || !section.body.trim())) throw new Error(`توجد فقرة ناقصة في ${label}.`);
  }
}

async function uploadPendingImages() {
  for (const pending of [...pendingImages]) {
    const response = await fetch('/api/local-dashboard/image', {
      method: 'POST',
      headers: {
        'content-type': pending.file.type,
        'x-image-name': encodeURIComponent(pending.file.name)
      },
      body: pending.file
    });
    const result = await response.json() as { ok?: boolean; path?: string; message?: string };
    if (!response.ok || !result.ok || !result.path) throw new Error(result.message || 'تعذر نسخ إحدى الصور.');
    if (pending.collection === 'cases' && pending.key === 'additionalImages' && Number.isInteger(pending.arrayIndex)) {
      pending.item.additionalImages[pending.arrayIndex!] = result.path;
    } else {
      (pending.item as unknown as Record<string, unknown>)[pending.key] = result.path;
    }
    if (pending.collection === 'site' && pending.key === 'portrait') syncLegacyPathToHomepage('site.portrait', result.path);
    clearPending(pending);
  }
}

async function saveFiles(openPreview = false) {
  if (!state) return;
  let previewWindow: Window | null = null;
  try {
    validateState();
    if (openPreview) previewWindow = window.open('about:blank', '_blank');
    setMessage(pendingImages.length ? 'جارٍ نسخ الصور والتحقق من المحتوى…' : 'جارٍ التحقق من المحتوى وحفظه في ملفات المشروع…');
    await uploadPendingImages();
    validateState();
    const response = await fetch('/api/local-dashboard/content', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state)
    });
    const result = await response.json() as { ok?: boolean; content?: DashboardContent; message?: string };
    if (!response.ok || !result.ok || !result.content) throw new Error(result.message || 'تعذر الحفظ.');
    state = normalizeContent(result.content, state);
    baseline = JSON.stringify(state);
    localStorage.removeItem(draftKey);
    localStorage.removeItem(legacyDraftKey);
    $('[data-draft-banner]')?.setAttribute('hidden', '');
    setDirty(false);
    renderAll();
    setMessage('حُفظ المحتوى داخل المشروع، وتم تحديث src/generated/default-content.ts.', 'success');
    if (previewWindow) previewWindow.location.href = '/';
  } catch (error) {
    previewWindow?.close();
    markDirty();
    setMessage(error instanceof Error ? error.message : 'تعذر حفظ المحتوى.', 'error');
  }
}

const normalizePolicy = (raw: Partial<Policy> | undefined, fallback: Policy): Policy => ({
  slug: fallback.slug,
  title: String(raw?.title ?? fallback.title),
  description: String(raw?.description ?? fallback.description),
  updated: String(raw?.updated ?? fallback.updated),
  alert: String(raw?.alert ?? fallback.alert ?? ''),
  sections: Array.isArray(raw?.sections)
    ? raw.sections.map((section) => ({ heading: String(section?.heading ?? ''), body: String(section?.body ?? '') }))
    : clone(fallback.sections)
});

const normalizeNavigation = (raw: unknown, fallback: NavigationItem[] | undefined): NavigationItem[] => {
  const source = Array.isArray(raw) ? raw : Array.isArray(fallback) ? fallback : defaultNavigation;
  return source.map((entry, index) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Partial<NavigationItem>;
    return {
      id: String(item.id || `navigation-${index + 1}`),
      label: String(item.label || `رابط ${index + 1}`),
      url: String(item.url || '/'),
      visible: item.visible !== false,
      primary: item.primary === true
    };
  });
};

const normalizeFieldModel = (raw: Partial<FieldModel> | undefined, fallback: FieldModel): FieldModel => ({
  serviceFields: (Array.isArray(raw?.serviceFields) ? raw!.serviceFields : fallback.serviceFields).map((item, index) => ({
    ...item,
    id: String(item.id || `service-field-${index + 1}`),
    label: String(item.label || `حقل خدمة ${index + 1}`),
    type: item.type === 'text' ? 'text' : 'textarea',
    placement: item.placement === 'card' ? 'card' : 'details',
    required: item.required === true,
    visible: item.visible !== false,
    builtin: item.builtin === true,
    order: (index + 1) * 10
  })),
  consultationFields: (Array.isArray(raw?.consultationFields) ? raw!.consultationFields : fallback.consultationFields).map((item, index) => ({
    ...item,
    id: String(item.id || `consultation-field-${index + 1}`),
    label: String(item.label || `حقل استشارة ${index + 1}`),
    type: ['text', 'textarea', 'tel', 'select', 'checkbox'].includes(item.type) ? item.type : 'text',
    placeholder: String(item.placeholder || ''),
    helpText: String(item.helpText || ''),
    options: Array.isArray(item.options) ? item.options.map(String) : [],
    required: item.id === 'phone' || item.id === 'privacy' || item.required === true,
    visible: item.id === 'phone' || item.id === 'privacy' || item.visible !== false,
    fullWidth: item.type === 'textarea' || item.type === 'checkbox' || item.fullWidth === true,
    builtin: item.builtin === true,
    order: (index + 1) * 10
  })) as ConsultationFieldDefinition[]
});

const normalizeDisplayFields = (
  raw: unknown,
  fallback: DisplayFieldDefinition[]
): DisplayFieldDefinition[] => {
  const source = Array.isArray(raw) && raw.length ? raw : fallback;
  return source.map((entry, index) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Partial<DisplayFieldDefinition>;
    return {
      id: String(item.id || `custom-field-${index + 1}`),
      label: String(item.label || `حقل ${index + 1}`),
      type: item.type === 'text' ? 'text' : 'textarea',
      placement: item.placement === 'card' ? 'card' : 'details',
      required: item.required === true,
      visible: item.visible !== false,
      builtin: item.builtin === true,
      order: (index + 1) * 10
    };
  });
};

const normalizeCustomFields = (raw: unknown, fields: DisplayFieldDefinition[]) => {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return Object.fromEntries(fields.filter((field) => !field.builtin).map((field) => [field.id, String(source[field.id] ?? '')]));
};

function normalizeContent(raw: unknown, fallback: DashboardContent): DashboardContent {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<DashboardContent>;
  const inputHome = input.home;
  const inputSite = input.site;
  const normalizedFieldModel = normalizeFieldModel(input.fieldModel, fallback.fieldModel);
  const aboutSource = { ...fallback.about, ...(input.about || {}) };
  const aboutFields = normalizeDisplayFields(aboutSource.fields, fallback.about.fields || []);
  return {
    site: {
      ...fallback.site,
      ...(inputSite || {}),
      navigation: normalizeNavigation(inputSite?.navigation, fallback.site.navigation)
    },
    about: {
      ...aboutSource,
      experienceAreas: Array.isArray(input.about?.experienceAreas) ? input.about.experienceAreas.map(String) : clone(fallback.about.experienceAreas),
      workplaces: Array.isArray(input.about?.workplaces) ? input.about.workplaces.map(String) : clone(fallback.about.workplaces || []),
      fields: aboutFields,
      customFields: normalizeCustomFields(aboutSource.customFields, aboutFields)
    },
    home: {
      banner: { ...fallback.home.banner, ...(inputHome?.banner || {}) },
      profile: { ...fallback.home.profile, ...(inputHome?.profile || {}) },
      quickStart: { ...fallback.home.quickStart, ...(inputHome?.quickStart || {}) },
      consultation: { ...fallback.home.consultation, ...(inputHome?.consultation || {}) },
      services: { ...fallback.home.services, ...(inputHome?.services || {}) },
      cases: { ...fallback.home.cases, ...(inputHome?.cases || {}) },
      footer: { ...fallback.home.footer, ...(inputHome?.footer || {}) },
      sections: Array.isArray(inputHome?.sections) ? clone(inputHome.sections) : clone(fallback.home.sections)
    },
    fieldModel: normalizedFieldModel,
    theme: { ...defaultTheme, ...(fallback.theme || {}), ...(input.theme || {}) },
    pages: (Array.isArray(input.pages) && input.pages.length ? input.pages : clone(fallback.pages || [])).map((page) => ({
      ...page,
      navigationLabel: page.navigationLabel || page.title,
      status: page.status === 'published' ? 'published' : 'draft',
      pageKind: page.pageKind === 'landing' ? 'landing' : 'standard',
      isHomepage: page.isHomepage === true,
      showInNavigation: page.showInNavigation === true,
      headerMode: page.headerMode === 'hidden' ? 'hidden' : page.headerMode === 'minimal' ? 'minimal' : 'full',
      footerMode: page.footerMode === 'hidden' ? 'hidden' : page.footerMode === 'minimal' ? 'minimal' : 'full',
      seo: {
        title: page.seo?.title || page.title,
        description: page.seo?.description || '',
        image: page.seo?.image || '',
        noindex: page.seo?.noindex === true || page.status !== 'published'
      },
      sections: (Array.isArray(page.sections) ? page.sections : []).map((section) => ({
        ...makePageSection(pageSectionTypes.includes(section.type) ? section.type : 'text-image'),
        ...section,
        fields: normalizeDisplayFields(section.fields, newSectionFields()),
        customFields: normalizeCustomFields(section.customFields, normalizeDisplayFields(section.fields, newSectionFields())),
        style: { ...defaultPageStyle(), ...(section.style || {}) },
        content: {
          ...makePageSection(pageSectionTypes.includes(section.type) ? section.type : 'text-image').content,
          ...(section.content || {}),
          limit: Number(section.content?.limit) === 0
            ? 0
            : Math.min(100, Math.max(1, Number.isFinite(Number(section.content?.limit)) ? Math.trunc(Number(section.content?.limit)) : 6)),
          items: (Array.isArray(section.content?.items) ? section.content.items : []).map((item) => {
            const fields = normalizeDisplayFields(item.fields, newPageItemFields());
            return { ...makePageItem(), ...item, fields, customFields: normalizeCustomFields(item.customFields, fields) };
          })
        }
      }))
    })),
    services: (Array.isArray(input.services) ? input.services : []).map((item, index) => {
      const fields = normalizeDisplayFields(item.fields, normalizedFieldModel.serviceFields);
      return {
      ...item,
      fields,
      mediaType: item.mediaType === 'image' ? 'image' : 'icon',
      icon: item.icon || 'sparkles',
      image: item.image || '',
      customFields: normalizeCustomFields(item.customFields, fields),
      featured: item.featured === true,
      placeholder: item.placeholder === true,
      order: Number.isInteger(item.order) ? item.order : (index + 1) * 10,
      visible: item.visible !== false
    };
    }),
    cases: (Array.isArray(input.cases) ? input.cases : []).map((item, index) => {
      const fallbackFields = fallback.cases[index]?.fields || fallback.cases[0]?.fields || [];
      const fields = normalizeDisplayFields(item.fields, fallbackFields);
      return {
      ...item,
      fields,
      customFields: normalizeCustomFields(item.customFields, fields),
      category: item.category || item.procedure || '',
      procedureDate: item.procedureDate || '',
      displayType: item.displayType === 'single-result'
        ? 'single-result'
        : item.displayType === 'before-after-gallery'
          ? 'before-after-gallery'
          : 'before-after',
      beforeImage: item.beforeImage || '',
      afterImage: item.afterImage || '',
      resultImage: item.resultImage || (item.displayType === 'single-result' ? item.afterImage : '') || '',
      additionalImages: item.displayType === 'before-after-gallery'
        ? (Array.isArray(item.additionalImages) && item.additionalImages.length ? item.additionalImages.slice(0, 20).map(String) : [''])
        : (Array.isArray(item.additionalImages) ? item.additionalImages.slice(0, 20).map(String) : []),
      status: item.status === 'draft' ? 'draft' : 'published',
      featured: item.featured === true,
      placeholder: item.placeholder === true,
      order: Number.isInteger(item.order) ? item.order : (index + 1) * 10,
      visible: item.visible !== false
    };
    }),
    achievements: (Array.isArray(input.achievements) ? input.achievements : clone(fallback.achievements)).map((item, index) => {
      const fallbackFields = fallback.achievements[index]?.fields || fallback.achievements[0]?.fields || [];
      const fields = normalizeDisplayFields(item.fields, fallbackFields);
      return {
      ...item,
      fields,
      customFields: normalizeCustomFields(item.customFields, fields),
      placeholder: item.placeholder === true,
      order: Number.isInteger(item.order) ? item.order : (index + 1) * 10,
      visible: item.visible !== false
    };
    }),
    privacy: normalizePolicy(input.privacy, fallback.privacy),
    disclaimer: normalizePolicy(input.disclaimer, fallback.disclaimer)
  } as DashboardContent;
}

const renumber = (collection: CollectionName) => {
  if (!state) return;
  state[collection].forEach((item, index) => { item.order = (index + 1) * 10; });
};

const renderCollection = (collection: CollectionName) => {
  if (collection === 'services') renderServices();
  else if (collection === 'cases') renderCases();
  else renderAchievements();
  renderPagePreview();
};

const collectionItemAt = (collection: CollectionName, index: number) => {
  if (!state) return undefined;
  return state[collection][index] as Service | CaseStudy | Achievement | undefined;
};

document.addEventListener('input', (event) => {
  if (!state) return;
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) return;
  if (input.matches('[data-filter-services], [data-filter-cases], [data-filter-achievements]')) return;

  if (input.dataset.path) {
    const optionMatch = input.dataset.path.match(/^fieldModel\.consultationFields\.(\d+)\.optionsText$/);
    if (optionMatch) {
      const definition = state.fieldModel.consultationFields[Number(optionMatch[1])];
      if (definition) definition.options = input.value.split('\n').map((item) => item.trim()).filter(Boolean);
    } else if (input.dataset.path === 'about.experienceAreasText') {
      state.about.experienceAreas = input.value.split('\n').map((item) => item.trim()).filter(Boolean);
    } else if (input.dataset.path === 'about.workplacesText') {
      state.about.workplaces = input.value.split('\n').map((item) => item.trim()).filter(Boolean);
    } else {
      setByPath(input.dataset.path, input.type === 'checkbox' ? (input as HTMLInputElement).checked : input.value);
      syncLegacyPathToHomepage(input.dataset.path, input.type === 'checkbox' ? (input as HTMLInputElement).checked : input.value);
    }
    markDirty();
  }

  const modelGroup = input.dataset.modelGroup as keyof FieldModel | undefined;
  const modelIndex = Number(input.dataset.index);
  const modelKey = input.dataset.modelKey;
  if (modelGroup && Number.isInteger(modelIndex) && modelKey) {
    const item = state.fieldModel[modelGroup][modelIndex] as unknown as Record<string, unknown> | undefined;
    if (!item) return;
    item[modelKey] = input.type === 'checkbox' ? (input as HTMLInputElement).checked : input.value;
    markDirty();
    return;
  }

  const navigationIndex = Number(input.dataset.navigationIndex);
  const navigationKey = input.dataset.navigationKey as keyof NavigationItem | undefined;
  if (Number.isInteger(navigationIndex) && navigationKey && state.site.navigation[navigationIndex]) {
    const item = state.site.navigation[navigationIndex];
    const value = input.type === 'checkbox' ? (input as HTMLInputElement).checked : input.value;
    (item as unknown as Record<string, unknown>)[navigationKey] = value;
    const card = input.closest<HTMLElement>('[data-navigation-item]');
    const title = card?.querySelector<HTMLElement>('header strong');
    if (navigationKey === 'label' && title) title.textContent = String(value);
    markDirty();
    return;
  }

  const collection = input.dataset.collection as CollectionName | undefined;
  const index = Number(input.dataset.index);
  const key = input.dataset.key;
  if (collection && Number.isInteger(index) && key) {
    const item = collectionItemAt(collection, index);
    if (!item) return;
    const record = item as unknown as Record<string, unknown>;
    const previousLabel = itemLabel(collection, item);
    const previousId = itemIdentifier(collection, item);
    const nextValue = input.type === 'checkbox' ? (input as HTMLInputElement).checked : input.value;

    if (input.hasAttribute('data-image-path')) {
      clearPending({ collection, item, key } as ImageTarget);
    }
    if (key.startsWith('customFields.')) {
      const customKey = key.slice('customFields.'.length);
      item.customFields ||= {};
      item.customFields[customKey] = String(nextValue);
    } else {
      record[key] = nextValue;
    }
    if (collection === 'cases' && key === 'displayType' && nextValue === 'before-after-gallery') {
      const caseItem = item as CaseStudy;
      if (!Array.isArray(caseItem.additionalImages) || caseItem.additionalImages.length === 0) caseItem.additionalImages = [''];
    }
    const isNameField = (collection === 'services' && key === 'name') || (collection === 'cases' && key === 'title') || (collection === 'achievements' && key === 'title');
    const prefix = collection === 'services' ? 'service' : collection === 'cases' ? 'case' : 'achievement';
    if (isNameField && (previousId.startsWith(`${prefix}-`) || previousId === makeSlug(previousLabel, prefix))) {
      const generated = uniqueIdentifier(collection, makeSlug(String(nextValue), prefix), item);
      if (collection === 'achievements') (item as Achievement).id = generated;
      else (item as Service | CaseStudy).slug = generated;
      const card = input.closest<HTMLElement>('[data-item-card]');
      const identifierInput = card?.querySelector<HTMLInputElement>(`[data-key="${collection === 'achievements' ? 'id' : 'slug'}"]`);
      if (identifierInput) identifierInput.value = generated;
      const code = card?.querySelector<HTMLElement>('[data-card-identifier]');
      if (code) code.textContent = generated;
      const notice = card?.querySelector<HTMLElement>('[data-slug-notice]');
      if (notice) notice.innerHTML = slugNotice(collection, generated, item);
    }
    const cardTitle = input.closest<HTMLElement>('[data-item-card]')?.querySelector<HTMLElement>('[data-card-title]');
    if (isNameField && cardTitle) cardTitle.textContent = String(nextValue);
    if (key === 'slug' || key === 'id') {
      const notice = input.closest<HTMLElement>('[data-item-card]')?.querySelector<HTMLElement>('[data-slug-notice]');
      if (notice) notice.innerHTML = slugNotice(collection, String(nextValue), item);
      const code = input.closest<HTMLElement>('[data-item-card]')?.querySelector<HTMLElement>('[data-card-identifier]');
      if (code) code.textContent = String(nextValue);
    }
    markDirty();
  }
});

document.addEventListener('change', (event) => {
  if (!state) return;
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
  if (input.dataset.path?.startsWith('fieldModel.')) {
    renderConsultationFields();
    return;
  }
  if (input.dataset.navigationKey) {
    renderNavigation();
    return;
  }
  if (input.dataset.modelGroup) {
    renderConsultationFields();
    return;
  }
  const collection = input.dataset.collection as CollectionName | undefined;
  const key = input.dataset.key;
  if (collection && (['mediaType', 'displayType', 'icon', 'visible', 'placeholder', 'status'].includes(key || '') || input.hasAttribute('data-image-path'))) {
    renderCollection(collection);
  }
});

const clearDragState = () => {
  document.querySelectorAll<HTMLElement>('[data-item-card].is-dragging, [data-item-card].is-drag-over')
    .forEach((card) => card.classList.remove('is-dragging', 'is-drag-over'));
  draggedCollection = null;
  draggedIndex = -1;
};

document.addEventListener('dragstart', (event) => {
  if (!state) return;
  const fieldHandle = (event.target as HTMLElement).closest<HTMLElement>('[data-field-drag-handle]');
  if (fieldHandle) {
    const target = parseFieldToken(fieldHandle.dataset.fieldDragHandle);
    if (!target) {
      event.preventDefault();
      return;
    }
    draggedDisplayField = target;
    fieldHandle.closest<HTMLElement>('[data-field-row]')?.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', fieldHandle.dataset.fieldDragHandle || '');
    }
    return;
  }
  const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-drag-handle]');
  if (!handle) return;
  const collection = handle.dataset.dragCollection;
  const index = Number(handle.dataset.index);
  if ((collection !== 'services' && collection !== 'cases') || !Number.isInteger(index)) {
    event.preventDefault();
    return;
  }
  draggedCollection = collection;
  draggedIndex = index;
  handle.closest<HTMLElement>('[data-item-card]')?.classList.add('is-dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${collection}:${index}`);
  }
});

document.addEventListener('dragover', (event) => {
  if (draggedDisplayField) {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-field-row]');
    const target = parseFieldToken(row?.dataset.fieldRow);
    if (!row || !target) return;
    const sameOwner = target.scope === draggedDisplayField.scope
      && target.ownerIndex === draggedDisplayField.ownerIndex
      && target.sectionIndex === draggedDisplayField.sectionIndex
      && target.itemIndex === draggedDisplayField.itemIndex;
    if (!sameOwner || target.fieldIndex === draggedDisplayField.fieldIndex) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll<HTMLElement>('[data-field-row].is-drag-over')
      .forEach((item) => item.classList.remove('is-drag-over'));
    row.classList.add('is-drag-over');
    return;
  }
  if (!draggedCollection || draggedIndex < 0) return;
  const card = (event.target as HTMLElement).closest<HTMLElement>(`[data-item-card="${draggedCollection}"]`);
  if (!card) return;
  const targetIndex = Number(card.dataset.index);
  if (!Number.isInteger(targetIndex) || targetIndex === draggedIndex) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  document.querySelectorAll<HTMLElement>('[data-item-card].is-drag-over')
    .forEach((item) => item.classList.remove('is-drag-over'));
  card.classList.add('is-drag-over');
});

document.addEventListener('drop', (event) => {
  if (state && draggedDisplayField) {
    const sourceTarget = draggedDisplayField;
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-field-row]');
    const target = parseFieldToken(row?.dataset.fieldRow);
    const sameOwner = target
      && target.scope === sourceTarget.scope
      && target.ownerIndex === sourceTarget.ownerIndex
      && target.sectionIndex === sourceTarget.sectionIndex
      && target.itemIndex === sourceTarget.itemIndex;
    if (sameOwner && target && target.fieldIndex !== sourceTarget.fieldIndex) {
      event.preventDefault();
      const owner = resolveFieldOwner(sourceTarget);
      const [moved] = owner?.fields.splice(sourceTarget.fieldIndex, 1) || [];
      if (owner && moved) {
        owner.fields.splice(target.fieldIndex, 0, moved);
        normalizeDisplayFieldOrder(owner.fields);
        markDirty();
        rerenderFieldOwner(sourceTarget.scope);
        setMessage('تم تحديث ترتيب حقول هذا العنصر فقط.', 'success');
      }
    }
    document.querySelectorAll<HTMLElement>('[data-field-row].is-dragging, [data-field-row].is-drag-over')
      .forEach((item) => item.classList.remove('is-dragging', 'is-drag-over'));
    draggedDisplayField = null;
    return;
  }
  if (!state || !draggedCollection || draggedIndex < 0) return;
  const collection = draggedCollection;
  const card = (event.target as HTMLElement).closest<HTMLElement>(`[data-item-card="${collection}"]`);
  if (!card) {
    clearDragState();
    return;
  }
  event.preventDefault();
  const targetIndex = Number(card.dataset.index);
  if (!Number.isInteger(targetIndex) || targetIndex === draggedIndex) {
    clearDragState();
    return;
  }
  const items = state[collection] as Array<Service | CaseStudy>;
  const [moved] = items.splice(draggedIndex, 1);
  if (!moved) {
    clearDragState();
    return;
  }
  items.splice(targetIndex, 0, moved);
  renumber(collection);
  markDirty();
  clearDragState();
  renderCollection(collection);
  setMessage(`تم تحديث ترتيب ${collection === 'services' ? 'الخدمات' : 'الحالات'} في المسودة. احفظ ملفات المشروع لاعتماده.`, 'success');
});

document.addEventListener('dragend', () => {
  document.querySelectorAll<HTMLElement>('[data-field-row].is-dragging, [data-field-row].is-drag-over')
    .forEach((item) => item.classList.remove('is-dragging', 'is-drag-over'));
  draggedDisplayField = null;
  clearDragState();
});

document.addEventListener('click', (event) => {
  if (!state) return;
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button) return;

  if (button.dataset.editDisplayField) {
    const target = parseFieldToken(button.dataset.editDisplayField);
    if (target) openFieldEditor(target);
    return;
  }

  if (button.dataset.addDisplayField) {
    const target = parseFieldToken(button.dataset.addDisplayField);
    if (!target) return;
    const owner = resolveFieldOwner(target);
    if (!owner) return;
    const id = uniqueDisplayFieldId(owner, target.scope);
    owner.fields.push({
      id,
      label: 'حقل جديد',
      type: 'textarea',
      placement: 'details',
      required: false,
      visible: true,
      builtin: false,
      order: (owner.fields.length + 1) * 10
    });
    owner.customFields ||= {};
    owner.customFields[id] = '';
    target.fieldIndex = owner.fields.length - 1;
    markDirty();
    rerenderFieldOwner(target.scope);
    openFieldEditor(target);
    return;
  }

  if (button.dataset.moveDisplayField) {
    const target = parseFieldToken(button.dataset.fieldToken);
    if (!target) return;
    const owner = resolveFieldOwner(target);
    if (!owner) return;
    const next = button.dataset.moveDisplayField === 'up' ? target.fieldIndex - 1 : target.fieldIndex + 1;
    if (next < 0 || next >= owner.fields.length) return;
    [owner.fields[target.fieldIndex], owner.fields[next]] = [owner.fields[next], owner.fields[target.fieldIndex]];
    normalizeDisplayFieldOrder(owner.fields);
    markDirty();
    rerenderFieldOwner(target.scope);
    return;
  }

  if (button.hasAttribute('data-add-consultation-field')) {
    state.fieldModel.consultationFields.push({
      id: `consultation-field-${Date.now()}`,
      label: 'حقل استشارة جديد',
      type: 'text',
      placeholder: '',
      helpText: '',
      options: [],
      required: false,
      visible: true,
      fullWidth: false,
      builtin: false,
      order: (state.fieldModel.consultationFields.length + 1) * 10
    });
    markDirty();
    renderConsultationFields();
    return;
  }

  if (button.dataset.moveModel) {
    const group = button.dataset.modelGroup as keyof FieldModel;
    const items = state.fieldModel[group];
    const index = Number(button.dataset.index);
    const next = button.dataset.moveModel === 'up' ? index - 1 : index + 1;
    if (!items || next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
    items.forEach((item, itemIndex) => { item.order = (itemIndex + 1) * 10; });
    markDirty();
    renderConsultationFields();
    return;
  }

  if (button.hasAttribute('data-delete-model')) {
    const group = button.dataset.modelGroup as keyof FieldModel;
    const items = state.fieldModel[group];
    const index = Number(button.dataset.index);
    const item = items?.[index];
    if (!item || item.builtin || !window.confirm(`هل تريد حذف الحقل «${item.label}»؟`)) return;
    items.splice(index, 1);
    items.forEach((entry, itemIndex) => { entry.order = (itemIndex + 1) * 10; });
    markDirty();
    renderConsultationFields();
    return;
  }

  if (button.hasAttribute('data-add-navigation')) {
    state.site.navigation.push({
      id: `navigation-${Date.now()}`,
      label: 'رابط جديد',
      url: '/#top',
      visible: true,
      primary: false
    });
    markDirty();
    renderNavigation();
    requestAnimationFrame(() => $('[data-panel="navigation"] [data-navigation-item]:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return;
  }

  if (button.dataset.moveNavigation) {
    const index = Number(button.dataset.index);
    const next = button.dataset.moveNavigation === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= state.site.navigation.length) return;
    [state.site.navigation[index], state.site.navigation[next]] = [state.site.navigation[next], state.site.navigation[index]];
    markDirty();
    renderNavigation();
    return;
  }

  if (button.hasAttribute('data-duplicate-navigation')) {
    const index = Number(button.dataset.index);
    const source = state.site.navigation[index];
    if (!source) return;
    const copy = clone(source);
    copy.id = `navigation-${Date.now()}`;
    copy.label = `${copy.label} — نسخة`;
    copy.primary = false;
    state.site.navigation.splice(index + 1, 0, copy);
    markDirty();
    renderNavigation();
    return;
  }

  if (button.hasAttribute('data-delete-navigation')) {
    const index = Number(button.dataset.index);
    const item = state.site.navigation[index];
    if (!item || !window.confirm(`هل تريد حذف رابط «${item.label}» من الهيدر؟`)) return;
    state.site.navigation.splice(index, 1);
    markDirty();
    renderNavigation();
    return;
  }

  if (button.dataset.moveItem) {
    const collection = button.dataset.collectionName as CollectionName;
    const index = Number(button.dataset.index);
    const next = button.dataset.moveItem === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= state[collection].length) return;
    const items = state[collection] as Array<Service | CaseStudy | Achievement>;
    const current = items[index];
    items[index] = items[next];
    items[next] = current;
    renumber(collection);
    markDirty();
    renderCollection(collection);
    return;
  }

  if (button.dataset.toggleItem) {
    const collection = button.dataset.toggleItem as CollectionName;
    const item = collectionItemAt(collection, Number(button.dataset.index));
    if (!item) return;
    if (collapsedItems.has(item)) collapsedItems.delete(item);
    else collapsedItems.add(item);
    renderCollection(collection);
    return;
  }

  if (button.dataset.duplicateItem) {
    const collection = button.dataset.duplicateItem as CollectionName;
    const index = Number(button.dataset.index);
    const source = collectionItemAt(collection, index);
    if (!source) return;
    const copy = clone(source) as Service | CaseStudy | Achievement;
    const prefix = collection === 'services' ? 'service' : collection === 'cases' ? 'case' : 'achievement';
    const nextId = uniqueIdentifier(collection, `${itemIdentifier(collection, source)}-copy`, source);
    if (collection === 'services') {
      (copy as Service).slug = nextId;
      (copy as Service).name = `${(copy as Service).name} — نسخة`;
    } else if (collection === 'cases') {
      (copy as CaseStudy).slug = nextId;
      (copy as CaseStudy).title = `${(copy as CaseStudy).title} — نسخة`;
      (copy as CaseStudy).placeholder = true;
    } else {
      (copy as Achievement).id = nextId || `${prefix}-${Date.now()}`;
      (copy as Achievement).title = `${(copy as Achievement).title} — نسخة`;
      (copy as Achievement).placeholder = true;
    }
    (state[collection] as Array<typeof copy>).splice(index + 1, 0, copy);
    renumber(collection);
    markDirty();
    renderCollection(collection);
    setMessage('أُنشئت نسخة جديدة. راجع المعرّف والمحتوى قبل الحفظ.', 'success');
    return;
  }

  if (button.dataset.deleteItem) {
    const collection = button.dataset.deleteItem as CollectionName;
    const index = Number(button.dataset.index);
    const item = collectionItemAt(collection, index);
    if (!item) return;
    if (!window.confirm(`هل تريد حذف «${itemLabel(collection, item)}»؟ سيُحذف ملف المحتوى عند الحفظ، ولن تُحذف الصور القديمة.`)) return;
    pendingImages.filter((entry) => entry.item === item).forEach(clearPending);
    (state[collection] as Array<typeof item>).splice(index, 1);
    renumber(collection);
    markDirty();
    renderCollection(collection);
    setMessage('حُذف العنصر من المسودة. اضغط «حفظ في ملفات المشروع» لاعتماد الحذف.', 'success');
    return;
  }

  if (button.dataset.generateSlug) {
    const collection = button.dataset.generateSlug as CollectionName;
    const item = collectionItemAt(collection, Number(button.dataset.index));
    if (!item) return;
    const prefix = collection === 'services' ? 'service' : collection === 'cases' ? 'case' : 'achievement';
    const generated = uniqueIdentifier(collection, makeSlug(itemLabel(collection, item), prefix), item);
    if (collection === 'achievements') (item as Achievement).id = generated;
    else (item as Service | CaseStudy).slug = generated;
    markDirty();
    renderCollection(collection);
    return;
  }

  if (button.dataset.uploadImage === 'portrait') {
    imageTarget = { collection: 'site', item: state.site, key: 'portrait' };
    imageInput.click();
    return;
  }

  if (button.dataset.uploadCollection) {
    const collection = button.dataset.uploadCollection as 'services' | 'cases' | 'achievements';
    const item = collectionItemAt(collection, Number(button.dataset.index));
    const key = button.dataset.imageKey;
    if (!item || !key) return;
    const arrayIndex = Number(button.dataset.imageIndex);
    imageTarget = {
      collection,
      item,
      key,
      ...(Number.isInteger(arrayIndex) ? { arrayIndex } : {})
    } as ImageTarget;
    imageInput.click();
    return;
  }

  if (button.dataset.removeImage) {
    const collection = button.dataset.removeImage as 'services' | 'cases' | 'achievements';
    const item = collectionItemAt(collection, Number(button.dataset.index));
    const key = button.dataset.imageKey;
    if (!item || !key) return;
    const arrayIndex = Number(button.dataset.imageIndex);
    const target = {
      collection,
      item,
      key,
      ...(Number.isInteger(arrayIndex) ? { arrayIndex } : {})
    } as ImageTarget;
    clearPending(target);
    if (collection === 'cases' && key === 'additionalImages' && Number.isInteger(arrayIndex)) {
      (item as CaseStudy).additionalImages[arrayIndex] = '';
    } else if (collection === 'services') {
      (item as Service).image = '';
      (item as Service).mediaType = 'icon';
    } else if (collection === 'achievements') {
      (item as Achievement).image = placeholderImages.achievement;
      (item as Achievement).placeholder = true;
    } else {
      (item as CaseStudy)[key as 'beforeImage' | 'afterImage' | 'resultImage'] = placeholderImages[key as keyof typeof placeholderImages] || placeholderImages.afterImage;
      (item as CaseStudy).placeholder = true;
    }
    markDirty();
    renderCollection(collection);
    setMessage('أزيل ارتباط الصورة من المحتوى. لم يُحذف أي ملف صورة قديم.', 'success');
    return;
  }

  if (button.hasAttribute('data-add-case-gallery')) {
    const item = state.cases[Number(button.dataset.index)];
    if (!item || item.additionalImages.length >= 20) return;
    item.additionalImages.push('');
    markDirty();
    renderCases();
    requestAnimationFrame(() => {
      const slots = document.querySelectorAll('[data-panel="cases"] [data-gallery-slot]');
      slots[slots.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return;
  }

  if (button.hasAttribute('data-delete-case-gallery')) {
    const item = state.cases[Number(button.dataset.index)];
    const imageIndex = Number(button.dataset.imageIndex);
    if (!item || !Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex >= item.additionalImages.length) return;
    pendingImages = pendingImages.filter((entry) => {
      if (entry.collection !== 'cases' || entry.item !== item || entry.key !== 'additionalImages') return true;
      if (entry.arrayIndex === imageIndex) {
        URL.revokeObjectURL(entry.previewUrl);
        return false;
      }
      if (Number(entry.arrayIndex) > imageIndex) entry.arrayIndex = Number(entry.arrayIndex) - 1;
      return true;
    });
    item.additionalImages.splice(imageIndex, 1);
    if (item.additionalImages.length === 0) item.additionalImages.push('');
    markDirty();
    renderCases();
    return;
  }

  if (button.dataset.addPolicySection) {
    const key = button.dataset.addPolicySection as 'privacy' | 'disclaimer';
    state[key].sections.push({ heading: '[عنوان الفقرة الجديدة]', body: '[نص الفقرة الجديدة]' });
    markDirty();
    renderPolicy(key);
    return;
  }

  if (button.dataset.movePolicySection) {
    const key = button.dataset.policy as 'privacy' | 'disclaimer';
    const index = Number(button.dataset.index);
    const next = button.dataset.movePolicySection === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= state[key].sections.length) return;
    [state[key].sections[index], state[key].sections[next]] = [state[key].sections[next], state[key].sections[index]];
    markDirty();
    renderPolicy(key);
    return;
  }

  if (button.dataset.deletePolicySection) {
    const key = button.dataset.deletePolicySection as 'privacy' | 'disclaimer';
    const index = Number(button.dataset.index);
    if (state[key].sections.length <= 1) {
      setMessage('يجب إبقاء فقرة واحدة على الأقل في السياسة.', 'error');
      return;
    }
    if (!window.confirm('هل تريد حذف هذه الفقرة من السياسة؟')) return;
    state[key].sections.splice(index, 1);
    markDirty();
    renderPolicy(key);
  }
});

fieldEditorForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!fieldEditorTarget) return;
  const target = { ...fieldEditorTarget };
  const owner = resolveFieldOwner(target);
  const definition = owner?.fields[target.fieldIndex];
  const label = fieldEditorLabel.value.trim();
  if (!owner || !definition || !label) {
    fieldEditorLabel.setCustomValidity('أدخل عنواناً واضحاً للحقل.');
    fieldEditorLabel.reportValidity();
    return;
  }
  fieldEditorLabel.setCustomValidity('');
  if (target.scope === 'page-section' || target.scope === 'page-item') pushPageHistory();
  definition.label = label;
  definition.type = fieldEditorType.value === 'text' ? 'text' : 'textarea';
  definition.placement = fieldEditorPlacement.value === 'card' ? 'card' : 'details';
  definition.visible = fieldEditorVisible.checked;
  definition.required = fieldEditorRequired.checked;
  normalizeDisplayFieldOrder(owner.fields);
  markDirty();
  closeFieldEditor();
  rerenderFieldOwner(target.scope);
  setMessage(`تم تحديث عنوان الحقل «${label}» لهذا العنصر فقط.`, 'success');
});

document.querySelectorAll<HTMLButtonElement>('[data-close-field-editor]').forEach((button) => {
  button.addEventListener('click', closeFieldEditor);
});

deleteDisplayFieldButton?.addEventListener('click', () => {
  if (!fieldEditorTarget) return;
  const target = { ...fieldEditorTarget };
  const owner = resolveFieldOwner(target);
  const definition = owner?.fields[target.fieldIndex];
  if (!owner || !definition || definition.builtin) return;
  if (!window.confirm(`هل تريد حذف الحقل «${definition.label}» من هذا العنصر فقط؟`)) return;
  if (target.scope === 'page-section' || target.scope === 'page-item') pushPageHistory();
  owner.fields.splice(target.fieldIndex, 1);
  delete owner.customFields[definition.id];
  normalizeDisplayFieldOrder(owner.fields);
  markDirty();
  closeFieldEditor();
  rerenderFieldOwner(target.scope);
  setMessage('تم حذف الحقل الإضافي من هذا العنصر فقط.', 'success');
});

fieldEditorDialog?.addEventListener('click', (event) => {
  if (event.target === fieldEditorDialog) closeFieldEditor();
});

$('[data-add-service]')?.addEventListener('click', () => {
  if (!state) return;
  const fields = clone(state.services[0]?.fields || state.fieldModel.serviceFields);
  const item: Service = {
    slug: uniqueIdentifier('services', `service-${Date.now()}`),
    name: '[اسم الخدمة الجديدة]',
    category: '[فئة الخدمة]',
    summary: '[ملخص موثق للخدمة]',
    description: '[وصف الخدمة]',
    suitableFor: '[لمن قد تناسب بعد التقييم]',
    notes: '[الملاحظات والتنبيهات]',
    fields,
    customFields: Object.fromEntries(fields.filter((field) => !field.builtin).map((field) => [field.id, ''])),
    mediaType: 'icon',
    icon: 'sparkles',
    image: '',
    featured: false,
    placeholder: true,
    order: (state.services.length + 1) * 10,
    visible: true
  };
  state.services.push(item);
  markDirty();
  renderServices();
  requestAnimationFrame(() => $('[data-panel="services"] [data-item-card]:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
});

$('[data-add-case]')?.addEventListener('click', () => {
  if (!state) return;
  const fields = clone(state.cases[0]?.fields || []);
  const item: CaseStudy = {
    slug: uniqueIdentifier('cases', `case-${Date.now()}`),
    title: '[عنوان الحالة الجديدة]',
    category: '[تصنيف الحالة]',
    procedure: '[الخدمة أو الإجراء]',
    description: 'هذه حالة تجريبية لا تمثل نتيجة حقيقية حتى استبدال بياناتها.',
    performed: '[ما تم تنفيذه]',
    procedureDate: '',
    sessions: '[عدد الجلسات إن انطبق]',
    duration: '[المدة]',
    displayType: 'before-after',
    beforeImage: placeholderImages.beforeImage,
    afterImage: placeholderImages.afterImage,
    resultImage: '',
    additionalImages: [],
    notes: '[ملاحظات من دون بيانات شخصية أو صحية حساسة]',
    status: 'draft',
    featured: false,
    placeholder: true,
    order: (state.cases.length + 1) * 10,
    visible: true,
    fields,
    customFields: Object.fromEntries(fields.filter((field) => !field.builtin).map((field) => [field.id, '']))
  };
  state.cases.push(item);
  markDirty();
  renderCases();
  requestAnimationFrame(() => $('[data-panel="cases"] [data-item-card]:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
});

$('[data-add-achievement]')?.addEventListener('click', () => {
  if (!state) return;
  const fields = clone(state.achievements[0]?.fields || []);
  const item: Achievement = {
    id: uniqueIdentifier('achievements', `achievement-${Date.now()}`),
    title: '[اسم الإنجاز أو الشهادة الجديدة]',
    year: '[السنة]',
    description: '[وصف مختصر ومصدر التحقق]',
    image: placeholderImages.achievement,
    placeholder: true,
    order: (state.achievements.length + 1) * 10,
    visible: true,
    fields,
    customFields: Object.fromEntries(fields.filter((field) => !field.builtin).map((field) => [field.id, '']))
  };
  state.achievements.push(item);
  markDirty();
  renderAchievements();
  requestAnimationFrame(() => $('[data-panel="achievements"] [data-item-card]:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
});

imageInput.addEventListener('change', () => {
  const file = imageInput.files?.[0];
  if (!file || !imageTarget || !state) return;
  try {
    if (!allowedImageTypes.has(file.type)) throw new Error('الصيغ المسموحة: JPG وPNG وWebP وAVIF.');
    if (file.size > 5 * 1024 * 1024) throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميغابايت.');
    clearPending(imageTarget);
    pendingImages.push({ ...imageTarget, file, previewUrl: URL.createObjectURL(file) } as PendingImage);
    markDirty();
    if (imageTarget.collection === 'site') renderProfile();
    else if (imageTarget.collection === 'pages') renderPages();
    else renderCollection(imageTarget.collection);
    setMessage('أضيفت الصورة إلى المعاينة. لن تُنسخ إلى المشروع قبل الضغط على «حفظ في ملفات المشروع».', 'success');
  } catch (error) {
    setMessage(error instanceof Error ? error.message : 'تعذر اختيار الصورة.', 'error');
  } finally {
    imageInput.value = '';
    imageTarget = null;
  }
});

($('[data-filter-services]') as HTMLInputElement)?.addEventListener('input', (event) => {
  filters.services = (event.target as HTMLInputElement).value;
  renderServices();
});
($('[data-filter-cases]') as HTMLInputElement)?.addEventListener('input', (event) => {
  filters.cases = (event.target as HTMLInputElement).value;
  renderCases();
});
($('[data-filter-achievements]') as HTMLInputElement)?.addEventListener('input', (event) => {
  filters.achievements = (event.target as HTMLInputElement).value;
  renderAchievements();
});

const setNestedValue = (target: Record<string, unknown>, path: string, value: unknown) => {
  const parts = path.split('.');
  let cursor = target;
  parts.slice(0, -1).forEach((part) => {
    cursor = cursor[part] as Record<string, unknown>;
  });
  cursor[parts.at(-1)!] = value;
};

document.addEventListener('focusin', (event) => {
  const target = event.target as Element;
  if (!target.matches('[data-page-key], [data-section-key], [data-section-style]')) return;
  if (recordedFocus === target) return;
  recordedFocus = target;
  pushPageHistory();
});
document.addEventListener('focusout', (event) => {
  if (event.target === recordedFocus) recordedFocus = null;
});

document.addEventListener('input', (event) => {
  if (!state) return;
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) return;
  if (input.dataset.themeKey) {
    const key = input.dataset.themeKey as keyof ThemeSettings;
    if (key === 'preset') return;
    const value = input.value.toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(value)) {
      (state.theme as unknown as Record<string, unknown>)[key] = value;
      state.theme.preset = 'custom';
      document.querySelectorAll<HTMLInputElement>(`[data-theme-key="${key}"]`).forEach((field) => { if (field !== input) field.value = value; });
      markDirty();
      renderPagePreview();
    }
    return;
  }
  const page = currentPage();
  if (!page) return;
  if (input.dataset.pageKey) {
    const key = input.dataset.pageKey;
    const value = input.type === 'checkbox' ? (input as HTMLInputElement).checked : input.value;
    const previousTitle = page.title;
    setNestedValue(page as unknown as Record<string, unknown>, key, value);
    if (key === 'title') {
      if (page.navigationLabel === previousTitle) page.navigationLabel = String(value);
      if (!page.isHomepage && page.slug.startsWith('page-')) page.slug = makeSlug(String(value), 'page');
    }
    if (key === 'status' && value === 'published' && page.seo.noindex) page.seo.noindex = false;
    page.updatedAt = new Date().toISOString();
    markDirty();
    renderPagePreview();
    return;
  }
  const sectionIndex = Number(input.dataset.sectionIndex);
  if (!Number.isInteger(sectionIndex) || !page.sections[sectionIndex]) return;
  const section = page.sections[sectionIndex];
  if (input.dataset.sectionStyle) {
    const key = input.dataset.sectionStyle as keyof PageSectionStyle;
    (section.style as unknown as Record<string, unknown>)[key] = key === 'columns' ? Number(input.value) : input.value;
    markDirty();
    renderPagePreview();
    return;
  }
  if (input.dataset.sectionKey) {
    const key = input.dataset.sectionKey;
    const value = input.type === 'checkbox' ? (input as HTMLInputElement).checked : input.type === 'number' ? Number(input.value) : input.value;
    if (input.hasAttribute('data-page-image-path')) {
      const itemMatch = key.match(/^items\.(\d+)\.image$/);
      if (itemMatch) clearPending({ collection: 'pages', item: section.content.items[Number(itemMatch[1])], key: 'image' });
      else clearPending({ collection: 'pages', item: section, key: 'image' });
    }
    if (key.startsWith('style.')) setNestedValue(section as unknown as Record<string, unknown>, key, value);
    else setNestedValue(section as unknown as Record<string, unknown>, key, value);
    if (key === 'type') {
      section.type = value as PageSectionType;
      section.name = pageSectionLabels[section.type];
      if (section.type === 'services-grid') section.content.source = 'services';
      else if (section.type === 'cases-gallery') section.content.source = 'cases';
      else if (!itemSectionTypes.has(section.type)) section.content.source = section.type === 'about-profile' ? 'about' : section.type === 'contact' || section.type === 'consultation-form' ? 'contact' : 'manual';
    }
    page.updatedAt = new Date().toISOString();
    markDirty();
    renderPagePreview();
  }
});

document.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
  if (input.dataset.themeKey) {
    if (/^#[0-9a-fA-F]{6}$/.test(input.value)) renderTheme();
    return;
  }
  if (input.matches('[data-page-key], [data-section-key], [data-section-style]')) renderPages();
});

document.addEventListener('click', (event) => {
  if (!state) return;
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button) return;

  if (button.dataset.themePreset) {
    state.theme = clone(themePresets[button.dataset.themePreset as keyof typeof themePresets]);
    markDirty();
    renderTheme();
    renderPagePreview();
    setMessage('طُبّقت لوحة الألوان الجاهزة على المسودة. احفظ في ملفات المشروع لاعتمادها.', 'success');
    return;
  }
  if (button.hasAttribute('data-reset-theme')) {
    state.theme = clone(defaultTheme);
    markDirty();
    renderTheme();
    renderPagePreview();
    return;
  }
  if (button.dataset.selectPage) {
    selectedPageId = button.dataset.selectPage;
    recordedFocus = null;
    renderPages();
    return;
  }
  if (button.hasAttribute('data-add-page')) {
    const page = makeManagedPage('blank');
    state.pages.push(page);
    selectedPageId = page.id;
    markDirty();
    renderPages();
    return;
  }
  if (button.dataset.createTemplate) {
    const page = makeManagedPage(button.dataset.createTemplate as 'blank' | 'service' | 'consultation' | 'campaign');
    state.pages.push(page);
    selectedPageId = page.id;
    markDirty();
    renderPages();
    setMessage('أُنشئت صفحة من القالب كمسودة. راجع المحتوى وSEO قبل النشر.', 'success');
    return;
  }
  const page = currentPage();
  if (!page) return;
  if (button.hasAttribute('data-page-undo')) {
    const stack = pageUndo.get(page.id) || [];
    const snapshot = stack.pop();
    if (!snapshot) return;
    const redo = pageRedo.get(page.id) || [];
    redo.push(JSON.stringify(page));
    pageRedo.set(page.id, redo);
    const index = state.pages.indexOf(page);
    state.pages[index] = JSON.parse(snapshot) as ManagedPage;
    markDirty();
    renderPages();
    return;
  }
  if (button.hasAttribute('data-page-redo')) {
    const stack = pageRedo.get(page.id) || [];
    const snapshot = stack.pop();
    if (!snapshot) return;
    const undo = pageUndo.get(page.id) || [];
    undo.push(JSON.stringify(page));
    pageUndo.set(page.id, undo);
    const index = state.pages.indexOf(page);
    state.pages[index] = JSON.parse(snapshot) as ManagedPage;
    markDirty();
    renderPages();
    return;
  }
  if (button.hasAttribute('data-duplicate-page')) {
    const copy = clone(page);
    copy.id = `page-${Date.now()}`;
    copy.title = `${copy.title} — نسخة`;
    copy.navigationLabel = copy.title;
    copy.slug = `${page.isHomepage ? 'home-copy' : page.slug}-copy-${Date.now().toString().slice(-4)}`;
    copy.isHomepage = false;
    copy.status = 'draft';
    copy.showInNavigation = false;
    copy.seo.noindex = true;
    copy.updatedAt = new Date().toISOString();
    state.pages.splice(state.pages.indexOf(page) + 1, 0, copy);
    selectedPageId = copy.id;
    markDirty();
    renderPages();
    return;
  }
  if (button.hasAttribute('data-delete-page')) {
    if (page.isHomepage) return;
    if (!window.confirm(`هل تريد حذف الصفحة «${page.title}»؟ سيُحذف ملفها عند حفظ المشروع.`)) return;
    page.sections.forEach((section) => {
      clearPending({ collection: 'pages', item: section, key: 'image' });
      section.content.items.forEach((item) => clearPending({ collection: 'pages', item, key: 'image' }));
    });
    state.pages.splice(state.pages.indexOf(page), 1);
    selectedPageId = state.pages[0]?.id || '';
    markDirty();
    renderPages();
    return;
  }
  if (button.hasAttribute('data-set-homepage')) {
    if (!window.confirm(`تعيين «${page.title}» كصفحة رئيسية للموقع؟`)) return;
    pushPageHistory();
    const oldHome = state.pages.find((item) => item.isHomepage);
    if (oldHome) {
      oldHome.isHomepage = false;
      oldHome.slug = uniquePageSlug(makeSlug(oldHome.title, 'previous-home'), oldHome);
    }
    page.isHomepage = true;
    page.slug = 'home';
    page.status = 'published';
    page.seo.noindex = false;
    markDirty();
    renderPages();
    return;
  }
  if (button.hasAttribute('data-add-page-section')) {
    pushPageHistory();
    const select = $('[data-section-library]') as HTMLSelectElement;
    page.sections.push(makePageSection(select.value as PageSectionType));
    markDirty();
    renderPages();
    requestAnimationFrame(() => $('[data-page-section-card]:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return;
  }
  const sectionIndex = Number(button.dataset.index);
  const section = page.sections[sectionIndex];
  if (button.dataset.movePageSection && section) {
    pushPageHistory();
    const next = button.dataset.movePageSection === 'up' ? sectionIndex - 1 : sectionIndex + 1;
    if (next < 0 || next >= page.sections.length) return;
    [page.sections[sectionIndex], page.sections[next]] = [page.sections[next], page.sections[sectionIndex]];
    markDirty();
    renderPages();
    return;
  }
  if (button.hasAttribute('data-duplicate-page-section') && section) {
    pushPageHistory();
    const copy = clone(section);
    copy.id = `${section.id}-copy-${Date.now().toString().slice(-4)}`;
    copy.name = `${copy.name} — نسخة`;
    page.sections.splice(sectionIndex + 1, 0, copy);
    markDirty();
    renderPages();
    return;
  }
  if (button.hasAttribute('data-toggle-page-section') && section) {
    if (collapsedItems.has(section)) collapsedItems.delete(section); else collapsedItems.add(section);
    renderPages();
    return;
  }
  if (button.hasAttribute('data-delete-page-section') && section) {
    if (!window.confirm(`حذف القسم «${section.name}» من الصفحة؟`)) return;
    pushPageHistory();
    clearPending({ collection: 'pages', item: section, key: 'image' });
    section.content.items.forEach((item) => clearPending({ collection: 'pages', item, key: 'image' }));
    page.sections.splice(sectionIndex, 1);
    markDirty();
    renderPages();
    return;
  }
  if (button.hasAttribute('data-upload-page-section') && section) {
    imageTarget = { collection: 'pages', item: section, key: 'image' };
    imageInput.click();
    return;
  }
  if (button.hasAttribute('data-remove-page-section-image') && section) {
    clearPending({ collection: 'pages', item: section, key: 'image' });
    section.content.image = '';
    markDirty();
    renderPages();
    return;
  }
  if (button.hasAttribute('data-add-page-item') && section) {
    pushPageHistory();
    section.content.items.push(makePageItem(section.content.items.length));
    markDirty();
    renderPages();
    return;
  }
  const itemSectionIndex = Number(button.dataset.sectionIndex);
  const itemIndex = Number(button.dataset.itemIndex);
  const itemSection = page.sections[itemSectionIndex];
  const item = itemSection?.content.items[itemIndex];
  if (button.dataset.movePageItem && itemSection && item) {
    pushPageHistory();
    const next = button.dataset.movePageItem === 'up' ? itemIndex - 1 : itemIndex + 1;
    if (next < 0 || next >= itemSection.content.items.length) return;
    [itemSection.content.items[itemIndex], itemSection.content.items[next]] = [itemSection.content.items[next], itemSection.content.items[itemIndex]];
    markDirty();
    renderPages();
    return;
  }
  if (button.hasAttribute('data-delete-page-item') && itemSection && item) {
    pushPageHistory();
    clearPending({ collection: 'pages', item, key: 'image' });
    itemSection.content.items.splice(itemIndex, 1);
    markDirty();
    renderPages();
    return;
  }
  if (button.hasAttribute('data-upload-page-item') && item) {
    imageTarget = { collection: 'pages', item, key: 'image' };
    imageInput.click();
    return;
  }
  if (button.dataset.copyPageSection) {
    const sourceIndex = Number(button.dataset.copyPageSection);
    const source = page.sections[sourceIndex];
    const select = document.querySelector<HTMLSelectElement>(`[data-copy-target="${sourceIndex}"]`);
    const destination = state.pages.find((candidate) => candidate.id === select?.value);
    if (!source || !destination) return;
    const copy = clone(source);
    copy.id = `${source.id}-copy-${Date.now().toString().slice(-4)}`;
    destination.sections.push(copy);
    markDirty();
    setMessage(`نُسخ القسم إلى الصفحة «${destination.title}».`, 'success');
    return;
  }
  if (button.dataset.previewSize) {
    previewSize = button.dataset.previewSize as 'desktop' | 'mobile';
    document.querySelectorAll<HTMLButtonElement>('[data-preview-size]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.previewSize === previewSize)));
    renderPagePreview();
  }
});

const uniquePageSlug = (proposed: string, current?: ManagedPage) => {
  if (!state) return proposed;
  const used = new Set(state.pages.filter((page) => page !== current).map((page) => page.slug));
  let result = proposed;
  let suffix = 2;
  while (used.has(result)) result = `${proposed}-${suffix++}`;
  return result;
};

($('[data-filter-pages]') as HTMLInputElement)?.addEventListener('input', (event) => {
  pageFilter = (event.target as HTMLInputElement).value;
  renderPages();
});

$('[data-save-draft]')?.addEventListener('click', () => {
  if (!state) return;
  localStorage.setItem(draftKey, JSON.stringify(state));
  $('[data-draft-banner]')?.removeAttribute('hidden');
  setMessage(
    pendingImages.length
      ? 'حُفظت النصوص والمسارات الحالية في المسودة المحلية. الصور الجديدة المختارة تبقى في المعاينة الحالية فقط حتى حفظ ملفات المشروع.'
      : 'حُفظت المسودة على هذا الجهاز فقط، ولم تتغير ملفات المشروع.',
    'success'
  );
});

$('[data-save-files]')?.addEventListener('click', () => saveFiles(false));
$('[data-save-preview]')?.addEventListener('click', () => saveFiles(true));

$('[data-export]')?.addEventListener('click', () => {
  if (!state) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `rajab-content-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setMessage('تم تصدير المحتوى العام فقط. لا يتضمن الملف طلبات الاستشارة أو الأسرار.', 'success');
});

($('[data-import]') as HTMLInputElement)?.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !state) return;
  try {
    const imported = JSON.parse(await file.text()) as Partial<DashboardContent>;
    if (!imported.site || !imported.home || !Array.isArray(imported.services) || !Array.isArray(imported.cases)) {
      throw new Error('الملف لا يحتوي بنية محتوى معروفة.');
    }
    clearAllPending();
    state = normalizeContent(imported, state);
    validateState();
    markDirty();
    renderAll();
    setMessage('تم استيراد المحتوى وتطبيق القيم الآمنة للحقول الناقصة. راجعه ثم احفظه في ملفات المشروع.', 'success');
  } catch (error) {
    setMessage(error instanceof Error ? error.message : 'تعذر استيراد الملف.', 'error');
  } finally {
    input.value = '';
  }
});

$('[data-restore-draft]')?.addEventListener('click', () => {
  if (!state) return;
  try {
    const draft = localStorage.getItem(draftKey) || localStorage.getItem(legacyDraftKey);
    if (!draft) return;
    clearAllPending();
    state = normalizeContent(JSON.parse(draft), state);
    markDirty();
    renderAll();
    setMessage('تمت استعادة المسودة المحلية وتحديث الحقول الناقصة تلقائياً. لم تُحفظ بعد في ملفات المشروع.', 'success');
  } catch {
    setMessage('تعذر قراءة المسودة المحلية.', 'error');
  }
});

$('[data-clear-draft]')?.addEventListener('click', () => {
  localStorage.removeItem(draftKey);
  localStorage.removeItem(legacyDraftKey);
  $('[data-draft-banner]')?.setAttribute('hidden', '');
  setMessage('حُذفت المسودة المحلية.', 'success');
});

async function loadFromFiles(force = false) {
  if (force && dirty && !window.confirm('توجد تغييرات غير محفوظة. هل تريد تجاهلها وإعادة تحميل ملفات المشروع؟')) return;
  setMessage('جارٍ تحميل المحتوى من ملفات المشروع…');
  try {
    const response = await fetch('/api/local-dashboard/content', { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) {
      let details = '';
      try {
        const errorBody = await response.json() as { message?: string };
        details = errorBody.message ? ` السبب: ${errorBody.message}` : '';
      } catch {
        details = '';
      }
      throw new Error(`تعذر تحميل ملفات المحتوى. شغّل اللوحة عبر npm run dashboard وافتح http://127.0.0.1:4321/local-dashboard/.${details}`);
    }
    const loaded = await response.json() as DashboardContent;
    clearAllPending();
    state = normalizeContent(loaded, loaded);
    baseline = JSON.stringify(state);
    setDirty(false);
    renderAll();
    setMessage('المحتوى جاهز للتعديل. التغييرات لا تُعتمد حتى تضغط «حفظ في ملفات المشروع».', 'success');
    if (localStorage.getItem(draftKey) || localStorage.getItem(legacyDraftKey)) $('[data-draft-banner]')?.removeAttribute('hidden');
  } catch (error) {
    setMessage(error instanceof Error ? error.message : 'تعذر تشغيل لوحة التحكم.', 'error');
  }
}

$('[data-reload]')?.addEventListener('click', () => loadFromFiles(true));
window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
});

loadFromFiles();
export {};
