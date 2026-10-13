import React, { useState, useEffect } from 'react';
import { UserSession, Machine, MaintenanceTemplate, MaintenanceRecord } from './types/cmms';
import {
  getStoredUser,
  clearStoredUser,
  cmmsApi,
  getWeekKey,
  normalizeWeekKey,
  getCachedMachines,
  getCachedTemplates,
  getCachedRecords,
} from './services/cmmsApi';
import { Header } from './components/Header';
import { LoginView } from './views/LoginView';
import { HomeView } from './views/HomeView';
import { OperatorView } from './views/OperatorView';
import { RedListView } from './views/RedListView';
import { ReportsView } from './views/ReportsView';
import { AdminView } from './views/AdminView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { Loader2, LogOut, AlertCircle, X } from 'lucide-react';

function filterMachinesWithTasks(rawMachines: Machine[], rawTemplates: MaintenanceTemplate[]): Machine[] {
  const activeTemplates = rawTemplates.filter((tmpl) => tmpl.active);
  const machineNamesWithTasks = new Set(
    activeTemplates.map((tmpl) => (tmpl.machineName || '').trim().toLowerCase()).filter(Boolean)
  );
  const machineIdsWithTasks = new Set(
    activeTemplates.map((tmpl) => (tmpl.machineId || '').trim().toLowerCase()).filter(Boolean)
  );

  const withTasks = rawMachines.filter((machine) => {
    const nameMatch = machine.machineName && machineNamesWithTasks.has(machine.machineName.trim().toLowerCase());
    const idMatch = machine.id && machineIdsWithTasks.has(machine.id.trim().toLowerCase());
    const codeMatch = (machine.code || machine.machineCode) && (
      machineIdsWithTasks.has((machine.code || '').trim().toLowerCase()) ||
      machineIdsWithTasks.has((machine.machineCode || '').trim().toLowerCase())
    );
    return nameMatch || idMatch || codeMatch;
  });

  // Şablonda tanımlı olup makine listesinde adı geçen makineleri de dahil et
  for (const tmpl of activeTemplates) {
    if (!tmpl.machineName) continue;
    const tmplName = tmpl.machineName.trim().toLowerCase();
    const exists = withTasks.some(
      (m) => (m.machineName || '').trim().toLowerCase() === tmplName
    );
    if (!exists) {
      withTasks.push({
        id: tmpl.machineId || tmpl.machineName,
        machineName: tmpl.machineName,
        machineCode: tmpl.machineId || '',
        code: tmpl.machineId || '',
      });
    }
  }

  return withTasks;
}

