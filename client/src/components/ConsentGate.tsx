import { ShieldCheck, ShieldOff } from 'lucide-react';
import { Modal, Button } from '../components/ui';
import { useConsentStore } from '../stores/consentStore';
import { ApiError } from '../services/api';
import { useState } from 'react';

interface ConsentGateProps {
  open: boolean;
}

export function ConsentGate({ open }: ConsentGateProps) {
  const grant = useConsentStore((s) => s.grant);
  const dismissPrompt = useConsentStore((s) => s.dismissPrompt);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGrant = async () => {
    setError('');
    setLoading(true);
    try {
      await grant();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save consent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} title="Consent Required" closable={false}>
      <div className="space-y-4">
        <p className="text-sm text-raid-text-secondary">
          ScreenRaid is a consent-based platform. Before you can receive visual or audio overlays
          from friends, you must explicitly opt in. You can revoke consent or use the Panic button
          at any time to stop all overlays instantly.
        </p>
        <ul className="space-y-2 text-sm text-raid-text-secondary">
          <li className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-raid-success" />
            You control when you receive content
          </li>
          <li className="flex items-center gap-2">
            <ShieldOff size={16} className="text-raid-danger" />
            Panic hides everything immediately
          </li>
        </ul>
        {error && (
          <p className="text-sm text-raid-danger">{error}</p>
        )}
        <div className="flex gap-3 pt-2">
          <Button className="flex-1" onClick={handleGrant} disabled={loading}>
            {loading ? 'Saving…' : 'I consent to receive overlays'}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={dismissPrompt}>
            Decline (limited mode)
          </Button>
        </div>
      </div>
    </Modal>
  );
}
