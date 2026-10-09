import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { StaffBar } from '../../components/Layouts.jsx';
import { BranchPicker, StaffBranchProvider, useStaffBranch } from '../../components/StaffBranch.jsx';
import AdminOrders from './AdminOrders.jsx';
import AdminSales from './AdminSales.jsx';
import AdminRiders from './AdminRiders.jsx';
import AdminKiosks from './AdminKiosks.jsx';
import AdminBranding from './AdminBranding.jsx';
import AdminMenu from './AdminMenu.jsx';
import AdminSettings from './AdminSettings.jsx';
import AdminAdmins from './AdminAdmins.jsx';
import AdminBranches from './AdminBranches.jsx';

// `superOnly` pages manage what every branch shares.
const LINKS = [
  { to: 'sales', label: 'Sales' },
  { to: 'orders', label: 'Orders' },
  { to: 'menu', label: 'Menu', superOnly: true },
  { to: 'riders', label: 'Riders' },
  { to: 'kiosks', label: 'Kiosks' },
  { to: 'settings', label: 'Employee passwords' },
  { to: 'branches', label: 'Branches', superOnly: true },
  { to: 'admins', label: 'Admins', superOnly: true },
  { to: 'branding', label: 'Site images', superOnly: true },
];

// Remembered per browser, so an admin of several branches comes back to the one they were on.
export default function AdminApp() {
  return (
    <StaffBranchProvider storageKey="3k.adminBranch" allowAll>
      <AdminShell />
    </StaffBranchProvider>
  );
}

function AdminShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { isSuper, branch, branches } = useStaffBranch();
  const links = LINKS.filter((l) => isSuper || !l.superOnly);
  const superRoute = (element) => (isSuper ? element : <Navigate to="../sales" replace />);

  return (
    <div className="min-h-screen bg-cream">
      <StaffBar
        title={isSuper ? 'Super admin' : 'Admin'}
        subtitle={branch?.name ?? (isSuper ? 'All branches' : branches.length ? `${branches.length} branches` : undefined)}
        onLogout={async () => {
          await logout();
          navigate('/');
        }}
      >
        <BranchPicker />
      </StaffBar>
      <div className="mx-auto max-w-[1300px] gap-6 p-4 md:grid md:grid-cols-[210px_1fr]">
        <nav className="scroll-thin mb-4 flex gap-2 overflow-x-auto md:mb-0 md:flex-col md:self-start">
          {links.map((l) => (
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
            <Route index element={<Navigate to="sales" replace />} />
            <Route path="sales" element={<AdminSales />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="menu" element={superRoute(<AdminMenu />)} />
            <Route path="riders" element={<AdminRiders />} />
            <Route path="kiosks" element={<AdminKiosks />} />
            <Route path="branding" element={superRoute(<AdminBranding />)} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="admins" element={superRoute(<AdminAdmins />)} />
            <Route path="branches" element={superRoute(<AdminBranches />)} />
            <Route path="*" element={<Navigate to="sales" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
