import React, { useState, useRef, useEffect } from 'react';
import jsQR from 'jsqr';
import {
  Machine,
  MaintenanceTemplate,
  MaintenanceRecord,
  UserSession,
  DEPARTMENTS,
  DepartmentConfig,
} from '../types/cmms';
import { getWeekKey, normalizeWeekKey, cmmsApi } from '../services/cmmsApi';
import { uploadQueueService, QueuedRecord } from '../services/uploadQueue';
import { analyzeMaintenancePhoto } from '../services/geminiService';
import { extractDriveFileId } from './RedListView';
import {
  Search,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Maximize2,
  X,
  Upload,
  Sparkles,
  ShieldAlert,
  Loader2,
  Check,
  RotateCcw,
  QrCode,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Layers,
  Wrench,
  CheckCircle,
  MapPin,
  Filter,
  Eye,
} from 'lucide-react';
import { PerformedMaintenanceModal } from '../components/PerformedMaintenanceModal';

interface OperatorViewProps {
  user: UserSession;
  machines: Machine[];
  templates: MaintenanceTemplate[];
  records: MaintenanceRecord[];
  onRecordSaved: () => void;
  onNavigateHome: () => void;
  initialMachine?: Machine | null;
  initialTemplateId?: string | null;
}


// Helper: accurately determine if a task strictly requires a photo
export function isTaskPhotoMandatory(task?: MaintenanceTemplate | null): boolean {
  if (!task) return false;
  const val = (task as any).photoRequired;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s === 'true' || s === 'evet' || s === '1' || s === 'zorunlu' || s === 'yes';
  }
  return false;
}

// Helper: ultra-fast client-side compression (reduces 15MB phone photos to ~60-80KB in <100ms)
function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawData = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // 900px provides crisp industrial inspection clarity while keeping data payloads featherlight
        const maxDim = 900;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'medium';
          ctx.drawImage(img, 0, 0, width, height);
          // 0.68 quality creates a ~60-80KB JPEG that uploads in milliseconds
          const compressed = canvas.toDataURL('image/jpeg', 0.68);
          resolve(compressed);
          return;
        }
        resolve(rawData);
      };
      img.onerror = () => resolve(rawData);
      img.src = rawData;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

// Play audio beep sound & trigger haptic feedback on successful scan
function playScanSuccessSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
    if ('vibrate' in navigator) {
      navigator.vibrate([100]);
    }
  } catch {}
}

