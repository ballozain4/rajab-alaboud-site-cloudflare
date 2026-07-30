import type { RecordStatus } from '../types';

export const SYRIAN_PROVINCES = [
  'دمشق',
  'ريف دمشق',
  'حمص',
  'حماة',
  'حلب',
  'إدلب',
  'اللاذقية',
  'طرطوس',
  'درعا',
  'السويداء',
  'القنيطرة',
  'دير الزور',
  'الرقة',
  'الحسكة',
  'أخرى'
] as const;

export const CONSULTATION_TYPES = [
  'استشارة عن خدمة تجميلية',
  'استشارة عن البشرة وروتين العناية',
  'استشارة عن إزالة الشعر بالليزر',
  'استفسار عام'
] as const;

export const CONSULTATION_SOURCES = [
  'الموقع',
  'إنستغرام',
  'فيسبوك',
  'واتساب',
  'إعلان',
  'إحالة',
  'غير معروف'
] as const;

export const CONSULTATION_STATUSES: RecordStatus[] = [
  'new',
  'reviewed',
  'awaiting-client',
  'contacted',
  'appointment-booked',
  'completed',
  'not-suitable',
  'cancelled'
];

export const STATUS_LABELS: Record<RecordStatus, string> = {
  new: 'جديد',
  reviewed: 'تمت المراجعة',
  'awaiting-client': 'بانتظار تواصل العميل',
  contacted: 'تم التواصل',
  'appointment-booked': 'تم حجز موعد',
  completed: 'مكتمل',
  'not-suitable': 'غير مناسب',
  cancelled: 'ملغى'
};
