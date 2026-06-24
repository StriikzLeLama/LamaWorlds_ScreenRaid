import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { AuthLayout } from './components/layout/AuthLayout';
import { ConsentGate } from './components/ConsentGate';
import { useAuthStore } from './stores/authStore';
import { useConsentStore } from './stores/consentStore';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { RoomsPage } from './pages/RoomsPage';
import { FriendsPage } from './pages/FriendsPage';
import { MediaLibraryPage } from './pages/MediaLibraryPage';
import { SettingsPage } from './pages/SettingsPage';
import { RoomPage } from './pages/RoomPage';
import { AdminPage } from './pages/AdminPage';
import { useWebSocket } from './hooks/useWebSocket';
import { usePanicHotkey } from './hooks/usePanicHotkey';
import { usePrankReceiver } from './hooks/usePrankReceiver';
import { useMonitorSync } from './hooks/useMonitorSync';
import { useAdminBootstrap } from './hooks/useAdminBootstrap';

function WsProvider({ children }: { children: React.ReactNode }) {
  useWebSocket();
  usePanicHotkey();
  usePrankReceiver();
  useMonitorSync();
  useAdminBootstrap();
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const globalConsent = useConsentStore((s) => s.globalConsent);
  const consentPromptSeen = useConsentStore((s) => s.consentPromptSeen);
  const showConsentGate = isAuthenticated && !globalConsent && !consentPromptSeen;

  return (
    <BrowserRouter>
      <ConsentGate open={showConsentGate} />
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        </Route>
        <Route
          element={
            <ProtectedRoute>
              <WsProvider>
                <MainLayout />
              </WsProvider>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/rooms/:id" element={<RoomPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/media" element={<MediaLibraryPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
