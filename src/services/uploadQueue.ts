import { cmmsApi } from './cmmsApi';
import { MaintenanceRecord } from '../types/cmms';

export interface QueuedRecord {
  id: string;
  machineId: string;
  machineName: string;
  templateId: string;
  task: string;
  measuredValue?: string;
  result: 'UYGUN' | 'RED';
  description?: string;
  operator: string;
  operatorRole?: string;
  proofImageUrl?: string;
  photoDataUrl?: string;
  timestamp: number;
  status: 'pending' | 'uploading' | 'failed' | 'completed';
  error?: string;
  retries: number;
}

const STORAGE_KEY = 'cmms_upload_queue_v1';
type QueueListener = (queue: QueuedRecord[]) => void;

class UploadQueueService {
  private queue: QueuedRecord[] = [];
  private listeners: Set<QueueListener> = new Set();
  private processing: boolean = false;
  private onRecordUploadedCallback?: (record: MaintenanceRecord) => void;

  constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.processQueue();
      });
    }
  }

  public setOnRecordUploaded(cb: (record: MaintenanceRecord) => void) {
    this.onRecordUploadedCallback = cb;
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // If any were marked as 'uploading' when page reloaded, reset to 'pending'
          this.queue = parsed.map((item) => ({
            ...item,
            status: item.status === 'uploading' ? 'pending' : item.status,
          }));
        }
      }
    } catch (e) {
      console.warn('Failed to load upload queue from localStorage', e);
      this.queue = [];
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.warn('Failed to persist upload queue (storage quota?)', e);
    }
    this.notify();
  }

  public getQueue(): QueuedRecord[] {
    return [...this.queue];
  }

  public getPendingCount(): number {
    return this.queue.filter((q) => q.status !== 'completed').length;
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getQueue());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const current = this.getQueue();
    this.listeners.forEach((fn) => {
      try {
        fn(current);
      } catch (err) {
        console.error(err);
      }
    });
  }

  /**
   * Enqueue a new maintenance record. Immediately returns created item and triggers background sync.
   */
  public enqueue(
    data: Omit<QueuedRecord, 'id' | 'timestamp' | 'status' | 'retries' | 'error'>
  ): QueuedRecord {
    const item: QueuedRecord = {
      ...data,
      id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      status: 'pending',
      retries: 0,
    };

    // Keep proof photo in fast cache as well
    if (item.proofImageUrl) {
      try {
        localStorage.setItem(`proofImg_${item.id}`, item.proofImageUrl);
        localStorage.setItem(`proofImg_${item.machineId}_${item.templateId}`, item.proofImageUrl);
        localStorage.setItem(`proofImg_${item.templateId}`, item.proofImageUrl);
      } catch {}
    }

    this.queue.push(item);
    this.saveToStorage();

    // Trigger asynchronous background processing
    setTimeout(() => {
      this.processQueue();
    }, 50);

    return item;
  }

  /**
   * Removes an item from the queue
   */
  public removeItem(id: string) {
    this.queue = this.queue.filter((q) => q.id !== id);
    this.saveToStorage();
  }

  /**
   * Force retry all pending/failed items
   */
  public async retryAll() {
    this.queue = this.queue.map((q) => ({
      ...q,
      status: 'pending',
      error: undefined,
    }));
    this.saveToStorage();
    await this.processQueue();
  }

  /**
   * Sequentially process pending queue items in the background
   */
  public async processQueue() {
    if (this.processing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    const nextItem = this.queue.find((q) => q.status === 'pending');
    if (!nextItem) return;

    this.processing = true;
    nextItem.status = 'uploading';
    this.saveToStorage();

    try {
      const res = await cmmsApi.saveRecord({
        machineId: nextItem.machineId,
        machineName: nextItem.machineName,
        templateId: nextItem.templateId,
        task: nextItem.task,
        measuredValue: nextItem.measuredValue,
        result: nextItem.result,
        description: nextItem.description,
        operator: nextItem.operator,
        operatorRole: nextItem.operatorRole,
        proofImageUrl: nextItem.proofImageUrl,
        photoDataUrl: nextItem.photoDataUrl || nextItem.proofImageUrl,
      } as any);

      if (res && res.success) {
        // Record successfully uploaded to Google Sheets and Drive
        const recordId = res.recordId || nextItem.id;
        if (nextItem.proofImageUrl) {
          try {
            localStorage.setItem(`proofImg_${recordId}`, nextItem.proofImageUrl);
          } catch {}
        }

        // Notify callback if available
        if (this.onRecordUploadedCallback) {
          this.onRecordUploadedCallback({
            recordId,
            machineId: nextItem.machineId,
            machineName: nextItem.machineName,
            templateId: nextItem.templateId,
            task: nextItem.task,
            measuredValue: nextItem.measuredValue,
            result: nextItem.result,
            description: nextItem.description,
            operator: nextItem.operator,
            operatorRole: nextItem.operatorRole,
            proofImageUrl: nextItem.proofImageUrl,
            weekKey: '', // will be filled by caller
            createdAt: new Date(nextItem.timestamp).toISOString(),
            date: new Date(nextItem.timestamp).toLocaleDateString('tr-TR'),
            time: new Date(nextItem.timestamp).toLocaleTimeString('tr-TR'),
          });
        }

        // Remove from queue upon success
        this.queue = this.queue.filter((q) => q.id !== nextItem.id);
        this.saveToStorage();
      } else {
        throw new Error(res?.message || 'Sunucu hatası');
      }
    } catch (err: any) {
      console.warn('Queue upload error for item', nextItem.id, err);
      nextItem.status = 'failed';
      nextItem.retries = (nextItem.retries || 0) + 1;
      nextItem.error = err?.message || 'Bağlantı hatası';
      this.saveToStorage();
    } finally {
      this.processing = false;
      // If there are more pending items, schedule next
      const remainingPending = this.queue.some((q) => q.status === 'pending');
      if (remainingPending) {
        setTimeout(() => this.processQueue(), 300);
      }
    }
  }
}

export const uploadQueueService = new UploadQueueService();
