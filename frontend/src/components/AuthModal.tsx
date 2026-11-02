import React, { useEffect, useState } from 'react';
import { Check, Mail, X } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestMagicLink: (email: string) => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onRequestMagicLink }) => {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSent(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSending(true);
    try {
      await onRequestMagicLink(email.trim());
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not send the sign-in link.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h2 id="auth-modal-title" style={{ fontSize: '18px', fontWeight: 700 }}>Sign in to Zenopher</h2>
          <button className="btn-square" style={{ width: '36px', height: '36px' }} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {sent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4ADE80', fontWeight: 700 }}>
                <Check size={18} /> Link sent
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Check {email} and open the link on this device to finish signing in.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Sign in to sync designs, use sharing, and keep your account controls available across devices.
              </p>
              <label style={{ fontSize: '13px', fontWeight: 700 }}>
                Email address
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  style={{ marginTop: '8px' }}
                />
              </label>
              {error && <p style={{ fontSize: '12px', color: '#F87171' }}>{error}</p>}
              <button className="primary" type="submit" disabled={isSending} style={{ height: '44px', gap: '8px' }}>
                <Mail size={16} />
                {isSending ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