export default function App() {
  const [user, setUser] = useState<UserSession | null>(getStoredUser);
  const [currentScreen, setCurrentScreen] = useState<
    'home' | 'operator' | 'redList' | 'reports' | 'admin'
  >('home');

  // Instant SWR state: Initialize immediately from local cache so app opens in 0ms
  const initialCachedMachines = getCachedMachines();
  const initialCachedTemplates = getCachedTemplates();
  const initialCachedRecords = getCachedRecords();
  const hasCachedData = initialCachedMachines.length > 0 && initialCachedTemplates.length > 0;

  const [machines, setMachines] = useState<Machine[]>(() =>
    hasCachedData ? filterMachinesWithTasks(initialCachedMachines, initialCachedTemplates) : []
  );
  const [allMachines, setAllMachines] = useState<Machine[]>(initialCachedMachines);
  const [templates, setTemplates] = useState<MaintenanceTemplate[]>(initialCachedTemplates);
  const [records, setRecords] = useState<MaintenanceRecord[]>(initialCachedRecords);
  const [loading, setLoading] = useState(!hasCachedData);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Clear legacy mock data once to ensure only real Google Sheet data is present
  useEffect(() => {
    localStorage.removeItem('cmmsRecords_V5442');
    localStorage.removeItem('cmmsTemplates_V5442');
    localStorage.removeItem('cmmsMachines_V5442');
  }, []);

  // Fetch live data directly from Google Spreadsheet
  const loadData = async (showSyncSpinner: boolean = false) => {
    if (showSyncSpinner) setSyncing(true);
    try {
      const [rawMachines, rawTemplates, rawRecords] = await Promise.all([
        cmmsApi.getMachines(),
        cmmsApi.getTemplates(showSyncSpinner),
        cmmsApi.getRecords(),
      ]);

      setAllMachines(rawMachines);
      setTemplates(rawTemplates);
      setRecords(rawRecords);

      const withTasks = filterMachinesWithTasks(rawMachines, rawTemplates);
      setMachines(withTasks);
      setLastSyncTime(new Date().toLocaleTimeString('tr-TR'));
    } catch (err) {
      console.error('Failed to load Google Sheet data:', err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    const existing = getStoredUser();
    if (existing) {
      setUser(existing);
    }
    loadData();
  }, []);

  const handleLoginSuccess = (loggedInUser: UserSession) => {
    setUser(loggedInUser);
    setCurrentScreen('home');
    loadData(true);
  };

  // Safe In-App Logout (never depends on window.confirm)
  const handleRequestLogout = () => {
    setShowLogoutConfirm(true);
  };

  const handleConfirmLogout = () => {
    clearStoredUser();
    setUser(null);
    setCurrentScreen('home');
    setShowLogoutConfirm(false);
  };

  const handleManualSync = () => {
    loadData(true);
  };

  // Calculate current week's RED count for badge
  const thisWeek = getWeekKey();
  const redCount = records.filter(
    (r) => normalizeWeekKey(r.weekKey, r.createdAt) === thisWeek && r.result === 'RED'
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#131d2e] flex items-center justify-center p-4">
        <div className="text-center space-y-3 bg-[#1b263b] p-8 rounded-3xl shadow-2xl border border-yellow-500/30 max-w-sm w-full">
          <Loader2 className="w-10 h-10 animate-spin text-yellow-400 mx-auto" />
          <div className="text-base font-black text-white">
            Google E-Tabloya Bağlanılıyor...
          </div>
          <div className="text-xs text-slate-400 font-medium">
            Makineler, kontrol tanımları ve arıza kayıtları senkronize ediliyor.
          </div>
        </div>
      </div>
    );
  }

  const [operatorInitialMachine, setOperatorInitialMachine] = useState<Machine | null>(null);
  const [operatorInitialTemplateId, setOperatorInitialTemplateId] = useState<string | null>(null);

  const handleSelectMachineFromHome = (m: Machine, templateId?: string) => {
    setOperatorInitialMachine(m);
    setOperatorInitialTemplateId(templateId || null);
    setCurrentScreen('operator');
  };

  // Not logged in: Show Login Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-[#131d2e]">
        <LoginView onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  // Logged in: Render Full Application with Responsive Header
  return (
    <div className="min-h-screen bg-[#131d2e] text-slate-100 flex flex-col font-sans">
      <Header
        currentScreen={currentScreen}
        onNavigate={(screen) => {
          if (screen === 'operator') {
            setOperatorInitialMachine(null);
            setOperatorInitialTemplateId(null);
          }
          setCurrentScreen(screen);
        }}
        user={user}
        redCount={redCount}
        onRequestLogout={handleRequestLogout}
        onSync={handleManualSync}
        syncing={syncing}
        lastSyncTime={lastSyncTime}
        machinesCount={machines.length}
        recordsCount={records.length}
      />

      <main className="flex-1 pb-12">
        {currentScreen === 'home' && (
          <HomeView
            user={user}
            machines={machines}
            templates={templates}
            records={records}
            onNavigate={setCurrentScreen}
            onSelectMachine={handleSelectMachineFromHome}
          />
        )}

        {currentScreen === 'operator' && (
          <OperatorView
            user={user}
            machines={machines}
            templates={templates}
            records={records}
            initialMachine={operatorInitialMachine}
            initialTemplateId={operatorInitialTemplateId}
            onRecordSaved={() => loadData(true)}
            onNavigateHome={() => {
              setOperatorInitialMachine(null);
              setOperatorInitialTemplateId(null);
              setCurrentScreen('home');
            }}
          />
        )}

        {currentScreen === 'redList' && (
          <RedListView
            records={records}
            machines={machines}
            onRecordUpdated={() => loadData(true)}
            onNavigateHome={() => setCurrentScreen('home')}
          />
        )}

        {currentScreen === 'reports' && (
          <ReportsView
            user={user}
            records={records}
            machines={machines}
            templates={templates}
            onNavigateHome={() => setCurrentScreen('home')}
          />
        )}

        {currentScreen === 'admin' && (
          <AdminView
            machines={allMachines.length > 0 ? allMachines : machines}
            templates={templates}
            onTemplatesUpdated={() => loadData(true)}
            onNavigateHome={() => setCurrentScreen('home')}
          />
        )}
      </main>

      {/* Corporate Footer with live E-Tablo status */}
      <footer className="bg-[#101726] border-t border-yellow-500/20 py-2.5 sm:py-3 px-3 sm:px-4 text-center text-[11px] sm:text-xs text-slate-400 font-medium print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block shrink-0" />
            <span className="font-bold text-yellow-400">Google E-Tablo Aktif</span>
            <span>•</span>
            <span className="text-slate-300">{machines.length} Bakımlı Makine</span>
            <span>•</span>
            <span className="text-slate-300">{records.length} Kayıt</span>
            {lastSyncTime && <span className="hidden xs:inline">({lastSyncTime})</span>}
          </div>
          <span className="text-[10px] sm:text-xs text-slate-500">AKG CMMS • V5.5.0 Sarı-Siyah</span>
        </div>
      </footer>

      {/* IN-APP LOGOUT CONFIRMATION MODAL (Does not depend on window.confirm) */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#1b263b] rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl border border-yellow-500/30 space-y-4 animate-in zoom-in-95">
            <div className="w-14 h-14 bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded-full flex items-center justify-center mx-auto">
              <LogOut className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-black text-white mb-1">
                Sistemden Çıkış Yapılsın mı?
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Aktif oturumunuz sonlandırılacak ve şifre giriş ekranına yönlendirileceksiniz.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="flex-1 py-3 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl text-sm shadow-md transition-colors cursor-pointer"
              >
                Çıkış Yap
              </button>

              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="py-3 px-5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PWA Offline Connectivity Indicator */}
      <OfflineIndicator />
    </div>
  );
}
