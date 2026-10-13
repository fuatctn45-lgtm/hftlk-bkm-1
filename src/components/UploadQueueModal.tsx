import React from 'react';
import { QueuedRecord, uploadQueueService } from '../services/uploadQueue';
import {
  X,
  CloudUpload,
  Loader2,
  Clock,
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  Check,
} from 'lucide-react';

interface UploadQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  queue: QueuedRecord[];
}

export const UploadQueueModal: React.FC<UploadQueueModalProps> = ({
  isOpen,
  onClose,
  queue,
}) => {
  if (!isOpen) return null;

  const pendingCount = queue.length;
  const isUploading = queue.some((q) => q.status === 'uploading');
  const hasFailed = queue.some((q) => q.status === 'failed');

  const handleRetry = () => {
    uploadQueueService.retryAll();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#1b263b] w-full max-w-md rounded-2xl border border-yellow-500/40 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-[#141d2c] px-4 py-3 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-yellow-400/20 text-yellow-400 flex items-center justify-center border border-yellow-400/30">
              <CloudUpload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                <span>Bekleyen Yüklemeler</span>
                <span className="text-xs font-mono bg-yellow-400 text-black px-1.5 py-0.2 rounded-md font-black">
                  ({pendingCount})
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Arka planda E-Tabloya aktarılan kayıtlar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-3 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-800/80">
          {queue.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="text-sm font-bold text-white">Sırada Bekleyen Kayıt Yok</div>
              <div className="text-xs text-slate-400">Tüm kontroller başarıyla eşitlendi.</div>
            </div>
          ) : (
            queue.map((item) => {
              const timeStr = new Date(item.timestamp).toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div key={item.id} className="pt-2 first:pt-0 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-yellow-400 truncate">
                        {item.machineName}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                          item.result === 'RED'
                            ? 'bg-rose-950 text-rose-300 border border-rose-700'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                        }`}
                      >
                        {item.result}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 truncate mt-0.5">
                      {item.task}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Saat: {timeStr}
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="shrink-0 text-right">
                    {item.status === 'uploading' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-yellow-400 font-bold bg-yellow-400/10 px-2 py-0.5 rounded-lg border border-yellow-400/30">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Yükleniyor</span>
                      </span>
                    )}
                    {item.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
                        <Clock className="w-3 h-3" />
                        <span>Sırada</span>
                      </span>
                    )}
                    {item.status === 'failed' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-bold bg-rose-950/70 px-2 py-0.5 rounded-lg border border-rose-800">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Tekrar Dene</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#141d2c] px-4 py-2.5 border-t border-slate-700/80 flex items-center justify-between gap-2">
          {queue.length > 0 ? (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isUploading}
              className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black text-xs font-black rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isUploading ? 'animate-spin' : ''}`} />
              <span>{isUploading ? 'Yükleniyor...' : 'Şimdi Eşitle'}</span>
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">Bulut senkronizasyonu tam</span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
