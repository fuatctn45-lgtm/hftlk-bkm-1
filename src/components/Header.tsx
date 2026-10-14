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
  Palette,
} from 'lucide-react';
import { THEME_OPTIONS, ThemeId, applyTheme, getStoredTheme } from '../utils/theme';

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
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(() => getStoredTheme());
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Sync theme changes across tabs/components
  useEffect(() => {
    const handleThemeEvent = (e: any) => {
      if (e.detail?.themeId) {
        setCurrentThemeId(e.detail.themeId);
      }
    };
    window.addEventListener('cmms_theme_changed', handleThemeEvent);
    return () => window.removeEventListener('cmms_theme_changed', handleThemeEvent);
  }, []);

  const handleSelectTheme = (newTheme: ThemeId) => {
    setCurrentThemeId(newTheme);
    applyTheme(newTheme);
  };

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

            {/* Dropdown Panel Sheet: Farklı ve Belirgin Menü Arka Planı */}
            {dropdownOpen && (
              <>
                {/* Arka plan karartma ve blur perdesi: Tıklanınca menüyü kapatır ve menüyü öne çıkarır */}
                <div
                  className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 transition-opacity"
                  onClick={() => setDropdownOpen(false)}
                />

                <div className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-auto sm:mt-2 w-[calc(100vw-16px)] sm:w-92 max-w-sm bg-[#1e293b] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95)] border-2 border-yellow-400 ring-1 ring-yellow-400/50 overflow-hidden text-slate-100 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* User info banner - Farklı ve Kontrastlı Başlık */}
                  <div className="bg-[#141e2e] text-white p-4 border-b border-yellow-400/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-yellow-400 text-black flex items-center justify-center font-black text-sm shrink-0 shadow-md">
                          {operatorName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-sm truncate text-yellow-400 leading-tight">
                            {operatorName}
                          </div>
                          <div className="text-[11px] text-slate-300 flex items-center gap-1.5 mt-0.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                            <span>{isAdmin ? 'Sistem Yöneticisi (Admin)' : 'Saha Operatörü'}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setDropdownOpen(false)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 cursor-pointer transition-colors"
                        title="Kapat"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-700/70 text-[11px]">
                      <div className="bg-[#24344d] rounded-xl px-3 py-2 border border-slate-600/70 shadow-inner">
                        <span className="text-slate-300 block text-[10px] font-medium">Bakımlı Makineler</span>
                        <span className="font-black text-yellow-400 text-xs sm:text-sm">{machinesCount} Adet</span>
                      </div>
                      <div className="bg-[#24344d] rounded-xl px-3 py-2 border border-slate-600/70 shadow-inner">
                        <span className="text-slate-300 block text-[10px] font-medium">Toplam Kayıt</span>
                        <span className="font-black text-yellow-400 text-xs sm:text-sm">{recordsCount} Kayıt</span>
                      </div>
                    </div>
                  </div>

                  {/* Menü Linkleri - Farklı ve Ayrışan Kart Arka Planı */}
                  <div className="p-2.5 space-y-1.5 max-h-[50vh] overflow-y-auto bg-[#182335]">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentScreen === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectNav(item.id)}
                          className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer border ${
                            isActive
                              ? 'bg-yellow-400/20 text-yellow-300 font-black border-yellow-400/70 shadow-sm'
                              : 'bg-[#1f2d42] hover:bg-[#283a54] text-slate-100 border-slate-700/60 hover:border-slate-600'
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
                              <div className="text-[10px] text-slate-300 truncate">
                                {item.desc}
                              </div>
                            </div>
                          </div>

                          {item.badge ? (
                            <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 shadow-xs">
                              {item.badge}
                            </span>
                          ) : (
                            <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-yellow-400' : 'text-slate-400'}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Görünüm / Tema Seçeneği (Açılır Liste - Yer Tasarruflu) */}
                  <div className="p-2.5 bg-[#141e2e] border-t border-yellow-400/30">
                    <label
                      htmlFor="theme-selector-dropdown"
                      className="flex items-center justify-between mb-1.5 cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="p-1 rounded-md bg-yellow-400 text-black shadow-xs">
                          <Palette className="w-3 h-3" />
                        </div>
                        <span className="text-[11px] font-black text-yellow-400 uppercase tracking-wider">
                          Görünüm & Tema
                        </span>
                      </div>
                      <span className="text-[9px] font-bold text-slate-300 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60">
                        {THEME_OPTIONS.find((t) => t.id === currentThemeId)?.name || 'AKG Klasik'}
                      </span>
                    </label>

                    {/* Açılır Liste (Select Dropdown) */}
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <div
                          className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-xs ring-1 ring-black/30"
                          style={{
                            backgroundColor:
                              THEME_OPTIONS.find((t) => t.id === currentThemeId)?.previewAccent || '#facc15',
                          }}
                        />
                      </div>
                      <select
                        id="theme-selector-dropdown"
                        value={currentThemeId}
                        onChange={(e) => handleSelectTheme(e.target.value as ThemeId)}
                        className="w-full pl-8 pr-8 py-2 bg-[#1b273b] hover:bg-[#22324b] border border-yellow-400/40 focus:border-yellow-400 rounded-xl text-xs font-bold text-white shadow-xs appearance-none cursor-pointer outline-none focus:ring-1 focus:ring-yellow-400 transition-colors"
                      >
                        {THEME_OPTIONS.map((theme) => (
                          <option
                            key={theme.id}
                            value={theme.id}
                            className="bg-[#152033] text-white py-1"
                          >
                            {theme.name} — {theme.badge}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-yellow-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Menü Alt Bölümü (Footer) */}
                  <div className="p-3 bg-[#131c2c] border-t border-yellow-400/30 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-300 font-semibold px-1">
                      <span className="flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-yellow-400" />
                        <span>Google E-Tablo</span>
                      </span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Canlı Bağlantı</span>
                      </span>
                    </div>

                    {/* Hard Refresh Button for Android & Mobile */}
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        handleHardRefresh();
                      }}
                      className="w-full py-2.5 px-3 bg-[#1e2c40] hover:bg-[#283a52] text-yellow-400 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-yellow-500/40 cursor-pointer shadow-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-yellow-400" />
                      <span>Önbelleği Temizle & Yenile (Android)</span>
                    </button>

                    {/* GitHub Pages ZIP Button - SADECE ADMİN GÖREBİLİR */}
                    {isAdmin && (
                      <a
                        href="/api/export-github-pages-zip"
                        download="hftlk-bkm-github-pages.zip"
                        className="w-full py-2 px-3 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-black rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-yellow-500/10"
                      >
                        <Download className="w-3.5 h-3.5 text-black" />
                        <span>GitHub Pages İçin Hazır ZIP</span>
                      </a>
                    )}

                    {/* Logout Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onRequestLogout();
                      }}
                      className="w-full py-2 px-3 bg-rose-950/50 hover:bg-rose-900/70 text-rose-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-rose-800/60 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-300" />
                      <span>Oturumu Kapat</span>
                    </button>
                  </div>
                </div>
              </>
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
