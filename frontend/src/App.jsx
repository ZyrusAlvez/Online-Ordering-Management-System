import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { CustomerLayout } from './components/Layouts.jsx';
import { RequireRole } from './components/guards.jsx';
import { ADMIN_ROLES } from './context/AuthContext.jsx';
import { PageLoader } from './components/ui.jsx';
import Landing from './pages/Landing.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Menu from './pages/customer/Menu.jsx';
import Checkout from './pages/customer/Checkout.jsx';
import Orders from './pages/customer/Orders.jsx';
import Profile from './pages/customer/Profile.jsx';
import OrderDetail from './pages/customer/OrderDetail.jsx';
import PaymentResult from './pages/customer/PaymentResult.jsx';

// Staff surfaces are code-split so customers never download the POS/admin bundle.
const CashierApp = lazy(() => import('./pages/cashier/CashierApp.jsx'));
const KioskApp = lazy(() => import('./pages/kiosk/KioskApp.jsx'));
const Driver = lazy(() => import('./pages/driver/Driver.jsx'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp.jsx'));

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route element={<CustomerLayout />}>
        <Route path="/menu" element={<Menu />} />
        <Route
          path="/checkout"
          element={
            <RequireRole roles={['customer']}>
              <Checkout />
            </RequireRole>
          }
        />
        <Route
          path="/orders"
          element={
            <RequireRole roles={['customer']}>
              <Orders />
            </RequireRole>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <RequireRole roles={['customer']}>
              <OrderDetail />
            </RequireRole>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireRole roles={['customer']}>
              <Profile />
            </RequireRole>
          }
        />
        <Route path="/payment-result" element={<PaymentResult />} />
      </Route>

      {/* Employee-only surfaces. /cashier and /kiosk handle their own password gate. */}
      <Route path="/cashier/*" element={<CashierApp />} />
      <Route path="/kiosk/*" element={<KioskApp />} />
      <Route
        path="/driver"
        element={
          <RequireRole roles={['rider']}>
            <Driver />
          </RequireRole>
        }
      />
      <Route
        path="/admin/*"
        element={
          <RequireRole roles={ADMIN_ROLES}>
            <AdminApp />
          </RequireRole>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
