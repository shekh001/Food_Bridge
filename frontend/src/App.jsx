import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import NotificationToast from './components/NotificationToast.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { useAuth } from './context/AuthContext.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import Browse from './pages/Browse.jsx';
import NeedsBoard from './pages/NeedsBoard.jsx';
import Impact from './pages/Impact.jsx';
import ListingDetail from './pages/ListingDetail.jsx';
import DonorDashboard from './pages/DonorDashboard.jsx';
import NGODashboard from './pages/NGODashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import Terms from './pages/Terms.jsx';
import Privacy from './pages/Privacy.jsx';

// Dashboard routes render their own full-page sidebar shell
// (components/DashboardShell.jsx) — a data workspace and a marketing site
// want different chrome, so the marketing Navbar/Footer step aside here
// rather than stacking on top of a second nav.
const DASHBOARD_PATHS = ['/donor', '/ngo', '/admin'];

function Shell({ children }) {
  const location = useLocation();
  const isDashboard = DASHBOARD_PATHS.some((p) => location.pathname.startsWith(p));

  if (isDashboard) {
    return (
      <div className="font-body">
        {children}
        <NotificationToast />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-body">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <NotificationToast />
    </div>
  );
}

export default function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="w-8 h-8 border-2 border-line border-t-rescue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <SocketProvider>
      <Shell>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/needs" element={<NeedsBoard />} />
          <Route path="/impact" element={<Impact />} />
          <Route path="/listings/:id" element={<ListingDetail />} />
          <Route path="/donor" element={<ProtectedRoute roles={['donor']}><DonorDashboard /></ProtectedRoute>} />
          <Route path="/ngo" element={<ProtectedRoute roles={['ngo']}><NGODashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        </Routes>
      </Shell>
    </SocketProvider>
  );
}
