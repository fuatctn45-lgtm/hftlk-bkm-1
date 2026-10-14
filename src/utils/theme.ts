export type ThemeId = 'akg-classic' | 'oled-black' | 'graphite-steel' | 'light-day' | 'emerald-dark';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  subtitle: string;
  badge: string;
  previewBg: string;
  previewCard: string;
  previewAccent: string;
  previewText: string;
  isDark: boolean;
  appBgClass: string;
  headerBgClass: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'akg-classic',
    name: 'AKG Klasik',
    subtitle: 'Koyu Lacivert & Emniyet Sarısı',
    badge: 'VARSAYILAN',
    previewBg: '#131d2e',
    previewCard: '#1b263b',
    previewAccent: '#facc15',
    previewText: '#f8fafc',
    isDark: true,
    appBgClass: 'bg-[#131d2e]',
    headerBgClass: 'bg-[#152033]',
  },
  {
    id: 'oled-black',
    name: 'OLED Gece Karası',
    subtitle: 'Zifiri Siyah & Parlak Sarı (Göz Dostu & Pil Tasarrufu)',
    badge: 'GECE VARDİYASI',
    previewBg: '#05070a',
    previewCard: '#0f141f',
    previewAccent: '#facc15',
    previewText: '#ffffff',
    isDark: true,
    appBgClass: 'bg-[#05070a]',
    headerBgClass: 'bg-[#090d14]',
  },
  {
    id: 'graphite-steel',
    name: 'Grafit & Çelik',
    subtitle: 'Endüstriyel Koyu Füme & Titanyum Çelik',
    badge: 'ENDÜSTRİYEL',
    previewBg: '#0f172a',
    previewCard: '#1e293b',
    previewAccent: '#38bdf8',
    previewText: '#f1f5f9',
    isDark: true,
    appBgClass: 'bg-[#0f172a]',
    headerBgClass: 'bg-[#1e293b]',
  },
  {
    id: 'light-day',
    name: 'Aydınlık Fabrika',
    subtitle: 'Açık Zemin & Güneş Işığı Modu (Yüksek Kontrast)',
    badge: 'GÜNDÜZ MODU',
    previewBg: '#f1f5f9',
    previewCard: '#ffffff',
    previewAccent: '#ca8a04',
    previewText: '#0f172a',
    isDark: false,
    appBgClass: 'bg-[#f1f5f9]',
    headerBgClass: 'bg-white',
  },
  {
    id: 'emerald-dark',
    name: 'Endüstriyel Zümrüt',
    subtitle: 'Derin Askeri Yeşil & Altın Emniyet Tonu',
    badge: 'SAHA',
    previewBg: '#061a14',
    previewCard: '#0f2f25',
    previewAccent: '#34d399',
    previewText: '#ecfdf5',
    isDark: true,
    appBgClass: 'bg-[#061a14]',
    headerBgClass: 'bg-[#0a261e]',
  },
];

const THEME_STORAGE_KEY = 'cmms_theme_v1';

export function getStoredTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && THEME_OPTIONS.some((t) => t.id === saved)) {
      return saved as ThemeId;
    }
  } catch {
    // Ignore localStorage errors
  }
  return 'akg-classic';
}

export function applyTheme(themeId: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', themeId);
      if (themeId === 'light-day') {
        document.documentElement.classList.add('theme-light');
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('theme-light');
      }
    }
    window.dispatchEvent(new CustomEvent('cmms_theme_changed', { detail: { themeId } }));
  } catch (err) {
    console.error('Failed to apply theme:', err);
  }
}
