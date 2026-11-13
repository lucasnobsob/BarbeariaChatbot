-- Seed de demonstração (Superadmin + Primeira Barbearia de Exemplo)
-- Execute com: npm run db:seed:local

-- Superadministrador padrão: admin@barbersaas.local / Admin@123456
INSERT OR IGNORE INTO Users (Id, Name, Email, PasswordHash, IsSuperAdmin, Status)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Superadministrador SaaS',
  'admin@barbersaas.local',
  'pbkdf2_sha256$100000$034ace85979954e73b637a78d81f2f5e$9671f810789173a57e2164f26a0685e41bcc60cd6dc4f80ed3b1391771c41d2e',
  1,
  'active'
);

-- Proprietário demo: demo@vintagebarber.local / Demo@123456
INSERT OR IGNORE INTO Users (Id, Name, Email, PasswordHash, IsSuperAdmin, Status)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  'Ricardo Almeida',
  'demo@vintagebarber.local',
  'pbkdf2_sha256$100000$5ba935a666835a97f0a9c17b7542d4c3$0528f0f0dcd29cb977ac2bda1b6385e1f482ef78819edfaf54e179a578463990',
  0,
  'active'
);

INSERT OR IGNORE INTO Tenants (Id, Name, Slug, Status)
VALUES (
  '11111111-1111-4000-8000-000000000001',
  'Barbearia Vintage Demo',
  'vintage-demo',
  'active'
);

INSERT OR IGNORE INTO TenantUsers (Id, TenantId, UserId, Role)
VALUES (
  '22222222-2222-4000-8000-000000000001',
  '11111111-1111-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'owner'
);

INSERT OR IGNORE INTO BusinessProfiles (
  Id, TenantId, BusinessName, Tagline, HeroSubtitle, Description, AboutText, FooterText,
  TemplateKey, PrimaryColor, SecondaryColor, AccentColor,
  Phone, WhatsAppNumber, Email, Instagram,
  PostalCode, Street, Number, Neighborhood, City, State, Latitude, Longitude
) VALUES (
  '33333333-3333-4000-8000-000000000001',
  '11111111-1111-4000-8000-000000000001',
  'Barbearia Vintage Demo',
  'Tradição, estilo e precisão na tesoura e navalha.',
  'Agende seu corte ou barba online em segundos.',
  'Barbearia clássica com atendimento personalizado, toalha quente e ambiente exclusivo.',
  'Fundada para resgatar a experiência clássica de cuidado masculino, unindo técnicas tradicionais de navalha com estilos contemporâneos.',
  'Barbearia Vintage Demo — Exemplo de estabelecimento multi-tenant.',
  'classic-luxury',
  '#d97706',
  '#0f172a',
  '#f59e0b',
  '(11) 99999-0000',
  '5511999990000',
  'contato@vintagebarber.local',
  '@vintagedemobarber',
  '01310-100',
  'Avenida Paulista',
  '1000',
  'Bela Vista',
  'São Paulo',
  'SP',
  -23.5649,
  -46.6519
);

INSERT OR IGNORE INTO BusinessSettings (Id, TenantId, SettingKey, SettingValue) VALUES
  ('44444444-4444-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', 'slot_interval_minutes', '30'),
  ('44444444-4444-4000-8000-000000000002', '11111111-1111-4000-8000-000000000001', 'min_advance_minutes', '30'),
  ('44444444-4444-4000-8000-000000000003', '11111111-1111-4000-8000-000000000001', 'max_advance_days', '30'),
  ('44444444-4444-4000-8000-000000000004', '11111111-1111-4000-8000-000000000001', 'allow_public_cancellation', 'true'),
  ('44444444-4444-4000-8000-000000000005', '11111111-1111-4000-8000-000000000001', 'timezone_offset_minutes', '-180');

