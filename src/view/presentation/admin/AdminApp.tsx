'use client';

import { NavLink, Navigate, useNavigate } from '@/utils/navigation';
import { useAuth } from '@/context/AuthContext';
import { StaffBar } from '@/view/components/Layouts';
import { BranchPicker, StaffBranchProvider, useStaffBranch } from '@/view/components/StaffBranch';

// `superOnly` pages manage what every branch shares.
const LINKS = [
  { to: 'sales', label: 'Sales' },
  { to: 'orders', label: 'Orders' },
  { to: 'menu', label: 'Menu' },
  { to: 'riders', label: 'Riders' },
  { to: 'kiosks', label: 'Kiosks' },
  { to: 'settings', label: 'Employee passwords' },
  { to: 'branches', label: 'Branches', superOnly: true },
  { to: 'admins', label: 'Admins', superOnly: true },
  { to: 'branding', label: 'Site images', superOnly: true },
];

// Remembered per browser, so an admin of several branches comes back to the one they were on.
export default function AdminApp({ children }: { children: React.ReactNode }) {
  return (
    <StaffBranchProvider storageKey="3k.adminBranch" allowAll>
      <AdminShell>{children}</AdminShell>
    </StaffBranchProvider>
  );
}

/** Wraps the pages that manage what every branch shares; a branch admin is sent to Sales. */
export function SuperOnly({ children }: { children: React.ReactNode }) {
  const { isSuper } = useStaffBranch();
  return isSuper ? <>{children}</> : <Navigate to="/admin/sales" replace />;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { isSuper, branch, branches } = useStaffBranch();
  const links = LINKS.filter((l) => isSuper || !l.superOnly);

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
              to={`/admin/${l.to}`}
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
          {children}
        </main>
      </div>
    </div>
  );
}
