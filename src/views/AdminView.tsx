import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MaintenanceTemplate, Machine, DEPARTMENTS, DepartmentConfig } from '../types/cmms';
import { cmmsApi } from '../services/cmmsApi';
import { extractDriveFileId } from './RedListView';
import { CODE_GS_SOURCE } from '../constants/codeGsSource';
import { analyzeMaintenancePhoto, ImageAnalysisResponse } from '../services/geminiService';
import {
  Settings,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Upload,
  Search,
  Check,
  X,
  Loader2,
  Wrench,
  Shield,
  Layers,
  Sparkles,
  AlertTriangle,
  Image as ImageIcon,
  Copy,
  FileCode,
  Camera,
  Eye,
  Bot,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface AdminViewProps {
  machines: Machine[];
  templates: MaintenanceTemplate[];
  onTemplatesUpdated: () => void;
  onNavigateHome: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  machines,
  templates,
  onTemplatesUpdated,
  onNavigateHome,
}) => {
  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [machineId, setMachineId] = useState('');
  const [region, setRegion] = useState('');
  const [system, setSystem] = useState('');
  const [part, setPart] = useState('');
  const [task, setTask] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [orderNo, setOrderNo] = useState(1);
  const [photoRequired, setPhotoRequired] = useState(false);
  const [active, setActive] = useState(true);
  const [refImageBase64, setRefImageBase64] = useState<string | null>(null);
  const [refImageName, setRefImageName] = useState<string>('');
  const [existingImageUrl, setExistingImageUrl] = useState<string>('');
  const [isNewImageSelected, setIsNewImageSelected] = useState<boolean>(false);
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);

  // Görsel Değiştirme Modal Ekranı State'leri
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [modalPendingImage, setModalPendingImage] = useState<string | null>(null);
  const [modalPendingName, setModalPendingName] = useState<string>('');
  const [modalActionType, setModalActionType] = useState<'keep' | 'deleted' | 'new'>('keep');
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [imageAnalysisResult, setImageAnalysisResult] = useState<ImageAnalysisResponse | null>(null);
  const fileUploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Düzenleme Modal Ekranı (Tüm düzenleme, silme ve kayıt işlemlerinin doğrudan yapıldığı modal)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const editModalCameraRef = useRef<HTMLInputElement | null>(null);
  const editModalFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPreviewLoadFailed(false);
  }, [refImageBase64]);

  // Search & Collapsible groups
  const [filterQuery, setFilterQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Machine Searchable Combobox State
  const [machineSearchQuery, setMachineSearchQuery] = useState('');
  const [machineDropdownOpen, setMachineDropdownOpen] = useState(false);
  const machineSelectRef = useRef<HTMLDivElement | null>(null);

  // Close combobox when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (machineSelectRef.current && !machineSelectRef.current.contains(e.target as Node)) {
        setMachineDropdownOpen(false);
      }
    };
    if (machineDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [machineDropdownOpen]);

  // Selected Machine Object
  const selectedMachine = useMemo(() => {
    if (!machineId) return null;
    return machines.find((m) => m.id === machineId || m.machineName === machineId) || null;
  }, [machines, machineId]);

  // Filtered Machines for Combobox
  const filteredMachines = useMemo(() => {
    if (!machineSearchQuery.trim()) return machines;
    const q = machineSearchQuery.toLocaleLowerCase('tr-TR').trim();
    return machines.filter((m) =>
      (m.machineName || '').toLocaleLowerCase('tr-TR').includes(q) ||
      (m.costCenter || '').toLocaleLowerCase('tr-TR').includes(q) ||
      (m.code || '').toLocaleLowerCase('tr-TR').includes(q) ||
      (m.id || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [machines, machineSearchQuery]);

  // Department helper
  const getDeptInfo = (sys?: string): DepartmentConfig | null => {
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

  const getDeptBadgeStyle = (dept?: DepartmentConfig | null) => {
    switch (dept?.kod) {
      case 'elektrik':
        return 'bg-yellow-400/20 text-yellow-300 border-yellow-400/50';
      case 'mekanik':
        return 'bg-cyan-400/20 text-cyan-300 border-cyan-400/50';
      case 'dis':
        return 'bg-[#D6C1A6]/25 text-[#F5EDE3] border-[#D6C1A6]/50';
      case 'isg':
        return 'bg-orange-500/25 text-orange-300 border-orange-500/50';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  // Group templates by machine
  const groupedTemplates: Record<string, MaintenanceTemplate[]> = {};
  templates.forEach((t) => {
    const key = t.machineName || t.machineId;
    if (!groupedTemplates[key]) {
      groupedTemplates[key] = [];
    }
    groupedTemplates[key].push(t);
  });

  const handleToggleGroup = (machineName: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [machineName]: !prev[machineName],
    }));
  };

  const handleToggleAll = (open: boolean) => {
    const newState: Record<string, boolean> = {};
    Object.keys(groupedTemplates).forEach((k) => {
      newState[k] = open;
    });
    setOpenGroups(newState);
  };

  const handleStartEdit = (t: MaintenanceTemplate) => {
    setEditingId(t.templateId);
    setMachineId(t.machineId);
    setMachineSearchQuery('');
    setRegion(t.region || '');
    setSystem(t.system || '');
    setPart(t.part || '');
    setTask(t.task);
    setTargetValue(t.targetValue || '');
    setOrderNo(t.orderNo || 1);
    setPhotoRequired(Boolean(t.photoRequired));
    setActive(Boolean(t.active));

    // Check if image was previously deleted
    let isDeleted = false;
    try {
      const delMap = JSON.parse(localStorage.getItem('cmms_deleted_images') || '{}');
      if (delMap[t.templateId]) isDeleted = true;
    } catch {}

    // The true existing image from Google Sheets
    const sheetImg = isDeleted ? '' : (t.referenceImageUrl || '');
    let finalImg = sheetImg;
    if (!finalImg && !isDeleted) {
      try {
        const cached = localStorage.getItem(`templateImg_${t.templateId}`);
        if (cached) finalImg = cached;
      } catch {}
    }

    setExistingImageUrl(finalImg || '');
    setIsNewImageSelected(false);
    setRefImageBase64(null);
    setRefImageName(finalImg ? (t.referenceImageName || t.imageName || '') : '');
    setEditModalOpen(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditModalOpen(false);
    setMachineId('');
    setMachineSearchQuery('');
    setRegion('');
    setSystem('');
    setPart('');
    setTask('');
    setTargetValue('');
    setOrderNo(1);
    setPhotoRequired(false);
    setActive(true);
    setRefImageBase64(null);
    setRefImageName('');
    setExistingImageUrl('');
    setIsNewImageSelected(false);
    setStatusMessage(null);
  };

  const processImageFile = (file: File): Promise<{ base64: string; name: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawData = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
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
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'medium';
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.80);
            resolve({ base64: compressed, name: file.name });
            return;
          }
          resolve({ base64: rawData, name: file.name });
        };
        img.onerror = () => resolve({ base64: rawData, name: file.name });
        img.src = rawData;
      };
      reader.readAsDataURL(file);
    });
  };

  // Ortak Kayıt Fonksiyonu (Hem formdan hem de modal ekrandan doğrudan kaydetmek için)
  const executeSaveTemplate = async (override?: {
    imageToSend?: string | null;
    isNewImage?: boolean;
    imageName?: string;
    deleteImage?: boolean;
    keepEditOpen?: boolean;
  }) => {
    const isDeleteImage = Boolean(
      override?.deleteImage ||
      override?.imageToSend === '' ||
      override?.imageToSend === null ||
      (override?.isNewImage && !override?.imageToSend && !refImageBase64) ||
      (isNewImageSelected && !refImageBase64 && !existingImageUrl)
    );

    const isNewImg = override?.isNewImage !== undefined ? override.isNewImage : isNewImageSelected;
    let finalImageToSend: string | undefined = undefined;

    if (isDeleteImage) {
      finalImageToSend = '';
    } else if (override && override.imageToSend !== undefined) {
      finalImageToSend = override.imageToSend || undefined;
    } else if (isNewImg) {
      finalImageToSend = refImageBase64 || undefined;
    } else if (editingId) {
      finalImageToSend = existingImageUrl || refImageBase64 || undefined;
    } else {
      finalImageToSend = refImageBase64 || undefined;
    }

    if (!isDeleteImage && !finalImageToSend) {
      setStatusMessage({
        type: 'error',
        text: 'Referans resmi (teknik şema) yüklenmeden bakım tanımı kaydedilemez.',
      });
      return false;
    }
    if (!machineId) {
      setStatusMessage({ type: 'error', text: 'Lütfen bir makine seçiniz.' });
      return false;
    }
    if (!task.trim()) {
      setStatusMessage({ type: 'error', text: 'Yapılacak bakım açıklaması zorunludur.' });
      return false;
    }
    if (!system) {
      setStatusMessage({ type: 'error', text: 'Lütfen bakımı yapacak birimi seçiniz.' });
      return false;
    }

    setSaveLoading(true);
    setStatusMessage(null);

    try {
      const selectedMachineObj = machines.find((m) => m.id === machineId || m.machineName === machineId);
      const machineName = selectedMachineObj?.machineName || machineId;
      const costCenter = selectedMachineObj?.costCenter || '';
      const imgName = isDeleteImage ? '' : (override?.imageName || refImageName || undefined);

      const res = await cmmsApi.saveTemplate(
        {
          templateId: editingId || '',
          machineId,
          machineName,
          costCenter,
          region: region.trim(),
          system,
          part: part.trim(),
          task: task.trim(),
          targetValue: targetValue.trim(),
          orderNo: Number(orderNo) || 1,
          photoRequired,
          active,
          referenceImageUrl: isDeleteImage ? '' : finalImageToSend,
          referenceImageName: imgName,
          imageName: imgName,
          deleteImage: isDeleteImage,
        },
        {
          isNewImageSelected: isNewImg,
          existingImageUrl: isDeleteImage ? '' : existingImageUrl,
          deleteImage: isDeleteImage,
        }
      );

      if (res.success) {
        const savedUrl = isDeleteImage ? '' : (res.referenceImageUrl || finalImageToSend);
        if (isDeleteImage) {
          try {
            if (editingId) {
              const delMap = JSON.parse(localStorage.getItem('cmms_deleted_images') || '{}');
              delMap[editingId] = true;
              localStorage.setItem('cmms_deleted_images', JSON.stringify(delMap));
            }
            const map = JSON.parse(localStorage.getItem('cmms_template_photos_map') || '{}');
            if (editingId) delete map[editingId];
            if (task.trim()) delete map[task.trim()];
            localStorage.setItem('cmms_template_photos_map', JSON.stringify(map));
            if (editingId) localStorage.removeItem(`templateImg_${editingId}`);
          } catch {}
        } else if (savedUrl) {
          try {
            if (editingId) {
              const delMap = JSON.parse(localStorage.getItem('cmms_deleted_images') || '{}');
              delete delMap[editingId];
              localStorage.setItem('cmms_deleted_images', JSON.stringify(delMap));
            }
            const map = JSON.parse(localStorage.getItem('cmms_template_photos_map') || '{}');
            if (res.templateId) map[res.templateId] = savedUrl;
            if (editingId) map[editingId] = savedUrl;
            map[task.trim()] = savedUrl;
            localStorage.setItem('cmms_template_photos_map', JSON.stringify(map));
            if (res.templateId) localStorage.setItem(`templateImg_${res.templateId}`, savedUrl);
            if (editingId) localStorage.setItem(`templateImg_${editingId}`, savedUrl);
          } catch {}
        }

        setStatusMessage({
          type: 'success',
          text: editingId
            ? (isDeleteImage
                ? 'Referans resmi başarıyla silindi.'
                : (isNewImg ? 'Yeni teknik şema görseli yüklendi ve bakım tanımı kaydedildi.' : 'Bakım tanımı başarıyla güncellendi.'))
            : 'Yeni bakım tanımı kaydedildi.',
        });
        onTemplatesUpdated();

        // Eğer düzenleme modunun açık kalması isteniyorsa sadece görsel state'ini tazele
        if (override?.keepEditOpen) {
          if (isDeleteImage) {
            setExistingImageUrl('');
            setRefImageBase64(null);
            setRefImageName('');
            setIsNewImageSelected(false);
          } else if (savedUrl) {
            setExistingImageUrl(savedUrl);
            setRefImageBase64(null);
            setIsNewImageSelected(false);
          }
          setEditModalOpen(true);
        } else {
          handleCancelEdit();
        }
        return true;
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Kayıt sırasında hata oluştu.' });
        return false;
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Kayıt sırasında hata oluştu.' });
      return false;
    } finally {
      setSaveLoading(false);
    }
  };

  // Modal Açılış: Düzenleme modunda veya formda görsel modalı açılır (Arka plandaki düzenleme modu açık kalır)
  const handleOpenImageModal = () => {
    const currentImg = refImageBase64 || existingImageUrl || '';
    setModalPendingImage(currentImg || null);
    setModalPendingName(refImageName || '');
    setModalActionType(currentImg ? 'keep' : 'deleted');
    setImageAnalysisResult(null);
    setImageModalOpen(true);
  };

  // Modal İçinde: Resmi Sil (Sadece görsel state'ini günceller, düzenleme ekranından çıkmaz!)
  const handleModalDeleteImage = () => {
    setModalPendingImage(null);
    setModalPendingName('');
    setModalActionType('deleted');
    setImageAnalysisResult(null);
  };

  // Modal İçinde: Yeni resim seçildiğinde veya kamera ile çekildiğinde (Düzenleme ekranından çıkmaz!)
  const handleModalFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const { base64, name } = await processImageFile(file);
      setModalPendingImage(base64);
      setModalPendingName(name);
      setModalActionType('new');
      setImageAnalysisResult(null);
      e.target.value = '';
    }
  };

  // Modal İçinde: 'Eski Resmi Sil ve E-Tabloya Kaydet' (Arka plandaki düzenleme modunu açık tutar)
  const handleModalDirectDeleteAndSave = async () => {
    setRefImageBase64(null);
    setExistingImageUrl('');
    setRefImageName('');
    setIsNewImageSelected(true);
    setModalPendingImage(null);
    setModalPendingName('');
    setModalActionType('deleted');
    setImageModalOpen(false);

    if (editingId) {
      // Arka plandaki düzenleme modunu AÇIK tutarak tek hamlede kaydet!
      await executeSaveTemplate({
        imageToSend: '',
        deleteImage: true,
        isNewImage: false,
        imageName: '',
        keepEditOpen: true,
      });
    } else {
      setStatusMessage({
        type: 'success',
        text: 'Teknik şema görseli kaldırıldı. Düzenlemeye devam edebilirsiniz.',
      });
    }
  };

  // Modal İçinde: Seçilen/silinen görseli form alanına aktar ve düzenleme moduna dön (Arka plan açık kalır)
  const handleApplyImageModal = () => {
    if (modalActionType === 'deleted') {
      setRefImageBase64(null);
      setExistingImageUrl('');
      setRefImageName('');
      setIsNewImageSelected(true);
    } else if (modalActionType === 'new' && modalPendingImage) {
      setRefImageBase64(modalPendingImage);
      setRefImageName(modalPendingName || 'yeni_referans_resim.jpg');
      setIsNewImageSelected(true);
    }
    setImageModalOpen(false);
  };

  // AI ile Resmi Analiz Et (Gemini 3.1 Pro / Vision)
  const handleAnalyzeImage = async () => {
    const imgToAnalyze = modalPendingImage || refImageBase64 || existingImageUrl;
    if (!imgToAnalyze) {
      setStatusMessage({
        type: 'error',
        text: 'Analiz edilecek bir görsel bulunamadı. Lütfen önce bir görsel seçin veya yükleyin.',
      });
      return;
    }
    setIsAnalyzingImage(true);
    setImageAnalysisResult(null);
    try {
      let base64 = imgToAnalyze;
      if (!imgToAnalyze.startsWith('data:')) {
        const fetchUrl = extractDriveFileId(imgToAnalyze)
          ? `/api/drive-image/${extractDriveFileId(imgToAnalyze)}`
          : imgToAnalyze;
        const res = await fetch(fetchUrl);
        const blob = await res.blob();
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }
      const cleanData = base64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      const mime = base64.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
      const result = await analyzeMaintenancePhoto(cleanData, {
        mimeType: mime,
        taskName: task || 'Teknik Şema Kontrolü',
        machineName: selectedMachine?.machineName || 'Endüstriyel Ekipman',
        prompt: 'Bu endüstriyel teknik şema veya bakım görselini analiz et. Parça ve montaj yapısını, şemanın doğruluğunu, bağlantı noktalarını ve kritik bakım uyarılarını özetle.',
      });
      setImageAnalysisResult(result);
    } catch (err: any) {
      setImageAnalysisResult({
        success: false,
        message: err?.message || 'Görsel analizi yapılamadı.',
      });
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const { base64, name } = await processImageFile(file);
      setRefImageName(name);
      setRefImageBase64(base64);
      setIsNewImageSelected(true);
      e.target.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSaveTemplate();
  };

  const handleDelete = async (templateId: string, taskTitle: string) => {
    if (!confirm(`Bu bakım tanımı silinecektir:\n\n${taskTitle}\n\nOnaylıyor musunuz?`)) {
      return;
    }

    try {
      await cmmsApi.deleteTemplate(templateId);
      onTemplatesUpdated();
    } catch (err: any) {
      alert(`Silinemedi: ${err.message}`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Industrial Hero Command Banner (Sarı - Siyah Konsept) */}
      <div className="bg-gradient-to-br from-black via-[#10141e] to-[#182030] text-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden border border-yellow-500/40">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-yellow-400 text-black flex items-center justify-center font-black shadow-md shrink-0">
                <Settings className="w-4 h-4 text-black" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Admin Bakım Tanımı Paneli
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 font-normal max-w-2xl">
              Haftalık kontrol listesini düzenleyin, yeni bakım maddeleri tanımlayın ve birim standartlarını belirleyin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setScriptModalOpen(true)}
              className="px-3.5 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-black rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              title="Google E-Tablo Apps Script (Code.gs) senkronizasyon kodunu görüntüle"
            >
              <FileCode className="w-4 h-4 text-black" />
              <span>E-Tablo Kodu (Code.gs)</span>
            </button>
            <span className="px-3 py-1.5 bg-yellow-400/20 text-yellow-300 rounded-xl text-xs font-mono font-bold border border-yellow-400/40">
              {templates.length} Tanımlı Kontrol
            </span>
          </div>
        </div>

        {/* Technical background accents */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-15 bg-[radial-gradient(#facc15_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
      </div>

      {/* Form Section (Sarı - Siyah Koyu Tema) */}
      <div className="bg-[#1b263b] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-yellow-500/30 shadow-xl space-y-4">
        <h3 className="text-base sm:text-lg font-black text-white border-b border-slate-800 pb-3 flex items-center gap-2">
          <Plus className="w-5 h-5 text-yellow-400" />
          <span>{editingId ? 'Bakım Tanımını Düzenle' : 'Yeni Bakım Tanımı Ekle'}</span>
        </h3>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Searchable Machine Selector (Aramalı Makine Seçim Listesi) */}
            <div className="relative" ref={machineSelectRef}>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                <span>Makine Seçimi *</span>
                {selectedMachine && (
                  <span className="text-[11px] font-mono text-yellow-400 font-bold bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/30">
                    {selectedMachine.costCenter || selectedMachine.code || selectedMachine.id}
                  </span>
                )}
              </label>

              <div className="relative">
                <div
                  onClick={() => setMachineDropdownOpen(true)}
                  className="w-full flex items-center gap-2 bg-[#141d2d] border border-slate-700 hover:border-yellow-400/70 focus-within:border-yellow-400 focus-within:ring-1 focus-within:ring-yellow-400 rounded-xl px-3 py-2.5 text-sm cursor-text transition-all"
                >
                  <Search className="w-4 h-4 text-yellow-400 shrink-0" />
                  <input
                    type="text"
                    value={machineSearchQuery}
                    onChange={(e) => {
                      setMachineSearchQuery(e.target.value);
                      setMachineDropdownOpen(true);
                    }}
                    onFocus={() => setMachineDropdownOpen(true)}
                    placeholder={
                      selectedMachine
                        ? `${selectedMachine.machineName}`
                        : 'Makine adı veya kod ile ara (Örn: CNC, Trafo)...'
                    }
                    className="w-full bg-transparent text-white placeholder:text-slate-400 focus:outline-none text-xs sm:text-sm font-semibold"
                  />

                  {selectedMachine && !machineSearchQuery && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMachineId('');
                        setMachineSearchQuery('');
                      }}
                      title="Seçimi Temizle"
                      className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMachineDropdownOpen(!machineDropdownOpen);
                    }}
                    className="text-slate-400 hover:text-yellow-400"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        machineDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>

                {/* Dropdown Results List */}
                {machineDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#1b263b] border border-yellow-500/40 rounded-xl shadow-2xl z-30 max-h-64 overflow-y-auto p-1.5 space-y-1">
                    <div className="px-2.5 py-1.5 text-[11px] font-bold text-slate-400 border-b border-slate-800 flex items-center justify-between">
                      <span>Makineler ({filteredMachines.length})</span>
                      {machineSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setMachineSearchQuery('')}
                          className="text-yellow-400 hover:underline"
                        >
                          Filtreyi Temizle
                        </button>
                      )}
                    </div>

                    {filteredMachines.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        "{machineSearchQuery}" ile eşleşen makine bulunamadı.
                      </div>
                    ) : (
                      filteredMachines.map((m) => {
                        const isSelected = m.id === machineId || m.machineName === machineId;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setMachineId(m.id);
                              setMachineSearchQuery('');
                              setMachineDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm flex items-center justify-between gap-2 transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-yellow-400/20 text-yellow-300 font-black border border-yellow-400/50'
                                : 'hover:bg-slate-800/80 text-slate-200'
                            }`}
                          >
                            <span className="font-bold text-yellow-400 truncate">
                              {m.machineName}
                            </span>
                            <span className="font-mono text-[10px] sm:text-xs bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800 shrink-0">
                              {m.costCenter || m.code || m.id}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Bakımı Yapan Birim (Renkli Birim Seçimi) */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Bakımı Yapan Birim *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DEPARTMENTS.map((d) => {
                  const isSelected = system === d.deger || system === d.ad;
                  const badgeStyle = getDeptBadgeStyle(d);
                  return (
                    <button
                      key={d.kod}
                      type="button"
                      onClick={() => setSystem(d.deger)}
                      className={`px-3 py-2 rounded-xl text-xs font-black transition-all border flex items-center justify-between cursor-pointer active:scale-95 ${
                        isSelected
                          ? `${badgeStyle} ring-2 ring-yellow-400 shadow-lg scale-102 font-black`
                          : 'bg-[#141d2d] border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <span className="truncate">{d.ad}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Bölge (Ünite / Bölüm) */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Bölge (Ünite / Bölüm)
              </label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Örn: Besleme Ünitesi, Fırın Girişi"
                className="w-full px-3.5 py-2.5 bg-[#141d2d] border border-slate-700 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 text-white placeholder:text-slate-500 rounded-xl text-xs sm:text-sm font-medium"
              />
            </div>

            {/* 4. Parça / Ekipman */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Parça / Ekipman
              </label>
              <input
                type="text"
                value={part}
                onChange={(e) => setPart(e.target.value)}
                placeholder="Örn: Rulman, Basınç Valfi, Servo Motor"
                className="w-full px-3.5 py-2.5 bg-[#141d2d] border border-slate-700 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 text-white placeholder:text-slate-500 rounded-xl text-xs sm:text-sm font-medium"
              />
            </div>

            {/* 5. Yapılacak Bakım Görevi */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Yapılacak Bakım Görevi *
              </label>
              <textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                required
                rows={2}
                placeholder="Operatörün sahada uygulayacağı kontrol talimatı..."
                className="w-full px-3.5 py-2.5 bg-[#141d2d] border border-slate-700 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 text-white placeholder:text-slate-500 rounded-xl text-xs sm:text-sm font-medium"
              />
            </div>

            {/* 6. İstenen Değer / Tolerans */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                İstenen Değer / Tolerans
              </label>
              <input
                type="text"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="Örn: 210 bar ± 5 bar, 8.2mm, Max 55°C"
                className="w-full px-3.5 py-2.5 bg-[#141d2d] border border-slate-700 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 text-white placeholder:text-slate-500 rounded-xl text-xs sm:text-sm font-medium"
              />
            </div>

            {/* 7. Sıra No */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Sıra No
              </label>
              <input
                type="number"
                min={1}
                value={orderNo}
                onChange={(e) => setOrderNo(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-[#141d2d] border border-slate-700 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 text-white rounded-xl text-xs sm:text-sm font-medium"
              />
            </div>
          </div>

          {/* Reference Image Upload & Preview (Zorunlu Alan) */}
          <div className="p-4 bg-[#141d2d] rounded-xl border border-slate-800">
            {(() => {
              const hasImage = Boolean(refImageBase64 || (editingId && existingImageUrl));
              const displayImg = refImageBase64 || existingImageUrl;

              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Referans Resim (Teknik Şema) *
                      </label>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                          hasImage
                            ? (isNewImageSelected
                                ? 'bg-amber-500/20 text-yellow-300 border-yellow-400/60'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40')
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                        }`}
                      >
                        {hasImage
                          ? (isNewImageSelected
                              ? 'Yeni Görsel Seçildi ✔'
                              : (editingId ? 'Mevcut Görsel Korunuyor ✔' : 'Görsel Hazır ✔'))
                          : 'Zorunlu Alan'}
                      </span>
                    </div>

                    {hasImage ? (
                      <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        {isNewImageSelected
                          ? 'Yeni şema seçildi (kaydedilecek)'
                          : (editingId ? 'Mevcut şema korunuyor' : 'Kayıt düğmesi aktif')}
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Kayıt için resim zorunludur
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    {/* Düzenleme modunda veya mevcut resim varsa Modal Aç, yoksa doğrudan dosya seçici */}
                    {editingId || hasImage ? (
                      <button
                        type="button"
                        onClick={handleOpenImageModal}
                        className="px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 transition-all border bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300 shadow-md shadow-yellow-500/20 cursor-pointer active:scale-95"
                      >
                        <Upload className="w-4 h-4 shrink-0" />
                        <span>Resmi Değiştir</span>
                      </button>
                    ) : (
                      <label className="cursor-pointer">
                        <span className="px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 transition-all border bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300 shadow-md shadow-yellow-500/20">
                          <Upload className="w-4 h-4 shrink-0" />
                          <span>Referans Resmi Seç / Yükle</span>
                        </span>
                        <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                      </label>
                    )}

                    {displayImg && (
                      <div className="flex items-center gap-2.5 bg-[#1b263b] px-3 py-1.5 rounded-xl border border-yellow-500/30">
                        {previewLoadFailed && !displayImg.startsWith('data:') ? (
                          <div className="w-14 h-12 rounded-lg bg-yellow-500/20 border border-yellow-400/50 flex flex-col items-center justify-center text-yellow-400 shrink-0">
                            <Layers className="w-5 h-5" />
                            <span className="text-[8px] font-black uppercase mt-0.5">ŞEMA</span>
                          </div>
                        ) : (
                          <img
                            src={
                              displayImg.startsWith('data:')
                                ? displayImg
                                : extractDriveFileId(displayImg)
                                ? `/api/drive-image/${extractDriveFileId(displayImg)}`
                                : displayImg
                            }
                            alt="Referans Önizleme"
                            onError={(e) => {
                              const fId = extractDriveFileId(displayImg);
                              if (fId && !e.currentTarget.src.includes('thumbnail')) {
                                e.currentTarget.src = `https://drive.google.com/thumbnail?id=${fId}&sz=w1000`;
                              } else {
                                setPreviewLoadFailed(true);
                              }
                            }}
                            className="w-14 h-12 object-cover rounded-lg border border-yellow-400/50 shadow-sm"
                          />
                        )}
                        <div className="text-left max-w-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white block truncate" title={refImageName || 'Teknik Şema'}>
                              {refImageName || (isNewImageSelected ? 'Yeni Görsel' : 'Mevcut Görsel')}
                            </span>
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.2 rounded font-mono ${
                                isNewImageSelected
                                  ? 'bg-amber-400 text-black'
                                  : 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              {isNewImageSelected ? 'YENİ' : 'MEVCUT'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setRefImageBase64(null);
                              setExistingImageUrl('');
                              setRefImageName('');
                              setIsNewImageSelected(true);
                            }}
                            className="text-[11px] text-rose-400 font-bold hover:underline cursor-pointer block mt-0.5"
                          >
                            Resmi Kaldır
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {!hasImage && (
                    <div className="mt-3 p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Bakım tanımı kayıt düğmesini aktifleştirmek için lütfen bir teknik şema / referans resmi yükleyin.</span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Checkbox Options */}
          <div className="flex flex-wrap items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm font-bold text-slate-200 select-none">
              <input
                type="checkbox"
                checked={photoRequired}
                onChange={(e) => setPhotoRequired(e.target.checked)}
                className="w-4 h-4 rounded text-yellow-400 focus:ring-yellow-400 accent-yellow-400 cursor-pointer"
              />
              <span>Operatörden kanıt fotoğrafı zorunlu tutulsun</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm font-bold text-slate-200 select-none">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 rounded text-yellow-400 focus:ring-yellow-400 accent-yellow-400 cursor-pointer"
              />
              <span>Aktif</span>
            </label>
          </div>

          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-bold ${
                statusMessage.type === 'error'
                  ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                  : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              {statusMessage.text}
            </div>
          )}

          {/* Action Buttons: Kayıt düğmesi sadece resim olunca aktif */}
          {(() => {
            const hasImage = Boolean(refImageBase64 || (editingId && existingImageUrl));
            const isSaveDisabled = saveLoading || !hasImage;
            return (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSaveDisabled}
                  className={`py-3 px-6 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
                    isSaveDisabled
                      ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                      : 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-lg shadow-yellow-500/20 cursor-pointer active:scale-95'
                  }`}
                >
                  {saveLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <>
                      {hasImage && <Check className="w-4 h-4 shrink-0" />}
                      <span>{editingId ? 'Değişiklikleri Kaydet' : 'Bakım Tanımını Kaydet'}</span>
                    </>
                  )}
                </button>

                {isSaveDisabled && !saveLoading && (
                  <div className="text-xs text-amber-400 font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Referans resmi olmadan kayıt düğmesi aktif olmaz</span>
                  </div>
                )}

                {editingId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs sm:text-sm border border-slate-700 cursor-pointer"
                  >
                    Vazgeç
                  </button>
                )}
              </div>
            );
          })()}
        </form>
      </div>

      {/* Existing Templates Section (Kayıtlı Bakım Tanımları - Koyu Sarı-Siyah Tema) */}
      <div className="bg-[#1b263b] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-yellow-500/30 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base sm:text-lg font-black text-white">Kayıtlı Bakım Tanımları</h3>
            <span className="text-xs text-slate-400 font-semibold">{templates.length} toplam bakım maddesi</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleToggleAll(true)}
              className="px-3 py-1.5 bg-[#141d2d] hover:bg-slate-800 text-slate-300 font-bold rounded-lg text-xs border border-slate-700 transition-colors"
            >
              Tümünü Aç
            </button>
            <button
              type="button"
              onClick={() => handleToggleAll(false)}
              className="px-3 py-1.5 bg-[#141d2d] hover:bg-slate-800 text-slate-300 font-bold rounded-lg text-xs border border-slate-700 transition-colors"
            >
              Tümünü Kapat
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Makine veya bakım arayın..."
            className="w-full pl-9 pr-4 py-2.5 bg-[#141d2d] border border-slate-700 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 rounded-xl text-xs sm:text-sm font-semibold text-white placeholder:text-slate-500"
          />
          <Search className="w-4 h-4 text-yellow-400 absolute left-3 top-3" />
        </div>

        {/* Collapsible Groups */}
        <div className="space-y-3">
          {Object.keys(groupedTemplates).map((machineName) => {
            const groupTasks = groupedTemplates[machineName].filter((t) => {
              if (!filterQuery) return true;
              return (
                t.task.toLowerCase().includes(filterQuery.toLowerCase()) ||
                machineName.toLowerCase().includes(filterQuery.toLowerCase())
              );
            });

            if (groupTasks.length === 0) return null;
            const isOpen = openGroups[machineName] ?? true;

            return (
              <div key={machineName} className="border border-slate-800 rounded-xl overflow-hidden shadow-md">
                {/* Accordion Header (Sarı Makine İsmi) */}
                <button
                  type="button"
                  onClick={() => handleToggleGroup(machineName)}
                  className="w-full px-4 py-3 bg-[#182030] hover:bg-[#1e283d] transition-colors flex items-center justify-between text-left font-black text-sm text-white"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-yellow-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-yellow-400 shrink-0" />
                    )}
                    <span className="text-yellow-400 font-black truncate">{machineName}</span>
                  </div>
                  <span className="text-xs bg-yellow-400/10 text-yellow-400 px-2.5 py-0.5 rounded-full border border-yellow-400/30 font-extrabold shrink-0">
                    {groupTasks.length} bakım
                  </span>
                </button>

                {/* Accordion Body */}
                {isOpen && (
                  <div className="divide-y divide-slate-800/80 bg-[#162030]">
                    {groupTasks.map((t, idx) => {
                      const dept = getDeptInfo(t.system);
                      const deptBadgeStyle = getDeptBadgeStyle(dept);

                      return (
                        <div key={t.templateId} className="p-3.5 flex items-start justify-between gap-3 hover:bg-[#1b263b] transition-colors">
                          <div className="space-y-1.5 min-w-0">
                            <div className="font-extrabold text-sm text-white leading-snug break-words">
                              <span className="text-yellow-400 mr-1.5">{idx + 1}.</span>
                              {t.task}
                            </div>
                            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                              {/* Renkli Birim Rozeti */}
                              {t.system && (
                                <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${deptBadgeStyle}`}>
                                  {dept?.ad || t.system}
                                </span>
                              )}
                              {t.region && (
                                <span className="bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded-md text-[11px] font-medium border border-slate-700">
                                  Bölge: <b className="text-slate-200">{t.region}</b>
                                </span>
                              )}
                              {t.targetValue && (
                                <span className="bg-slate-800/80 text-yellow-300 px-2 py-0.5 rounded-md text-[11px] font-mono border border-slate-700">
                                  İstenen: <b className="text-yellow-400">{t.targetValue}</b>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 pt-0.5">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  t.active
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                {t.active ? 'Aktif' : 'Pasif'}
                              </span>
                              {t.photoRequired && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  Fotoğraf Zorunlu
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {t.referenceImageUrl && (
                              <button
                                type="button"
                                onClick={() => handleStartEdit(t)}
                                className="w-10 h-10 rounded-lg overflow-hidden border border-yellow-500/40 bg-slate-900 shrink-0 hover:scale-105 transition-transform"
                                title="Teknik Şemayı İncele / Değiştir"
                              >
                                <img
                                  src={
                                    t.referenceImageUrl.startsWith('data:')
                                      ? t.referenceImageUrl
                                      : extractDriveFileId(t.referenceImageUrl)
                                      ? `https://drive.google.com/thumbnail?id=${extractDriveFileId(t.referenceImageUrl)}&sz=w200`
                                      : t.referenceImageUrl
                                  }
                                  alt="Şema"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleStartEdit(t)}
                              className="p-1.5 text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-colors cursor-pointer"
                              title="Düzenle"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(t.templateId, t.task)}
                              className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
      </div>

      {/* =========================================================================
          GÖRSEL DEĞİŞTİRME MODAL EKRANI (Teknik Şema / Referans Resim Yönetimi)
          Kullanıcı isteği: Düzenleme modunda 'Resmi Değiştir' dendiğinde modal açılsın,
          eski resmi sil ve yerine yenisini çek/yükle seçenekleri olsun, kayıt tamamlansın.
         ========================================================================= */}
      {imageModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="bg-[#141d2d] border border-yellow-500/40 rounded-2xl sm:rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Başlık */}
            <div className="p-4 sm:p-5 bg-[#1b263b] border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-400 text-black flex items-center justify-center font-black shadow-md shadow-yellow-500/20">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <span>Referans Görsel & Teknik Şema Yönetimi</span>
                    {editingId && (
                      <span className="text-[10px] font-mono bg-yellow-400/20 text-yellow-300 px-2 py-0.5 rounded border border-yellow-400/40">
                        {editingId}
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Fotoğraf çekebilir, dosya seçebilir, silebilir veya yapay zeka ile analiz edebilirsiniz
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImageModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal İçerik */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {/* Görsel Durum Önizlemesi */}
              <div className="bg-[#0f172a] rounded-2xl p-4 border border-slate-800 text-center">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-yellow-400" />
                  <span>
                    {modalActionType === 'deleted' || (!modalPendingImage && modalActionType !== 'new')
                      ? 'Görsel Silindi (Kaldırıldı)'
                      : modalActionType === 'new'
                      ? 'Yeni Seçilen Görsel'
                      : 'Mevcut Kayıtlı Görsel'}
                  </span>
                </div>

                {modalPendingImage ? (
                  <div className="relative inline-block max-w-full">
                    <img
                      src={
                        modalPendingImage.startsWith('data:')
                          ? modalPendingImage
                          : extractDriveFileId(modalPendingImage)
                          ? `/api/drive-image/${extractDriveFileId(modalPendingImage)}`
                          : modalPendingImage
                      }
                      alt="Önizleme"
                      className="max-h-60 max-w-full mx-auto rounded-xl border border-yellow-400/40 object-contain shadow-lg bg-black/40"
                    />
                    <div className="mt-2 text-xs text-slate-300 font-medium truncate max-w-xs mx-auto">
                      {modalPendingName || (modalActionType === 'new' ? 'Yeni Fotoğraf' : 'Kayıtlı Teknik Şema')}
                    </div>
                  </div>
                ) : (
                  <div className="py-8 px-4 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-700 rounded-xl bg-slate-900/40">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                    <span className="text-sm font-bold text-slate-200">Referans Görsel Yok (Silindi)</span>
                    <span className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Görsel kaldırıldı. Aşağıdaki seçeneklerden yeni fotoğraf çekebilir, galeriden seçebilir veya mevcut haliyle devam edebilirsiniz.
                    </span>
                  </div>
                )}
              </div>

              {/* AI Gemini Görsel Analiz Bölümü (resmi analiz et) */}
              {(modalPendingImage || refImageBase64 || existingImageUrl) && (
                <div className="bg-[#1b263b] rounded-2xl p-4 border border-cyan-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                      <Bot className="w-4 h-4 text-cyan-400" />
                      <span>Gemini Endüstriyel Şema & Görüntü Analizi</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleAnalyzeImage}
                      disabled={isAnalyzingImage || (!modalPendingImage && !refImageBase64 && !existingImageUrl)}
                      className="py-1.5 px-3 rounded-lg text-xs font-black bg-cyan-400 hover:bg-cyan-300 text-black cursor-pointer active:scale-95 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAnalyzingImage ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Analiz Ediliyor...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Resmi Analiz Et</span>
                        </>
                      )}
                    </button>
                  </div>

                  {imageAnalysisResult && (
                    <div className="mt-3 p-3.5 rounded-xl bg-[#0f172a] border border-cyan-500/40 text-xs space-y-2 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="font-bold text-slate-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Mühendislik Değerlendirmesi</span>
                        </span>
                        {imageAnalysisResult.verdict && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                              imageAnalysisResult.verdict === 'UYGUN'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            }`}
                          >
                            ÖNERİLEN: {imageAnalysisResult.verdict}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto pr-1">
                        {imageAnalysisResult.analysis || imageAnalysisResult.message}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Gizli Dosya & Kamera Inputları */}
              <input
                ref={fileUploadInputRef}
                type="file"
                accept="image/*"
                onChange={handleModalFileSelected}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleModalFileSelected}
                className="hidden"
              />

              {/* İşlem Düğmeleri: Kameradan Çek, Dosyadan Seç, Görseli Sil */}
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* 1. Kameradan Çek */}
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border bg-[#1b263b] hover:bg-slate-700 text-yellow-300 border-yellow-400/40 cursor-pointer active:scale-95 transition-all shadow-sm"
                  >
                    <Camera className="w-4 h-4 text-yellow-400 shrink-0" />
                    <span>Kameradan Çek</span>
                  </button>

                  {/* 2. Dosyadan Seç */}
                  <button
                    type="button"
                    onClick={() => fileUploadInputRef.current?.click()}
                    className="py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border bg-[#1b263b] hover:bg-slate-700 text-yellow-300 border-yellow-400/40 cursor-pointer active:scale-95 transition-all shadow-sm"
                  >
                    <Upload className="w-4 h-4 text-yellow-400 shrink-0" />
                    <span>Dosyadan / Galeriden Seç</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* 3. Eski Resmi Sil (Düzenleme ekranından çıkmaz!) */}
                  <button
                    type="button"
                    onClick={handleModalDeleteImage}
                    disabled={!modalPendingImage}
                    className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border transition-all ${
                      !modalPendingImage
                        ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30 cursor-pointer active:scale-95'
                    }`}
                  >
                    <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Görseli Sil (Kaldır)</span>
                  </button>

                  {/* 4. E-Tablo'dan Şimdi Sil ve Kaydet (Düzenleme açık kalsın) */}
                  {editingId && (
                    <button
                      type="button"
                      onClick={handleModalDirectDeleteAndSave}
                      disabled={saveLoading || !modalPendingImage}
                      className="py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 cursor-pointer active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      title="E-Tablo'daki sütunları hemen temizler ancak düzenleme ekranını kapatmaz"
                    >
                      <Check className="w-3.5 h-3.5 text-yellow-400" />
                      <span>E-Tablo'dan Sil (Düzenleme Açık Kalsın)</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Alt Bar: Düzenleme ekranına dön */}
            <div className="p-4 sm:p-5 bg-[#1b263b] border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setImageModalOpen(false)}
                className="py-2.5 px-4 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer transition-colors"
              >
                Kapat
              </button>

              <button
                type="button"
                onClick={handleApplyImageModal}
                className="py-2.5 px-6 rounded-xl text-xs sm:text-sm font-black bg-yellow-400 hover:bg-yellow-300 text-black shadow-lg shadow-yellow-500/20 cursor-pointer active:scale-95 transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4 text-black" />
                <span>Uygula ve Düzenlemeye Dön</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* =========================================================================
          TAM DÜZENLEME & SİLME & KAYIT MODAL EKRANI
          Kullanıcı isteği: "herşey modal ekrandan olasun ordan kayıt edip sile bileyim"
          Düzenle butonuna tıklandığında tam donanımlı bu modal açılır.
         ========================================================================= */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="bg-[#141d2d] border border-yellow-500/40 rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-[#1b263b] border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-400 text-black flex items-center justify-center font-black shadow-md shadow-yellow-500/20">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <span>Bakım Tanımı Düzenleme</span>
                    {editingId && (
                      <span className="text-[10px] font-mono bg-yellow-400/20 text-yellow-300 px-2 py-0.5 rounded border border-yellow-400/40">
                        {editingId}
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Tüm bilgileri, fotoğrafı düzenleyebilir, doğrudan kaydedebilir veya silebilirsiniz.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {/* 1. Görsel Yönetim Kartı (Eski Resmi Sil, Kameradan Çek, Dosyadan Seç) */}
              <div className="p-4 bg-[#1b263b] rounded-2xl border border-yellow-500/30 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase text-yellow-300 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-yellow-400" />
                    <span>Referans Teknik Şema Görseli</span>
                  </span>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                      refImageBase64 || existingImageUrl
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {refImageBase64 || existingImageUrl
                      ? (isNewImageSelected ? 'Yeni Görsel Hazır ✔' : 'Mevcut Görsel ✔')
                      : 'Görsel Yok (Silindi)'}
                  </span>
                </div>

                {/* Önizleme Alanı */}
                {(refImageBase64 || existingImageUrl) ? (
                  <div className="flex items-center gap-3 bg-[#0f172a] p-3 rounded-xl border border-slate-800">
                    <img
                      src={
                        refImageBase64
                          ? refImageBase64
                          : extractDriveFileId(existingImageUrl)
                          ? `/api/drive-image/${extractDriveFileId(existingImageUrl)}`
                          : existingImageUrl
                      }
                      alt="Referans Şema"
                      className="w-20 h-16 object-cover rounded-lg border border-yellow-400/50 shadow-sm shrink-0 bg-black/40"
                      onError={(e) => {
                        const fId = extractDriveFileId(existingImageUrl);
                        if (fId && !e.currentTarget.src.includes('thumbnail')) {
                          e.currentTarget.src = `https://drive.google.com/thumbnail?id=${fId}&sz=w1000`;
                        }
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">
                        {refImageName || (isNewImageSelected ? 'Yeni Yüklenen Resim' : 'Kayıtlı Teknik Şema')}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {isNewImageSelected ? 'Kaydet düğmesine basıldığında güncellenecektir' : 'Mevcut referans görseli korunuyor'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-dashed border-slate-700 text-center text-xs text-slate-400">
                    <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                    <span>Referans görsel silindi. Aşağıdaki düğmelerden yeni bir fotoğraf çekebilir veya seçebilirsiniz.</span>
                  </div>
                )}

                {/* Gizli Inputlar */}
                <input
                  ref={editModalCameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const { base64, name } = await processImageFile(file);
                      setRefImageBase64(base64);
                      setRefImageName(name);
                      setIsNewImageSelected(true);
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                />
                <input
                  ref={editModalFileRef}
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const { base64, name } = await processImageFile(file);
                      setRefImageBase64(base64);
                      setRefImageName(name);
                      setIsNewImageSelected(true);
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                />

                {/* Resim Aksiyon Butonları: Modal üzerinden veya hızlı butonlarla */}
                <div className="space-y-2 pt-1">
                  {/* Ana Modal Butonu (Kullanıcı İsteği: "modal resmim yüklem veya değiştirme modal ekrandan olasun arka planda düzenlem modu halen çalışsın") */}
                  <button
                    type="button"
                    onClick={handleOpenImageModal}
                    className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 border bg-yellow-400 hover:bg-yellow-300 text-black border-yellow-300 shadow-md cursor-pointer active:scale-95 transition-all"
                  >
                    <ImageIcon className="w-4 h-4 text-black shrink-0" />
                    <span>Görseli Modal Ekrandan Yönet / Değiştir / Yükle / Sil</span>
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Hızlı Sil (DÜZENLEME EKRANINDAN ÇIKMAZ!) */}
                    <button
                      type="button"
                      onClick={() => {
                        setRefImageBase64(null);
                        setExistingImageUrl('');
                        setRefImageName('');
                        setIsNewImageSelected(true);
                        setStatusMessage({
                          type: 'success',
                          text: 'Teknik şema görseli kaldırıldı. Düzenleme modunuz devam ediyor; kaydettiğinizde E-Tablo güncellenecektir.',
                        });
                      }}
                      disabled={!refImageBase64 && !existingImageUrl}
                      className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                        !refImageBase64 && !existingImageUrl
                          ? 'bg-slate-800 text-slate-500 border-slate-700 opacity-50 cursor-not-allowed'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30 cursor-pointer active:scale-95'
                      }`}
                      title="Görseli siler ancak düzenleme ekranını kapatmaz"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Görseli Sil</span>
                    </button>

                    {/* AI Görsel Analiz (resmi analiz et) */}
                    <button
                      type="button"
                      onClick={() => {
                        handleOpenImageModal();
                        handleAnalyzeImage();
                      }}
                      disabled={!refImageBase64 && !existingImageUrl}
                      className="py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30 cursor-pointer active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Bot className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Resmi Analiz Et</span>
                    </button>

                    {/* Kameradan Hızlı Çek */}
                    <button
                      type="button"
                      onClick={() => editModalCameraRef.current?.click()}
                      className="py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border bg-[#141d2d] hover:bg-slate-700 text-yellow-300 border-yellow-400/40 cursor-pointer active:scale-95 transition-all"
                    >
                      <Camera className="w-3.5 h-3.5 text-yellow-400" />
                      <span>Kameradan Çek</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Bakım Form Alanları */}
              <div className="space-y-3.5">
                {/* Makine Seçimi */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Makine *
                  </label>
                  <select
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#1b263b] border border-slate-700 focus:border-yellow-400 text-white rounded-xl text-xs sm:text-sm font-medium"
                  >
                    <option value="">-- Makine Seçin --</option>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.machineName} ({m.costCenter || m.id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Birim Seçimi */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Bakımı Yapacak Birim *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {DEPARTMENTS.map((d) => {
                      const isSelected = system === d.kod;
                      return (
                        <button
                          key={d.kod}
                          type="button"
                          onClick={() => setSystem(d.kod)}
                          className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all ${
                            isSelected
                              ? 'bg-yellow-400 text-black border-yellow-300 shadow-md shadow-yellow-500/20'
                              : 'bg-[#1b263b] text-slate-300 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          {d.ad}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                      Bölge (Ünite)
                    </label>
                    <input
                      type="text"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="Örn: Besleme Ünitesi"
                      className="w-full px-3 py-2 bg-[#1b263b] border border-slate-700 focus:border-yellow-400 text-white rounded-xl text-xs sm:text-sm font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                      Parça / Ekipman
                    </label>
                    <input
                      type="text"
                      value={part}
                      onChange={(e) => setPart(e.target.value)}
                      placeholder="Örn: Rulman, Valf"
                      className="w-full px-3 py-2 bg-[#1b263b] border border-slate-700 focus:border-yellow-400 text-white rounded-xl text-xs sm:text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Yapılacak Bakım Görevi */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Yapılacak Bakım Görevi *
                  </label>
                  <textarea
                    rows={2}
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    placeholder="Bakım talimatını giriniz..."
                    className="w-full px-3.5 py-2 bg-[#1b263b] border border-slate-700 focus:border-yellow-400 text-white rounded-xl text-xs sm:text-sm font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                      İstenen Değer / Tolerans
                    </label>
                    <input
                      type="text"
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      placeholder="Örn: 210 bar ± 5 bar"
                      className="w-full px-3 py-2 bg-[#1b263b] border border-slate-700 focus:border-yellow-400 text-white rounded-xl text-xs sm:text-sm font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                      Sıra No
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={orderNo}
                      onChange={(e) => setOrderNo(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#1b263b] border border-slate-700 focus:border-yellow-400 text-white rounded-xl text-xs sm:text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Seçenekler (Fotoğraf Zorunlu & Aktif) */}
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={photoRequired}
                      onChange={(e) => setPhotoRequired(e.target.checked)}
                      className="w-4 h-4 rounded text-yellow-400 focus:ring-yellow-400 border-slate-700"
                    />
                    <span>Operatör Bakım Fotoğrafı Çekmek Zorunda</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="w-4 h-4 rounded text-yellow-400 focus:ring-yellow-400 border-slate-700"
                    />
                    <span>Madde Aktif</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer: SİL & KAYDET & VAZGEÇ Düğmeleri */}
            <div className="p-4 sm:p-5 bg-[#1b263b] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              {/* Bakım Tanımını Tamamen Sil */}
              <button
                type="button"
                onClick={async () => {
                  if (editingId) {
                    await handleDelete(editingId, task || 'Bu bakım tanımı');
                    setEditModalOpen(false);
                    handleCancelEdit();
                  }
                }}
                disabled={saveLoading}
                className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Bu Bakımı Tamamen Sil</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saveLoading}
                  className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer transition-colors"
                >
                  Vazgeç
                </button>

                {/* Modal İçinden Doğrudan Kaydet */}
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await executeSaveTemplate();
                    if (ok) {
                      setEditModalOpen(false);
                    }
                  }}
                  disabled={saveLoading}
                  className="py-2.5 px-6 rounded-xl text-xs sm:text-sm font-black bg-yellow-400 hover:bg-yellow-300 text-black shadow-lg shadow-yellow-500/20 cursor-pointer active:scale-95 transition-all flex items-center gap-2"
                >
                  {saveLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-black shrink-0" />
                      <span>Modal'dan Direkt Kaydet</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          GOOGLE APPS SCRIPT (Code.gs) GÜNCELLEME MODALI
          Kullanıcı E-Tablo tarafındaki kodları güncelleyebilsin ve sütun mantığını
          (L: 12, P: 16, Q: 17, R: 18, F: 6) tek tıkla kopyalayıp güncelleyebilsin.
         ========================================================================= */}
      {scriptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="bg-[#141d2d] border border-yellow-500/40 rounded-2xl sm:rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-[#1b263b] border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-400 text-black flex items-center justify-center font-black shadow-md shadow-yellow-500/20">
                  <FileCode className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <span>Google Apps Script Kodu (Code.gs V5.5.4)</span>
                    <span className="text-[10px] font-mono bg-yellow-400/20 text-yellow-300 px-2 py-0.5 rounded border border-yellow-400/40">
                      Görsel ve Düzenleme Sütunları Güncel
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Google E-Tablonuzdaki L (12), P (16), Q (17) ve R (18) sütunlarını eksiksiz yöneten güncel kod
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setScriptModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {/* Açıklama Kutusu */}
              <div className="p-4 rounded-xl bg-yellow-950/30 border border-yellow-500/30 text-xs text-yellow-300 space-y-2">
                <div className="font-black text-sm flex items-center gap-2 text-yellow-400">
                  <Sparkles className="w-4 h-4" />
                  <span>Google E-Tablo Görsel Sütun Eşleşmesi:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-300 font-medium text-xs">
                  <li><b className="text-yellow-400">L Sütunu (12):</b> <code className="text-yellow-300 font-mono">ReferenceImage</code></li>
                  <li><b className="text-yellow-400">P Sütunu (16):</b> <code className="text-yellow-300 font-mono">ReferenceImageUrl</code> (Drive küçük resim bağlantısı)</li>
                  <li><b className="text-yellow-400">Q Sütunu (17):</b> <code className="text-yellow-300 font-mono">ReferenceImageName</code> (Dosya adı)</li>
                  <li><b className="text-yellow-400">R Sütunu (18):</b> <code className="text-yellow-300 font-mono">ReferenceImageDriveId</code> (Drive dosya ID)</li>
                  <li><b className="text-yellow-400">F Sütunu (6):</b> <code className="text-yellow-300 font-mono">YAPILACAK İŞ RESMİ</code> (Varsa bkm-sb sayfası için)</li>
                </ul>
                <p className="text-[11px] text-slate-400 pt-1">
                  <b>Kurulum:</b> Google E-Tablonuzda <b>Uzantılar &gt; Apps Script</b> bölümünü açın, mevcut kodun tamamını silip aşağıdaki kodu yapıştırın ve <b>Dağıt &gt; Yeni Dağıtım &gt; Web Uygulaması &gt; Erişim: Herkes</b> olarak kaydedin.
                </p>
              </div>

              {/* Kod Görüntüleme & Kopyalama */}
              <div className="relative">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase font-mono">Code.gs (Tam Kaynak)</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(CODE_GS_SOURCE);
                      setScriptCopied(true);
                      setTimeout(() => setScriptCopied(false), 3000);
                    }}
                    className="py-1.5 px-3 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
                  >
                    {scriptCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-black" />
                        <span>Kopyalandı!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-black" />
                        <span>Kodu Kopyala</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 bg-[#0a0f1d] border border-slate-800 rounded-xl text-[11px] font-mono text-slate-300 overflow-x-auto max-h-72 leading-relaxed select-all">
                  {CODE_GS_SOURCE}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#1b263b] border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setScriptModalOpen(false)}
                className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer transition-colors"
              >
                Kapat
              </button>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(CODE_GS_SOURCE);
                  setScriptCopied(true);
                  setTimeout(() => setScriptCopied(false), 3000);
                }}
                className="py-2.5 px-6 rounded-xl text-xs sm:text-sm font-black bg-yellow-400 hover:bg-yellow-300 text-black shadow-lg shadow-yellow-500/20 cursor-pointer active:scale-95 transition-all flex items-center gap-2"
              >
                {scriptCopied ? (
                  <>
                    <Check className="w-4 h-4 text-black" />
                    <span>Panoya Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-black" />
                    <span>Tüm Kodu Kopyala</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
