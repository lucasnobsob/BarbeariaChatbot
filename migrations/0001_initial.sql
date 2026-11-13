-- Migration 0001: Multi-tenant SaaS Barbershop Platform Schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Tenants (
  Id TEXT PRIMARY KEY,
  Name TEXT NOT NULL,
  Slug TEXT NOT NULL UNIQUE,
  CustomDomain TEXT UNIQUE,
  Status TEXT NOT NULL DEFAULT 'onboarding' CHECK (Status IN ('onboarding', 'active', 'inactive', 'blocked')),
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS Users (
  Id TEXT PRIMARY KEY,
  Name TEXT NOT NULL,
  Email TEXT NOT NULL UNIQUE,
  PasswordHash TEXT NOT NULL,
  IsSuperAdmin INTEGER NOT NULL DEFAULT 0 CHECK (IsSuperAdmin IN (0, 1)),
  Status TEXT NOT NULL DEFAULT 'active' CHECK (Status IN ('active', 'blocked')),
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS Sessions (
  Id TEXT PRIMARY KEY,
  UserId TEXT NOT NULL,
  TenantId TEXT,
  TokenHash TEXT NOT NULL UNIQUE,
  ExpiresAt TEXT NOT NULL,
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE,
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS TenantUsers (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL,
  UserId TEXT NOT NULL,
  Role TEXT NOT NULL CHECK (Role IN ('owner', 'admin', 'manager', 'receptionist', 'professional')),
  ProfessionalId TEXT,
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (TenantId, UserId),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE,
  FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS BusinessProfiles (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL UNIQUE,
  BusinessName TEXT NOT NULL,
  Tagline TEXT NOT NULL DEFAULT '',
  HeroSubtitle TEXT NOT NULL DEFAULT '',
  Description TEXT NOT NULL DEFAULT '',
  AboutText TEXT NOT NULL DEFAULT '',
  FooterText TEXT NOT NULL DEFAULT '',
  TemplateKey TEXT NOT NULL DEFAULT 'classic-luxury',
  LogoUrl TEXT NOT NULL DEFAULT '',
  CoverImageUrl TEXT NOT NULL DEFAULT '',
  PrimaryColor TEXT NOT NULL DEFAULT '#d97706',
  SecondaryColor TEXT NOT NULL DEFAULT '#0f172a',
  AccentColor TEXT NOT NULL DEFAULT '#f59e0b',
  ShowGallery INTEGER NOT NULL DEFAULT 1,
  ShowTeam INTEGER NOT NULL DEFAULT 1,
  ShowMap INTEGER NOT NULL DEFAULT 1,
  Phone TEXT NOT NULL DEFAULT '',
  WhatsAppNumber TEXT NOT NULL DEFAULT '',
  TelegramUsername TEXT NOT NULL DEFAULT '',
  Email TEXT NOT NULL DEFAULT '',
  Instagram TEXT NOT NULL DEFAULT '',
  PostalCode TEXT NOT NULL DEFAULT '',
  Street TEXT NOT NULL DEFAULT '',
  Number TEXT NOT NULL DEFAULT '',
  Neighborhood TEXT NOT NULL DEFAULT '',
  City TEXT NOT NULL DEFAULT '',
  State TEXT NOT NULL DEFAULT '',
  Complement TEXT NOT NULL DEFAULT '',
  Latitude REAL,
  Longitude REAL,
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ServiceCategories (
  Id TEXT NOT NULL,
  TenantId TEXT NOT NULL,
  Name TEXT NOT NULL,
  Description TEXT NOT NULL DEFAULT '',
  IsActive INTEGER NOT NULL DEFAULT 1 CHECK (IsActive IN (0, 1)),
  PRIMARY KEY (Id),
  UNIQUE (TenantId, Id),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Services (
  Id TEXT NOT NULL,
  TenantId TEXT NOT NULL,
  CategoryId TEXT,
  Name TEXT NOT NULL,
  Description TEXT NOT NULL DEFAULT '',
  PriceInCents INTEGER NOT NULL CHECK (PriceInCents >= 0),
  DurationMinutes INTEGER NOT NULL CHECK (DurationMinutes > 0 AND DurationMinutes <= 480),
  ImageUrl TEXT NOT NULL DEFAULT '',
  IsActive INTEGER NOT NULL DEFAULT 1 CHECK (IsActive IN (0, 1)),
  PRIMARY KEY (Id),
  UNIQUE (TenantId, Id),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE,
  FOREIGN KEY (TenantId, CategoryId) REFERENCES ServiceCategories(TenantId, Id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS Professionals (
  Id TEXT NOT NULL,
  TenantId TEXT NOT NULL,
  Name TEXT NOT NULL,
  Description TEXT NOT NULL DEFAULT '',
  Specialties TEXT NOT NULL DEFAULT '',
  PhotoUrl TEXT NOT NULL DEFAULT '',
  IsActive INTEGER NOT NULL DEFAULT 1 CHECK (IsActive IN (0, 1)),
  PRIMARY KEY (Id),
  UNIQUE (TenantId, Id),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ProfessionalServices (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL,
  ProfessionalId TEXT NOT NULL,
  ServiceId TEXT NOT NULL,
  UNIQUE (TenantId, ProfessionalId, ServiceId),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE,
  FOREIGN KEY (TenantId, ProfessionalId) REFERENCES Professionals(TenantId, Id) ON DELETE CASCADE,
  FOREIGN KEY (TenantId, ServiceId) REFERENCES Services(TenantId, Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS WorkingHours (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL,
  ProfessionalId TEXT,
  DayOfWeek INTEGER NOT NULL CHECK (DayOfWeek >= 0 AND DayOfWeek <= 6),
  StartTime TEXT NOT NULL DEFAULT '09:00',
  EndTime TEXT NOT NULL DEFAULT '19:00',
  BreakStart TEXT,
  BreakEnd TEXT,
  IsAvailable INTEGER NOT NULL DEFAULT 1 CHECK (IsAvailable IN (0, 1)),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE,
  FOREIGN KEY (TenantId, ProfessionalId) REFERENCES Professionals(TenantId, Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Customers (
  Id TEXT NOT NULL,
  TenantId TEXT NOT NULL,
  Name TEXT NOT NULL,
  Phone TEXT NOT NULL,
  Email TEXT NOT NULL DEFAULT '',
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (Id),
  UNIQUE (TenantId, Id),
  UNIQUE (TenantId, Phone),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Appointments (
  Id TEXT NOT NULL,
  TenantId TEXT NOT NULL,
  CustomerId TEXT NOT NULL,
  ServiceId TEXT NOT NULL,
  ProfessionalId TEXT NOT NULL,
  StartAt TEXT NOT NULL,
  EndAt TEXT NOT NULL,
  Status TEXT NOT NULL DEFAULT 'confirmed' CHECK (Status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  PriceInCents INTEGER NOT NULL CHECK (PriceInCents >= 0),
  ConfirmationCode TEXT NOT NULL,
  Notes TEXT NOT NULL DEFAULT '',
  Source TEXT NOT NULL DEFAULT 'web' CHECK (Source IN ('web', 'admin', 'telegram', 'whatsapp')),
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (Id),
  UNIQUE (TenantId, Id),
  UNIQUE (TenantId, ConfirmationCode),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE,
  FOREIGN KEY (TenantId, CustomerId) REFERENCES Customers(TenantId, Id) ON DELETE RESTRICT,
  FOREIGN KEY (TenantId, ServiceId) REFERENCES Services(TenantId, Id) ON DELETE RESTRICT,
  FOREIGN KEY (TenantId, ProfessionalId) REFERENCES Professionals(TenantId, Id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS BlockedSlots (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL,
  ProfessionalId TEXT,
  StartAt TEXT NOT NULL,
  EndAt TEXT NOT NULL,
  Reason TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE,
  FOREIGN KEY (TenantId, ProfessionalId) REFERENCES Professionals(TenantId, Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS GalleryImages (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL,
  ImageUrl TEXT NOT NULL,
  Caption TEXT NOT NULL DEFAULT '',
  DisplayOrder INTEGER NOT NULL DEFAULT 0,
  IsActive INTEGER NOT NULL DEFAULT 1 CHECK (IsActive IN (0, 1)),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ChatbotConfigurations (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL,
  Provider TEXT NOT NULL CHECK (Provider IN ('telegram', 'whatsapp')),
  IsEnabled INTEGER NOT NULL DEFAULT 0 CHECK (IsEnabled IN (0, 1)),
  ConfigurationJson TEXT NOT NULL DEFAULT '{}',
  WelcomeMessage TEXT NOT NULL DEFAULT '',
  AwayMessage TEXT NOT NULL DEFAULT '',
  WebhookSecretHash TEXT NOT NULL DEFAULT '',
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (TenantId, Provider),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ChatSessions (
  Id TEXT NOT NULL,
  TenantId TEXT NOT NULL,
  Provider TEXT NOT NULL CHECK (Provider IN ('telegram', 'whatsapp', 'simulator')),
  ExternalUserId TEXT NOT NULL,
  CurrentState TEXT NOT NULL DEFAULT 'idle',
  ContextJson TEXT NOT NULL DEFAULT '{}',
  ExpiresAt TEXT NOT NULL,
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (Id),
  UNIQUE (TenantId, Id),
  UNIQUE (TenantId, Provider, ExternalUserId),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ChatMessages (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL,
  SessionId TEXT NOT NULL,
  Direction TEXT NOT NULL CHECK (Direction IN ('inbound', 'outbound')),
  Message TEXT NOT NULL,
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE,
  FOREIGN KEY (TenantId, SessionId) REFERENCES ChatSessions(TenantId, Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS NotificationLogs (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL,
  AppointmentId TEXT NOT NULL,
  Channel TEXT NOT NULL,
  NotificationType TEXT NOT NULL,
  Status TEXT NOT NULL,
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE,
  FOREIGN KEY (TenantId, AppointmentId) REFERENCES Appointments(TenantId, Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS BusinessSettings (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL,
  SettingKey TEXT NOT NULL,
  SettingValue TEXT NOT NULL,
  UNIQUE (TenantId, SettingKey),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS MediaAssets (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL,
  ObjectKey TEXT NOT NULL UNIQUE,
  ContentType TEXT NOT NULL,
  SizeBytes INTEGER NOT NULL,
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS PlatformSettings (
  SettingKey TEXT PRIMARY KEY,
  SettingValue TEXT NOT NULL,
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS SystemLogs (
  Id TEXT PRIMARY KEY,
  TenantId TEXT,
  Level TEXT NOT NULL CHECK (Level IN ('info', 'warn', 'error')),
  Source TEXT NOT NULL,
  Message TEXT NOT NULL,
  MetaJson TEXT NOT NULL DEFAULT '{}',
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Composite indexes for multi-tenant query performance
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON Tenants(Slug);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON Sessions(TokenHash);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON TenantUsers(UserId, TenantId);
CREATE INDEX IF NOT EXISTS idx_services_tenant_active ON Services(TenantId, IsActive);
CREATE INDEX IF NOT EXISTS idx_professionals_tenant_active ON Professionals(TenantId, IsActive);
CREATE INDEX IF NOT EXISTS idx_working_hours_tenant_prof_day ON WorkingHours(TenantId, ProfessionalId, DayOfWeek);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON Customers(TenantId, Phone);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_start ON Appointments(TenantId, StartAt);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_prof_start ON Appointments(TenantId, ProfessionalId, StartAt);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_customer ON Appointments(TenantId, CustomerId);
CREATE INDEX IF NOT EXISTS idx_blocked_slots_tenant_start ON BlockedSlots(TenantId, StartAt, EndAt);
CREATE INDEX IF NOT EXISTS idx_gallery_tenant_order ON GalleryImages(TenantId, DisplayOrder);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_tenant_ext ON ChatSessions(TenantId, Provider, ExternalUserId);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_session ON ChatMessages(TenantId, SessionId, CreatedAt);
CREATE INDEX IF NOT EXISTS idx_media_assets_tenant ON MediaAssets(TenantId, ObjectKey);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON SystemLogs(CreatedAt DESC);

-- Default global platform limits aligned with Cloudflare Free Tier safety
INSERT OR IGNORE INTO PlatformSettings (SettingKey, SettingValue) VALUES
  ('max_services_per_tenant', '50'),
  ('max_professionals_per_tenant', '25'),
  ('max_gallery_images_per_tenant', '30'),
  ('max_upload_size_bytes', '2097152'),
  ('allow_new_registrations', 'true'),
  ('maintenance_mode', 'false');
