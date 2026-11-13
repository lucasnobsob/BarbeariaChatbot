import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bot,
  Calendar,
  ExternalLink,
  Image,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Scissors,
  Settings,
  Shield,
  Users,
  UserCheck,
  X
} from 'lucide-react';
import { useAuth } from '@web/lib/authContext';

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/website', label: 'Personalizar meu site', icon: Palette },
  { to: '/admin/appointments', label: 'Agenda', icon: Calendar },
  { to: '/admin/services', label: 'Serviços', icon: Scissors },
  { to: '/admin/professionals', label: 'Profissionais', icon: UserCheck },
  { to: '/admin/customers', label: 'Clientes', icon: Users },
  { to: '/admin/gallery', label: 'Galeria', icon: Image },
  { to: '/admin/chatbot', label: 'Chatbot', icon: Bot },
  { to: '/admin/settings', label: 'Configurações', icon: Settings }
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-slate-900 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <Link to="/admin/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-sm font-bold text-white">Painel BarberSaaS</span>
              <span className="block text-[11px] text-slate-400">
                {user?.tenantSlug ? `/b/${user.tenantSlug}` : 'Administração'}
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="text-slate-400 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}

          {user?.isSuperAdmin && (
            <Link
              to="/superadmin"
              className="mt-4 flex items-center gap-3 rounded-xl border border-purple-500/30 bg-purple-950/30 px-3.5 py-2.5 text-sm font-medium text-purple-200 hover:bg-purple-900/40"
            >
              <Shield className="h-4 w-4" /> Superadmin
            </Link>
          )}
        </nav>

        <div className="border-t border-slate-800 p-4 space-y-2">
          {user?.tenantSlug && (
            <a
              href={`/b/${user.tenantSlug}${user.tenantStatus !== 'active' ? '?preview=1' : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-slate-700"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver Meu Site Público
            </a>
          )}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair ({user?.name})
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg border border-slate-700 p-2 text-slate-200"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-white">BarberSaaS Admin</span>
          <div className="w-9" />
        </header>

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
