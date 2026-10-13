import React, { useState, useRef, useEffect } from 'react';
import { AkgLogo } from './AkgLogo';
import { UserSession } from '../types/cmms';
import { uploadQueueService, QueuedRecord } from '../services/uploadQueue';
import { UploadQueueModal } from './UploadQueueModal';
import {
  Menu,
  X,
  ChevronDown,
  Home,
  Wrench,
  BarChart3,
  AlertTriangle,
  Settings,
  LogOut,
  RefreshCw,
  User,
  Shield,
  Check,
  Download,
  Activity,
  Layers,
  FileSpreadsheet,
  ArrowRight,
  CloudUpload,
} from 'lucide-react';

interface HeaderProps {
  currentScreen: 'home' | 'operator' | 'redList' | 'reports' | 'admin';
  onNavigate: (screen: 'home' | 'operator' | 'redList' | 'reports' | 'admin') => void;
  user: UserSession | null;
  redCount: number;
  onRequestLogout: () => void;
  onSync?: () => void;
  syncing?: boolean;
  lastSyncTime?: string;
  machinesCount?: number;
  recordsCount?: number;
}

// Kısa isim formatlayıcı (Örn: "Fuat Çetin" -> "F.Çetin")
export function formatShortOperatorName(name?: string): string {
  if (!name) return 'Operatör';
  const clean = name.trim();
  const parts = clean.split(/\s+/);
  if (parts.length < 2) return clean;
  const firstInitial = parts[0].charAt(0).toUpperCase();
  const lastName = parts
    .slice(1)
    .map((p) => (p.length ? p.charAt(0).toUpperCase() + p.slice(1).toLocaleLowerCase('tr-TR') : ''))
    .join(' ');
  return `${firstInitial}.${lastName}`;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  onNavigate,
  user,
  redCount,
  onRequestLogout,
  onSync,
  syncing = false,
  lastSyncTime,
  machinesCount = 0,
  recordsCount = 0,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [queue, setQueue] = useState<QueuedRecord[]>(() => uploadQueueService.getQueue());
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to real-time background upload queue
  useEffect(() => {
    return uploadQueueService.subscribe((updated) => {
      setQueue(updated);
    });
  }, []);

  const isAdmin = String(user?.role || '').toLowerCase().includes('admin');
  const operatorName = user?.operator || user?.name || user?.fullName || 'Operatör';

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const handleSelectNav = (screen: 'home' | 'operator' | 'redList' | 'reports' | 'admin') => {
    onNavigate(screen);
    setDropdownOpen(false);
  };

  const handleHardRefresh = () => {
    try {
      localStorage.removeItem('cmmsLiveMachines_v5');
      localStorage.removeItem('cmmsLiveTemplates_v5');
      localStorage.removeItem('cmmsLiveRecords_v5');
      sessionStorage.clear();
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) caches.delete(name);
        });
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) reg.unregister();
        });
      }
    } catch {}
    window.location.href = window.location.origin + window.location.pathname + '?_t=' + Date.now();
  };

  const navItems = [
    {
      id: 'home' as const,
      label: 'Ana Sayfa',
      desc: 'Haftalık makine bakım durumu ve KPI göstergeleri',
      icon: Home,
      color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    },
    {
      id: 'redList' as const,
      label: 'RED Arıza Takibi',
      desc: 'Kritik uygunsuzluklar ve çözüm yönetimi',
      icon: AlertTriangle,
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
      badge: redCount > 0 ? `${redCount}` : undefined,
    },
    {
      id: 'reports' as const,
      label: 'Raporlar & Analitik',
      desc: 'Haftalık istatistikler, Excel ve PDF raporlama',
      icon: BarChart3,
      color: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    },
    ...(isAdmin
      ? [
          {
            id: 'admin' as const,
            label: 'Yönetim & Şema Paneli',
            desc: 'Kontrol maddeleri, birimler ve şema ayarları',
            icon: Settings,
            color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
          },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#152033]/95 text-white shadow-xl border-b border-yellow-500/30 backdrop-blur-md print:hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand Identity & Active Operator */}
        <div
          onClick={() => handleSelectNav('home')}
          className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group select-none shrink-0"
        >
          <div className="bg-yellow-400 text-black rounded-lg px-1.5 py-0.5 shadow-xs group-hover:scale-102 transition-transform shrink-0 border border-yellow-300 flex items-center justify-center">
            <AkgLogo size="xs" />
          </div>
          {/* Operator name (Kısa format: F.Çetin) */}
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shrink-0" />
            <span className="font-bold text-white tracking-wide" title={operatorName}>
              {formatShortOperatorName(operatorName)}
            </span>
            {isAdmin && (
              <span className="bg-yellow-400 text-black font-black text-[8px] px-1 py-0.5 rounded uppercase tracking-wider shrink-0 leading-none">
                YÖNETİCİ
              </span>
            )}
          </div>
        </div>

        {/* Right: Quick Action Controls + Modern Sarı-Siyah Açılır Menü */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Direct Red Warning Quick Button if any active defects */}
          {redCount > 0 && (
            <button
              type="button"
              onClick={() => handleSelectNav('redList')}
              title={`${redCount} açık arıza kaydı var`}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] sm:text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer animate-pulse"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{redCount} RED</span>
            </button>
          )}

          {/* AppSheet Tarzı Bekleyen Kayıtlar Rozeti: (3) */}
          {queue.length > 0 && (
            <button
              type="button"
              onClick={() => setQueueModalOpen(true)}
              title={`${queue.length} kayıt arka planda yükleniyor - Tıklayıp listeyi görün`}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-300 border border-yellow-400/60 text-xs sm:text-sm font-black transition-all shadow-md active:scale-95 cursor-pointer animate-pulse"
            >
              <CloudUpload className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
              <span>({queue.length})</span>
            </button>
          )}

          {/* Quick Sync Button */}
          {onSync && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              title={`E-Tablo canlı senkronizasyon (${machinesCount} makine, ${recordsCount} kayıt)`}
              className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900/90 hover:bg-yellow-400 hover:text-black border border-yellow-500/30 text-yellow-400 transition-all cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          )}

          {/* Modern Sarı-Siyah Açılır Menü Butonu */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-label="Açılır Menü"
              className={`inline-flex items-center justify-center h-8 sm:h-9 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-black transition-all shadow-md cursor-pointer active:scale-95 gap-1.5 ${
                dropdownOpen
                  ? 'bg-yellow-300 text-black ring-2 ring-yellow-400'
                  : 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-yellow-500/20'
              }`}
            >
              <Menu className="w-4 h-4 shrink-0 text-black" />
              <span className="hidden sm:inline">Menü</span>
              <ChevronDown className={`hidden sm:inline-block w-3.5 h-3.5 text-black transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Panel Sheet */}
            {dropdownOpen && (
              <div className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-auto sm:mt-2 w-[calc(100vw-16px)] sm:w-88 max-w-sm bg-[#1b263b] rounded-2xl shadow-2xl border border-yellow-500/40 overflow-hidden text-slate-100 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                {/* User info banner */}
                <div className="bg-[#141d2c] text-white p-4 border-b border-yellow-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-yellow-400 text-black flex items-center justify-center font-black text-sm shrink-0 shadow-md">
                        {operatorName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-sm truncate text-yellow-400 leading-tight">
                          {operatorName}
                        </div>
                        <div className="text-[11px] text-slate-300 flex items-center gap-1.5 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                          <span>{isAdmin ? 'Yönetici' : 'Saha Operatörü'}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDropdownOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-700/80 text-[11px]">
                    <div className="bg-[#192437] rounded-lg px-2.5 py-1.5 border border-slate-700/70">
                      <span className="text-slate-400 block text-[10px]">Bakımlı Makineler</span>
                      <span className="font-black text-yellow-400 text-xs">{machinesCount} Adet</span>
                    </div>
                    <div className="bg-[#192437] rounded-lg px-2.5 py-1.5 border border-slate-700/70">
                      <span className="text-slate-400 block text-[10px]">Toplam Kayıt</span>
                      <span className="font-black text-yellow-400 text-xs">{recordsCount} Kayıt</span>
                    </div>
                  </div>
                </div>

                {/* Nav Links */}
                <div className="p-2 space-y-1 max-h-[50vh] overflow-y-auto">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentScreen === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectNav(item.id)}
                        className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                          isActive
                            ? 'bg-yellow-400/20 text-yellow-300 font-black border border-yellow-500/50 shadow-xs'
                            : 'hover:bg-[#223048] text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-xl shrink-0 border ${item.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className={`text-xs sm:text-sm font-extrabold truncate ${isActive ? 'text-yellow-400' : 'text-slate-100'}`}>
                              {item.label}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {item.desc}
                            </div>
                          </div>
                        </div>

                        {item.badge ? (
                          <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 shadow-xs">
                            {item.badge}
                          </span>
                        ) : (
                          <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-yellow-400' : 'text-slate-500'}`} />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Dropdown Footer: Live Google E-Tablo Status + Quick ZIP Export + Logout */}
                <div className="p-3 bg-[#131b2a] border-t border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold px-1">
                    <span className="flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-yellow-400" />
                      <span>Google E-Tablo</span>
                    </span>
                    <span className="text-emerald-400 font-bold">Canlı Bağlantı</span>
                  </div>

                  {/* Hard Refresh Button for Android & Mobile */}
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      handleHardRefresh();
                    }}
                    className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-yellow-400 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-yellow-500/30 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-yellow-400" />
                    <span>Önbelleği Temizle & Yenile (Android)</span>
                  </button>

                  {/* GitHub Pages ZIP Button */}
                  <a
                    href="/api/export-github-pages-zip"
                    download="hftlk-bkm-github-pages.zip"
                    className="w-full py-2 px-3 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-black rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-yellow-500/10"
                  >
                    <Download className="w-3.5 h-3.5 text-black" />
                    <span>GitHub Pages İçin Hazır ZIP</span>
                  </a>

                  {/* Logout Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      onRequestLogout();
                    }}
                    className="w-full py-2 px-3 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-rose-800/40 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-400" />
                    <span>Oturumu Kapat</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AppSheet Tarzı Kısa ve Öz Bekleyen Yüklemeler Modalı */}
      <UploadQueueModal
        isOpen={queueModalOpen}
        onClose={() => setQueueModalOpen(false)}
        queue={queue}
      />
    </header>
  );
};
