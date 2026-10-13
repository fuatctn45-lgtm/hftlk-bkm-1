import React, { useState, useEffect } from 'react';
import { AkgLogo } from '../components/AkgLogo';
import { cmmsApi } from '../services/cmmsApi';
import { UserSession } from '../types/cmms';
import {
  KeyRound,
  ShieldCheck,
  Loader2,
  Database,
  RefreshCw,
  Eye,
  EyeOff,
  Lock,
  Server,
  Delete,
  Hash,
} from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (user: UserSession) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sheetStatus, setSheetStatus] = useState<{ connected: boolean; version?: string } | null>(null);
  const [showKeypad, setShowKeypad] = useState(false);

  // Check Google E-Tablo connection
  const verifySheetConnection = async () => {
    try {
      const res = await cmmsApi.checkConnection();
      setSheetStatus({ connected: res.success, version: res.version });
    } catch {
      setSheetStatus({ connected: false });
    }
  };

  useEffect(() => {
    verifySheetConnection();
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('Lütfen şifrenizi giriniz.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await cmmsApi.login(password);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setErrorMsg(res.message || 'Şifre hatalı veya kullanıcı bulunamadı.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Giriş yapılırken bağlantı hatası oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeypadPress = (val: string) => {
    if (val === 'backspace') {
      setPassword((prev) => prev.slice(0, -1));
    } else if (val === 'clear') {
      setPassword('');
    } else {
      setPassword((prev) => prev + val);
    }
  };

  return (
    <div className="min-h-[88vh] flex items-center justify-center p-3 sm:p-4 bg-[#131d2e]">
      <div className="w-full max-w-md bg-[#1b263b] rounded-3xl shadow-2xl border border-yellow-500/30 overflow-hidden">
        {/* Card Header (Sarı-Siyah) */}
        <div className="bg-[#152033] p-6 sm:p-7 text-white text-center flex flex-col items-center relative overflow-hidden border-b-2 border-yellow-400">
          <div className="bg-yellow-400 text-black rounded-2xl p-3 shadow-lg shadow-yellow-500/20 mb-3 border border-yellow-300">
            <AkgLogo size="md" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">Haftalık Bakım CMMS</h2>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-yellow-400 text-black">
              V5.5.0
            </span>
          </div>
          <p className="text-xs text-yellow-400/90 mt-1 font-semibold">
            AKG Endüstriyel Soğutma Sistemleri Bakım Portalı
          </p>

          {/* Live Google E-Tablo Connection Indicator */}
          <div className="mt-3.5 inline-flex items-center gap-2 px-3 py-1 bg-[#1a2538] rounded-full text-xs font-bold text-yellow-400 border border-yellow-500/30 shadow-xs">
            <span className={`w-2 h-2 rounded-full ${sheetStatus?.connected ? 'bg-yellow-400 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-[11px] text-slate-200">
              Google E-Tablo:{' '}
              <b className="text-yellow-400">{sheetStatus?.connected ? `Bağlı (${sheetStatus.version || 'v5.5.0'})` : 'Kontrol Ediliyor...'}</b>
            </span>
            <button
              type="button"
              onClick={verifySheetConnection}
              title="Bağlantıyı Yeniden Dene"
              className="hover:rotate-180 transition-transform cursor-pointer ml-0.5"
            >
              <RefreshCw className="w-3 h-3 text-yellow-400" />
            </button>
          </div>

          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-yellow-400/10 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-7">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-bold text-slate-300">
                  Kullanıcı / Yetkili Şifresi
                </label>
                <button
                  type="button"
                  onClick={() => setShowKeypad(!showKeypad)}
                  className="text-[11px] font-bold text-yellow-400 hover:text-yellow-300 flex items-center gap-1 cursor-pointer"
                >
                  <Hash className="w-3 h-3" />
                  <span>{showKeypad ? 'Klavyeyi Gizle' : 'Sayısal Tuş Takımı'}</span>
                </button>
              </div>

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifrenizi girin..."
                  autoFocus
                  className="w-full pl-10 pr-11 py-3 bg-[#141d2d] border border-slate-700 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all text-white placeholder:text-slate-500"
                />
                <KeyRound className="w-4 h-4 text-yellow-400 absolute left-3.5 top-3.5" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-yellow-400 cursor-pointer p-0.5"
                  title={showPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-2">
                <Database className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span>Kullanıcı rolleri E-Tablo <b>veri</b> sekmesinden otomatik doğrulanır.</span>
              </div>
            </div>

            {/* Mobile-Friendly Numeric Keypad (Sarı-Siyah) */}
            {showKeypad && (
              <div className="bg-[#141d2d] p-2.5 rounded-2xl border border-slate-700/80 space-y-1.5 animate-in fade-in duration-150">
                <div className="grid grid-cols-3 gap-1.5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleKeypadPress(digit)}
                      className="py-2.5 bg-[#1e2a3f] hover:bg-yellow-400 hover:text-black border border-slate-700 rounded-xl text-base font-black text-yellow-400 active:scale-95 transition-all cursor-pointer"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('clear')}
                    className="py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300 active:scale-95 transition-all cursor-pointer"
                  >
                    Temizle
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('0')}
                    className="py-2.5 bg-[#1e2a3f] hover:bg-yellow-400 hover:text-black border border-slate-700 rounded-xl text-base font-black text-yellow-400 active:scale-95 transition-all cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('backspace')}
                    className="py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-rose-950/60 border border-rose-700 text-rose-300 text-xs rounded-xl font-medium flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl shadow-lg shadow-yellow-500/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer active:scale-98"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>E-Tablodan Doğrulanıyor...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-black" />
                  <span>Sisteme Giriş Yap</span>
                </>
              )}
            </button>
          </form>

          {/* Security & Reliability Badge */}
          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-yellow-400" />
              <span>SSL / SHA-256 Korumalı</span>
            </span>
            <span className="font-mono text-yellow-400">V5.5.0 SARI-SİYAH</span>
          </div>
        </div>
      </div>
    </div>
  );
};