INSERT OR IGNORE INTO WorkingHours (Id, TenantId, ProfessionalId, DayOfWeek, StartTime, EndTime, BreakStart, BreakEnd, IsAvailable) VALUES
  ('55555555-5555-4000-8000-000000000000', '11111111-1111-4000-8000-000000000001', NULL, 0, '09:00', '17:00', NULL, NULL, 0),
  ('55555555-5555-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', NULL, 1, '09:00', '19:00', '12:00', '13:00', 0),
  ('55555555-5555-4000-8000-000000000002', '11111111-1111-4000-8000-000000000001', NULL, 2, '09:00', '19:00', '12:00', '13:00', 1),
  ('55555555-5555-4000-8000-000000000003', '11111111-1111-4000-8000-000000000001', NULL, 3, '09:00', '19:00', '12:00', '13:00', 1),
  ('55555555-5555-4000-8000-000000000004', '11111111-1111-4000-8000-000000000001', NULL, 4, '09:00', '19:00', '12:00', '13:00', 1),
  ('55555555-5555-4000-8000-000000000005', '11111111-1111-4000-8000-000000000001', NULL, 5, '09:00', '20:00', '12:00', '13:00', 1),
  ('55555555-5555-4000-8000-000000000006', '11111111-1111-4000-8000-000000000001', NULL, 6, '09:00', '17:00', NULL, NULL, 1);

INSERT OR IGNORE INTO ServiceCategories (Id, TenantId, Name, Description, IsActive) VALUES
  ('66666666-6666-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', 'Cortes', 'Cortes masculinos clássicos e modernos', 1),
  ('66666666-6666-4000-8000-000000000002', '11111111-1111-4000-8000-000000000001', 'Barba', 'Cuidado completo com toalha quente', 1);

INSERT OR IGNORE INTO Services (Id, TenantId, CategoryId, Name, Description, PriceInCents, DurationMinutes, ImageUrl, IsActive) VALUES
  ('77777777-7777-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', '66666666-6666-4000-8000-000000000001', 'Corte Tradicional', 'Corte na tesoura e máquina com lavagem e finalização.', 5000, 45, '', 1),
  ('77777777-7777-4000-8000-000000000002', '11111111-1111-4000-8000-000000000001', '66666666-6666-4000-8000-000000000002', 'Barba com Toalha Quente', 'Alinhamento, navalha e hidratação pós-barba.', 4000, 30, '', 1),
  ('77777777-7777-4000-8000-000000000003', '11111111-1111-4000-8000-000000000001', '66666666-6666-4000-8000-000000000001', 'Combo Corte + Barba', 'Pacote completo com acabamento premium.', 8000, 60, '', 1);

INSERT OR IGNORE INTO Professionals (Id, TenantId, Name, Description, Specialties, PhotoUrl, IsActive) VALUES
  ('88888888-8888-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', 'Ricardo Almeida', 'Master barber com 10 anos de experiência.', 'Corte Clássico, Navalha, Degradê', '', 1),
  ('88888888-8888-4000-8000-000000000002', '11111111-1111-4000-8000-000000000001', 'Lucas Ferreira', 'Especialista em visagismo e barboterapia.', 'Barba, Degradê, Sobrancelha', '', 1);

INSERT OR IGNORE INTO ProfessionalServices (Id, TenantId, ProfessionalId, ServiceId) VALUES
  ('99999999-9999-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', '88888888-8888-4000-8000-000000000001', '77777777-7777-4000-8000-000000000001'),
  ('99999999-9999-4000-8000-000000000002', '11111111-1111-4000-8000-000000000001', '88888888-8888-4000-8000-000000000001', '77777777-7777-4000-8000-000000000002'),
  ('99999999-9999-4000-8000-000000000003', '11111111-1111-4000-8000-000000000001', '88888888-8888-4000-8000-000000000001', '77777777-7777-4000-8000-000000000003'),
  ('99999999-9999-4000-8000-000000000004', '11111111-1111-4000-8000-000000000001', '88888888-8888-4000-8000-000000000002', '77777777-7777-4000-8000-000000000001'),
  ('99999999-9999-4000-8000-000000000005', '11111111-1111-4000-8000-000000000001', '88888888-8888-4000-8000-000000000002', '77777777-7777-4000-8000-000000000002');
