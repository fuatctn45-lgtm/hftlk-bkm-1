import React from 'react';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:left-4 sm:right-auto z-50 flex items-center justify-between sm:justify-start gap-2.5 rounded-xl bg-amber-500 text-black px-3.5 py-2 text-xs font-black shadow-2xl border border-amber-400">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-black animate-ping" />
        <WifiOff className="w-4 h-4 shrink-0 text-black" />
        <span>Çevrimdışı Mod — Önbellekteki verilerle çalışıyorsunuz.</span>
      </div>
    </div>
  );
};
