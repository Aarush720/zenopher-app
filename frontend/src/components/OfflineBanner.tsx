import React, { useState, useEffect } from 'react';
import { CloudOff, WifiOff } from 'lucide-react';

interface OfflineBannerProps {
  backendStatus?: 'disabled' | 'checking' | 'online' | 'offline';
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ backendStatus = 'disabled' }) => {
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showBackendNotice = backendStatus === 'offline' && !isOffline;
  if (!isOffline && !showBackendNotice) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--container)',
        color: 'var(--text)',
        padding: '12px 20px',
        borderRadius: 'var(--radius-pill)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '13px',
        fontWeight: 500,
        zIndex: 2000,
        border: 'none',
        boxShadow: 'none',
      }}
      role="status"
    >
      {isOffline ? <WifiOff size={16} color="var(--text-secondary)" /> : <CloudOff size={16} color="var(--text-secondary)" />}
      <span>{isOffline ? 'You’re offline. Your designs are still being saved on this device.' : 'The cloud backend is unavailable. Your designs are still being saved on this device.'}</span>
    </div>
  );
};

