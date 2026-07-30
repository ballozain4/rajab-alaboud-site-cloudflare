export type ServiceMediaType = 'icon' | 'image';
export type ContentFieldType = 'text' | 'textarea' | 'tel' | 'select' | 'checkbox';
export type DisplayFieldPlacement = 'card' | 'details';

export interface DisplayFieldDefinition {
  id: string;
  label: string;
  type: 'text' | 'textarea';
  placement: DisplayFieldPlacement;
  required: boolean;
  visible: boolean;
  builtin: boolean;
  order: number;
}

export type ServiceFieldDefinition = DisplayFieldDefinition;

export interface ConsultationFieldDefinition {
  id: string;
  label: string;
  type: ContentFieldType;
  placeholder: string;
  helpText: string;
  options: string[];
  required: boolean;
  visible: boolean;
  fullWidth: boolean;
  builtin: boolean;
  order: number;
}

export interface FieldModel {
  serviceFields: ServiceFieldDefinition[];
  consultationFields: ConsultationFieldDefinition[];
}

export interface Service {
  slug: string;
  name: string;
  category: string;
  summary: string;
  description: string;
  suitableFor: string;
  notes: string;
  fields: DisplayFieldDefinition[];
  customFields: Record<string, string>;
  mediaType: ServiceMediaType;
  icon: string;
  image: string;
  featured: boolean;
  placeholder: boolean;
  order: number;
  visible: boolean;
}

export type CaseDisplayType = 'before-after' | 'single-result' | 'before-after-gallery';
export type PublicationStatus = 'draft' | 'published';

export interface CaseStudy {
  slug: string;
  title: string;
  category: string;
  procedure: string;
  description: string;
  performed: string;
  procedureDate: string;
  sessions: string;
  duration: string;
  displayType: CaseDisplayType;
  beforeImage: string;
  afterImage: string;
  resultImage: string;
  additionalImages: string[];
  notes: string;
  fields: DisplayFieldDefinition[];
  customFields: Record<string, string>;
  status: PublicationStatus;
  featured: boolean;
  placeholder: boolean;
  order: number;
  visible: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  year: string;
  description: string;
  image: string;
  fields: DisplayFieldDefinition[];
  customFields: Record<string, string>;
  placeholder: boolean;
  order: number;
  visible: boolean;
}

export interface AboutContent {
  biography: string;
  expandedBiography: string;
  university: string;
  graduationYear: string;
  qualification: string;
  graduationProject: string;
  experienceAreas: string[];
  workplaces: string[];
  fields: DisplayFieldDefinition[];
  customFields: Record<string, string>;
}

export type HomeSectionId = 'banner' | 'profile' | 'quick-start' | 'consultation' | 'services' | 'cases';

export interface HomeSection {
  id: HomeSectionId;
  label: string;
  visible: boolean;
}

export interface HomeSettings {
  banner: {
    eyebrow: string;
    title: string;
    description: string;
    ctaLabel: string;
  };
  profile: {
    eyebrow: string;
    credentialLabel: string;
    moreLabel: string;
    lessLabel: string;
  };
  quickStart: {
    eyebrow: string;
    title: string;
    description: string;
  };
  consultation: {
    eyebrow: string;
    title: string;
    description: string;
    submitLabel: string;
  };
  services: {
    eyebrow: string;
    title: string;
    description: string;
    showMoreLabel: string;
    showLessLabel: string;
    requestLabel: string;
  };
  cases: {
    eyebrow: string;
    title: string;
    description: string;
    showMoreLabel: string;
    showLessLabel: string;
    consultationLabel: string;
  };
  footer: {
    biography: string;
  };
  sections: HomeSection[];
}

export interface SiteSettings {
  name: string;
  title: string;
  phoneDisplay: string;
  phoneLink: string;
  whatsapp: string;
  email: string;
  facebook: string;
  instagram: string;
  portrait: string;
  navigation: NavigationItem[];
}

export interface NavigationItem {
  id: string;
  label: string;
  url: string;
  visible: boolean;
  primary: boolean;
}

export interface Policy {
  slug: string;
  title: string;
  description: string;
  updated: string;
  sections: { heading: string; body: string }[];
  alert?: string;
}

