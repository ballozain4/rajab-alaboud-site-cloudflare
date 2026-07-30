import { DEFAULT_CONTENT } from '../generated/default-content';
import type { PublicationStatus, PublicContent } from '../types';

let cached: PublicContent | null = null;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const byDisplayOrder = <T extends { order?: number }>(label: (item: T) => string) => (a: T, b: T) =>
  (Number.isFinite(a.order) ? Number(a.order) : 10_000) - (Number.isFinite(b.order) ? Number(b.order) : 10_000)
  || label(a).localeCompare(label(b), 'ar');

export async function getPublicContent(): Promise<PublicContent> {
  if (cached) return cached;
  const content = clone(DEFAULT_CONTENT) as unknown as PublicContent;
  content.about.workplaces = Array.isArray(content.about.workplaces) ? content.about.workplaces : [];
  content.fieldModel.serviceFields.sort((a, b) => a.order - b.order);
  content.fieldModel.consultationFields.sort((a, b) => a.order - b.order);
  content.about.fields = Array.isArray(content.about.fields) ? content.about.fields.sort((a, b) => a.order - b.order) : [];
  content.about.customFields = content.about.customFields && typeof content.about.customFields === 'object' ? content.about.customFields : {};
  content.services = content.services.map((item) => ({
    ...item,
    fields: Array.isArray(item.fields)
      ? item.fields.sort((a, b) => a.order - b.order)
      : content.fieldModel.serviceFields.map((field) => ({ ...field })),
    customFields: item.customFields && typeof item.customFields === 'object' ? item.customFields : {}
  }));
  content.services.sort(byDisplayOrder((item) => item.name));
  content.cases = content.cases.map((item) => ({
    ...item,
    category: item.category || item.procedure,
    procedureDate: item.procedureDate || '',
    fields: Array.isArray(item.fields) ? item.fields.sort((a, b) => a.order - b.order) : [],
    customFields: item.customFields && typeof item.customFields === 'object' ? item.customFields : {},
    additionalImages: Array.isArray(item.additionalImages) ? item.additionalImages : [],
    status: (item.status === 'draft' ? 'draft' : 'published') as PublicationStatus
  })).sort(byDisplayOrder((item) => item.title));
  content.achievements = content.achievements.map((item) => ({
    ...item,
    fields: Array.isArray(item.fields) ? item.fields.sort((a, b) => a.order - b.order) : [],
    customFields: item.customFields && typeof item.customFields === 'object' ? item.customFields : {}
  })).sort(byDisplayOrder((item) => item.title));
  content.pages.forEach((page) => page.sections.forEach((section) => {
    section.fields = Array.isArray(section.fields) ? section.fields.sort((a, b) => a.order - b.order) : [];
    section.customFields = section.customFields && typeof section.customFields === 'object' ? section.customFields : {};
    section.content.items.forEach((item) => {
      item.fields = Array.isArray(item.fields) ? item.fields.sort((a, b) => a.order - b.order) : [];
      item.customFields = item.customFields && typeof item.customFields === 'object' ? item.customFields : {};
    });
  }));
  cached = content;
  return cached;
}
