import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));
const readCollection = async (path) => {
  const directory = join(root, path);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(join(directory, file), 'utf8'))));
};
const byDisplayOrder = (label) => (a, b) =>
  (Number.isFinite(a.order) ? Number(a.order) : 10_000) - (Number.isFinite(b.order) ? Number(b.order) : 10_000)
  || label(a).localeCompare(label(b), 'ar');
const withDisplayControls = (items) => items.map((item, index) => ({
  ...item,
  order: Number.isInteger(item.order) ? item.order : (index + 1) * 10,
  visible: item.visible !== false
}));

const services = withDisplayControls(await readCollection('content/services'))
  .map((item) => ({
    ...item,
    fields: Array.isArray(item.fields) ? item.fields.sort((a, b) => a.order - b.order) : [],
    customFields: item.customFields && typeof item.customFields === 'object' && !Array.isArray(item.customFields)
      ? item.customFields
      : {},
    mediaType: item.mediaType === 'image' ? 'image' : 'icon',
    icon: item.icon || 'sparkles',
    image: typeof item.image === 'string' ? item.image : ''
  }))
  .sort(byDisplayOrder((item) => item.name));
const cases = withDisplayControls(await readCollection('content/cases'))
  .map((item) => ({
    ...item,
    fields: Array.isArray(item.fields) ? item.fields.sort((a, b) => a.order - b.order) : [],
    customFields: item.customFields && typeof item.customFields === 'object' && !Array.isArray(item.customFields)
      ? item.customFields
      : {},
    category: item.category || item.procedure || '',
    procedureDate: item.procedureDate || '',
    displayType: ['single-result', 'before-after-gallery'].includes(item.displayType) ? item.displayType : 'before-after',
    beforeImage: item.beforeImage || '',
    afterImage: item.afterImage || '',
    resultImage: item.resultImage || (item.displayType === 'single-result' ? item.afterImage : '') || '',
    additionalImages: Array.isArray(item.additionalImages) ? item.additionalImages.slice(0, 20) : [],
    status: item.status === 'draft' ? 'draft' : 'published'
  }))
  .sort(byDisplayOrder((item) => item.title));
const achievements = withDisplayControls(await readJson('content/settings/achievements.json'))
  .map((item) => ({
    ...item,
    fields: Array.isArray(item.fields) ? item.fields.sort((a, b) => a.order - b.order) : [],
    customFields: item.customFields && typeof item.customFields === 'object' && !Array.isArray(item.customFields)
      ? item.customFields
      : {}
  }))
  .sort(byDisplayOrder((item) => item.title));
const pages = await readCollection('content/pages');
const about = await readJson('content/settings/about.json');
about.workplaces = Array.isArray(about.workplaces) ? about.workplaces : [];
about.fields = Array.isArray(about.fields) ? about.fields.sort((a, b) => a.order - b.order) : [];
about.customFields = about.customFields && typeof about.customFields === 'object' && !Array.isArray(about.customFields)
  ? about.customFields
  : {};
pages.forEach((page) => page.sections?.forEach((section) => {
  section.fields = Array.isArray(section.fields) ? section.fields.sort((a, b) => a.order - b.order) : [];
  section.customFields = section.customFields && typeof section.customFields === 'object' && !Array.isArray(section.customFields)
    ? section.customFields
    : {};
  section.content?.items?.forEach((item) => {
    item.fields = Array.isArray(item.fields) ? item.fields.sort((a, b) => a.order - b.order) : [];
    item.customFields = item.customFields && typeof item.customFields === 'object' && !Array.isArray(item.customFields)
      ? item.customFields
      : {};
  });
}));

const data = {
  site: await readJson('content/settings/site.json'),
  about,
  home: await readJson('content/settings/home.json'),
  theme: await readJson('content/settings/theme.json'),
  pages,
  achievements,
  services,
  cases,
  policies: await readCollection('content/policies'),
  fieldModel: await readJson('content/settings/field-model.json')
};

const target = join(root, 'src/generated/default-content.ts');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `/* Generated from /content. Do not edit manually. */\nexport const DEFAULT_CONTENT = ${JSON.stringify(data, null, 2)} as const;\n`, 'utf8');
console.log(`Generated content: ${data.pages.length} pages, ${data.cases.length} cases, ${data.services.length} services.`);
