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
  X,
  Check,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  QrCode,
  Factory,
  Layers,
} from 'lucide-react';

export type MachineGroup = '01-350522-Bakim ve Onarim & Üretim' | 'Üretim';

export const getMachineGroup = (m: Machine, costCenter?: string): MachineGroup => {
  const cc = (costCenter || m.costCenter || m.maliyetMerkezi || '').trim();
  const name = (m.machineName || '').toUpperCase();
  if (
    cc.includes('350522') ||
    cc.toUpperCase().includes('BAKIM VE ONARIM') ||
    cc.toUpperCase().includes('BAKIM') ||
    name.includes('KOMPRESÖR') ||
    name.includes('LUPAMAT') ||
    name.includes('JENARATÖR') ||
    name.includes('TEMİZ SU') ||
    name.includes('DOĞAL GAZ')
  ) {
    return '01-350522-Bakim ve Onarim & Üretim';
  }
  return 'Üretim';
};

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
  const [uploadQueue, setUploadQueue] = useState<QueuedRecord[]>(() => uploadQueueService.getQueue());

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'red'>('all');
  const [selectedGroup, setSelectedGroup] = useState<'all' | '01-350522-Bakim ve Onarim & Üretim' | 'Üretim'>('all');

  // Accordion state: clicking a card opens its machine list
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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

  // Helper to match active tasks to a machine
  const getTasksForMachine = (m: Machine) => {
    const mid = (m.id || '').trim().toLowerCase();
    const mName = (m.machineName || '').trim().toLowerCase();
    const mCode = (m.code || m.machineCode || '').trim().toLowerCase();
    const mCost = (m.costCenter || '').trim().toLowerCase();

    return activeTemplates.filter((t) => {
      const tMid = (t.machineId || '').trim().toLowerCase();
      const tMName = (t.machineName || '').trim().toLowerCase();

      return (
        (tMid && (tMid === mid || tMid === mCode || tMid === mCost)) ||
        (tMName && (tMName === mName || tMName.includes(mName) || mName.includes(tMName))) ||
        tMid === mid
      );
    }).sort((a, b) => (a.orderNo || 1) - (b.orderNo || 1));
  };

  // Helper to match a task's record for a machine
  const getTaskRecord = (machine: Machine, task: MaintenanceTemplate) => {
    const cleanTid = (task.templateId || '').trim().toLowerCase();
    const cleanMid = (machine.id || '').trim().toLowerCase();
    const cleanMName = (machine.machineName || '').trim().toLowerCase();

    return currentWeekRecords.find((r) => {
      const rTid = (r.templateId || '').trim().toLowerCase();
      if (rTid !== cleanTid) return false;
      const rMid = (r.machineId || '').trim().toLowerCase();
      const rMName = (r.machineName || '').trim().toLowerCase();
      return (
        rMid === cleanMid ||
        rMName === cleanMName ||
        (cleanMid && (rMid.includes(cleanMid) || cleanMid.includes(rMid)))
      );
    });
  };

  // Aggregate stats per machine
  const machineListWithStats = useMemo(() => {
    return machines
      .map((machine) => {
        const tasks = getTasksForMachine(machine);
        if (tasks.length === 0) return null;

        const resolvedCostCenter = (machine.costCenter || tasks[0]?.costCenter || '').trim();
        const group = getMachineGroup(machine, resolvedCostCenter);

        let okCount = 0;
        let redCount = 0;

        const tasksWithStatus = tasks.map((task) => {
          const rec = getTaskRecord(machine, task);
          let status: 'tamamlanan' | 'red' | 'bekleyen' = 'bekleyen';
          if (rec) {
            if (String(rec.result || '').toUpperCase().includes('RED')) {
              status = 'red';
              redCount++;
            } else {
              status = 'tamamlanan';
              okCount++;
            }
          }

          return {
            task,
            record: rec || null,
            status,
          };
        });

        const totalTasks = tasks.length;
        const completedTasks = okCount + redCount;
        const pendingTasks = Math.max(0, totalTasks - completedTasks);
        const completionRate = totalTasks > 0 ? Math.min(100, Math.round((completedTasks / totalTasks) * 100)) : 0;

        return {
          machine: {
            ...machine,
            costCenter: resolvedCostCenter || machine.costCenter,
          },
          costCenter: resolvedCostCenter,
          group,
          totalTasks,
          completedTasks,
          pendingTasks,
          okCount,
          redCount,
          completionRate,
          tasksWithStatus,
          isCompleted: pendingTasks === 0,
          hasRed: redCount > 0,
          isPending: pendingTasks > 0,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [machines, activeTemplates, currentWeekRecords]);

  // Department group counts
  const groupCounts = useMemo(() => {
    let bakimOnarim = 0;
    let uretim = 0;
    machineListWithStats.forEach((item) => {
      if (item.group === '01-350522-Bakim ve Onarim & Üretim') {
        bakimOnarim++;
      } else {
        uretim++;
      }
    });
    return { bakimOnarim, uretim };
  }, [machineListWithStats]);

  // Overall KPIs
  const { totalPlanned, completed, redCount, uygunCount, pendingCount, completionRate } = useMemo(() => {
    let planned = 0;
    let done = 0;
    let red = 0;
    let ok = 0;

    machineListWithStats.forEach((item) => {
      planned += item.totalTasks;
      done += item.completedTasks;
      red += item.redCount;
      ok += item.okCount;
    });

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
  }, [machineListWithStats]);

  // Filtered machine rows based on search, group and status
  const filteredMachineRows = useMemo(() => {
    return machineListWithStats.filter((item) => {
      const m = item.machine;
      const search = searchQuery.toLowerCase().trim();
      const codeStr = (m.machineCode || m.code || item.costCenter || '').toLowerCase();
      const nameStr = (m.machineName || '').toLowerCase();
      const groupStr = item.group.toLowerCase();

      const matchesSearch =
        !search ||
        nameStr.includes(search) ||
        codeStr.includes(search) ||
        groupStr.includes(search);
      if (!matchesSearch) return false;

      if (selectedGroup !== 'all' && item.group !== selectedGroup) return false;

      if (statusFilter === 'pending') return item.isPending;
      if (statusFilter === 'completed') return item.isCompleted;
      if (statusFilter === 'red') return item.hasRed;
      return true;
    });
  }, [machineListWithStats, searchQuery, statusFilter, selectedGroup]);

  // Grouped machine rows for clean section headers
  const groupedMachineRows = useMemo(() => {
    const groups: {
      key: '01-350522-Bakim ve Onarim & Üretim' | 'Üretim';
      title: string;
      subtitle: string;
      iconType: 'wrench' | 'factory';
      items: typeof filteredMachineRows;
      totalPlanned: number;
      completed: number;
    }[] = [
      {
        key: '01-350522-Bakim ve Onarim & Üretim',
        title: '01-350522 - Bakım ve Onarım & Üretim',
        subtitle: 'Kompresörler, Jenaratörler, Fabrika Su ve Altyapı Sistemleri',
        iconType: 'wrench',
        items: [],
        totalPlanned: 0,
        completed: 0,
      },
      {
        key: 'Üretim',
        title: 'Üretim',
        subtitle: 'Fin Makineleri, Fırın CAB, Test, Yağ Alma ve İmalat Hatları',
        iconType: 'factory',
        items: [],
        totalPlanned: 0,
        completed: 0,
      },
    ];

    filteredMachineRows.forEach((item) => {
      const targetKey = item.group === '01-350522-Bakim ve Onarim & Üretim'
        ? '01-350522-Bakim ve Onarim & Üretim'
        : 'Üretim';
      const grp = groups.find((g) => g.key === targetKey);
      if (grp) {
        grp.items.push(item);
        grp.totalPlanned += item.totalTasks;
        grp.completed += item.completedTasks;
      }
    });

    if (selectedGroup !== 'all') {
      return groups.filter((g) => g.key === selectedGroup && g.items.length > 0);
    }

    return groups.filter((g) => g.items.length > 0);
  }, [filteredMachineRows, selectedGroup]);

  // Click on a row: navigates directly to operator maintenance screen and starts QR scanning immediately
  const handleOpenMaintenance = (m: Machine) => {
    if (onSelectMachine) {
      onSelectMachine(m);
    } else {
      onNavigate('operator');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3.5 sm:py-6 space-y-4 sm:space-y-6">
      {/* Hero Command Banner */}
      <div className="bg-gradient-to-br from-[#1c283e] via-[#162133] to-[#22334e] text-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl relative overflow-hidden border border-yellow-500/40">
        <div className="relative z-10 max-w-3xl">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
            <span className="px-2.5 py-0.5 bg-yellow-400/20 text-yellow-300 rounded-md text-[11px] sm:text-xs font-mono font-black border border-yellow-400/40">
              Dönem: {currentWeek}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Hoş Geldiniz, <span className="text-yellow-400">{operatorName}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Makinelerin durumunu inceleyin; satırın üzerine tıklayarak QR kodunu okutup periyodik bakımı gerçekleştirin.
          </p>
        </div>

        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-15 bg-[radial-gradient(#facc15_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-yellow-400/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* KPI Stats Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
        {/* Planlanan */}
        <div className="bg-[#1b263b] p-3 sm:p-4 rounded-2xl border border-slate-700/70 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Planlanan</span>
            <Clock className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-yellow-400 font-mono">{totalPlanned}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">{machineListWithStats.length} Makine</div>
        </div>

        {/* Tamamlanan */}
        <div className="bg-[#1b263b] p-3 sm:p-4 rounded-2xl border border-slate-700/70 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-400">Tamamlanan</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">{completed}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Bu hafta yapılan</div>
        </div>

        {/* Bekleyen */}
        <div className="bg-[#1b263b] p-3 sm:p-4 rounded-2xl border border-slate-700/70 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-400">Bekleyen</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono">{pendingCount}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Kalan kontrol</div>
        </div>

        {/* UYGUN */}
        <div className="bg-[#1b263b] p-3 sm:p-4 rounded-2xl border border-slate-700/70 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-300">UYGUN</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">{uygunCount}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Sorunsuz kayıt</div>
        </div>

        {/* RED Arıza */}
        <div
          onClick={() => redCount > 0 && onNavigate('redList')}
          className={`p-3 sm:p-4 rounded-2xl border shadow-md transition-all ${
            redCount > 0
              ? 'bg-rose-950/40 border-rose-600/70 cursor-pointer hover:bg-rose-950/60'
              : 'bg-[#1b263b] border-slate-700/70'
          }`}
        >
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider">RED Arıza</span>
            <AlertTriangle className={`w-4 h-4 ${redCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-400 font-mono">{redCount}</div>
          <div className="text-[11px] text-rose-300 font-medium mt-0.5">
            {redCount > 0 ? 'Tıklayıp Listeyi Gör' : 'Kritik müdahale'}
          </div>
        </div>

        {/* İlerleme % */}
        <div className="bg-[#1b263b] p-3 sm:p-4 rounded-2xl border border-slate-700/70 shadow-md">
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

      {/* SADE SATIR LİSTESİ: Butonsuz, doğrudan tıklanabilir makine satırları */}
      <div className="bg-[#121a29] rounded-2xl sm:rounded-3xl border border-slate-700/80 p-3 sm:p-5 shadow-xl space-y-4">
        {/* Başlık & Grup / Durum Filtreleri */}
        <div className="space-y-3 pb-3 border-b border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block shadow-xs" />
              <span>Haftalık Makine Bakım Listesi</span>
            </h3>

            {/* Durum Filtreleri (Tümü, Bekleyen, Tamamlanan, RED) */}
            <div className="flex flex-wrap items-center gap-1.5 bg-[#0b121e] p-1 rounded-xl border border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-yellow-400 text-black font-black shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tümü ({machineListWithStats.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'pending'
                    ? 'bg-amber-400 text-black font-black shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Bekleyen ({machineListWithStats.filter((i) => i.isPending).length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'completed'
                    ? 'bg-emerald-400 text-black font-black shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tamamlanan ({machineListWithStats.filter((i) => i.isCompleted).length})
              </button>
              {machineListWithStats.some((i) => i.hasRed) && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('red')}
                  className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    statusFilter === 'red'
                      ? 'bg-rose-600 text-white font-black shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  RED Arızalı ({machineListWithStats.filter((i) => i.hasRed).length})
                </button>
              )}
            </div>
          </div>

          {/* Departman / Grup Filtre Sekmeleri: 01-350522-Bakim ve Onarim & Üretim */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 mr-1 hidden sm:inline">Grup:</span>
            <button
              type="button"
              onClick={() => setSelectedGroup('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                selectedGroup === 'all'
                  ? 'bg-yellow-400 text-black border-yellow-400 shadow-md font-black'
                  : 'bg-[#090f19] text-slate-300 border-slate-700/80 hover:border-slate-500'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Tüm Gruplar</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                selectedGroup === 'all' ? 'bg-black/20 text-black' : 'bg-slate-800 text-slate-400'
              }`}>
                {machineListWithStats.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedGroup('01-350522-Bakim ve Onarim & Üretim')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                selectedGroup === '01-350522-Bakim ve Onarim & Üretim'
                  ? 'bg-yellow-400 text-black border-yellow-400 shadow-md font-black'
                  : 'bg-[#090f19] text-slate-300 border-slate-700/80 hover:border-slate-500'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>01-350522 - Bakım ve Onarım & Üretim</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                selectedGroup === '01-350522-Bakim ve Onarim & Üretim' ? 'bg-black/20 text-black' : 'bg-slate-800 text-yellow-400'
              }`}>
                {groupCounts.bakimOnarim}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedGroup('Üretim')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                selectedGroup === 'Üretim'
                  ? 'bg-yellow-400 text-black border-yellow-400 shadow-md font-black'
                  : 'bg-[#090f19] text-slate-300 border-slate-700/80 hover:border-slate-500'
              }`}
            >
              <Factory className="w-3.5 h-3.5" />
              <span>Üretim</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                selectedGroup === 'Üretim' ? 'bg-black/20 text-black' : 'bg-slate-800 text-cyan-300'
              }`}>
                {groupCounts.uretim}
              </span>
            </button>
          </div>
        </div>

        {/* Arama Çubuğu */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Makine adı, kod veya grup ile ara..."
            className="w-full pl-10 pr-9 py-2 bg-[#090e17] border border-slate-700/80 rounded-xl text-xs sm:text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-yellow-400 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* GRUPLANDIRILMIŞ MAKİNE LİSTESİ: 2 Satırlı Kartlar (Rakamlar Altta) */}
        {groupedMachineRows.length === 0 ? (
          <div className="text-center py-10 bg-[#0d1421] rounded-2xl border border-dashed border-slate-700 p-6 space-y-2">
            <Wrench className="w-8 h-8 text-slate-500 mx-auto" />
            <h4 className="text-xs sm:text-sm font-bold text-slate-300">Makine bulunamadı</h4>
            <p className="text-[11px] text-slate-500">
              Arama kriterini veya grup filtresini değiştirerek tekrar deneyiniz.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedMachineRows.map((group) => {
              const isExpanded = !!expandedGroups[group.key] || searchQuery.trim().length > 0;

              return (
                /* TEK BİR ANA KART: Karta tıklandığında liste açılır/kapanır (ayrıcı çizgi yok) */
                <div
                  key={group.key}
                  className="rounded-2xl bg-[#0c1421] border border-slate-700/80 shadow-lg overflow-hidden transition-all duration-200"
                >
                  {/* Grup Kartı Başlığı (Karta tıklanınca liste açılır) */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-[#101929] transition-colors cursor-pointer select-none group/btn"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 flex items-center justify-center shrink-0">
                        {group.iconType === 'wrench' ? (
                          <Wrench className="w-4 h-4 text-yellow-400" />
                        ) : (
                          <Factory className="w-4 h-4 text-cyan-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-wide group-hover/btn:text-yellow-300 transition-colors">
                            {group.title}
                          </h4>
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-yellow-300 text-[10px] font-mono font-bold border border-slate-700 shrink-0">
                            {group.items.length} Makine
                          </span>
                        </div>
                        {group.subtitle && (
                          <p className="text-[10px] sm:text-[11px] text-slate-400 truncate mt-0.5">
                            {group.subtitle}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Açma / Kapama Göstergesi */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-400 hidden sm:inline-block font-medium">
                        {isExpanded ? 'Listeyi Gizle' : 'Makineleri Göster'}
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400 group-hover/btn:text-yellow-400 group-hover/btn:border-yellow-400/50 transition-all">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-yellow-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Karta Tıklandığında Açılan Sade Makine Listesi (Sayı ve QR kaldırıldı) */}
                  {isExpanded && (
                    <div className="p-3 sm:p-4 pt-1 space-y-2">
                      {group.items.map((item) => {
                        const m = item.machine;
                        const machineId = m.id || m.machineName;

                        return (
                          <div
                            key={machineId}
                            onClick={() => handleOpenMaintenance(m)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenMaintenance(m);
                              }
                            }}
                            className={`group flex items-center justify-between p-3 sm:p-3.5 rounded-xl border transition-all duration-150 cursor-pointer select-none ${
                              item.hasRed
                                ? 'bg-[#151a27] border-rose-600/70 hover:border-rose-400 hover:bg-[#1a2030]'
                                : item.isCompleted
                                ? 'bg-[#111a28] border-emerald-500/40 hover:border-emerald-400 hover:bg-[#142032]'
                                : 'bg-[#111a28] border-slate-800/90 hover:border-yellow-400/80 hover:bg-[#162337]'
                            } shadow-xs hover:shadow-md active:scale-[0.995]`}
                          >
                            {/* Sol: Sade Makine Adı (İnce yazı) ve Küçük Durum Noktası */}
                            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  item.hasRed
                                    ? 'bg-rose-500 ring-2 ring-rose-500/30'
                                    : item.isCompleted
                                    ? 'bg-emerald-400 ring-2 ring-emerald-400/30'
                                    : 'bg-yellow-400/70'
                                }`}
                              />
                              <span className="text-yellow-300 font-light text-xs sm:text-sm tracking-wide group-hover:text-yellow-200 transition-colors truncate">
                                {m.machineName}
                              </span>
                            </div>

                            {/* Sağ: Sade Durum Etiketi ve İnce Ok (Sayılar ve QR ikonu kaldırıldı) */}
                            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                              {item.hasRed ? (
                                <span className="px-2 py-0.5 rounded-md bg-rose-600/20 text-rose-300 text-[10px] font-bold border border-rose-500/40 uppercase tracking-wider flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                                  Arıza
                                </span>
                              ) : item.isCompleted ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40 flex items-center gap-1">
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  Tamamlandı
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400 text-[10px] font-medium border border-slate-700/60">
                                  Bekliyor
                                </span>
                              )}
                              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-yellow-400 group-hover:translate-x-0.5 transition-all" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
