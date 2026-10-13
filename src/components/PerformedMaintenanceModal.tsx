import React, { useState } from 'react';
import { MaintenanceRecord, Machine, MaintenanceTemplate } from '../types/cmms';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Camera,
  Maximize2,
  X,
  Wrench,
  RotateCcw,
  Search,
  ExternalLink,
  Layers,
  MapPin,
  FileText,
} from 'lucide-react';
import { extractDriveFileId } from '../views/RedListView';
import { getWeekKey, normalizeWeekKey } from '../services/cmmsApi';

interface PerformedMaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: Machine | null;
  records: MaintenanceRecord[];
  templates: MaintenanceTemplate[];
  onEditTask?: (template: MaintenanceTemplate) => void;
}

export const PerformedMaintenanceModal: React.FC<PerformedMaintenanceModalProps> = ({
  isOpen,
  onClose,
  machine,
  records,
  templates,
  onEditTask,
}) => {
  const currentWeek = getWeekKey();
  const [weekScope, setWeekScope] = useState<'current' | 'all'>('current');
  const [filterResult, setFilterResult] = useState<'ALL' | 'OK' | 'RED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [lightboxImg, setLightboxImg] = useState<{ url: string; title: string } | null>(null);

  if (!isOpen || !machine) return null;

  const cleanMid = (machine.id || '').trim().toLowerCase();
  const cleanMName = (machine.machineName || '').trim().toLowerCase();

  // Find all active templates for this machine
  const machineTemplates = templates
    .filter((t) => {
      const tMid = (t.machineId || '').trim().toLowerCase();
      const tMName = (t.machineName || '').trim().toLowerCase();
      return (
        t.active &&
        (tMid === cleanMid ||
          tMName === cleanMName ||
          (cleanMid && (tMid.includes(cleanMid) || cleanMid.includes(tMid))) ||
          (cleanMName && (tMName.includes(cleanMName) || cleanMName.includes(tMName))))
      );
    })
    .sort((a, b) => (a.orderNo || 1) - (b.orderNo || 1));

  // Combine synced records with local upload queue for instant 0ms access
  const allAvailableRecords: MaintenanceRecord[] = [...records];
  try {
    const queue = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('cmms_upload_queue') || '[]') : [];
    if (Array.isArray(queue)) {
      queue.forEach((q: any) => {
        allAvailableRecords.push({
          recordId: q.id || `QUEUE-${Date.now()}`,
          clientRequestId: q.id,
          templateId: q.templateId,
          machineId: q.machineId,
          machineName: q.machineName,
          operator: q.operator || 'Operatör',
          result: q.result || 'UYGUN',
          measuredValue: q.measuredValue || '',
          description: q.description || '',
          proofImageUrl: q.proofImageUrl || '',
          weekKey: q.weekKey || '',
          createdAt: new Date(q.timestamp || Date.now()).toISOString(),
        });
      });
    }
  } catch {}

  // Find all records matching this machine (filtered by weekScope: current week by default)
  const machineRecords = allAvailableRecords.filter((r) => {
    const rMid = (r.machineId || '').trim().toLowerCase();
    const rMName = (r.machineName || '').trim().toLowerCase();
    const matchesMachine = (
      rMid === cleanMid ||
      rMName === cleanMName ||
      (cleanMid && (rMid.includes(cleanMid) || cleanMid.includes(rMid))) ||
      (cleanMName && (rMName.includes(cleanMName) || cleanMName.includes(rMName)))
    );
    if (!matchesMachine) return false;
    if (weekScope === 'current') {
      return normalizeWeekKey(r.weekKey, r.createdAt) === currentWeek;
    }
    return true;
  });

  // Map each template to its most recent performed record
  const performedItems = machineTemplates.map((tmpl) => {
    const cleanTid = (tmpl.templateId || '').trim().toLowerCase();
    const cleanTask = (tmpl.task || '').trim().toLowerCase();

    const matches = machineRecords.filter((r) => {
      const rTid = (r.templateId || '').trim().toLowerCase();
      const rTask = (r.task || '').trim().toLowerCase();
      return rTid === cleanTid || (cleanTask && rTask === cleanTask);
    });

    const matchingRecord = matches.length > 0 ? matches[matches.length - 1] : null;
    return {
      template: tmpl,
      record: matchingRecord || null,
      isDone: !!matchingRecord,
    };
  });

  // Filter only items that have actually been performed
  const doneItems = performedItems.filter((item) => item.isDone);

  // Apply result and search filters
  const filteredDone = doneItems.filter((item) => {
    if (!item.record) return false;
    const isRedRec = String(item.record.result || '').toUpperCase().includes('RED');
    if (filterResult === 'OK' && isRedRec) return false;
    if (filterResult === 'RED' && !isRedRec) return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const taskMatch = item.template.task.toLowerCase().includes(q);
      const opMatch = (item.record.operator || '').toLowerCase().includes(q);
      const descMatch = (item.record.description || '').toLowerCase().includes(q);
      const valMatch = (item.record.measuredValue || '').toLowerCase().includes(q);
      const regMatch = (item.template.region || '').toLowerCase().includes(q);
      return taskMatch || opMatch || descMatch || valMatch || regMatch;
    }
    return true;
  });

  // Helper: retrieve best image source (local base64 or Google Drive or proxy)
  const getProofImageUrl = (record: MaintenanceRecord, templateId: string): string | null => {
    if (typeof window === 'undefined') return record.proofImageUrl || null;
    try {
      const localDirect =
        localStorage.getItem(`proofImg_${record.recordId}`) ||
        (record.clientRequestId ? localStorage.getItem(`proofImg_${record.clientRequestId}`) : null) ||
        localStorage.getItem(`proofImg_${machine.id}_${templateId}`) ||
        localStorage.getItem(`proofImg_${templateId}`);
      if (localDirect) return localDirect;

      const map = JSON.parse(localStorage.getItem('cmms_photos_map') || '{}');
      if (record.recordId && map[record.recordId]) return map[record.recordId];
      if (templateId && map[templateId]) return map[templateId];
      if (map[`${machine.id}_${templateId}`]) return map[`${machine.id}_${templateId}`];
    } catch {}

    const raw = record.proofImageUrl || '';
    if (raw.startsWith('data:')) return raw;
    const fId = extractDriveFileId(raw);
    if (fId) return `/api/drive-image/${fId}`;
    return raw || null;
  };

  const totalTasks = machineTemplates.length;
  const completedCount = doneItems.length;
  const uygunCount = doneItems.filter((i) => i.record?.result === 'UYGUN').length;
  const redCount = doneItems.filter((i) => i.record?.result === 'RED').length;
  const percent = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 sm:p-5 backdrop-blur-sm animate-in fade-in-50">
      <div className="bg-[#182338] border border-yellow-500/40 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-[#131d2e] p-4 sm:p-6 border-b border-yellow-500/30 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-[10px] sm:text-xs font-mono font-black bg-yellow-400 text-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                {machine.costCenter || machine.code || machine.id}
              </span>
              <span className="text-xs font-black text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-md border border-yellow-400/30">
                Yapılan Bakımlar Görünümü
              </span>
            </div>
            <h2 className="text-lg sm:text-2xl font-black text-white truncate break-words">
              {machine.machineName}
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Bu makinede tamamlanan kontrol kayıtları, ölçülen değerler ve kanıt fotoğrafları
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 p-2 rounded-xl transition-colors cursor-pointer shrink-0"
            title="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick KPI Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 sm:p-4 bg-[#141d2d] border-b border-slate-800 shrink-0 text-xs">
          <div className="bg-[#1b263b] p-2.5 rounded-xl border border-slate-700/60">
            <div className="text-[11px] text-slate-400 font-semibold">Yapılan Kontrol</div>
            <div className="text-lg font-black text-white">
              {completedCount} <span className="text-xs text-slate-400 font-bold">/ {totalTasks}</span>
            </div>
          </div>
          <div className="bg-[#1b263b] p-2.5 rounded-xl border border-amber-500/40">
            <div className="text-[11px] text-amber-400 font-bold">Kalan Kontrol</div>
            <div className="text-lg font-black text-amber-300">
              {Math.max(0, totalTasks - completedCount)} <span className="text-xs text-slate-400 font-bold">Adet</span>
            </div>
          </div>
          <div className="bg-[#1b263b] p-2.5 rounded-xl border border-emerald-500/40">
            <div className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>UYGUN</span>
            </div>
            <div className="text-lg font-black text-emerald-400">{uygunCount} Adet</div>
          </div>
          <div className={`p-2.5 rounded-xl border ${redCount > 0 ? 'bg-rose-950/40 border-rose-500/70' : 'bg-[#1b263b] border-slate-700/60'}`}>
            <div className="text-[11px] text-rose-400 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>RED Arıza</span>
            </div>
            <div className="text-lg font-black text-rose-400">{redCount} Adet</div>
          </div>
          <div className="bg-[#1b263b] p-2.5 rounded-xl border border-yellow-500/40 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-yellow-400 font-bold">Tamamlanma</div>
            <div className="text-lg font-black text-yellow-400">%{percent}</div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-3 sm:p-4 bg-[#162133] border-b border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Week Scope Filter */}
            <div className="flex items-center bg-[#131d2e] p-1 rounded-xl text-xs font-bold border border-slate-700/80">
              <button
                type="button"
                onClick={() => setWeekScope('current')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  weekScope === 'current'
                    ? 'bg-yellow-400 text-black font-black shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Bu Hafta ({currentWeek})
              </button>
              <button
                type="button"
                onClick={() => setWeekScope('all')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  weekScope === 'all'
                    ? 'bg-yellow-400 text-black font-black shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tüm Geçmiş
              </button>
            </div>

            {/* Segmented Result Filter */}
            <div className="flex items-center bg-[#131d2e] p-1 rounded-xl text-xs font-bold border border-slate-700/80">
              <button
                type="button"
                onClick={() => setFilterResult('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterResult === 'ALL'
                    ? 'bg-yellow-400 text-black font-black shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tümü ({doneItems.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterResult('OK')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterResult === 'OK'
                    ? 'bg-emerald-500 text-black font-black shadow-xs'
                    : 'text-emerald-400 hover:text-white'
                }`}
              >
                OK ({uygunCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterResult('RED')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterResult === 'RED'
                    ? 'bg-rose-600 text-white font-black shadow-xs'
                    : 'text-rose-400 hover:text-white'
                }`}
              >
                RED ({redCount})
              </button>
            </div>
          </div>

          {/* Search box */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Kontrol, operatör veya ölçüm ara..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#131d2e] border border-slate-700 rounded-xl text-xs font-medium text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-yellow-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Records List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3.5">
          {filteredDone.length === 0 ? (
            <div className="p-8 sm:p-12 text-center bg-[#141d2d] rounded-2xl border border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 text-yellow-400 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-sm sm:text-base font-black text-white">
                {doneItems.length === 0
                  ? 'Bu makinede henüz yapılmış bakım kaydı bulunmuyor'
                  : 'Aramaya veya filtreye uygun yapılan bakım bulunamadı'}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {doneItems.length === 0
                  ? 'Operatör paneline geçip QR doğrulayarak bakım kontrollerini kaydedebilirsiniz.'
                  : 'Filtre butonlarını veya arama metnini temizleyip tüm yapılan bakımları görüntüleyebilirsiniz.'}
              </p>
              {doneItems.length === 0 && onEditTask && machineTemplates[0] && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditTask(machineTemplates[0]);
                  }}
                  className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                >
                  <Wrench className="w-3.5 h-3.5 text-black" />
                  <span>Bakıma Başla</span>
                </button>
              )}
            </div>
          ) : (
            filteredDone.map((item, idx) => {
              const tmpl = item.template;
              const rec = item.record!;
              const isRed = rec.result === 'RED';
              const proofUrl = getProofImageUrl(rec, tmpl.templateId);
              const taskIndex = machineTemplates.findIndex((mt) => mt.templateId === tmpl.templateId);
              const itemNum = taskIndex >= 0 ? taskIndex + 1 : idx + 1;
              const redOrder = isRed
                ? performedItems
                    .filter((p) => p.record?.result === 'RED')
                    .findIndex((p) => p.template.templateId === tmpl.templateId)
                : -1;

              const formattedDate = rec.createdAt
                ? new Date(rec.createdAt).toLocaleString('tr-TR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : rec.date || 'Tarih belirtilmemiş';

              return (
                <div
                  key={tmpl.templateId || idx}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-start justify-between gap-4 shadow-md ${
                    isRed
                      ? 'bg-rose-950/25 border-rose-500/70 shadow-rose-950/20'
                      : 'bg-[#1b263b] border-slate-700/80 hover:border-yellow-400/60'
                  }`}
                >
                  {/* Left: Step details */}
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-yellow-400 text-black font-black text-xs flex items-center justify-center shrink-0">
                        {itemNum}
                      </span>
                      <h4 className="text-sm sm:text-base font-black text-yellow-400 break-words drop-shadow-xs">
                        {tmpl.task}
                      </h4>
                      <span
                        className={`px-3 py-1 rounded-full font-black text-xs flex items-center gap-1.5 shrink-0 shadow-sm ${
                          isRed
                            ? 'bg-rose-600 text-white ring-2 ring-rose-500/50 animate-pulse'
                            : 'bg-emerald-500 text-black ring-2 ring-emerald-400/40'
                        }`}
                      >
                        {isRed ? <AlertTriangle className="w-3.5 h-3.5 text-white" /> : <CheckCircle2 className="w-3.5 h-3.5 text-black" />}
                        <span>{isRed ? 'RED (ARIZA)' : 'OK (UYGUN)'}</span>
                      </span>
                      {isRed && redOrder >= 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-black text-[10px] flex items-center gap-1 shrink-0 animate-pulse">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{redOrder + 1}. Arıza</span>
                        </span>
                      )}
                    </div>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
                      <span className="bg-[#141d2d] px-2 py-0.5 rounded-md border border-slate-700 text-slate-300">
                        Birim: <b className="text-white">{tmpl.system || 'Genel'}</b>
                      </span>
                      {tmpl.region && (
                        <span className="bg-[#141d2d] px-2 py-0.5 rounded-md border border-slate-700 text-slate-300">
                          Bölge: <b className="text-white">{tmpl.region}</b>
                        </span>
                      )}
                      {tmpl.part && (
                        <span className="bg-[#141d2d] px-2 py-0.5 rounded-md border border-slate-700 text-slate-300">
                          Parça: <b className="text-white">{tmpl.part}</b>
                        </span>
                      )}
                      {tmpl.targetValue && (
                        <span className="bg-yellow-400/10 text-yellow-300 px-2 py-0.5 rounded-md border border-yellow-400/30">
                          Hedef: <b>{tmpl.targetValue}</b>
                        </span>
                      )}
                    </div>

                    {/* Measured value & description */}
                    <div className="bg-[#131d2e] p-3 rounded-xl border border-slate-800 space-y-1.5 text-xs">
                      {rec.measuredValue && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 font-semibold">Ölçülen Değer:</span>
                          <span className="font-mono font-black text-yellow-400 text-sm">
                            {rec.measuredValue}
                          </span>
                        </div>
                      )}

                      {rec.description && (
                        <div>
                          <span className="text-slate-400 font-semibold block text-[11px] mb-0.5">Operatör Notu:</span>
                          <p className={`font-medium leading-relaxed ${isRed ? 'text-rose-200 font-semibold' : 'text-slate-200'}`}>
                            {rec.description}
                          </p>
                        </div>
                      )}

                      {/* Operator & Timestamp footer */}
                      <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-semibold">
                        <span className="flex items-center gap-1 text-slate-300">
                          <User className="w-3.5 h-3.5 text-yellow-400" />
                          <span>Yapan: <b>{rec.operator || 'Operatör'}</b></span>
                        </span>
                        <span className="flex items-center gap-1 text-slate-400 font-mono">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>{formattedDate}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Proof image & actions */}
                  <div className="shrink-0 flex md:flex-col items-center md:items-end justify-between gap-3">
                    {proofUrl ? (
                      <div className="relative group">
                        <img
                          src={proofUrl}
                          alt="Kanıt Fotoğrafı"
                          onClick={() => setLightboxImg({ url: proofUrl, title: `${machine.machineName} - ${tmpl.task}` })}
                          onError={(e) => {
                            const fId = extractDriveFileId(rec.proofImageUrl);
                            if (fId && !e.currentTarget.src.includes('thumbnail')) {
                              e.currentTarget.src = `https://drive.google.com/thumbnail?id=${fId}&sz=w1000`;
                            }
                          }}
                          className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl border-2 border-yellow-400/50 shadow-md cursor-pointer hover:border-yellow-400 transition-all hover:scale-102"
                        />
                        <button
                          type="button"
                          onClick={() => setLightboxImg({ url: proofUrl, title: `${machine.machineName} - ${tmpl.task}` })}
                          className="absolute right-1 bottom-1 bg-black/80 text-yellow-400 p-1 rounded-md text-[10px] font-bold flex items-center gap-0.5 shadow-md hover:bg-yellow-400 hover:text-black transition-colors cursor-pointer"
                          title="Büyüt"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl border border-dashed border-slate-700 bg-[#131d2e] flex flex-col items-center justify-center text-slate-500 text-[10px] text-center p-1">
                        <Camera className="w-4 h-4 mb-1 text-slate-600" />
                        <span>Fotoğraf Yok</span>
                      </div>
                    )}

                    {onEditTask && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onEditTask(tmpl);
                        }}
                        className="px-3 py-1.5 bg-[#141d2d] hover:bg-yellow-400 hover:text-black text-yellow-400 border border-yellow-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                        title="Bu kontrolü operatör panelinde aç / güncelle"
                      >
                        <Wrench className="w-3 h-3" />
                        <span>Düzenle</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-[#131d2e] border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-400 font-semibold">
            Toplam <b className="text-yellow-400">{doneItems.length}</b> bakım yapılmış
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xs sm:text-sm rounded-xl transition-all cursor-pointer shadow-md"
          >
            Kapat
          </button>
        </div>
      </div>

      {/* Lightbox for zooming proof image */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4 backdrop-blur-md cursor-zoom-out"
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setLightboxImg(null)}
              className="absolute -top-10 right-0 text-yellow-400 hover:text-white p-1"
            >
              <X className="w-7 h-7" />
            </button>
            <div className="text-center text-xs font-bold text-yellow-400 mb-2 truncate max-w-md">
              {lightboxImg.title}
            </div>
            <img
              src={lightboxImg.url}
              alt="Kanıt Görseli"
              className="max-w-full max-h-[80vh] object-contain rounded-2xl bg-black border border-yellow-500/40 shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