// Normalize text for robust QR matching across Turkish characters, symbols, and cases
export function normalizeQrText(text: string): string {
  return (text || '')
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Check whether scanned QR code matches the selected machine
export function isQrMatchMachine(scanned: string, machine?: Machine | null): boolean {
  if (!scanned || !machine) return false;

  const normScan = normalizeQrText(scanned);
  const normName = normalizeQrText(machine.machineName);
  const normCode = normalizeQrText(machine.code || machine.machineCode || '');
  const normCost = normalizeQrText(machine.costCenter || '');
  const normId = normalizeQrText(machine.id);

  // 1. Direct or substring matching
  if (normName && (normScan.includes(normName) || normName.includes(normScan))) return true;
  if (normCode && (normScan.includes(normCode) || normCode.includes(normScan))) return true;
  if (normCost && (normScan.includes(normCost) || normCost.includes(normScan))) return true;
  if (normId && normScan.includes(normId)) return true;

  // 2. Numeric Cost Center matching (e.g. '351010-1' vs '12-351010-Yag Alma (Alu)')
  const scanNumbers = (scanned.match(/\d{4,}/g) || []);
  const costNumbers = ((machine.costCenter || '') + ' ' + (machine.machineCode || '')).match(/\d{4,}/g) || [];
  for (const sn of scanNumbers) {
    if (costNumbers.some((cn) => cn === sn || cn.includes(sn) || sn.includes(cn))) {
      return true;
    }
  }

  // 3. Significant word token matching (e.g. YAĞ, ALMA, EMO)
  const nameWords = (machine.machineName || '')
    .split(/[\s\-_/]+/)
    .map(normalizeQrText)
    .filter((w) => w.length >= 3);

  if (nameWords.length > 0) {
    const matchCount = nameWords.filter((w) => normScan.includes(w)).length;
    if (matchCount >= Math.min(2, nameWords.length)) {
      return true;
    }
  }

  return false;
}

export const OperatorView: React.FC<OperatorViewProps> = ({
  user,
  machines,
  templates,
  records,
  onRecordSaved,
  onNavigateHome,
  initialMachine,
  initialTemplateId,
}) => {
  const isAdmin = String(user.role || '').toLowerCase().includes('admin');
  const currentWeek = getWeekKey();

  // Target template if arriving from a specific task click
  const [targetTemplateId, setTargetTemplateId] = useState<string | null>(initialTemplateId || null);

  // Navigation step within operator panel
  // When an operator clicks a machine from home or list, they MUST scan the QR code first!
  const [subStep, setSubStep] = useState<'machines' | 'qr' | 'tasks' | 'control'>(() => {
    if (initialMachine) {
      return isAdmin ? 'tasks' : 'qr';
    }
    return 'machines';
  });
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(initialMachine || null);
  const [selectedTask, setSelectedTask] = useState<MaintenanceTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // QR Scanning state: starts immediately if arriving with initialMachine for operator
  const [qrScanning, setQrScanning] = useState<boolean>(() => {
    if (initialMachine && !isAdmin) {
      return true;
    }
    return false;
  });
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrSuccessMessage, setQrSuccessMessage] = useState<string | null>(null);
  const [wrongQrModal, setWrongQrModal] = useState<{ expected: string; scanned: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanLoopRef = useRef<number | null>(null);

  // Sync state when initialMachine or initialTemplateId changes
  useEffect(() => {
    if (initialMachine) {
      setSelectedMachine(initialMachine);
      setTargetTemplateId(initialTemplateId || null);
      if (isAdmin) {
        setSubStep('tasks');
        setQrScanning(false);
      } else {
        setSubStep('qr');
        setQrScanning(true);
        setQrError(null);
        setQrSuccessMessage(null);
      }
    }
  }, [initialMachine, initialTemplateId, isAdmin]);

  // Control / Form state
  const [measuredValue, setMeasuredValue] = useState('');
  const [result, setResult] = useState<'UYGUN' | 'RED' | ''>('');
  const [description, setDescription] = useState('');
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [proofImageFile, setProofImageFile] = useState<File | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Lightbox modals
  const [refImageModalOpen, setRefImageModalOpen] = useState(false);
  const [proofImageModalOpen, setProofImageModalOpen] = useState(false);

  // AI Image Analysis state
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [aiAnalysisVerdict, setAiAnalysisVerdict] = useState<'UYGUN' | 'RED' | null>(null);

  // Real-time background upload queue
  const [uploadQueue, setUploadQueue] = useState<QueuedRecord[]>(() => uploadQueueService.getQueue());
  useEffect(() => {
    return uploadQueueService.subscribe(setUploadQueue);
  }, []);

  const [performedModalOpen, setPerformedModalOpen] = useState(false);

  // Helper: find existing record for a task
  const findExistingRecord = (machineId: string, templateId: string): MaintenanceRecord | null => {
    const cleanMid = (machineId || '').trim().toLowerCase();
    const cleanTid = (templateId || '').trim().toLowerCase();

    // 1. Check pending items in local upload queue first (0ms latency!)
    const queued = uploadQueue.find((q) => {
      const qTid = (q.templateId || '').trim().toLowerCase();
      if (qTid !== cleanTid) return false;
      const qMid = (q.machineId || '').trim().toLowerCase();
      const qMName = (q.machineName || '').trim().toLowerCase();
      return (
        qMid === cleanMid ||
        qMName === cleanMid ||
        (cleanMid && (qMid.includes(cleanMid) || cleanMid.includes(qMid)))
      );
    });
    if (queued) {
      return {
        recordId: queued.id,
        machineId: queued.machineId,
        machineName: queued.machineName,
        templateId: queued.templateId,
        task: queued.task,
        measuredValue: queued.measuredValue,
        result: queued.result,
        description: queued.description,
        operator: queued.operator,
        operatorRole: queued.operatorRole,
        proofImageUrl: queued.proofImageUrl,
        weekKey: currentWeek,
        createdAt: new Date(queued.timestamp).toISOString(),
        date: new Date(queued.timestamp).toLocaleDateString('tr-TR'),
        time: new Date(queued.timestamp).toLocaleTimeString('tr-TR'),
      };
    }

    // 2. Check synced records from cloud
    const matching = records.filter((r) => {
      const rTid = (r.templateId || '').trim().toLowerCase();
      if (rTid !== cleanTid) return false;
      const rMid = (r.machineId || '').trim().toLowerCase();
      const rMName = (r.machineName || '').trim().toLowerCase();
      return (
        rMid === cleanMid ||
        rMName === cleanMid ||
        (cleanMid && (rMid.includes(cleanMid) || cleanMid.includes(rMid)))
      );
    });

    if (matching.length === 0) return null;

    // Sadece bu haftanın kaydını döndür
    const currentWeekRec = matching.find(
      (r) => normalizeWeekKey(r.weekKey, r.createdAt) === currentWeek
    );
    return currentWeekRec || null;
  };

  // Helper: map a machine & template to its status (bekleyen, tamamlanan / OK, red)
  const getTaskStatus = (machineId: string, templateId: string): 'bekleyen' | 'tamamlanan' | 'red' => {
    const rec = findExistingRecord(machineId, templateId);
    if (!rec) return 'bekleyen';
    return String(rec.result || '').toUpperCase().includes('RED') ? 'red' : 'tamamlanan';
  };

  // Helper: match department config
  const getDepartmentConfig = (sys?: string) => {
    if (!sys) return null;
    const cleanSys = sys.toLocaleUpperCase('tr-TR').trim();
    return (
      DEPARTMENTS.find(
        (d) =>
          d.deger.toLocaleUpperCase('tr-TR') === cleanSys ||
          d.ad.toLocaleUpperCase('tr-TR') === cleanSys ||
          cleanSys.includes(d.kod.toLocaleUpperCase('tr-TR')) ||
          cleanSys.includes(d.ad.toLocaleUpperCase('tr-TR')) ||
          cleanSys.includes(d.deger.toLocaleUpperCase('tr-TR'))
      ) || null
    );
  };

  // Helper: resolve Google Drive URL to local cache or proxy
  const resolveDriveImageUrl = (url?: string | null, templateId?: string, taskTitle?: string): string => {
    if (!url) return '';
    if (url.startsWith('data:')) return url;

    // 1. Check local base64 cache (instant zero-latency display for edited/uploaded images)
    try {
      if (templateId) {
        const cached = localStorage.getItem(`templateImg_${templateId}`);
        if (cached && cached.startsWith('data:')) return cached;
      }
      const map = JSON.parse(localStorage.getItem('cmms_template_photos_map') || '{}');
      if (templateId && map[templateId] && map[templateId].startsWith('data:')) return map[templateId];
      if (taskTitle && map[taskTitle] && map[taskTitle].startsWith('data:')) return map[taskTitle];
      if (map[url] && map[url].startsWith('data:')) return map[url];
    } catch {}

    const fId = extractDriveFileId(url);
    if (fId) {
      return `/api/drive-image/${fId}`;
    }
    return url;
  };

  // Helper: compute department style matching the RED fault panel style
  const getDeptDisplayStyle = (department?: DepartmentConfig | null) => {
    const code = department?.kod || '';
    switch (code) {
      case 'mekanik':
        return {
          containerClass: 'bg-cyan-950/40 border-cyan-400/50 shadow-md shadow-cyan-950/30',
          titleColor: 'text-cyan-300',
          dotColor: 'bg-[#66FFFF]',
          badgeClass: 'bg-cyan-400/20 text-cyan-200 border-cyan-400/40',
          targetColor: 'text-[#66FFFF]',
          cardBgClass: 'bg-cyan-950/25 hover:bg-cyan-950/40 border-cyan-500/40 hover:border-cyan-400 shadow-md shadow-cyan-950/20',
          stepNumberClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-400/50',
          btnClass: 'bg-cyan-400 hover:bg-cyan-300 text-black shadow-sm shadow-cyan-500/20',
          inputWrapperClass: 'bg-cyan-950/30 border-cyan-400/40',
          inputLabelColor: 'text-cyan-300',
          inputBadgeClass: 'bg-cyan-400 text-black',
          inputFocusRing: 'focus:ring-cyan-400',
          inputBorder: 'border-cyan-400/60',
        };
      case 'dis':
        return {
          containerClass: 'bg-stone-900/80 border-[#D6C1A6]/50 shadow-md shadow-stone-950/30',
          titleColor: 'text-[#E8DAC8]',
          dotColor: 'bg-[#D6C1A6]',
          badgeClass: 'bg-[#D6C1A6]/20 text-[#F5EDE3] border-[#D6C1A6]/40',
          targetColor: 'text-[#E8DAC8]',
          cardBgClass: 'bg-stone-900/65 hover:bg-stone-900/85 border-[#D6C1A6]/40 hover:border-[#D6C1A6] shadow-md shadow-stone-950/20',
          stepNumberClass: 'bg-stone-900 text-[#E8DAC8] border-[#D6C1A6]/50',
          btnClass: 'bg-[#D6C1A6] hover:bg-[#e0d0bc] text-black shadow-sm shadow-stone-500/20',
          inputWrapperClass: 'bg-stone-900/50 border-[#D6C1A6]/40',
          inputLabelColor: 'text-[#E8DAC8]',
          inputBadgeClass: 'bg-[#D6C1A6] text-black',
          inputFocusRing: 'focus:ring-[#D6C1A6]',
          inputBorder: 'border-[#D6C1A6]/60',
        };
      case 'isg':
        return {
          containerClass: 'bg-orange-950/40 border-orange-500/50 shadow-md shadow-orange-950/30',
          titleColor: 'text-orange-400',
          dotColor: 'bg-[#FF5B3A]',
          badgeClass: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
          targetColor: 'text-orange-400',
          cardBgClass: 'bg-orange-950/25 hover:bg-orange-950/40 border-orange-500/40 hover:border-orange-400 shadow-md shadow-orange-950/20',
          stepNumberClass: 'bg-orange-950/80 text-orange-300 border-orange-500/50',
          btnClass: 'bg-orange-500 hover:bg-orange-400 text-white shadow-sm shadow-orange-500/20',
          inputWrapperClass: 'bg-orange-950/30 border-orange-500/40',
          inputLabelColor: 'text-orange-400',
          inputBadgeClass: 'bg-orange-500 text-white',
          inputFocusRing: 'focus:ring-orange-500',
          inputBorder: 'border-orange-500/60',
        };
      case 'elektrik':
      default:
        return {
          containerClass: 'bg-yellow-950/40 border-yellow-400/50 shadow-md shadow-yellow-950/30',
          titleColor: 'text-yellow-300',
          dotColor: 'bg-[#FFFF66]',
          badgeClass: 'bg-yellow-400/20 text-yellow-200 border-yellow-400/40',
          targetColor: 'text-yellow-300',
          cardBgClass: 'bg-yellow-950/20 hover:bg-yellow-950/35 border-yellow-400/40 hover:border-yellow-400 shadow-md shadow-yellow-950/20',
          stepNumberClass: 'bg-yellow-950/80 text-yellow-300 border-yellow-400/50',
          btnClass: 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-sm shadow-yellow-500/20',
          inputWrapperClass: 'bg-yellow-400/10 border-yellow-400/40',
          inputLabelColor: 'text-yellow-400',
          inputBadgeClass: 'bg-yellow-400 text-black',
          inputFocusRing: 'focus:ring-yellow-400',
          inputBorder: 'border-yellow-400/60',
        };
    }
  };

  // Helper to get active tasks for any machine
  const getMachineTasks = (m: Machine) => {
    return templates
      .filter((t) => (t.machineId === m.id || t.machineName === m.machineName) && t.active)
      .sort((a, b) => (a.orderNo || 1) - (b.orderNo || 1));
  };

  // Machines that have at least one defined active maintenance task
  const machinesWithTasks = machines.filter((m) => getMachineTasks(m).length > 0);

  // Tasks for selected machine
  const machineTasks = selectedMachine ? getMachineTasks(selectedMachine) : [];

  // Computed task statistics for the selected machine
  const currentTaskIndex = selectedTask && selectedMachine
    ? machineTasks.findIndex((t) => t.templateId === selectedTask.templateId)
    : -1;
  const currentTaskNumber = currentTaskIndex >= 0 ? currentTaskIndex + 1 : (selectedTask?.orderNo || 1);
  const totalTasksCount = machineTasks.length;
  const completedTasks = selectedMachine
    ? machineTasks.filter((t) => getTaskStatus(selectedMachine.id, t.templateId) !== 'bekleyen')
    : [];
  const completedCount = completedTasks.length;
  const remainingCount = Math.max(0, totalTasksCount - completedCount);
  const okTasks = selectedMachine
    ? machineTasks.filter((t) => getTaskStatus(selectedMachine.id, t.templateId) === 'tamamlanan')
    : [];
  const redTasks = selectedMachine
    ? machineTasks.filter((t) => getTaskStatus(selectedMachine.id, t.templateId) === 'red')
    : [];
  const faultOrder = selectedTask ? redTasks.findIndex((t) => t.templateId === selectedTask.templateId) : -1;

  // Regional filter state (e.g. "AZOT SİSTEMİ", "FAN SİSTEMİ", etc.)
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string>('all');

  // Distinct regions available in the current machine's tasks with completion stats
  const availableRegions = React.useMemo(() => {
    if (!selectedMachine) return [];
    const map = new Map<string, { total: number; completed: number; hasRed: boolean }>();

    machineTasks.forEach((t) => {
      const reg = (t.region || '').trim() || 'GENEL';
      const st = getTaskStatus(selectedMachine.id, t.templateId);
      const cur = map.get(reg) || { total: 0, completed: 0, hasRed: false };
      cur.total += 1;
      if (st !== 'bekleyen') cur.completed += 1;
      if (st === 'red') cur.hasRed = true;
      map.set(reg, cur);
    });

    return Array.from(map.entries())
      .map(([name, stats]) => ({
        name,
        ...stats,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));
  }, [machineTasks, selectedMachine, records]);

  // Tasks filtered by region
  const displayedTasks = React.useMemo(() => {
    return machineTasks.filter((t) => {
      const reg = (t.region || '').trim() || 'GENEL';
      if (selectedRegionFilter !== 'all' && reg !== selectedRegionFilter) {
        return false;
      }
      return true;
    });
  }, [machineTasks, selectedRegionFilter]);

  // Filtered machines by status and search
  const [machineStatusFilter, setMachineStatusFilter] = useState<'all' | 'pending' | 'completed' | 'hasRed'>('all');

  const filteredMachines = machinesWithTasks.filter((m) => {
    const codeStr = m.machineCode || m.code || m.costCenter || '';
    const matchesSearch =
      m.machineName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      codeStr.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (machineStatusFilter === 'all') return true;
    const mTasks = getMachineTasks(m);
    const hasRed = mTasks.some((t) => getTaskStatus(m.id, t.templateId) === 'red');
    if (machineStatusFilter === 'hasRed') return hasRed;
    const completedCount = mTasks.filter((t) => getTaskStatus(m.id, t.templateId) !== 'bekleyen').length;
    const isAllDone = mTasks.length > 0 && completedCount >= mTasks.length;
    if (machineStatusFilter === 'completed') return isAllDone;
    if (machineStatusFilter === 'pending') return !isAllDone && !hasRed;
    return true;
  });

  // QR Selection Flow
  const handleSelectMachine = (machine: Machine) => {
    setSelectedMachine(machine);
    setSelectedRegionFilter('all');
    // If admin, bypass QR verification
    if (isAdmin) {
      setSubStep('tasks');
    } else {
      setSubStep('qr');
      setQrError(null);
      setQrScanning(true);
      setQrSuccessMessage(null);
    }
  };

  // Handle scanned QR code validation
  const handleVerifyQrCode = (scannedCode: string) => {
    if (!selectedMachine) return;
    const trimmed = scannedCode.trim();
    if (!trimmed) return;

    if (isQrMatchMachine(trimmed, selectedMachine)) {
      playScanSuccessSound();
      setQrScanning(false);
      setQrSuccessMessage(`QR Doğrulandı: ${selectedMachine.machineName} ✔`);
      setTimeout(() => {
        setQrSuccessMessage(null);
        if (targetTemplateId) {
          const mTasks = getMachineTasks(selectedMachine);
          const t = mTasks.find((item) => item.templateId === targetTemplateId);
          if (t) {
            handleOpenTask(t);
            setTargetTemplateId(null);
            return;
          }
        }
        setSubStep('tasks');
      }, 700);
    } else {
      setWrongQrModal({
        expected: `${selectedMachine.machineName} (${selectedMachine.costCenter || selectedMachine.code || selectedMachine.id})`,
        scanned: trimmed,
      });
    }
  };

  // Real-time camera stream QR decoding loop
  useEffect(() => {
    if (subStep !== 'qr' || !qrScanning || !selectedMachine) return;

    let stream: MediaStream | null = null;
    let isActive = true;

    const startScanner = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (!isActive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
        }

        // Offscreen canvas for decoding
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Native BarcodeDetector if available
        const barcodeDetector =
          typeof window !== 'undefined' && 'BarcodeDetector' in window
            ? new (window as any).BarcodeDetector({ formats: ['qr_code'] })
            : null;

        let frameCounter = 0;

        const scanFrame = async () => {
          if (!isActive || !videoRef.current) return;

          const video = videoRef.current;
          if (video.readyState >= 2) {
            frameCounter++;
            // Scan every 2nd frame (~15 fps) for optimal performance
            if (frameCounter % 2 === 0) {
              const width = video.videoWidth;
              const height = video.videoHeight;

              if (width > 0 && height > 0 && ctx) {
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(video, 0, 0, width, height);

                let detectedValue: string | null = null;

                // 1. Try native BarcodeDetector
                if (barcodeDetector) {
                  try {
                    const barcodes = await barcodeDetector.detect(canvas);
                    if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                      detectedValue = barcodes[0].rawValue;
                    }
                  } catch {}
                }

                // 2. Fallback to jsQR
                if (!detectedValue) {
                  try {
                    const imgData = ctx.getImageData(0, 0, width, height);
                    const code = jsQR(imgData.data, width, height, {
                      inversionAttempts: 'dontInvert',
                    });
                    if (code && code.data) {
                      detectedValue = code.data;
                    }
                  } catch {}
                }

                if (detectedValue && isActive) {
                  handleVerifyQrCode(detectedValue);
                  return; // Stop scanning loop on detection
                }
              }
            }
          }

          scanLoopRef.current = requestAnimationFrame(scanFrame);
        };

        scanLoopRef.current = requestAnimationFrame(scanFrame);
      } catch (err: any) {
        console.warn('Camera error:', err);
        setQrError('Kamera başlatılamadı. Lütfen kamera izinlerinizi kontrol edip sayfayı yenileyiniz.');
      }
    };

    startScanner();

    return () => {
      isActive = false;
      if (scanLoopRef.current) {
        cancelAnimationFrame(scanLoopRef.current);
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [subStep, qrScanning, selectedMachine]);

  // Select a task to perform control (Pre-populates existing record if already performed)
  const handleOpenTask = (task: MaintenanceTemplate) => {
    setSelectedTask(task);
    const existing = selectedMachine ? findExistingRecord(selectedMachine.id, task.templateId) : null;
    if (existing) {
      setMeasuredValue(existing.measuredValue || '');
      setResult((existing.result as 'UYGUN' | 'RED') || 'UYGUN');
      setDescription(existing.description || '');
      let proof = existing.proofImageUrl || null;
      if (!proof && selectedMachine) {
        try {
          proof = localStorage.getItem(`proofImg_${selectedMachine.id}_${task.templateId}`) ||
                  localStorage.getItem(`proofImg_${task.templateId}`) ||
                  null;
        } catch {}
      }
      setProofImage(proof);
    } else {
      setMeasuredValue('');
      setResult('');
      setDescription('');
      setProofImage(null);
    }
    setProofImageFile(null);
    setSaveMessage(null);
    setAiAnalysisResult(null);
    setAiAnalysisVerdict(null);
    setSubStep('control');
  };

  // Handle image upload / camera capture with fast client compression
  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofImageFile(file);
      try {
        const compressedBase64 = await compressImageFile(file);
        setProofImage(compressedBase64);
        setAiAnalysisResult(null);
      } catch {
        const reader = new FileReader();
        reader.onload = (event) => {
          setProofImage(event.target?.result as string);
          setAiAnalysisResult(null);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // AI Image Inspection (FEATURE 3: gemini-3.1-pro-preview)
  const handleRunAiInspection = async () => {
    if (!proofImage) return;

    setAiAnalyzing(true);
    setAiAnalysisResult(null);

    try {
      const res = await analyzeMaintenancePhoto(proofImage, {
        taskName: selectedTask?.task,
        machineName: selectedMachine?.machineName,
      });

      if (res.success && res.analysis) {
        setAiAnalysisResult(res.analysis);
        setAiAnalysisVerdict(res.verdict || null);

        if (res.verdict === 'RED' && !description) {
          setDescription('AI Tarafından Tespit Edilen Kusur: Fotoğrafta aşınma ve sızıntı emareleri saptandı.');
          setResult('RED');
        } else if (res.verdict === 'UYGUN' && !result) {
          setResult('UYGUN');
        }
      }
    } catch (err: any) {
      alert(err.message || 'Görüntü analizi gerçekleştirilemedi.');
    } finally {
      setAiAnalyzing(false);
    }
  };

  // Save Control Record
  const handleSaveControl = async () => {
    if (!selectedMachine || !selectedTask) return;

    // Check mandatory measurement
    if (selectedTask.targetValue && !measuredValue.trim()) {
      setSaveMessage({
        type: 'error',
        text: 'Bu bakım için istenen değer tanımlıdır. Lütfen ölçtüğünüz değeri yazınız.',
      });
      return;
    }

    // Check result chosen
    if (!result) {
      setSaveMessage({ type: 'error', text: 'Lütfen bakım sonucunu (UYGUN veya RED) seçiniz.' });
      return;
    }

    // Check mandatory description for RED (min 10 chars)
    if (result === 'RED' && description.trim().length < 10) {
      setSaveMessage({
        type: 'error',
        text: 'RED arıza durumunda en az 10 karakter açıklama girilmesi zorunludur.',
      });
      return;
    }

    // Check mandatory photo
    if (isTaskPhotoMandatory(selectedTask) && !proofImage) {
      setSaveMessage({
        type: 'error',
        text: 'Bu kontrol maddesi için kanıt fotoğrafı yüklenmesi zorunludur.',
      });
      return;
    }

    setSaveLoading(false);
    setSaveMessage(null);

    try {
      // 1. Immediately enqueue into AppSheet-style background sync queue (0ms wait)
      const queuedItem = uploadQueueService.enqueue({
        machineId: selectedMachine.id,
        machineName: selectedMachine.machineName,
        templateId: selectedTask.templateId,
        task: selectedTask.task,
        measuredValue: measuredValue.trim() || undefined,
        result,
        description: description.trim() || undefined,
        operator: user.operator || user.name || user.fullName || 'Operatör',
        operatorRole: user.role || 'operator',
        proofImageUrl: proofImage || undefined,
        photoDataUrl: proofImage || undefined,
      });

      // 2. Cache proof image locally for instant high-speed preview
      if (proofImage) {
        try {
          localStorage.setItem(`proofImg_${queuedItem.id}`, proofImage);
          localStorage.setItem(`proofImg_${selectedMachine.id}_${selectedTask.templateId}`, proofImage);
          localStorage.setItem(`proofImg_${selectedTask.templateId}`, proofImage);

          const map = JSON.parse(localStorage.getItem('cmms_photos_map') || '{}');
          map[queuedItem.id] = proofImage;
          map[`${selectedMachine.id}_${selectedTask.templateId}`] = proofImage;
          map[selectedTask.templateId] = proofImage;
          localStorage.setItem('cmms_photos_map', JSON.stringify(map));
        } catch {}
      }

      playScanSuccessSound();
      setSaveMessage({
        type: 'success',
        text: `Kayıt sıraya alındı ve arka planda aktarılıyor! (${result})`,
      });
      onRecordSaved();

      // 3. Find next pending task on this machine (prioritizing the currently active region)
      const candidateList =
        selectedRegionFilter !== 'all'
          ? machineTasks.filter((t) => ((t.region || '').trim() || 'GENEL') === selectedRegionFilter)
          : machineTasks;

      const currentIndex = candidateList.findIndex((t) => t.templateId === selectedTask.templateId);
      const nextPendingTask = candidateList.find(
        (t, idx) =>
          idx > currentIndex &&
          t.templateId !== selectedTask.templateId &&
          getTaskStatus(selectedMachine.id, t.templateId) === 'bekleyen'
      );

      setTimeout(() => {
        if (nextPendingTask) {
          handleOpenTask(nextPendingTask);
        } else {
          setSubStep('tasks');
        }
      }, 400);
    } catch (err: any) {
      setSaveMessage({ type: 'error', text: err.message || 'Kayıt sıraya eklenirken hata oluştu.' });
    } finally {
      setSaveLoading(false);
    }
  };

  // Modern Sarı-Siyah Step Breadcrumbs Navigation Bar
  const renderBreadcrumbBar = () => {
    return (
      <div className="bg-[#1b263b] rounded-2xl border border-yellow-500/30 p-2.5 sm:p-3 shadow-md flex items-center justify-between gap-2 overflow-x-auto select-none">
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-bold text-slate-300 shrink-0">
          <button
            type="button"
            onClick={onNavigateHome}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer hover:bg-slate-800 text-slate-300"
          >
            <span>🏠 Ana Sayfa</span>
          </button>

          <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

          <button
            type="button"
            disabled={!selectedMachine || (subStep === 'qr' && !isAdmin)}
            onClick={() => {
              if (subStep === 'qr' && !isAdmin) return;
              setSubStep('tasks');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              subStep === 'tasks' || subStep === 'qr'
                ? 'bg-yellow-400 text-black font-black shadow-md shadow-yellow-500/20'
                : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <span className="truncate max-w-[120px] sm:max-w-xs">{selectedMachine?.machineName || 'Makine'}</span>
          </button>

          {selectedTask && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-400 text-black font-black shadow-md shadow-yellow-500/20">
                <span>Madde #{currentTaskNumber} ({currentTaskNumber}/{totalTasksCount})</span>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onNavigateHome}
          className="text-xs text-yellow-400 hover:text-yellow-300 font-bold px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
        >
          Ana Sayfa
        </button>
      </div>
    );
  };

  // ==========================================
  // VIEW 1: MACHINE SELECTION (Sarı-Siyah)
  // ==========================================
  if (subStep === 'machines') {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-5 space-y-3.5">
        {renderBreadcrumbBar()}

        {/* Search & Segmented Filter Bar */}
        <div className="bg-[#1b263b] p-3.5 sm:p-5 rounded-2xl border border-slate-800 shadow-md space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Bakımı Yapılacak Makineler</span>
                <span className="text-xs font-black text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-md border border-yellow-400/30">
                  {machinesWithTasks.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Haftalık bakımı tanımlı {machinesWithTasks.length} makine
              </p>
            </div>

            {/* Segmented Filter Control */}
            <div className="flex items-center bg-[#141d2d] p-1 rounded-xl text-xs font-bold w-full sm:w-auto overflow-x-auto border border-slate-800">
              <button
                type="button"
                onClick={() => setMachineStatusFilter('all')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                  machineStatusFilter === 'all'
                    ? 'bg-yellow-400 text-black shadow-xs font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tümü ({machinesWithTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setMachineStatusFilter('pending')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                  machineStatusFilter === 'pending'
                    ? 'bg-yellow-400 text-black shadow-xs font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Bekleyen
              </button>
              <button
                type="button"
                onClick={() => setMachineStatusFilter('hasRed')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                  machineStatusFilter === 'hasRed'
                    ? 'bg-rose-600 text-white shadow-xs font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                RED
              </button>
              <button
                type="button"
                onClick={() => setMachineStatusFilter('completed')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                  machineStatusFilter === 'completed'
                    ? 'bg-emerald-500 text-black shadow-xs font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tamamlandı
              </button>
            </div>
          </div>

          {/* Search Input with Clear Button */}
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Makine adı veya masraf merkezi ara..."
              className="w-full pl-10 pr-9 py-2.5 bg-[#141d2d] border border-slate-700 rounded-xl text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-slate-400 hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-400 font-semibold">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <span>Bekleyen</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span>Tamamlanan</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span>RED (Arıza)</span>
            </span>
          </div>

          <span className="text-slate-400">
            <b className="text-yellow-400">{filteredMachines.length}</b> makine listeleniyor
          </span>
        </div>

        {/* Machine Cards Grid */}
        {filteredMachines.length === 0 ? (
          <div className="bg-[#1b263b] p-10 rounded-2xl border border-slate-800 text-center shadow-md space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 text-yellow-400 flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-white">Aramaya Uygun Makine Yok</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Lütfen filtrelerinizi veya arama kelimenizi kontrol edin.
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 bg-yellow-400 text-black font-black text-xs rounded-xl cursor-pointer"
              >
                Aramayı Sıfırla
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
            {filteredMachines.map((m) => {
              const mTasks = getMachineTasks(m);
              const completedCount = mTasks.filter(
                (t) => getTaskStatus(m.id, t.templateId) !== 'bekleyen'
              ).length;
              const hasRed = mTasks.some((t) => getTaskStatus(m.id, t.templateId) === 'red');
              const isAllDone = mTasks.length > 0 && completedCount >= mTasks.length;
              const percent = mTasks.length > 0 ? Math.round((completedCount / mTasks.length) * 100) : 0;

              return (
                <div
                  key={m.id}
                  onClick={() => handleSelectMachine(m)}
                  className={`group bg-[#1b263b] p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer shadow-md flex flex-col justify-between active:scale-[0.98] ${
                    hasRed
                      ? 'border-rose-500/70 hover:border-rose-400'
                      : isAllDone
                      ? 'border-emerald-500/60 hover:border-emerald-400'
                      : 'border-slate-800 hover:border-yellow-400'
                  }`}
                >
                  <div className="min-w-0 w-full mb-3">
                    {/* Header: Machine Name & Cost Center Code */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm sm:text-base font-black text-yellow-400 group-hover:text-yellow-300 transition-colors break-words line-clamp-2">
                        {m.machineName}
                      </h3>
                      <span className="text-[10px] sm:text-[11px] font-mono font-bold bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-lg shrink-0 border border-yellow-400/30">
                        {m.costCenter || m.code || m.id}
                      </span>
                    </div>

                    {/* Interactive Step Indicator Bubbles */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {mTasks.map((t, idx) => {
                        const st = getTaskStatus(m.id, t.templateId);
                        const bg =
                          st === 'red'
                            ? 'bg-rose-600 text-white shadow-xs animate-pulse'
                            : st === 'tamamlanan'
                            ? 'bg-emerald-500 text-black font-black shadow-xs'
                            : 'bg-slate-800 text-yellow-400 border border-yellow-500/40';

                        return (
                          <span
                            key={t.templateId}
                            title={`${idx + 1}. ${t.task} (${st.toUpperCase()}) - ${st !== 'bekleyen' ? 'Yapılan kontrol detayını gör' : 'Bekliyor'}`}
                            onClick={(e) => {
                              if (st !== 'bekleyen') {
                                e.stopPropagation();
                                setSelectedMachine(m);
                                setPerformedModalOpen(true);
                              }
                            }}
                            className={`min-w-[28px] px-1 h-6 sm:h-7 rounded-lg font-black text-[10px] sm:text-xs flex items-center justify-center shrink-0 transition-transform hover:scale-110 cursor-pointer ${bg}`}
                          >
                            {st === 'tamamlanan' ? (
                              <span className="text-[10px] font-black text-black">OK</span>
                            ) : st === 'red' ? (
                              <span className="text-[9px] font-black text-white animate-pulse">RED</span>
                            ) : (
                              <span>{idx + 1}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                        <span>İlerleme ({completedCount}/{mTasks.length})</span>
                        <span className={isAllDone ? 'text-emerald-400' : hasRed ? 'text-rose-400' : 'text-yellow-400'}>
                          %{percent}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            hasRed ? 'bg-rose-500' : isAllDone ? 'bg-emerald-400' : 'bg-yellow-400'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom CTA */}
                  <div className="pt-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs font-bold gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">
                        {isAllDone ? '✔ Kontroller Tamam' : hasRed ? '⚠️ Açık RED Kaydı' : 'Kontrol Bekliyor'}
                      </span>
                      {completedCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMachine(m);
                            setPerformedModalOpen(true);
                          }}
                          className="px-2 py-0.5 bg-yellow-400/15 hover:bg-yellow-400 hover:text-black text-yellow-400 text-[11px] font-black rounded-md border border-yellow-400/30 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          title="Bu makinede yapılan kontrolleri incele"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Yapılanları Gör ({completedCount})</span>
                        </button>
                      )}
                    </div>
                    <span className="text-yellow-400 font-black group-hover:translate-x-1 transition-transform flex items-center gap-1 shrink-0">
                      <span>Bakıma Başla</span>
                      <ArrowRight className="w-3.5 h-3.5 text-yellow-400" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW 2: QR SCAN (Sarı-Siyah)
  // ==========================================
  if (subStep === 'qr') {
    return (
      <div className="max-w-md mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        {renderBreadcrumbBar()}

        <div className="bg-[#1b263b] rounded-2xl border border-yellow-500/30 shadow-xl p-5 text-center space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-yellow-400 text-black border border-yellow-300 shadow-md shadow-yellow-500/20">
            <QrCode className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-lg font-black text-white">Makine QR Kodunu Okutun</h2>
            <p className="text-xs text-slate-400 mt-1">
              Doğru makinenin başında olduğunuzu teyit etmek için makine üzerindeki sarı QR etiketini okutunuz.
            </p>
          </div>

          <div className="bg-[#141d2d] border border-yellow-500/30 p-3 rounded-xl text-left text-xs space-y-1">
            <div className="text-yellow-400 font-extrabold text-sm">{selectedMachine?.machineName}</div>
            <div className="text-slate-400 font-mono text-[11px]">
              Etiket / Kod: {selectedMachine?.costCenter || selectedMachine?.code || selectedMachine?.id}
            </div>
          </div>

          {/* Success Banner when scanned */}
          {qrSuccessMessage && (
            <div className="p-3 bg-emerald-500 text-black font-black text-xs rounded-xl text-center flex items-center justify-center gap-2 animate-bounce shadow-lg">
              <CheckCircle className="w-4 h-4 text-black" />
              <span>{qrSuccessMessage}</span>
            </div>
          )}

          {/* QR Viewfinder Container with Yellow Laser */}
          <div className="relative aspect-square max-w-[260px] mx-auto rounded-3xl overflow-hidden bg-black border-4 border-yellow-400/50 shadow-inner flex items-center justify-center">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
            <div className="absolute inset-0 border-2 border-dashed border-yellow-400/60 m-6 rounded-2xl pointer-events-none" />
            <div className="absolute inset-x-0 h-1 bg-yellow-400 shadow-[0_0_15px_#facc15] animate-scan-sweep pointer-events-none" />
          </div>

          <p className="text-[11px] text-slate-400 font-medium">
            Kamerayı etikete doğrultun; QR kod algılandığında otomatik olarak kontrollere geçilecektir.
          </p>

          {qrError && (
            <div className="text-[11px] text-amber-300 bg-amber-950/40 p-2.5 rounded-xl border border-amber-800/60">
              {qrError}
            </div>
          )}

          {/* Presence Verification & Action Buttons */}
          <div className="space-y-2 pt-1">
            {/* Presence Mandatory Warning for Non-Admin Operators */}
            {!isAdmin ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-center">
                <div className="flex items-center justify-center gap-1.5 text-yellow-400 font-black text-xs mb-1">
                  <ShieldAlert className="w-4 h-4 text-yellow-400 shrink-0" />
                  <span>Makine Başı Fiziki Kontrol Zorunludur</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Bakım adımlarına geçebilmek için makinenin yanına gidip sarı QR etiketini canlı kameraya okutmanız gerekmektedir.
                </p>
              </div>
            ) : (
              /* ONLY FOR ADMINS: Admin Bypass Button */
              <button
                type="button"
                onClick={() => {
                  setQrScanning(false);
                  if (targetTemplateId && selectedMachine) {
                    const mTasks = getMachineTasks(selectedMachine);
                    const t = mTasks.find((item) => item.templateId === targetTemplateId);
                    if (t) {
                      handleOpenTask(t);
                      setTargetTemplateId(null);
                      return;
                    }
                  }
                  setSubStep('tasks');
                }}
                className="w-full py-2.5 px-4 bg-yellow-400/15 hover:bg-yellow-400/25 text-yellow-400 font-black rounded-xl text-xs border border-yellow-500/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <span>⚙️ Admin Yetkisi: QR Doğrulamayı Atla</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Manuel QR/Barkod Girişi (Kamera izni yoksa veya masaüstü testleri için) */}
            <div className="pt-2 border-t border-slate-800">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const inputEl = form.elements.namedItem('manualQrInput') as HTMLInputElement;
                  if (inputEl && inputEl.value.trim()) {
                    handleVerifyQrCode(inputEl.value.trim());
                    inputEl.value = '';
                  }
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  name="manualQrInput"
                  type="text"
                  placeholder="QR / Barkod / Makine Kodu..."
                  className="flex-1 bg-[#141d2d] border border-slate-700 focus:border-yellow-400 text-xs text-white px-3 py-2 rounded-xl outline-none"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xs rounded-xl cursor-pointer shrink-0 transition-transform active:scale-95"
                >
                  Doğrula
                </button>
              </form>
            </div>

            <button
              type="button"
              onClick={() => {
                setQrScanning(false);
                onNavigateHome();
              }}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-slate-400 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              ← Ana Sayfaya Dön (Farklı Makine Seç)
            </button>
          </div>
        </div>

        {/* Wrong QR Modal */}
        {wrongQrModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-[#1b263b] rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl border border-rose-500/50 space-y-3 animate-in zoom-in-95">
              <div className="w-12 h-12 bg-rose-950 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-600/40">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-white">Hatalı Makine Etiketi!</h3>
              <p className="text-xs text-slate-300">
                Okutulan QR kodu seçtiğiniz makine ile uyuşmuyor. Lütfen doğru makinenin başında olduğunuzdan emin olun.
              </p>

              <div className="text-[11px] text-left bg-black/50 p-2.5 rounded-xl border border-slate-800 space-y-1 text-slate-400">
                <div>
                  Beklenen: <b className="text-yellow-400 block">{wrongQrModal.expected}</b>
                </div>
                <div>
                  Okutulan: <b className="text-rose-300 block break-all font-mono">{wrongQrModal.scanned}</b>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setWrongQrModal(null);
                    setQrScanning(true);
                  }}
                  className="w-full py-2.5 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Tekrar Tara
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW 3: TASKS CHECKLIST (Sarı-Siyah)
  // ==========================================
  if (subStep === 'tasks') {
    const progressPercent = machineTasks.length > 0 ? Math.round((completedCount / machineTasks.length) * 100) : 0;

    return (
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3 sm:py-5 space-y-3.5">
        {renderBreadcrumbBar()}

        {/* Machine Header Card */}
        <div className="bg-[#1b263b] p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-md space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold text-yellow-400 uppercase tracking-wider block">
                {selectedMachine?.costCenter || selectedMachine?.code || 'Makine'}
              </span>
              <h2 className="text-lg sm:text-2xl font-black text-yellow-400 break-words">
                {selectedMachine?.machineName}
              </h2>
            </div>

            <div className="text-right">
              <div className="text-sm sm:text-base font-black text-yellow-400">%{progressPercent}</div>
              <div className="text-xs text-slate-300 font-semibold">
                {completedCount} / {machineTasks.length} Kontrol
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-yellow-400 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {completedCount > 0 && (
            <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-300 font-medium">
                Tamamlanan kontrolleri inceleyin:
              </span>
              <button
                type="button"
                onClick={() => setPerformedModalOpen(true)}
                className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-black rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <Eye className="w-3.5 h-3.5 text-black" />
                <span>Yapılan Bakımları Gör ({completedCount})</span>
              </button>
            </div>
          )}
        </div>

        {/* Department Colors Legend */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 bg-[#162030] p-3 rounded-xl border border-slate-800 text-[11px] font-semibold text-slate-300">
          <span className="text-yellow-400 font-black mr-1">Birimler:</span>
          {DEPARTMENTS.map((d) => (
            <span key={d.kod} className="flex items-center gap-1 bg-[#1a2538] px-2 py-0.5 rounded-lg border border-slate-700">
              <span className={`w-2.5 h-2.5 rounded-sm ${d.bgClass} border border-black/20`} />
              <span>{d.ad}</span>
            </span>
          ))}
        </div>

        {/* Regional Filter Bar (Bölgesel Filtre / Alan Seçimi) */}
        {availableRegions.length > 0 && (
          <div className="bg-[#1b263b] p-2.5 sm:p-3 rounded-xl border border-yellow-500/30 shadow-md space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg bg-yellow-400/20 text-yellow-400 flex items-center justify-center border border-yellow-400/30 shrink-0 shadow-inner">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    Bölgesel Filtre
                    <span className="text-[10px] font-bold text-yellow-400 normal-case bg-yellow-400/10 px-1.5 py-0.5 rounded border border-yellow-400/30">
                      {selectedRegionFilter === 'all' ? 'Tüm Bölgeler' : selectedRegionFilter}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Bulunduğunuz alana göre filtreleyip sadece o bölgenin kontrollerini yapabilirsiniz.
                  </p>
                </div>
              </div>

              {selectedRegionFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedRegionFilter('all')}
                  className="text-[11px] font-bold text-yellow-400 hover:text-yellow-300 flex items-center gap-1 cursor-pointer bg-yellow-400/10 px-2 py-0.5 rounded-md border border-yellow-400/30 hover:bg-yellow-400/20 transition-all"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Filtreyi Sıfırla</span>
                </button>
              )}
            </div>

            {/* Region selection buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => setSelectedRegionFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                  selectedRegionFilter === 'all'
                    ? 'bg-yellow-400 text-black border-yellow-300 shadow-sm shadow-yellow-500/20'
                    : 'bg-[#141d2d] text-slate-300 border-slate-700 hover:border-yellow-400/50 hover:bg-[#1a253a]'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Tümü</span>
                <span
                  className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                    selectedRegionFilter === 'all' ? 'bg-black/25 text-black' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {machineTasks.length}
                </span>
              </button>

              {availableRegions.map((reg) => {
                const isSelected = selectedRegionFilter === reg.name;
                const isCompleted = reg.completed >= reg.total;

                return (
                  <button
                    key={reg.name}
                    type="button"
                    onClick={() => setSelectedRegionFilter(reg.name)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                      isSelected
                        ? 'bg-yellow-400 text-black border-yellow-300 shadow-sm shadow-yellow-500/25'
                        : isCompleted
                        ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/40'
                        : reg.hasRed
                        ? 'bg-rose-950/40 text-rose-300 border-rose-500/40 hover:bg-rose-900/40'
                        : 'bg-[#141d2d] text-slate-300 border-slate-700 hover:border-yellow-400/50 hover:bg-[#1a253a]'
                    }`}
                  >
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>{reg.name}</span>
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                        isSelected
                          ? 'bg-black/25 text-black'
                          : isCompleted
                          ? 'bg-emerald-500/30 text-emerald-200'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {reg.completed}/{reg.total}
                    </span>
                    {isCompleted && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Task List Items */}
        {displayedTasks.length === 0 ? (
          <div className="bg-[#1b263b] p-8 rounded-2xl border border-slate-800 text-center space-y-3 shadow-md">
            <div className="w-12 h-12 rounded-full bg-yellow-400/10 text-yellow-400 flex items-center justify-center mx-auto">
              <MapPin className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-white">Bu bölgede kontrol maddesi bulunamadı</div>
            <p className="text-xs text-slate-400">
              Seçili bölge ({selectedRegionFilter}) için bu makinede henüz atanmış kontrol maddesi bulunmuyor.
            </p>
            <button
              type="button"
              onClick={() => setSelectedRegionFilter('all')}
              className="px-4 py-2 rounded-xl bg-yellow-400 text-black font-black text-xs cursor-pointer hover:bg-yellow-300 transition-all inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tüm Bölgeleri Göster</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-2.5">
            {displayedTasks.map((t, idx) => {
            const st = getTaskStatus(selectedMachine!.id, t.templateId);
            const dept = getDepartmentConfig(t.system);
            const deptStyle = getDeptDisplayStyle(dept);
            const globalIdx = machineTasks.findIndex((mt) => mt.templateId === t.templateId);
            const taskNumber = globalIdx >= 0 ? globalIdx + 1 : idx + 1;
            const itemFaultOrder = redTasks.findIndex((rt) => rt.templateId === t.templateId);

            return (
              <button
                key={t.templateId}
                type="button"
                onClick={() => handleOpenTask(t)}
                className={`relative overflow-hidden w-full p-3.5 sm:p-4 rounded-2xl border transition-all text-left flex items-start gap-3 sm:gap-4 cursor-pointer active:scale-[0.99] ${
                  st === 'red'
                    ? 'bg-rose-950/35 border-rose-500/70 shadow-md shadow-rose-950/30'
                    : st === 'tamamlanan'
                    ? 'bg-emerald-950/25 border-emerald-500/60 shadow-md shadow-emerald-950/30'
                    : deptStyle.cardBgClass
                }`}
              >
                {/* Large Semi-Transparent Watermark Stamp Overlay (Kartı kaplayacak büyüklükte RED / OK) */}
                {st === 'red' && (
                  <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-rose-950/30 backdrop-blur-[0.5px]">
                    <div className="border-4 sm:border-[5px] border-rose-500/80 rounded-2xl px-6 sm:px-12 py-1 sm:py-2 rotate-[-8deg] shadow-2xl bg-rose-950/60 select-none">
                      <span className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-widest text-rose-400 drop-shadow-md">
                        RED
                      </span>
                    </div>
                  </div>
                )}

                {st === 'tamamlanan' && (
                  <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-emerald-950/25 backdrop-blur-[0.5px]">
                    <div className="border-4 sm:border-[5px] border-emerald-500/80 rounded-2xl px-6 sm:px-12 py-1 sm:py-2 rotate-[-8deg] shadow-2xl bg-emerald-950/60 select-none">
                      <span className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-widest text-emerald-400 drop-shadow-md">
                        OK
                      </span>
                    </div>
                  </div>
                )}

                {/* Step Number with status indicator */}
                <div
                  className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl font-black text-xs sm:text-sm shrink-0 flex items-center justify-center border shadow-xs ${
                    st === 'red'
                      ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                      : st === 'tamamlanan'
                      ? 'bg-emerald-500 text-black border-emerald-400'
                      : deptStyle.stepNumberClass
                  }`}
                >
                  {st === 'red' ? (
                    <div className="flex flex-col items-center leading-none">
                      <span className="text-[10px] sm:text-xs font-black">RED</span>
                      {itemFaultOrder >= 0 && (
                        <span className="text-[8px] font-mono font-bold opacity-90">#{itemFaultOrder + 1}</span>
                      )}
                    </div>
                  ) : st === 'tamamlanan' ? (
                    <span className="text-[11px] sm:text-xs font-black">OK</span>
                  ) : (
                    taskNumber
                  )}
                </div>

                {/* Task Details */}
                <div className="flex-1 min-w-0">
                  <div className="font-black text-xs sm:text-sm leading-snug mb-1 text-white group-hover:text-yellow-400 transition-colors break-words">
                    {t.task}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {t.targetValue && <span>Hedef: <b className="text-yellow-400 font-bold">{t.targetValue}</b></span>}
                    {t.region && <span>· Bölge: <b className="text-slate-300">{t.region}</b></span>}
                    {isTaskPhotoMandatory(t) && (
                      <span className="text-rose-400 font-bold flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        <span>Fotoğraflı</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Status icon right */}
                <div className="shrink-0 self-center flex items-center gap-1.5">
                  {st !== 'bekleyen' && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setPerformedModalOpen(true);
                      }}
                      title="Yapılan kontrol kaydını ve fotoğrafı incele"
                      className="p-1.5 rounded-lg bg-yellow-400/20 text-yellow-400 hover:bg-yellow-400 hover:text-black transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                    </span>
                  )}
                  {st === 'red' ? (
                    <span className="px-2.5 py-1 bg-rose-600 text-white text-xs font-black rounded-lg animate-pulse">
                      RED
                    </span>
                  ) : st === 'tamamlanan' ? (
                    <span className="px-2.5 py-1 bg-emerald-500 text-black text-xs font-black rounded-lg flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>OK</span>
                    </span>
                  ) : (
                    <span className={`px-2.5 py-1 text-xs font-black rounded-lg flex items-center gap-1 shadow-sm ${deptStyle.btnClass}`}>
                      <span>Kontrol</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
      </div>
    );
  }

  // ==========================================
  // VIEW 4: TASK EXECUTION & CONTROL SCREEN (Sarı-Siyah)
  // ==========================================
  const dept = getDepartmentConfig(selectedTask?.system);
  const deptStyle = getDeptDisplayStyle(dept);
  const isRed = result === 'RED';
  const descLength = description.trim().length;
  const isPhotoRequired = isTaskPhotoMandatory(selectedTask);
  const saveDisabled = saveLoading || (isPhotoRequired && !proofImage);

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-6 py-3 sm:py-5 space-y-3.5">
      {renderBreadcrumbBar()}

      {/* Control Header Card */}
      <div className="bg-[#1b263b] p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-md space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-yellow-400 uppercase tracking-wider block truncate">
              {selectedMachine?.machineName}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <h2 className="text-base sm:text-lg font-black text-white">
                {currentTaskNumber}. Kontrol Maddesi
              </h2>
              <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-yellow-400 text-black border border-yellow-300">
                {currentTaskNumber} / {totalTasksCount}
              </span>
            </div>
          </div>
        </div>

        {/* Reference Image Frame */}
        {selectedTask?.referenceImageUrl ? (
          <div
            onClick={() => setRefImageModalOpen(true)}
            className="relative w-full max-h-56 sm:max-h-64 aspect-16/9 bg-black rounded-xl overflow-hidden border border-yellow-500/30 cursor-zoom-in group shadow-inner"
          >
            <img
              src={resolveDriveImageUrl(selectedTask.referenceImageUrl, selectedTask.templateId, selectedTask.task)}
              alt="Referans Resim"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const fId = extractDriveFileId(selectedTask.referenceImageUrl);
                if (!fId) return;
                const current = e.currentTarget.src;
                if (current.includes('/api/drive-image/')) {
                  e.currentTarget.src = `https://drive.google.com/thumbnail?id=${fId}&sz=w1000`;
                } else if (current.includes('thumbnail')) {
                  e.currentTarget.src = `https://lh3.googleusercontent.com/d/${fId}=w1000`;
                }
              }}
              className="w-full h-full object-contain"
            />
            <div className="absolute right-2 bottom-2 bg-yellow-400 text-black text-[11px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 shadow-md">
              <Maximize2 className="w-3 h-3" />
              <span>Büyüt</span>
            </div>
          </div>
        ) : null}

        {/* Task Specification Info (Arıza / Birim Grubu Renginde RED Stili) */}
        <div className={`p-4 rounded-xl border transition-all duration-200 space-y-2.5 ${deptStyle.containerClass}`}>
          <div className="flex items-center justify-between">
            <div className={`text-[10px] sm:text-[11px] uppercase font-black tracking-wider flex items-center gap-1.5 ${deptStyle.titleColor}`}>
              <span className={`w-2 h-2 rounded-full ${deptStyle.dotColor} animate-pulse`} />
              <span>YAPILACAK KONTROL</span>
            </div>
            {isPhotoRequired && (
              <span className="text-[10px] font-black bg-rose-950/80 text-rose-300 border border-rose-800/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Camera className="w-3 h-3 text-rose-400" />
                <span>Fotoğraf Zorunlu</span>
              </span>
            )}
          </div>

          <div className="text-sm sm:text-base font-black leading-snug break-words text-yellow-400 drop-shadow-xs">
            {selectedTask?.task}
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs pt-1.5 border-t border-slate-700/60">
            <span className={`font-black px-2.5 py-0.5 rounded-md border flex items-center gap-1.5 ${deptStyle.badgeClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${deptStyle.dotColor}`} />
              <span>Birim: {dept?.ad || selectedTask?.system || 'Genel'}</span>
            </span>
            <span className="font-bold bg-[#192437] text-slate-300 px-2.5 py-0.5 rounded-md border border-slate-700">
              Bölge: {selectedTask?.region || '-'}
            </span>
            {selectedTask?.part && (
              <span className="font-bold bg-[#192437] text-slate-300 px-2.5 py-0.5 rounded-md border border-slate-700">
                Parça: {selectedTask?.part}
              </span>
            )}
          </div>

          {selectedTask?.targetValue && (
            <div className="pt-2 text-xs sm:text-sm font-medium text-slate-200 border-t border-slate-700/40 flex items-center gap-1.5">
              <span className="text-slate-400">Hedef Değer:</span>{' '}
              <b className={`font-black ${deptStyle.targetColor}`}>{selectedTask.targetValue}</b>
            </div>
          )}
        </div>
      </div>

      {/* Control Execution Form (Sarı-Siyah / RED Seçildiğinde Gül-Kırmızı Arkaplan) */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border shadow-md space-y-4 transition-all duration-200 ${
          isRed
            ? 'bg-rose-950/40 border-rose-600/50 shadow-rose-950/40'
            : 'bg-[#1b263b] border-slate-800'
        }`}
      >
        {/* Previous Record Notice if already completed */}
        {(() => {
          const prevRec = selectedMachine && selectedTask ? findExistingRecord(selectedMachine.id, selectedTask.templateId) : null;
          if (!prevRec) return null;
          return (
            <div className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
              prevRec.result === 'RED'
                ? 'bg-rose-950/60 border-rose-500/80 text-rose-200'
                : 'bg-emerald-950/50 border-emerald-500/80 text-emerald-200'
            }`}>
              <div className="text-xs space-y-0.5 min-w-0">
                <div className="font-black flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Bu kontrol daha önce tamamlanmıştır (Mevcut Kayıt Açık)</span>
                </div>
                <div className="text-[11px] opacity-85">
                  Yapan: <b>{prevRec.operator}</b> • {prevRec.createdAt ? new Date(prevRec.createdAt).toLocaleString('tr-TR') : prevRec.date} • Sonuç: <b className="font-mono">{prevRec.result}</b>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPerformedModalOpen(true)}
                className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-black rounded-lg shrink-0 cursor-pointer shadow-sm transition-all"
              >
                Tüm Detayları Gör
              </button>
            </div>
          );
        })()}

        {/* Measured Value Input */}
        {selectedTask?.targetValue && (
          <div className={`p-3.5 rounded-xl border ${deptStyle.inputWrapperClass}`}>
            <label className={`block text-xs font-black mb-1 flex items-center justify-between ${deptStyle.inputLabelColor}`}>
              <span>Ölçülen Değer / Tespit</span>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${deptStyle.inputBadgeClass}`}>
                ZORUNLU
              </span>
            </label>
            <div className="text-[11px] text-slate-400 mb-1.5 font-medium">
              İstenen Referans: <b className={deptStyle.targetColor}>{selectedTask.targetValue}</b>
            </div>
            <input
              type="text"
              value={measuredValue}
              onChange={(e) => setMeasuredValue(e.target.value)}
              placeholder="Ör: 4.8 bar / 48°C / 8.2mm"
              className={`w-full px-3 py-2.5 bg-[#141d2d] border rounded-xl text-base font-bold text-white focus:outline-none focus:ring-2 ${deptStyle.inputBorder} ${deptStyle.inputFocusRing}`}
            />
          </div>
        )}

        {/* Result Selection: UYGUN vs RED */}
        <div>
          <label className="block text-xs sm:text-sm font-black text-white mb-2">
            Bakım Sonucu <span className="text-rose-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setResult('UYGUN')}
              className={`py-3.5 px-3 sm:px-5 rounded-2xl font-black text-base border-2 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95 ${
                result === 'UYGUN'
                  ? 'bg-emerald-500 border-emerald-400 text-black shadow-lg ring-4 ring-emerald-500/20'
                  : 'bg-[#141d2d] border-slate-700 text-slate-300 hover:border-emerald-500 hover:text-white'
              }`}
            >
              <CheckCircle2 className={`w-5 h-5 ${result === 'UYGUN' ? 'text-black' : 'text-emerald-400'}`} />
              <span>OK (UYGUN)</span>
            </button>

            <button
              type="button"
              onClick={() => setResult('RED')}
              className={`py-3.5 px-3 sm:px-5 rounded-2xl font-black text-base border-2 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95 ${
                result === 'RED'
                  ? 'bg-rose-600 border-rose-500 text-white shadow-lg ring-4 ring-rose-500/20 animate-pulse'
                  : 'bg-[#141d2d] border-slate-700 text-slate-300 hover:border-rose-500 hover:text-white'
              }`}
            >
              <AlertTriangle className={`w-5 h-5 ${result === 'RED' ? 'text-white' : 'text-rose-400'}`} />
              <span>RED (Arıza)</span>
            </button>
          </div>
        </div>


        {/* Description Field */}
        <div>
          <label className="block text-xs sm:text-sm font-black text-white mb-1 flex items-center justify-between">
            <span>Açıklama / Notlar</span>
            {isRed && (
              <span className="text-[10px] font-black bg-rose-900 text-rose-200 px-2 py-0.5 rounded-full uppercase border border-rose-700">
                RED İÇİN ZORUNLU
              </span>
            )}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={
              isRed
                ? 'Arızanın tanımı nedir? Hangi parçada hasar var? (En az 10 karakter)...'
                : 'Açıklama veya ilave notlar (isteğe bağlı)...'
            }
            className={`w-full px-3.5 py-2.5 bg-[#141d2d] border rounded-xl text-base sm:text-sm font-medium focus:outline-none transition-all text-white ${
              isRed && descLength < 10
                ? 'border-rose-500 focus:ring-2 focus:ring-rose-500'
                : 'border-slate-700 focus:ring-2 focus:ring-yellow-400'
            }`}
          />
          {isRed && (
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="text-rose-400 font-bold text-[11px] sm:text-xs">
                {descLength < 10
                  ? `Lütfen en az ${10 - descLength} karakter daha yazın.`
                  : '✔ Açıklama yeterli.'}
              </span>
              <span className={`font-black ${descLength >= 10 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {descLength} / 10
              </span>
            </div>
          )}
        </div>

        {/* Proof Photo Capture Area */}
        <div
          className={`p-3.5 sm:p-4 rounded-xl border-2 transition-all ${
            isPhotoRequired && !proofImage
              ? 'bg-rose-950/20 border-rose-500/70'
              : proofImage
              ? 'bg-emerald-950/20 border-emerald-500/70'
              : 'bg-[#141d2d] border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-yellow-400" />
              <span className="text-xs sm:text-sm font-black text-white">Kanıt Fotoğrafı</span>
              {isPhotoRequired && (
                <span className="text-[9px] font-black bg-rose-600 text-white px-2 py-0.5 rounded-full uppercase">
                  ZORUNLU
                </span>
              )}
            </div>

            {proofImage && (
              <button
                type="button"
                onClick={() => setProofImageModalOpen(true)}
                className="text-xs font-bold text-yellow-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Büyüt</span>
              </button>
            )}
          </div>

          {/* Photo Actions & Preview */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <label className="w-full sm:w-auto cursor-pointer">
              <span className="w-full sm:w-auto py-2.5 px-4 bg-yellow-400 hover:bg-yellow-300 text-black text-xs sm:text-sm font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95">
                <Upload className="w-4 h-4 text-black" />
                <span>{proofImage ? 'Yeniden Çek / Değiştir' : 'Fotoğraf Çek / Yükle'}</span>
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageCapture}
                className="hidden"
              />
            </label>

            {proofImage && (
              <div className="flex items-center gap-3 w-full sm:w-auto bg-[#141d2d] p-2 rounded-xl border border-slate-700 shadow-2xs">
                <img
                  src={proofImage}
                  alt="Önizleme"
                  onClick={() => setProofImageModalOpen(true)}
                  className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg border-2 border-emerald-500 shadow-xs cursor-pointer shrink-0"
                />
                <div className="text-xs text-slate-300 min-w-0">
                  <div className="font-bold text-emerald-400 truncate">Fotoğraf eklendi ✔</div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400">
                    {proofImageFile ? `${Math.round(proofImageFile.size / 1024)} KB` : 'Hazır'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* FEATURE 3: AI Visual Defect Inspection Button */}
          {proofImage && (
            <div className="mt-3.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleRunAiInspection}
                disabled={aiAnalyzing}
                className="w-full py-2.5 px-4 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {aiAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>Gemini 3.1 Pro Fotoğrafı İnceliyor...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-black" />
                    <span>AI Görsel Kusur & Arıza Tespiti Yap (Gemini 3.1 Pro)</span>
                  </>
                )}
              </button>

              {/* Inspection Results Box */}
              {aiAnalysisResult && (
                <div className="mt-3 p-3 bg-[#141d2d] border border-yellow-500/40 rounded-xl text-xs text-slate-100 space-y-2">
                  <div className="flex items-center justify-between font-black text-yellow-400 border-b border-yellow-500/20 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                      <span>Gemini Endüstriyel Analiz Raporu</span>
                    </span>
                    {aiAnalysisVerdict && (
                      <span
                        className={`px-2 py-0.5 rounded-full font-black text-[10px] ${
                          aiAnalysisVerdict === 'RED'
                            ? 'bg-rose-600 text-white'
                            : 'bg-emerald-500 text-black'
                        }`}
                      >
                        ÖNERİ: {aiAnalysisVerdict}
                      </span>
                    )}
                  </div>
                  <div className="whitespace-pre-line leading-relaxed font-medium text-slate-200">
                    {aiAnalysisResult}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feedback Message */}
        {saveMessage && (
          <div
            className={`p-3.5 rounded-xl text-sm font-bold ${
              saveMessage.type === 'error'
                ? 'bg-rose-950/60 text-rose-200 border border-rose-700'
                : 'bg-emerald-950/60 text-emerald-200 border border-emerald-700'
            }`}
          >
            {saveMessage.text}
          </div>
        )}

        {/* Submit Save Button (Sarı-Siyah) */}
        <button
          type="button"
          onClick={handleSaveControl}
          disabled={saveDisabled}
          className={`w-full py-4 px-6 rounded-2xl font-black text-base shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] ${
            saveDisabled
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              : 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-yellow-500/25'
          }`}
        >
          {saveLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-black" />
              <span>Kaydediliyor...</span>
            </>
          ) : isPhotoRequired && !proofImage ? (
            <span>📷 Önce Kanıt Fotoğrafı Çekiniz</span>
          ) : (
            <>
              <span>Kontrolü Kaydet & Sonrakine Geç</span>
              <ArrowRight className="w-5 h-5 text-black" />
            </>
          )}
        </button>
      </div>

      {/* Lightbox Modal for Reference Image */}
      {refImageModalOpen && selectedTask?.referenceImageUrl && (
        <div
          onClick={() => setRefImageModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setRefImageModalOpen(false)}
              className="absolute -top-10 right-0 text-yellow-400 hover:text-white p-1"
            >
              <X className="w-7 h-7" />
            </button>
            <img
              src={resolveDriveImageUrl(selectedTask.referenceImageUrl, selectedTask.templateId, selectedTask.task)}
              alt="Referans Resim"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const fId = extractDriveFileId(selectedTask.referenceImageUrl);
                if (!fId) return;
                const current = e.currentTarget.src;
                if (current.includes('/api/drive-image/')) {
                  e.currentTarget.src = `https://drive.google.com/thumbnail?id=${fId}&sz=w1600`;
                } else if (current.includes('thumbnail')) {
                  e.currentTarget.src = `https://lh3.googleusercontent.com/d/${fId}=w1600`;
                }
              }}
              className="max-w-full max-h-[80vh] object-contain rounded-2xl bg-black border border-yellow-500/40 shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Lightbox Modal for Proof Image */}
      {proofImageModalOpen && proofImage && (
        <div
          onClick={() => setProofImageModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setProofImageModalOpen(false)}
              className="absolute -top-10 right-0 text-yellow-400 hover:text-white p-1"
            >
              <X className="w-7 h-7" />
            </button>
            <img
              src={proofImage}
              alt="Kanıt Fotoğrafı"
              className="max-w-full max-h-[80vh] object-contain rounded-2xl bg-black border border-yellow-500/40 shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Yapılan Bakımlar Görünümü Modalı */}
      <PerformedMaintenanceModal
        isOpen={performedModalOpen}
        onClose={() => setPerformedModalOpen(false)}
        machine={selectedMachine}
        records={records}
        templates={templates}
        onEditTask={(t) => {
          setPerformedModalOpen(false);
          handleOpenTask(t);
        }}
      />
    </div>
  );
};
