import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().trim().email('E-mail inválido').max(150).transform((v) => v.toLowerCase()),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres').max(128),
  turnstileToken: z.string().optional()
});

export const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido').transform((v) => v.toLowerCase()),
  password: z.string().min(1, 'Informe a senha'),
  turnstileToken: z.string().optional()
});

export const businessProfileSchema = z.object({
  businessName: z.string().trim().min(2, 'Nome da barbearia é obrigatório').max(120),
  slug: z
    .string()
    .trim()
    .min(3, 'Slug deve ter pelo menos 3 caracteres')
    .max(60)
    .regex(slugRegex, 'Slug deve conter apenas letras minúsculas, números e hífens')
    .optional(),
  tagline: z.string().trim().max(160).default(''),
  heroSubtitle: z.string().trim().max(260).default(''),
  description: z.string().trim().max(1000).default(''),
  aboutText: z.string().trim().max(3000).default(''),
  footerText: z.string().trim().max(300).default(''),
  templateKey: z.enum(['classic-luxury', 'modern-minimal', 'urban-studio']).default('classic-luxury'),
  logoUrl: z.string().trim().max(500).default(''),
  coverImageUrl: z.string().trim().max(500).default(''),
  primaryColor: z.string().regex(hexColorRegex, 'Cor inválida').default('#d97706'),
  secondaryColor: z.string().regex(hexColorRegex, 'Cor inválida').default('#0f172a'),
  accentColor: z.string().regex(hexColorRegex, 'Cor inválida').default('#f59e0b'),
  showGallery: z.boolean().default(true),
  showTeam: z.boolean().default(true),
  showMap: z.boolean().default(true),
  phone: z.string().trim().max(40).default(''),
  whatsAppNumber: z.string().trim().max(40).default(''),
  telegramUsername: z.string().trim().max(60).default(''),
  email: z.string().trim().max(150).default(''),
  instagram: z.string().trim().max(100).default(''),
  postalCode: z.string().trim().max(20).default(''),
  street: z.string().trim().max(160).default(''),
  number: z.string().trim().max(30).default(''),
  neighborhood: z.string().trim().max(100).default(''),
  city: z.string().trim().max(100).default(''),
  state: z.string().trim().max(40).default(''),
  complement: z.string().trim().max(120).default(''),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional()
});

export const workingHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(timeRegex, 'Horário inicial inválido (HH:MM)'),
  endTime: z.string().regex(timeRegex, 'Horário final inválido (HH:MM)'),
  breakStart: z.string().regex(timeRegex).nullable().optional(),
  breakEnd: z.string().regex(timeRegex).nullable().optional(),
  isAvailable: z.boolean()
});

export const workingHoursArraySchema = z.object({
  professionalId: z.string().nullable().optional(),
  hours: z.array(workingHourSchema).min(1).max(7)
});

export const serviceCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(''),
  isActive: z.boolean().default(true)
});

export const serviceSchema = z.object({
  categoryId: z.string().nullable().optional(),
  name: z.string().trim().min(2, 'Nome do serviço é obrigatório').max(120),
  description: z.string().trim().max(600).default(''),
  priceInCents: z.number().int().min(0).max(100_000_00),
  durationMinutes: z.number().int().min(5).max(480),
  imageUrl: z.string().trim().max(500).default(''),
  isActive: z.boolean().default(true)
});

export const professionalSchema = z.object({
  name: z.string().trim().min(2, 'Nome do profissional é obrigatório').max(120),
  description: z.string().trim().max(600).default(''),
  specialties: z.string().trim().max(250).default(''),
  photoUrl: z.string().trim().max(500).default(''),
  isActive: z.boolean().default(true),
  serviceIds: z.array(z.string()).default([])
});

export const galleryImageSchema = z.object({
  imageUrl: z.string().trim().min(1).max(500),
  caption: z.string().trim().max(200).default(''),
  displayOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true)
});

export const publicBookingSchema = z.object({
  serviceId: z.string().min(1),
  professionalId: z.string().min(1),
  startAt: z.string().min(10),
  customerName: z.string().trim().min(2, 'Informe seu nome').max(120),
  customerPhone: z.string().trim().min(8, 'Informe um telefone válido').max(30),
  customerEmail: z.string().trim().email().optional().or(z.literal('')),
  notes: z.string().trim().max(400).default(''),
  turnstileToken: z.string().optional()
});

export const adminAppointmentSchema = z.object({
  serviceId: z.string().min(1),
  professionalId: z.string().min(1),
  startAt: z.string().min(10),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(8).max(30),
  customerEmail: z.string().trim().email().optional().or(z.literal('')),
  notes: z.string().trim().max(400).default('')
});

export const blockedSlotSchema = z.object({
  professionalId: z.string().nullable().optional(),
  startAt: z.string().min(10),
  endAt: z.string().min(10),
  reason: z.string().trim().max(200).default('')
});

export const chatbotConfigSchema = z.object({
  provider: z.enum(['telegram', 'whatsapp']),
  isEnabled: z.boolean(),
  welcomeMessage: z.string().trim().max(1000).default(''),
  awayMessage: z.string().trim().max(1000).default(''),
  botToken: z.string().trim().max(300).optional(),
  botUsername: z.string().trim().max(100).optional(),
  phoneNumberId: z.string().trim().max(100).optional(),
  accessToken: z.string().trim().max(500).optional(),
  appSecret: z.string().trim().max(200).optional(),
  verifyToken: z.string().trim().max(120).optional()
});

export const businessSettingsSchema = z.object({
  slotIntervalMinutes: z.number().int().min(5).max(120).default(30),
  minAdvanceMinutes: z.number().int().min(0).max(10080).default(30),
  maxAdvanceDays: z.number().int().min(1).max(180).default(30),
  allowPublicCancellation: z.boolean().default(true),
  timezoneOffsetMinutes: z.number().int().min(-720).max(840).default(-180)
});

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
