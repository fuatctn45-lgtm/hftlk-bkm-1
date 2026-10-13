import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share2, Smartphone, X, Check, PlusSquare } from 'lucide-react';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed and running as standalone app, don't show prompt
  if (isInstalled) {
    return null;
  }

  // Android / Chromium / Desktop Install
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`flex items-center gap-1.5 font-black rounded-xl transition-all cursor-pointer shadow-md active:scale-95 ${
          compact
            ? 'px-2.5 py-1 text-xs bg-yellow-400 text-black hover:bg-yellow-300 shadow-yellow-500/20'
            : 'px-3.5 py-2 text-xs sm:text-sm bg-yellow-400 text-black hover:bg-yellow-300 shadow-yellow-500/25'
        }`}
        title="Uygulamayı Telefona / Tablete Yükle"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Uygulama Olarak Yükle</span>
      </button>
    );
  }

  // iOS Safari flow (WebKit doesn't fire beforeinstallprompt)
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 font-black rounded-xl transition-all cursor-pointer shadow-md active:scale-95 ${
            compact
              ? 'px-2.5 py-1 text-xs bg-yellow-400 text-black hover:bg-yellow-300'
              : 'px-3.5 py-2 text-xs sm:text-sm bg-yellow-400 text-black hover:bg-yellow-300'
          }`}
          title="iPhone / iPad Ana Ekrana Ekle"
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span>Ana Ekrana Ekle</span>
        </button>

        {showIOSGuide && (
          <div
            onClick={() => setShowIOSGuide(false)}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-[#1b263b] border border-yellow-500/40 p-5 shadow-2xl text-white space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-yellow-400 text-black flex items-center justify-center font-black">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">iPhone / iPad Uygulama Yapma</h3>
                    <p className="text-xs text-slate-400">Safari üzerinden ana ekrana ekleyin</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs sm:text-sm">
                <div className="flex items-start gap-3 bg-[#141d2d] p-3 rounded-xl border border-slate-800">
                  <span className="w-6 h-6 rounded-full bg-yellow-400 text-black font-black flex items-center justify-center shrink-0 text-xs">
                    1
                  </span>
                  <div>
                    <span className="font-bold text-white block">Safari'de Paylaş Butonuna Basın</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      Alt bardaki <Share2 className="w-3.5 h-3.5 text-sky-400 inline" /> simgesine dokunun.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-[#141d2d] p-3 rounded-xl border border-slate-800">
                  <span className="w-6 h-6 rounded-full bg-yellow-400 text-black font-black flex items-center justify-center shrink-0 text-xs">
                    2
                  </span>
                  <div>
                    <span className="font-bold text-white block">"Ana Ekrana Ekle"yi Seçin</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      Aşağı kaydırıp <PlusSquare className="w-3.5 h-3.5 text-yellow-400 inline" /> <b>Ana Ekrana Ekle</b> seçeneğine basın.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-[#141d2d] p-3 rounded-xl border border-slate-800">
                  <span className="w-6 h-6 rounded-full bg-yellow-400 text-black font-black flex items-center justify-center shrink-0 text-xs">
                    3
                  </span>
                  <div>
                    <span className="font-bold text-white block">"Ekle" Butonuna Dokunun</span>
                    <span className="text-xs text-slate-400">
                      Sağ üstteki <b>Ekle</b> butonuna dokunun. Artık telefonunuzda tıpkı App Store uygulaması gibi tam ekran çalışır.
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl text-xs sm:text-sm shadow-md transition-all cursor-pointer"
              >
                Anladım
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback banner / button for Android / Chrome users where beforeinstallprompt hasn't fired yet
  return (
    <>
      <button
        type="button"
        onClick={() => setShowIOSGuide(true)}
        className={`flex items-center gap-1.5 font-black rounded-xl transition-all cursor-pointer shadow-md active:scale-95 ${
          compact
            ? 'px-2.5 py-1 text-xs bg-yellow-400/20 text-yellow-400 border border-yellow-400/40 hover:bg-yellow-400 hover:text-black'
            : 'px-3 py-1.5 text-xs bg-yellow-400/20 text-yellow-400 border border-yellow-400/40 hover:bg-yellow-400 hover:text-black'
        }`}
        title="Uygulamayı Telefona Ekle"
      >
        <Smartphone className="w-3.5 h-3.5 shrink-0" />
        <span>Telefona Yükle</span>
      </button>

      {showIOSGuide && (
        <div
          onClick={() => setShowIOSGuide(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#1b263b] border border-yellow-500/40 p-5 shadow-2xl text-white space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-yellow-400 text-black flex items-center justify-center font-black">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Telefona Uygulama Olarak Yükleme</h3>
                  <p className="text-xs text-slate-400">Android ve iPhone / iPad</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="bg-[#141d2d] p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="font-bold text-yellow-400 block">🤖 Android / Chrome:</span>
                <p className="text-xs text-slate-300">
                  Chrome tarayıcınızın sağ üstündeki <b>üç nokta (⋮)</b> simgesine dokunun ve <b>"Uygulamayı Yükle"</b> veya <b>"Ana Ekrana Ekle"</b> seçeneğine basın.
                </p>
              </div>

              <div className="bg-[#141d2d] p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="font-bold text-sky-400 block">🍏 iPhone / Safari:</span>
                <p className="text-xs text-slate-300">
                  Safari'nin altındaki <b>Paylaş (Share)</b> simgesine dokunun, ardından <b>"Ana Ekrana Ekle"</b> seçeneğini seçin.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl text-xs sm:text-sm shadow-md transition-all cursor-pointer"
            >
              Tamam
            </button>
          </div>
        </div>
      )}
    </>
  );
};
