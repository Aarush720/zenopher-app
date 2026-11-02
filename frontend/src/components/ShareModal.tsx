import React, { useEffect, useState } from 'react';
import { Check, Copy, Link2, Mail, Share2, X } from 'lucide-react';
import { ApiShare } from '../services/api';

interface ShareModalProps {
  isOpen: boolean;
  designTitle: string;
  onClose: () => void;
  onCreateShare: (input: { kind: 'link' | 'user'; permission: 'view' | 'comment'; expiresInDays?: number; email?: string }) => Promise<{ token?: string; url?: string }>;
  onListShares: () => Promise<ApiShare[]>;
  onRevokeShare: (shareId: string) => Promise<void>;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  designTitle,
  onClose,
  onCreateShare,
  onListShares,
  onRevokeShare,
}) => {
  const [kind, setKind] = useState<'link' | 'user'>('link');
  const [permission, setPermission] = useState<'view' | 'comment'>('view');
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(30);
  const [email, setEmail] = useState('');
  const [shares, setShares] = useState<ApiShare[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setShareUrl(null);
    setCopied(false);
    setError(null);
    void onListShares().then(setShares).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : 'Could not load sharing settings.');
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsWorking(true);
    try {
      const created = await onCreateShare({ kind, permission, expiresInDays, email: kind === 'user' ? email.trim() : undefined });
      if (created.url) setShareUrl(created.url);
      setShares(await onListShares());
      if (kind === 'user') setEmail('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create the share.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleRevoke = async (shareId: string) => {
    setError(null);
    try {
      await onRevokeShare(shareId);
      setShares((current) => current.map((share) => share.id === shareId ? { ...share, revoked_at: Math.floor(Date.now() / 1000) } : share));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not revoke the share.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-modal-title" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Share2 size={18} />
            <h2 id="share-modal-title" style={{ fontSize: '18px', fontWeight: 700 }}>Share design</h2>
          </div>
          <button className="btn-square" style={{ width: '36px', height: '36px' }} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Create access for <strong style={{ color: 'var(--text)' }}>{designTitle}</strong>. Link tokens are shown once and can be revoked below.
          </p>

          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button type="button" className={kind === 'link' ? 'selected' : ''} onClick={() => setKind('link')} style={{ height: '38px', gap: '6px', fontSize: '12px' }}>
                <Link2 size={14} /> Link access
              </button>
              <button type="button" className={kind === 'user' ? 'selected' : ''} onClick={() => setKind('user')} style={{ height: '38px', gap: '6px', fontSize: '12px' }}>
                <Mail size={14} /> Invite by email
              </button>
            </div>
            {kind === 'user' && (
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="viewer@example.com" />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Permission
                <select value={permission} onChange={(event) => setPermission(event.target.value as 'view' | 'comment')} style={{ marginTop: '5px' }}>
                  <option value="view">View only</option>
                  <option value="comment">Can comment</option>
                </select>
              </label>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Expires
                <select value={expiresInDays ?? ''} onChange={(event) => setExpiresInDays(event.target.value ? Number(event.target.value) : undefined)} style={{ marginTop: '5px' }}>
                  <option value="">Never</option>
                  <option value="7">In 7 days</option>
                  <option value="30">In 30 days</option>
                  <option value="365">In 1 year</option>
                </select>
              </label>
            </div>
            <button className="primary" type="submit" disabled={isWorking} style={{ height: '40px', gap: '7px' }}>
              {kind === 'link' ? <Link2 size={15} /> : <Mail size={15} />}
              {isWorking ? 'Creating…' : kind === 'link' ? 'Create share link' : 'Send invitation'}
            </button>
          </form>

          {shareUrl && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--container)', borderRadius: 'var(--radius-control)', padding: '10px' }}>
              <input readOnly value={shareUrl} aria-label="Share link" style={{ minWidth: 0, flex: 1, fontSize: '11px' }} />
              <button onClick={handleCopy} style={{ height: '34px', minWidth: '34px', padding: '0 9px', gap: '5px' }} title="Copy link">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span style={{ fontSize: '11px' }}>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          )}

          {error && <p style={{ fontSize: '12px', color: '#F87171' }}>{error}</p>}

          {shares.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700 }}>Existing access</span>
              {shares.map((share) => (
                <div key={share.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--container)', borderRadius: 'var(--radius-control)', padding: '9px 10px', opacity: share.revoked_at ? 0.5 : 1 }}>
                  <span style={{ flex: 1, fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {share.kind === 'link' ? 'Share link' : share.grantee_email || 'Invited user'} · {share.permission}
                  </span>
                  {!share.revoked_at && <button onClick={() => void handleRevoke(share.id)} style={{ height: '28px', padding: '0 8px', fontSize: '10px' }}>Revoke</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
