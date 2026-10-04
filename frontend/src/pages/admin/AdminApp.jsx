import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { StaffBar } from '../../components/Layouts.jsx';
import AdminOrders from './AdminOrders.jsx';
import AdminRiders from './AdminRiders.jsx';
import AdminKiosks from './AdminKiosks.jsx';
import AdminBranding from './AdminBranding.jsx';
import AdminMenu from './AdminMenu.jsx';
import AdminSettings from './AdminSettings.jsx';

const LINKS = [
  { to: 'orders', label: 'Orders' },
  { to: 'menu', label: 'Menu' },
  { to: 'riders', label: 'Riders' },
  { to: 'kiosks', label: 'Kiosks' },
  { to: 'branding', label: 'Site images' },
  { to: 'settings', label: 'Employee passwords' },
];

export default function AdminApp() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-cream">
      <StaffBar
        title="Admin"
        onLogout={async () => {
          await logout();
          navigate('/');
        }}
      />
      <div className="mx-auto max-w-[1300px] gap-6 p-4 md:grid md:grid-cols-[210px_1fr]">
        <nav className="scroll-thin mb-4 flex gap-2 overflow-x-auto md:mb-0 md:flex-col md:self-start">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `shrink-0 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                  isActive ? 'bg-ink text-cream' : 'bg-paper text-ink-soft hover:text-ink'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0">
          <Routes>
            <Route index element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="menu" element={<AdminMenu />} />
            <Route path="riders" element={<AdminRiders />} />
            <Route path="kiosks" element={<AdminKiosks />} />
            <Route path="branding" element={<AdminBranding />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="*" element={<Navigate to="orders" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