export type PageStatus = 'draft' | 'published';
export type PageKind = 'standard' | 'landing';
export type PageSectionType =
  | 'hero'
  | 'text-image'
  | 'services-grid'
  | 'steps'
  | 'cases-gallery'
  | 'about-profile'
  | 'features'
  | 'faq'
  | 'testimonials'
  | 'gallery'
  | 'stats'
  | 'logos'
  | 'cta'
  | 'consultation-form'
  | 'contact';

export interface PageSectionItem {
  id: string;
  title: string;
  text: string;
  image: string;
  imageAlt: string;
  value: string;
  label: string;
  url: string;
  fields: DisplayFieldDefinition[];
  customFields: Record<string, string>;
}

export interface PageSectionStyle {
  background: 'default' | 'surface' | 'primary' | 'dark' | 'custom';
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  buttonColor: string;
  width: 'wide' | 'normal' | 'narrow';
  spacing: 'small' | 'normal' | 'large';
  alignment: 'start' | 'center';
  imagePosition: 'start' | 'end';
  columns: 2 | 3 | 4;
}

export interface PageSection {
  id: string;
  type: PageSectionType;
  name: string;
  visible: boolean;
  style: PageSectionStyle;
  fields: DisplayFieldDefinition[];
  customFields: Record<string, string>;
  content: {
    eyebrow: string;
    title: string;
    description: string;
    image: string;
    imageAlt: string;
    buttonLabel: string;
    buttonUrl: string;
    secondaryButtonLabel: string;
    secondaryButtonUrl: string;
    source: 'manual' | 'services' | 'cases' | 'about' | 'contact';
    limit: number;
    items: PageSectionItem[];
  };
}

export interface ManagedPage {
  id: string;
  title: string;
  slug: string;
  navigationLabel: string;
  status: PageStatus;
  pageKind: PageKind;
  isHomepage: boolean;
  showInNavigation: boolean;
  headerMode: 'full' | 'minimal' | 'hidden';
  footerMode: 'full' | 'minimal' | 'hidden';
  seo: {
    title: string;
    description: string;
    image: string;
    noindex: boolean;
  };
  sections: PageSection[];
  updatedAt: string;
}

export interface ThemeSettings {
  preset: 'lavender' | 'rose' | 'ocean' | 'forest' | 'custom';
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  secondary: string;
  secondarySoft: string;
  accent: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  buttonText: string;
  focus: string;
}

export interface PublicContent {
  site: SiteSettings;
  about: AboutContent;
  home: HomeSettings;
  theme: ThemeSettings;
  pages: ManagedPage[];
  achievements: Achievement[];
  services: Service[];
  cases: CaseStudy[];
  policies: Policy[];
  fieldModel: FieldModel;
}

export type RecordStatus =
  | 'new'
  | 'reviewed'
  | 'awaiting-client'
  | 'contacted'
  | 'appointment-booked'
  | 'completed'
  | 'not-suitable'
  | 'cancelled';

export interface ConsultationRecord {
  kind: 'consultation';
  id?: number;
  createdAt: string;
  updatedAt: string;
  reference: string;
  clientRequestId: string;
  status: RecordStatus;
  archived: boolean;
  notificationEmailStatus: 'pending' | 'sent' | 'failed' | 'not-configured' | 'demo';
  notificationWhatsappStatus: 'manual' | 'sent' | 'failed' | 'not-configured' | 'demo';
  consultation: {
    name: string;
    phone: string;
    city: string;
    requestMode: 'consultation' | 'service';
    consultationType: string;
    serviceSlug: string;
    serviceName: string;
    subject: string;
    description: string;
    extraFields: Record<string, string | boolean>;
    source: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent: string;
    utmTerm: string;
  };
}

export interface DashboardContent {
  site: SiteSettings;
  about: AboutContent;
  home: HomeSettings;
  theme: ThemeSettings;
  pages: ManagedPage[];
  achievements: Achievement[];
  services: Service[];
  cases: CaseStudy[];
  fieldModel: FieldModel;
  privacy: Policy;
  disclaimer: Policy;
}
