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
import { WebSettingsPage } from './pages/WebSettingsPage';
import { RoomPage } from './pages/RoomPage';
import { AdminPage } from './pages/AdminPage';
import { JoinInvitePage } from './pages/JoinInvitePage';
import { useWebSocket } from './hooks/useWebSocket';
import { useAdminBootstrap } from './hooks/useAdminBootstrap';
import { useSessionBootstrap } from './hooks/useSessionBootstrap';

/** Web dashboard — rooms, friends, media, admin. Served by the server at `/`. */
function WebWsProvider({ children }: { children: React.ReactNode }) {
  useSessionBootstrap();
  useWebSocket();
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
  if (isAuthenticated) {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next?.startsWith('/')) return <Navigate to={next} replace />;
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function AppWeb() {
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
        <Route path="/join" element={<JoinInvitePage />} />
        <Route
          element={
            <ProtectedRoute>
              <WebWsProvider>
                <MainLayout />
              </WebWsProvider>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/rooms/:id" element={<RoomPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/media" element={<MediaLibraryPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/settings" element={<WebSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
