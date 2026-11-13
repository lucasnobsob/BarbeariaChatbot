export type TenantStatus = 'onboarding' | 'active' | 'inactive' | 'blocked';
export type UserRole = 'owner' | 'admin' | 'manager' | 'receptionist' | 'professional';
export type AppointmentStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type AppointmentSource = 'web' | 'admin' | 'telegram' | 'whatsapp';
export type ChatbotProviderType = 'telegram' | 'whatsapp';
export type TemplateKey = 'classic-luxury' | 'modern-minimal' | 'urban-studio';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantStatus: TenantStatus | null;
  role: UserRole | null;
}

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessProfile {
  id: string;
  tenantId: string;
  businessName: string;
  tagline: string;
  heroSubtitle: string;
  description: string;
  aboutText: string;
  footerText: string;
  templateKey: TemplateKey;
  logoUrl: string;
  coverImageUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  showGallery: boolean;
  showTeam: boolean;
  showMap: boolean;
  phone: string;
  whatsAppNumber: string;
  telegramUsername: string;
  email: string;
  instagram: string;
  postalCode: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
  latitude: number | null;
  longitude: number | null;
}

export interface ServiceCategory {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  isActive: boolean;
}

export interface ServiceItem {
  id: string;
  tenantId: string;
  categoryId: string | null;
  name: string;
  description: string;
  priceInCents: number;
  durationMinutes: number;
  imageUrl: string;
  isActive: boolean;
}

export interface ProfessionalItem {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  specialties: string;
  photoUrl: string;
  isActive: boolean;
  serviceIds?: string[];
}

export interface WorkingHourItem {
  id?: string;
  tenantId?: string;
  professionalId?: string | null;
  dayOfWeek: number; // 0 (Sunday) .. 6 (Saturday)
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  isAvailable: boolean;
}

export interface GalleryImageItem {
  id: string;
  tenantId: string;
  imageUrl: string;
  caption: string;
  displayOrder: number;
  isActive: boolean;
}

export interface CustomerItem {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  appointmentCount?: number;
  lastAppointmentAt?: string | null;
}

export interface AppointmentItem {
  id: string;
  tenantId: string;
  customerId: string;
  serviceId: string;
  professionalId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  priceInCents: number;
  confirmationCode: string;
  notes: string;
  source: AppointmentSource;
  createdAt: string;
  updatedAt: string;
  customerName?: string;
  customerPhone?: string;
  serviceName?: string;
  serviceDurationMinutes?: number;
  professionalName?: string;
}

export interface BlockedSlotItem {
  id: string;
  tenantId: string;
  professionalId: string | null;
  startAt: string;
  endAt: string;
  reason: string;
  professionalName?: string | null;
}

export interface ChatbotConfigPublic {
  id?: string;
  provider: ChatbotProviderType;
  isEnabled: boolean;
  welcomeMessage: string;
  awayMessage: string;
  hasToken: boolean;
  maskedToken: string;
  botUsername?: string;
  phoneNumberId?: string;
  webhookUrl: string;
}

export interface PublicBarbershopPayload {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: TenantStatus;
  };
  profile: BusinessProfile;
  categories: ServiceCategory[];
  services: ServiceItem[];
  professionals: ProfessionalItem[];
  workingHours: WorkingHourItem[];
  gallery: GalleryImageItem[];
  settings: {
    slotIntervalMinutes: number;
    minAdvanceMinutes: number;
    maxAdvanceDays: number;
    allowPublicCancellation: boolean;
  };
}
