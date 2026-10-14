import React, { useState, useMemo, useEffect } from 'react';
import { UserSession, Machine, MaintenanceTemplate, MaintenanceRecord } from '../types/cmms';
import { getWeekKey, normalizeWeekKey } from '../services/cmmsApi';
import { uploadQueueService, QueuedRecord } from '../services/uploadQueue';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  BarChart3,
  Settings,
  ArrowRight,
} from 'lucide-react';

interface HomeViewProps {
  user: UserSession;
  machines: Machine[];
  templates: MaintenanceTemplate[];
  records: MaintenanceRecord[];
  onNavigate: (screen: 'operator' | 'redList' | 'reports' | 'admin') => void;
  onSelectMachine?: (machine: Machine, templateId?: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  user,
  machines,
  templates,
  records,
  onNavigate,
}) => {
  const currentWeek = getWeekKey();
  const operatorName = user.operator || user.name || user.fullName || 'Operatör';
  const isAdmin = String(user.role || '').toLowerCase().includes('admin');
  const [uploadQueue, setUploadQueue] = useState<QueuedRecord[]>(() => uploadQueueService.getQueue());

  useEffect(() => {
    return uploadQueueService.subscribe(setUploadQueue);
  }, []);

  // Calculate current week records (incorporates local background queue immediately for 0ms lag)
  const currentWeekRecords = useMemo(() => {
    const fromApi = records.filter((r) => normalizeWeekKey(r.weekKey, r.createdAt) === currentWeek);
    const fromQueue = uploadQueue.map((q) => ({
      recordId: q.id,
      machineId: q.machineId,
      machineName: q.machineName,
      templateId: q.templateId,
      task: q.task,
      measuredValue: q.measuredValue,
      result: q.result,
      description: q.description,
      operator: q.operator,
      operatorRole: q.operatorRole,
      proofImageUrl: q.proofImageUrl,
      weekKey: currentWeek,
      createdAt: new Date(q.timestamp).toISOString(),
      date: new Date(q.timestamp).toLocaleDateString('tr-TR'),
      time: new Date(q.timestamp).toLocaleTimeString('tr-TR'),
    } as MaintenanceRecord));

    const existingKeys = new Set(
      fromApi.map((r) => `${(r.machineId || r.machineName || '').trim().toLowerCase()}_${(r.templateId || '').trim().toLowerCase()}`)
    );
    const nonDuplicatedQueue = fromQueue.filter(
      (q) => !existingKeys.has(`${(q.machineId || q.machineName || '').trim().toLowerCase()}_${(q.templateId || '').trim().toLowerCase()}`)
    );

    return [...fromApi, ...nonDuplicatedQueue];
  }, [records, currentWeek, uploadQueue]);

  const activeTemplates = useMemo(() => {
    return templates.filter((t) => t.active);
  }, [templates]);

  const machinesWithTasksCount = useMemo(() => {
    return machines.filter((m) => {
      const mid = (m.id || '').trim().toLowerCase();
      const mName = (m.machineName || '').trim().toLowerCase();
      return activeTemplates.some((t) => {
        const tMid = (t.machineId || '').trim().toLowerCase();
        const tMName = (t.machineName || '').trim().toLowerCase();
        return (tMid && tMid === mid) || (tMName && tMName === mName);
      });
    }).length;
  }, [machines, activeTemplates]);

  // Exact KPI calculation based on active tasks vs inspection statuses
  const { totalPlanned, completed, redCount, uygunCount, pendingCount, completionRate } = useMemo(() => {
    const planned = activeTemplates.length;
    let red = 0;
    let ok = 0;

    activeTemplates.forEach((t) => {
      const cleanTid = (t.templateId || '').trim().toLowerCase();
      const cleanMid = (t.machineId || '').trim().toLowerCase();
      const cleanMName = (t.machineName || '').trim().toLowerCase();

      const matchingRecords = currentWeekRecords.filter((r) => {
        const rTid = (r.templateId || '').trim().toLowerCase();
        if (rTid !== cleanTid) return false;
        const rMid = (r.machineId || '').trim().toLowerCase();
        const rMName = (r.machineName || '').trim().toLowerCase();
        return (
          (cleanMid && rMid === cleanMid) ||
          (cleanMName && rMName === cleanMName) ||
          rMid === cleanMid
        );
      });

      if (matchingRecords.length > 0) {
        const latest = matchingRecords[matchingRecords.length - 1];
        if (String(latest.result || '').toUpperCase().includes('RED')) {
          red++;
        } else {
          ok++;
        }
      }
    });

    const done = ok + red;
    const pending = Math.max(0, planned - done);
    const rate = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0;

    return {
      totalPlanned: planned,
      completed: done,
      redCount: red,
      uygunCount: ok,
      pendingCount: pending,
      completionRate: rate,
    };
  }, [activeTemplates, currentWeekRecords]);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3.5 sm:py-6 space-y-4 sm:space-y-6">
      {/* Industrial Hero Command Banner (Sarı - Siyah Konsept) */}
      <div className="bg-gradient-to-br from-[#1c283e] via-[#162133] to-[#22334e] text-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden border border-yellow-500/40">
        <div className="relative z-10 max-w-3xl">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <span className="px-2.5 py-0.5 bg-yellow-400/20 text-yellow-300 rounded-md text-[11px] sm:text-xs font-mono font-black border border-yellow-400/40">
              Dönem: {currentWeek}
            </span>
          </div>

          <h2 className="text-xl sm:text-3xl font-black tracking-tight text-white">
            Hoş Geldiniz, <span className="text-yellow-400">{operatorName}</span>
          </h2>
        </div>

        {/* Technical background accents */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-15 bg-[radial-gradient(#facc15_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-yellow-400/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* KPI Stats Cards (Sarı - Siyah Konsept) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
        {/* Planlanan */}
        <div className="bg-[#1b263b] p-3.5 sm:p-4 rounded-2xl border border-slate-700/70 hover:border-yellow-500/50 shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Planlanan</span>
            <Clock className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-yellow-400 font-mono">{totalPlanned}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">{machinesWithTasksCount} Makine</div>
        </div>

        {/* Tamamlanan */}
        <div className="bg-[#1b263b] p-3.5 sm:p-4 rounded-2xl border border-slate-700/70 hover:border-yellow-500/50 shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-400">Tamamlanan</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">{completed}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Bu hafta yapılan</div>
        </div>

        {/* Bekleyen */}
        <div className="bg-[#1b263b] p-3.5 sm:p-4 rounded-2xl border border-slate-700/70 hover:border-yellow-500/50 shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-400">Bekleyen</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono">{pendingCount}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Kalan kontrol</div>
        </div>

        {/* UYGUN */}
        <div className="bg-[#1b263b] p-3.5 sm:p-4 rounded-2xl border border-slate-700/70 hover:border-yellow-500/50 shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-300">UYGUN</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">{uygunCount}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Sorunsuz kayıt</div>
        </div>

        {/* RED Arıza */}
        <div className={`p-3.5 sm:p-4 rounded-2xl border shadow-md transition-all ${
          redCount > 0 ? 'bg-rose-950/40 border-rose-600/70' : 'bg-[#1b263b] border-slate-700/70'
        }`}>
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider">RED Arıza</span>
            <AlertTriangle className={`w-4 h-4 ${redCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-400 font-mono">{redCount}</div>
          <div className="text-[11px] text-rose-300 font-medium mt-0.5">Kritik müdahale</div>
        </div>

        {/* İlerleme % */}
        <div className="bg-[#1b263b] p-3.5 sm:p-4 rounded-2xl border border-slate-700/70 hover:border-yellow-500/50 shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-yellow-400">İlerleme</span>
            <TrendingUp className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-yellow-400 font-mono">%{completionRate}</div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                completionRate >= 90 ? 'bg-emerald-400' : completionRate >= 50 ? 'bg-yellow-400' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, completionRate)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Ana Navigasyon Kartları (Diğer Kartlar) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Kart 1: Operatör Bakım Paneli */}
        <div
          onClick={() => onNavigate('operator')}
          className="group bg-[#1b263b] rounded-2xl p-6 border border-slate-700/70 hover:border-yellow-400 shadow-lg hover:shadow-yellow-500/10 cursor-pointer transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-yellow-400/20 text-yellow-400 border border-yellow-400/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Wrench className="w-6 h-6 text-yellow-400" />
            </div>
            <h3 className="text-lg font-black text-white group-hover:text-yellow-400 transition-colors mb-1.5">
              Operatör Bakım Paneli
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Makineleri seçin, QR kodlarını okutun ve birimlere göre renklendirilmiş periyodik kontrol adımlarını gerçekleştirin.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-700/70 flex items-center justify-between text-yellow-400 font-bold text-sm">
            <span>Kontrole Başla ({machinesWithTasksCount} Bakımlı Makine)</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
          </div>
        </div>

        {/* Kart 2: RED Verilen Bakımlar */}
        <div
          onClick={() => onNavigate('redList')}
          className="group bg-[#1b263b] rounded-2xl p-6 border border-slate-700/70 hover:border-rose-500 shadow-lg hover:shadow-rose-500/10 cursor-pointer transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform relative">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
              {redCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-rose-600 text-white rounded-full text-[11px] font-black flex items-center justify-center animate-pulse shadow-md">
                  {redCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-lg font-black text-white group-hover:text-rose-400 transition-colors">
                RED Verilen Bakımlar
              </h3>
              {redCount > 0 && (
                <span className="text-[10px] bg-rose-950 text-rose-300 font-black px-2 py-0.5 rounded-full border border-rose-700">
                  {redCount} Arıza
                </span>
              )}
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Operatörlerin uygun bulmadığı kritik arıza kayıtları, fotoğraflı kanıtlar ve "Giderildi" aksiyon takibi.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-700/70 flex items-center justify-between text-rose-400 font-bold text-sm">
            <span>{redCount > 0 ? `${redCount} Açık Arıza Mevcut` : 'Arızaları İncele'}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
          </div>
        </div>

        {/* Kart 3: Bakım Raporları */}
        <div
          onClick={() => onNavigate('reports')}
          className="group bg-[#1b263b] rounded-2xl p-6 border border-slate-700/70 hover:border-emerald-400 shadow-lg hover:shadow-emerald-500/10 cursor-pointer transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <BarChart3 className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-lg font-black text-white group-hover:text-emerald-400 transition-colors mb-1.5">
              Bakım Raporları
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Makine ve birim bazında detaylı istatistikler, Excel (CSV) dışa aktarımı, yazdırma ve tek tıkla PDF e-posta gönderimi.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-700/70 flex items-center justify-between text-emerald-400 font-bold text-sm">
            <span>Raporları Görüntüle</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
          </div>
        </div>

        {/* Kart 4: Admin Yönetim Paneli (if admin) */}
        {isAdmin && (
          <div
            onClick={() => onNavigate('admin')}
            className="group bg-[#1b263b] rounded-2xl p-6 border border-slate-700/70 hover:border-amber-400 shadow-lg hover:shadow-amber-500/10 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Settings className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-black text-white group-hover:text-amber-400 transition-colors mb-1.5">
                Admin Bakım Tanımı
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Makinelere yeni kontrol maddeleri ekleyin, birim renklerini düzenleyin, fotoğraf zorunluluğu koyun ve referans resim yükleyin.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-700/70 flex items-center justify-between text-amber-400 font-bold text-sm">
              <span>Tanımları Yönet ({templates.length} Madde)</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
