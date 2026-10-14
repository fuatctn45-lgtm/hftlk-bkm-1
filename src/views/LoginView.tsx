import React, { useState, useEffect } from 'react';
import { AkgLogo } from '../components/AkgLogo';
import { cmmsApi } from '../services/cmmsApi';
import { UserSession } from '../types/cmms';
import {
  KeyRound,
  Loader2,
  Eye,
  EyeOff,
  LogIn,
} from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (user: UserSession) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sheetConnected, setSheetConnected] = useState<boolean>(true);

  // E-Tablo bağlantı durumunu sessizce doğrula
  useEffect(() => {
    let isMounted = true;
    cmmsApi.checkConnection().then((res) => {
      if (isMounted) {
        setSheetConnected(res.success);
      }
    }).catch(() => {
      if (isMounted) setSheetConnected(false);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = password.trim();
    if (!trimmed) {
      setErrorMsg('Lütfen şifre veya PIN kodunuzu giriniz.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await cmmsApi.login(trimmed);
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#131d2e]">
      <div className="w-full max-w-sm bg-[#1b263b] rounded-2xl shadow-2xl border border-slate-700/80 overflow-hidden">
        {/* Üst Logo ve Başlık Alanı */}
        <div className="bg-[#152033] p-6 text-center flex flex-col items-center border-b border-slate-700/80">
          <div className="bg-white rounded-xl p-2.5 shadow-md mb-3">
            <AkgLogo size="md" />
          </div>
          <h1 className="text-base font-extrabold tracking-tight text-white">
            AKG Termoteknik Sistemler
          </h1>
          <p className="text-xs text-yellow-400 font-medium mt-0.5">
            Periyodik Bakım ve Takip Sistemi
          </p>

          {/* E-Tablo Durum Rozeti */}
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2538] rounded-full text-[11px] font-semibold text-slate-300 border border-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                sheetConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>
              Google E-Tablo:{' '}
              <b className={sheetConnected ? 'text-emerald-400' : 'text-amber-300'}>
                {sheetConnected ? 'Bağlantı Aktif' : 'Hazır'}
              </b>
            </span>
          </div>
        </div>

        {/* Sade Giriş Formu */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label
              htmlFor="user-password"
              className="block text-xs font-bold text-slate-300 mb-1.5"
            >
              Şifre / PIN Kodu
            </label>
            <div className="relative">
              <input
                id="user-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="Şifrenizi giriniz..."
                autoFocus
                disabled={loading}
                className="w-full pl-10 pr-10 py-3 bg-[#141d2d] border border-slate-700 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all text-white placeholder:text-slate-500 disabled:opacity-60"
              />
              <KeyRound className="w-4 h-4 text-yellow-400 absolute left-3.5 top-3.5 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-yellow-400 cursor-pointer p-0.5 transition-colors"
                title={showPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Hata Mesajı */}
          {errorMsg && (
            <div className="p-2.5 bg-rose-950/60 border border-rose-700/80 text-rose-300 text-xs rounded-xl font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Tek Sade Giriş Butonu */}
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full py-3 px-4 bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-black font-extrabold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                <span>Giriş Yapılıyor...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 text-black" />
                <span>Giriş Yap</span>
              </>
            )}
          </button>
        </form>

        {/* Alt Bilgi */}
        <div className="px-6 py-3 bg-[#152033]/60 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 font-medium">
            AKG Termoteknik Sistemler San. ve Tic. Ltd. Şti.
          </p>
        </div>
      </div>
    </div>
  );
};
