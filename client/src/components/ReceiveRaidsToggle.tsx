import { useState } from 'react';
import { Toggle } from './ui';
import { useConsentStore } from '../stores/consentStore';

interface Props {
  className?: string;
  /** Compact layout for the receiver home card. */
  compact?: boolean;
}

/**
 * Single On/Off control for receiving overlays.
 * On → grant (+ resume if paused). Off → revoke (full opt-out).
 * Panic still uses pause separately and can leave receiving “off” until resumed via this toggle.
 */
export function ReceiveRaidsToggle({ className = '', compact = false }: Props) {
  const { globalConsent, isPaused, grant, revoke, resume } = useConsentStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Receiving is only active when consented and not panic-paused.
  const receiving = globalConsent && !isPaused;

  const setReceiving = async (next: boolean) => {
    setBusy(true);
    setError('');
    try {
      if (next) {
        if (!globalConsent) await grant();
        if (isPaused) await resume();
      } else {
        await revoke();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update receiving');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <Toggle
        checked={receiving}
        disabled={busy}
        onChange={(v) => void setReceiving(v)}
        label="Receive raids"
        description={
          compact
            ? receiving
              ? 'Overlays can appear on your screen'
              : 'Overlays are blocked'
            : receiving
              ? 'Friends in your rooms can send overlays to your desktop receiver.'
              : 'Turn on to allow overlays on your screen. Panic still clears them instantly.'
        }
      />
      {error && <p className="mt-2 text-xs text-raid-danger">{error}</p>}
    </div>
  );
}
