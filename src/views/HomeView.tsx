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

export type MachineGroup = string;

export const getMachineGroup = (m: Machine, costCenter?: string): string => {
  const cc = (costCenter || m.costCenter || m.maliyetMerkezi || '').trim();
  if (
    cc &&
    cc !== '#N/A' &&
    cc.toUpperCase() !== 'MALİYET MER' &&
    cc.toLowerCase() !== 'null' &&
    cc.toLowerCase() !== 'undefined'
  ) {
    return cc;
  }
  return 'Genel';
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
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

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

  // Dynamic Group Statistics from the Sheet's CostCenter column
  const groupStats = useMemo(() => {
    const stats: Record<string, { count: number; totalPlanned: number; completed: number }> = {};
    machineListWithStats.forEach((item) => {
      const g = item.group;
      if (!stats[g]) {
        stats[g] = { count: 0, totalPlanned: 0, completed: 0 };
      }
      stats[g].count++;
      stats[g].totalPlanned += item.totalTasks;
      stats[g].completed += item.completedTasks;
    });
    return stats;
  }, [machineListWithStats]);

  // All unique available groups extracted dynamically from the CostCenter column
  const availableGroups = useMemo(() => {
    const keys = Object.keys(groupStats);
    return keys.sort((a, b) => {
      // Keep 01-350522 first if present, otherwise sort naturally
      if (a.includes('350522')) return -1;
      if (b.includes('350522')) return 1;
      return a.localeCompare(b, 'tr-TR');
    });
  }, [groupStats]);

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
      const groupStr = (item.group || '').toLowerCase();

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

  // Dynamically group machine rows by the exact CostCenter column value
  const groupedMachineRows = useMemo(() => {
    const groupMap: Record<
      string,
      {
        key: string;
        title: string;
        subtitle: string;
        iconType: 'wrench' | 'factory';
        items: typeof filteredMachineRows;
        totalPlanned: number;
        completed: number;
      }
    > = {};

    filteredMachineRows.forEach((item) => {
      const gKey = item.group;
      if (!groupMap[gKey]) {
        const isBakim = /bakım|onarim|onarım|350522|kompresör|altyapı/i.test(gKey);
        groupMap[gKey] = {
          key: gKey,
          title: gKey,
          subtitle: `Maliyet Merkezi: ${gKey}`,
          iconType: isBakim ? 'wrench' : 'factory',
          items: [],
          totalPlanned: 0,
          completed: 0,
        };
      }
      groupMap[gKey].items.push(item);
      groupMap[gKey].totalPlanned += item.totalTasks;
      groupMap[gKey].completed += item.completedTasks;
    });

    const groupsList = Object.values(groupMap);
    // Sort groups: 01-350522 first, then alphabetical
    groupsList.sort((a, b) => {
      if (a.key.includes('350522')) return -1;
      if (b.key.includes('350522')) return 1;
      return a.title.localeCompare(b.title, 'tr-TR');
    });

    if (selectedGroup !== 'all') {
      return groupsList.filter((g) => g.key === selectedGroup && g.items.length > 0);
    }

    return groupsList.filter((g) => g.items.length > 0);
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

      {/* KPI Stats Summary Bar: 2 Satır (Rakamlar Altta) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {/* Satır 1 / 1: Planlanan */}
        <div className="bg-[#1b263b] p-3 sm:p-4 rounded-2xl border border-slate-700/70 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Planlanan</span>
            <Clock className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-yellow-400 font-mono">{totalPlanned}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">{machineListWithStats.length} Makine</div>
        </div>

        {/* Satır 1 / 2: Tamamlanan (YEŞİL #00c853) */}
        <div className="bg-[#1b263b] p-3 sm:p-4 rounded-2xl border border-[#00c853]/40 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#00c853]">Tamamlanan</span>
            <CheckCircle2 className="w-4 h-4 text-[#00c853]" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-[#00c853] font-mono">{completed}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Bu hafta yapılan</div>
        </div>

        {/* Satır 1 / 3: Bekleyen */}
        <div className="bg-[#1b263b] p-3 sm:p-4 rounded-2xl border border-slate-700/70 shadow-md col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-400">Bekleyen</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono">{pendingCount}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Kalan kontrol</div>
        </div>

        {/* Satır 2 / 1: UYGUN */}
        <div className="bg-[#1b263b] p-3 sm:p-4 rounded-2xl border border-slate-700/70 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-300">UYGUN</span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#00c853] inline-block shadow-[0_0_8px_rgba(0,200,83,0.6)]" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-[#00c853] font-mono">{uygunCount}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Sorunsuz kayıt</div>
        </div>

        {/* Satır 2 / 2: RED Arıza */}
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

        {/* Satır 2 / 3: İlerleme % */}
        <div className="bg-[#1b263b] p-3 sm:p-4 rounded-2xl border border-slate-700/70 shadow-md col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-yellow-400">İlerleme</span>
            <TrendingUp className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-yellow-400 font-mono">%{completionRate}</div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                completionRate >= 90 ? 'bg-[#00c853]' : completionRate >= 50 ? 'bg-yellow-400' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, completionRate)}%` }}
            />
          </div>
        </div>
      </div>

      {/* SADE SATIR LİSTESİ: Butonsuz, doğrudan tıklanabilir makine satırları */}
      <div className="bg-[#121a29] rounded-2xl sm:rounded-3xl border border-slate-700/80 p-3 sm:p-5 shadow-xl space-y-4">
        {/* Başlık & Grup / Durum Filtreleri (Ayrıcı çizgisiz) */}
        <div className="space-y-3 pb-1">
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

          {/* Departman / Grup Filtresi (Açılır Liste - Yer Tasarruflu ve Pratik) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <label htmlFor="group-select-dropdown" className="sr-only">
                Grup Seçimi
              </label>
              <div className="relative flex items-center bg-[#090f19] border border-slate-700/80 hover:border-yellow-400/70 focus-within:border-yellow-400 focus-within:ring-1 focus-within:ring-yellow-400/50 rounded-xl px-3 py-2 transition-all shadow-xs">
                <Layers className="w-4 h-4 text-yellow-400 shrink-0 mr-2" />
                <span className="text-xs font-bold text-slate-400 mr-2 shrink-0">
                  Grup:
                </span>
                <select
                  id="group-select-dropdown"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full bg-transparent text-white font-bold text-xs sm:text-sm focus:outline-none cursor-pointer pr-7 appearance-none truncate [&>option]:bg-[#121a29] [&>option]:text-white [&>option]:py-2"
                >
                  <option value="all">
                    Tüm Gruplar ({machineListWithStats.length} Makine)
                  </option>
                  {availableGroups.map((groupName) => {
                    const count = groupStats[groupName]?.count || 0;
                    return (
                      <option key={groupName} value={groupName}>
                        {groupName} ({count} Makine)
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="w-4 h-4 text-yellow-400 shrink-0 pointer-events-none absolute right-3" />
              </div>
            </div>

            {/* Seçili Grup Temizleme Butonu */}
            {selectedGroup !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedGroup('all')}
                className="px-3 py-2 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-400 border border-yellow-400/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95"
                title="Tüm Gruplara Dön"
              >
                <X className="w-3.5 h-3.5" />
                <span>Tüm Gruplara Dön</span>
              </button>
            )}
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

        {/* GRUPLANDIRILMIŞ MAKİNE LİSTESİ */}
        {groupedMachineRows.length === 0 ? (
          <div className="text-center py-10 bg-[#0d1421] rounded-2xl border border-dashed border-slate-700 p-6 space-y-2">
            <Wrench className="w-8 h-8 text-slate-500 mx-auto" />
            <h4 className="text-xs sm:text-sm font-bold text-slate-300">Makine bulunamadı</h4>
            <p className="text-[11px] text-slate-500">
              Arama kriterini veya grup filtresini değiştirerek tekrar deneyiniz.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
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

                    {/* Açma / Kapama ve Grup Göstergesi */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        {/* Grup Göstergesi (İlerleme Çubuğu) */}
                        <div className="w-14 sm:w-20 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-700/80 hidden xs:block">
                          <div
                            className="h-full bg-[#00c853] rounded-full transition-all duration-300"
                            style={{
                              width: `${group.totalPlanned > 0 ? (group.completed / group.totalPlanned) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        {/* Yapılan Bakım Rakamı YEŞİL #00c853 */}
                        <div className="flex items-baseline gap-0.5 px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700/80 text-xs font-mono">
                          <span className="text-[#00c853] font-bold">{group.completed}</span>
                          <span className="text-slate-400 text-[11px]">/{group.totalPlanned}</span>
                        </div>
                      </div>

                      <div className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400 group-hover/btn:text-yellow-400 group-hover/btn:border-yellow-400/50 transition-all">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-yellow-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Karta Tıklandığında Açılan Makine Listesi: Görseldeki Gibi Satırlar (Satır Şekli Korundu, Ayrıcı Çizgi Yok) */}
                  {isExpanded && (
                    <div className="p-3 sm:p-4 pt-1 space-y-2.5">
                      {group.items.map((item) => {
                        const m = item.machine;
                        const machineId = m.id || m.machineName;
                        const percent = item.totalTasks > 0 ? Math.round((item.completedTasks / item.totalTasks) * 100) : 0;

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
                            className={`group w-full p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all duration-150 cursor-pointer select-none active:scale-[0.99] border ${
                              item.hasRed
                                ? 'bg-[#181119] border-rose-600/70 hover:border-rose-400 hover:bg-[#201421]'
                                : item.isCompleted
                                ? 'bg-[#0e1724] border-[#00c853]/40 hover:border-[#00c853] hover:bg-[#121e30]'
                                : 'bg-[#0e1624] border-slate-700/80 hover:border-yellow-400/80 hover:bg-[#131f33]'
                            } shadow-xs hover:shadow-lg`}
                          >
                            {/* Üst Kısım: Makine Adı (Sarı) + Sağda Yeşil Rakamlar & Gösterge (Buton/QR yok, tek parça tıkla) */}
                            <div className="flex items-center justify-between gap-3">
                              {/* Makine Adı: Görseldeki gibi sarı, belirgin ve ince/zarif ("ALÜ TEST-1" stili, yanında grup adı yok) */}
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-yellow-400 font-bold text-sm sm:text-base tracking-wide group-hover:text-yellow-300 transition-colors truncate">
                                  {m.machineName}
                                </span>
                              </div>

                              {/* Sağ Kısım: Yapılan Bakımlar Rakamları YEŞİL + Gösterge (Bekliyor kaldırıldı) */}
                              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                {item.hasRed && (
                                  <span className="px-2 py-0.5 rounded-md bg-rose-600/25 text-rose-300 text-[10px] sm:text-xs font-black border border-rose-500/50 uppercase tracking-wider flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                                    ARIZA
                                  </span>
                                )}

                                {/* Yeşil Gösterge Çubuğu */}
                                <div className="w-16 sm:w-24 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-700/70 hidden xs:block">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      item.hasRed
                                        ? 'bg-rose-500'
                                        : item.isCompleted
                                        ? 'bg-[#00c853] shadow-[0_0_8px_rgba(0,200,83,0.6)]'
                                        : 'bg-[#00c853]'
                                    }`}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>

                                {/* Yapılan Bakım Rakamı: YEŞİL (#00c853) */}
                                <div className="flex items-baseline gap-0.5 bg-slate-900/95 px-2.5 py-1 rounded-lg border border-slate-700/80 font-mono">
                                  <span className="text-[#00c853] font-black text-xs sm:text-sm">
                                    {item.completedTasks}
                                  </span>
                                  <span className="text-slate-400 text-xs">
                                    /{item.totalTasks}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Alt Kısım: Görseldeki gibi Adım / Durum Rozetleri Satırı (Yeşil OK ve Kırmızı RED) */}
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2.5 pt-0.5">
                              {item.tasksWithStatus.map((t, idx) => {
                                if (t.status === 'tamamlanan') {
                                  return (
                                    <span
                                      key={idx}
                                      title={`${idx + 1}. ${t.task.task || 'Bakım'} (Tamamlandı)`}
                                      className="h-6 sm:h-7 px-2.5 rounded-md bg-[#00c853] text-black font-black text-[11px] sm:text-xs flex items-center gap-1 shadow-xs"
                                    >
                                      <Check className="w-3 h-3 stroke-[3]" />
                                      <span>OK</span>
                                    </span>
                                  );
                                }
                                if (t.status === 'red') {
                                  return (
                                    <span
                                      key={idx}
                                      title={`${idx + 1}. ${t.task.task || 'Bakım'} (Arıza / RED)`}
                                      className="h-6 sm:h-7 px-2.5 rounded-md bg-[#ef4444] text-white font-black text-[11px] sm:text-xs flex items-center gap-1 shadow-xs animate-pulse"
                                    >
                                      <span>RED</span>
                                    </span>
                                  );
                                }
                                // Bekleyen: "Bekliyor" yazısı YOK, sade adım numarası rozeti
                                return (
                                  <span
                                    key={idx}
                                    title={`${idx + 1}. ${t.task.task || 'Bakım'}`}
                                    className="min-w-[26px] h-6 sm:h-7 px-1.5 rounded-md bg-slate-800/90 text-slate-400 border border-slate-700/70 font-bold text-[11px] sm:text-xs flex items-center justify-center"
                                  >
                                    {idx + 1}
                                  </span>
                                );
                              })}
                              {item.tasksWithStatus.length === 0 && (
                                <span className="text-xs text-slate-500 italic">Tanımlı bakım maddesi yok</span>
                              )}
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
