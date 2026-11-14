import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@web/lib/authContext';
import { LandingPage } from '@web/pages/LandingPage';
import { LoginPage } from '@web/pages/LoginPage';
import { RegisterPage } from '@web/pages/RegisterPage';
import { OnboardingWizard } from '@web/pages/OnboardingWizard';
import { BarbershopPublicPage } from '@web/pages/BarbershopPublicPage';
import {
  DataDeletionPage,
  PrivacyPolicyPage,
  TermsOfServicePage
} from '@web/pages/LegalPages';
import { AdminLayout } from '@web/components/AdminLayout';
import { AdminDashboard } from '@web/pages/admin/AdminDashboard';
import { AdminWebsitePage } from '@web/pages/admin/AdminWebsitePage';
import { AdminServicesPage } from '@web/pages/admin/AdminServicesPage';
import { AdminProfessionalsPage } from '@web/pages/admin/AdminProfessionalsPage';
import { AdminAppointmentsPage } from '@web/pages/admin/AdminAppointmentsPage';
import { AdminCustomersPage } from '@web/pages/admin/AdminCustomersPage';
import { AdminGalleryPage } from '@web/pages/admin/AdminGalleryPage';
import { AdminChatbotPage } from '@web/pages/admin/AdminChatbotPage';
import { AdminBillingPage } from '@web/pages/admin/AdminBillingPage';
import { AdminSettingsPage } from '@web/pages/admin/AdminSettingsPage';
import {
  SuperAdminBillingPage,
  SuperAdminLayout,
  SuperAdminLogsPage,
  SuperAdminOverviewPage,
  SuperAdminSettingsPage,
  SuperAdminTenantsPage,
  SuperAdminUsersPage
} from '@web/pages/superadmin/SuperAdminPages';

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm text-slate-400">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireTenant() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm text-slate-400">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.tenantId) return <Navigate to="/admin/onboarding" replace />;
  return <Outlet />;
}

function RequireSuperAdmin() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm text-slate-400">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isSuperAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

function AdminIndexRedirect() {
  const { user } = useAuth();
  if (!user?.tenantId) return <Navigate to="/admin/onboarding" replace />;
  return <Navigate to="/admin/dashboard" replace />;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Área pública */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/privacidade" element={<PrivacyPolicyPage />} />
        <Route path="/termos" element={<TermsOfServicePage />} />
        <Route path="/exclusao-de-dados" element={<DataDeletionPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/b/:slug" element={<BarbershopPublicPage />} />
        <Route path="/b/:slug/services" element={<BarbershopPublicPage />} />
        <Route path="/b/:slug/gallery" element={<BarbershopPublicPage />} />
        <Route path="/b/:slug/booking" element={<BarbershopPublicPage />} />
        <Route path="/b/:slug/location" element={<BarbershopPublicPage />} />

        {/* Onboarding */}
        <Route element={<RequireAuth />}>
          <Route path="/admin/onboarding" element={<OnboardingWizard />} />
          <Route path="/admin" element={<AdminIndexRedirect />} />
        </Route>

        {/* Área administrativa da barbearia */}
        <Route element={<RequireTenant />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="website" element={<AdminWebsitePage />} />
            <Route path="services" element={<AdminServicesPage />} />
            <Route path="professionals" element={<AdminProfessionalsPage />} />
            <Route path="appointments" element={<AdminAppointmentsPage />} />
            <Route path="customers" element={<AdminCustomersPage />} />
            <Route path="gallery" element={<AdminGalleryPage />} />
            <Route path="chatbot" element={<AdminChatbotPage />} />
            <Route path="billing" element={<AdminBillingPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Route>

        {/* Superadministrador */}
        <Route element={<RequireSuperAdmin />}>
          <Route path="/superadmin" element={<SuperAdminLayout />}>
            <Route index element={<SuperAdminOverviewPage />} />
            <Route path="tenants" element={<SuperAdminTenantsPage />} />
            <Route path="billing" element={<SuperAdminBillingPage />} />
            <Route path="users" element={<SuperAdminUsersPage />} />
            <Route path="settings" element={<SuperAdminSettingsPage />} />
            <Route path="logs" element={<SuperAdminLogsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
export default App;
