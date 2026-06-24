import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ReceiverLayout } from './components/layout/ReceiverLayout';
import { AuthLayout } from './components/layout/AuthLayout';
import { ConsentGate } from './components/ConsentGate';
import { useAuthStore } from './stores/authStore';
import { useConsentStore } from './stores/consentStore';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ReceiverHomePage } from './pages/receiver/ReceiverHomePage';
import { ReceiverSettingsPage } from './pages/receiver/ReceiverSettingsPage';
import { useWebSocket } from './hooks/useWebSocket';
import { usePanicHotkey } from './hooks/usePanicHotkey';
import { usePrankReceiver } from './hooks/usePrankReceiver';
import { useMonitorSync } from './hooks/useMonitorSync';

/** Tauri receiver — overlays, panic, monitor sync only. */
function ReceiverWsProvider({ children }: { children: React.ReactNode }) {
  useWebSocket();
  usePanicHotkey();
  usePrankReceiver();
  useMonitorSync();
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

export function AppReceiver() {
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
              <ReceiverWsProvider>
                <ReceiverLayout />
              </ReceiverWsProvider>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<ReceiverHomePage />} />
          <Route path="/settings" element={<ReceiverSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
