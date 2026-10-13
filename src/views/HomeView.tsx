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
  Search,
  Check,
  X,
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
  onSelectMachine,
}) => {
  const currentWeek = getWeekKey();
  const operatorName = user.operator || user.name || user.fullName || 'Operatör';
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'completed' | 'hasRed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadQueue, setUploadQueue] = useState<QueuedRecord[]>(() => uploadQueueService.getQueue());

  useEffect(() => {
    return uploadQueueService.subscribe(setUploadQueue);
  }, []);

  // Calculate current week statistics (incorporates local background queue immediately for 0ms lag)
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

  const totalPlanned = activeTemplates.length;
  const completed = currentWeekRecords.length;
  const redCount = currentWeekRecords.filter((r) => r.result === 'RED').length;
  const uygunCount = currentWeekRecords.filter((r) => r.result === 'UYGUN').length;
  const pendingCount = Math.max(0, totalPlanned - completed);
  const completionRate = totalPlanned > 0 ? Math.round((completed / totalPlanned) * 100) : 0;

  const getMachineTasks = (m: Machine) => {
    return templates
      .filter((t) => (t.machineId === m.id || t.machineName === m.machineName) && t.active)
      .sort((a, b) => (a.orderNo || 1) - (b.orderNo || 1));
  };

  const getTaskStatus = (machineId: string, templateId: string): 'bekleyen' | 'tamamlanan' | 'red' => {
    const cleanMid = (machineId || '').trim().toLowerCase();
    const cleanTid = (templateId || '').trim().toLowerCase();

    // Sadece bu haftanın (currentWeek) kayıtlarını dikkate al
    const matchingCurrent = currentWeekRecords.filter((r) => {
      const matchTmpl = (r.templateId || '').trim().toLowerCase() === cleanTid;
      if (!matchTmpl) return false;
      const rMid = (r.machineId || '').trim().toLowerCase();
      const rMName = (r.machineName || '').trim().toLowerCase();
      return rMid === cleanMid || rMName === cleanMid || (cleanMid && (rMid.includes(cleanMid) || cleanMid.includes(rMid)));
    });

    if (matchingCurrent.length > 0) {
      const latestRec = matchingCurrent[matchingCurrent.length - 1];
      return String(latestRec.result || '').toUpperCase().includes('RED') ? 'red' : 'tamamlanan';
    }

    return 'bekleyen';
  };

  const machinesWithTasks = useMemo(() => {
    return machines.filter((m) => getMachineTasks(m).length > 0);
  }, [machines, templates]);

  const filteredMachinesList = useMemo(() => {
    return machinesWithTasks.filter((m) => {
      const codeStr = m.machineCode || m.code || m.costCenter || '';
      return (
        m.machineName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        codeStr.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [machinesWithTasks, searchTerm]);

  const pendingMachines = useMemo(() => {
    return filteredMachinesList.filter((m) => {
      const mTasks = getMachineTasks(m);
      const hasRed = mTasks.some((t) => getTaskStatus(m.id, t.templateId) === 'red');
      const doneCount = mTasks.filter((t) => getTaskStatus(m.id, t.templateId) !== 'bekleyen').length;
      return !hasRed && (mTasks.length === 0 || doneCount < mTasks.length);
    });
  }, [filteredMachinesList, currentWeekRecords]);

  const completedMachines = useMemo(() => {
    return filteredMachinesList.filter((m) => {
      const mTasks = getMachineTasks(m);
      const hasRed = mTasks.some((t) => getTaskStatus(m.id, t.templateId) === 'red');
      const doneCount = mTasks.filter((t) => getTaskStatus(m.id, t.templateId) !== 'bekleyen').length;
      return !hasRed && mTasks.length > 0 && doneCount >= mTasks.length;
    });
  }, [filteredMachinesList, currentWeekRecords]);

  const redMachines = useMemo(() => {
    return filteredMachinesList.filter((m) => {
      const mTasks = getMachineTasks(m);
      return mTasks.some((t) => getTaskStatus(m.id, t.templateId) === 'red');
    });
  }, [filteredMachinesList, currentWeekRecords]);

  const renderHomeMachineRow = (m: Machine) => {
    const mTasks = getMachineTasks(m);
    const completedTasks = mTasks.filter(
      (t) => getTaskStatus(m.id, t.templateId) !== 'bekleyen'
    );
    const completedCount = completedTasks.length;
    const okCount = mTasks.filter((t) => getTaskStatus(m.id, t.templateId) === 'tamamlanan').length;
    const redCount = mTasks.filter((t) => getTaskStatus(m.id, t.templateId) === 'red').length;
    const hasRed = redCount > 0;
    const isAllDone = mTasks.length > 0 && completedCount >= mTasks.length;

    return (
      <div
        key={m.id}
        onClick={() => {
          if (onSelectMachine) {
            onSelectMachine(m);
          } else {
            onNavigate('operator');
          }
        }}
        className={`group w-full p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer shadow-xs flex items-center justify-between gap-3 active:scale-[0.99] hover:shadow-md ${
          hasRed
            ? 'bg-rose-950/25 border-rose-500/70 hover:border-rose-400 hover:bg-rose-950/35'
            : isAllDone
            ? 'bg-emerald-950/20 border-emerald-500/50 hover:border-emerald-400 hover:bg-emerald-950/30'
            : 'bg-[#1b263b] border-slate-700/80 hover:border-yellow-400 hover:bg-[#202e47]'
        }`}
      >
        <div className="min-w-0 flex-1 space-y-2.5">
          {/* Makine İsmi ve Durum Rozetleri */}
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base sm:text-lg font-black text-yellow-400 group-hover:text-yellow-300 transition-colors">
              {m.machineName}
            </h3>
            {isAllDone && (
              <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Tamamlandı</span>
              </span>
            )}
            {completedCount > 0 && (
              <span className="text-[10px] font-black bg-[#141d2d] px-2 py-0.5 rounded-md border border-slate-700 flex items-center gap-1.5">
                {okCount > 0 && <span className="text-emerald-400">{okCount} OK</span>}
                {okCount > 0 && redCount > 0 && <span className="text-slate-500">·</span>}
                {redCount > 0 && <span className="text-rose-400 animate-pulse">{redCount} RED</span>}
              </span>
            )}
          </div>

          {/* Numaralı Adım Kutuları */}
          <div className="flex flex-wrap items-center gap-1.5">
            {mTasks.map((t, idx) => {
              const st = getTaskStatus(m.id, t.templateId);
              const bg =
                st === 'red'
                  ? 'bg-rose-600 text-white shadow-xs animate-pulse ring-1 ring-rose-400 border border-rose-300'
                  : st === 'tamamlanan'
                  ? 'bg-emerald-500 text-black font-black shadow-xs border border-emerald-300'
                  : 'bg-[#141d2d] text-yellow-400 border border-yellow-500/50 hover:border-yellow-400';

              return (
                <span
                  key={t.templateId}
                  title={`${idx + 1}. ${t.task} - ${st === 'tamamlanan' ? 'OK (UYGUN)' : st === 'red' ? 'RED (ARIZA)' : 'BEKLEYEN'} (${st.toUpperCase()})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectMachine) {
                      onSelectMachine(m, t.templateId);
                    } else {
                      onNavigate('operator');
                    }
                  }}
                  className={`min-w-[32px] px-1.5 h-7 sm:h-8 rounded-lg font-mono font-black text-xs sm:text-sm flex items-center justify-center shrink-0 transition-transform hover:scale-110 cursor-pointer ${bg}`}
                >
                  {st === 'tamamlanan' ? (
                    <span className="text-[11px] sm:text-xs font-black tracking-tight text-black">OK</span>
                  ) : st === 'red' ? (
                    <span className="text-[10px] sm:text-[11px] font-black tracking-tight text-white animate-pulse">RED</span>
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

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

          <h2 className="text-xl sm:text-3xl font-black tracking-tight mb-2 text-white">
            Hoş Geldiniz, <span className="text-yellow-400">{operatorName}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-medium max-w-xl">
            Aşağıdaki makine kartlarına tıklayarak makine üzerindeki sarı QR kodunu okutun ve periyodik bakımı gerçekleştirin.
          </p>
        </div>

        {/* Technical background accents */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-15 bg-[radial-gradient(#facc15_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-yellow-400/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* KPI Stats Cards (Sarı - Siyah) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
        {/* Planned */}
        <div className="bg-[#1b263b] p-3.5 sm:p-4 rounded-2xl border border-slate-700/70 hover:border-yellow-500/50 shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Planlanan</span>
            <Clock className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-yellow-400 font-mono">{totalPlanned}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Aktif bakım maddesi</div>
        </div>

        {/* Completed */}
        <div className="bg-[#1b263b] p-3.5 sm:p-4 rounded-2xl border border-slate-700/70 hover:border-yellow-500/50 shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-400">Tamamlanan</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">{completed}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Bu hafta yapılan</div>
        </div>

        {/* Pending */}
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
        <div className={`p-3.5 sm:p-4 rounded-2xl border shadow-md transition-all ${redCount > 0 ? 'bg-rose-950/40 border-rose-600/70' : 'bg-[#1b263b] border-slate-700/70'}`}>
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider">RED Arıza</span>
            <AlertTriangle className={`w-4 h-4 ${redCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-400 font-mono">{redCount}</div>
          <div className="text-[11px] text-rose-300 font-medium mt-0.5">Kritik müdahale</div>
        </div>

        {/* Progress % */}
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

      {/* Search & Filter Header for Machines */}
      <div className="bg-[#1b263b] p-3.5 sm:p-5 rounded-2xl border border-slate-700/70 shadow-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <span>Haftalık Makine Bakım Durumu</span>
              <span className="text-xs font-black text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-md border border-yellow-400/30">
                {machinesWithTasks.length} Makine
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Bakım bekleyen ve tamamlanan makinelerin listesi
            </p>
          </div>

          {/* Segmented Filter Control */}
          <div className="flex items-center bg-[#141d2d] p-1 rounded-xl text-xs font-bold w-full sm:w-auto overflow-x-auto border border-slate-700/80">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-yellow-400 text-black shadow-xs font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tümü ({machinesWithTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('pending')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                filterTab === 'pending'
                  ? 'bg-yellow-400 text-black shadow-xs font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Bakım Olan ({pendingMachines.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('completed')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                filterTab === 'completed'
                  ? 'bg-emerald-500 text-black shadow-xs font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Bakımı Biten ({completedMachines.length})
            </button>
            {redMachines.length > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab('hasRed')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                  filterTab === 'hasRed'
                    ? 'bg-rose-600 text-white shadow-xs font-black'
                    : 'text-rose-400 hover:text-white'
                }`}
              >
                RED Arıza ({redMachines.length})
              </button>
            )}
          </div>
        </div>

        {/* Search input */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Makine adı veya masraf merkezi ara..."
            className="w-full pl-10 pr-9 py-2.5 bg-[#141d2d] border border-slate-700 rounded-xl text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-3 text-slate-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Machine Rows by Status */}
      <div className="space-y-4">
        {/* RED Arızalı Makineler (varsa) */}
        {redMachines.length > 0 && (filterTab === 'all' || filterTab === 'hasRed') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 text-xs font-black text-rose-400">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span>RED ARIZALI MAKİNELER</span>
              </div>
              <span className="text-[11px] bg-rose-950/80 px-2.5 py-0.5 rounded-md border border-rose-800/60 font-bold">
                {redMachines.length} Makine
              </span>
            </div>
            <div className="space-y-2">
              {redMachines.map(renderHomeMachineRow)}
            </div>
          </div>
        )}

        {/* Bakım Olan / Devam Eden Makineler */}
        {pendingMachines.length > 0 && (filterTab === 'all' || filterTab === 'pending') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 text-xs font-black text-yellow-400">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <span>BAKIM OLAN / DEVAM EDEN MAKİNELER</span>
              </div>
              <span className="text-[11px] bg-yellow-400/10 px-2.5 py-0.5 rounded-md border border-yellow-400/30 font-bold text-yellow-400">
                {pendingMachines.length} Makine
              </span>
            </div>
            <div className="space-y-2">
              {pendingMachines.map(renderHomeMachineRow)}
            </div>
          </div>
        )}

        {/* Bakımı Biten (Tamamlanan) Makineler */}
        {completedMachines.length > 0 && (filterTab === 'all' || filterTab === 'completed') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 text-xs font-black text-emerald-400">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span>BAKIMI BİTEN (TAMAMLANAN) MAKİNELER</span>
              </div>
              <span className="text-[11px] bg-emerald-950/80 px-2.5 py-0.5 rounded-md border border-emerald-800/60 font-bold text-emerald-400">
                {completedMachines.length} Makine
              </span>
            </div>
            <div className="space-y-2">
              {completedMachines.map(renderHomeMachineRow)}
            </div>
          </div>
        )}

        {filteredMachinesList.length === 0 && (
          <div className="bg-[#1b263b] p-8 text-center rounded-2xl border border-slate-700/70 text-slate-400">
            Aramanıza uygun makine bulunamadı.
          </div>
        )}
      </div>
    </div>
  );
};
