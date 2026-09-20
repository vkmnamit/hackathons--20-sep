import React, { useState } from 'react';
import { Sidebar, type Page } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { LandingPage } from '@/pages/LandingPage';
import { Dashboard } from '@/pages/Dashboard';
import { OptimizationWorkspace } from '@/pages/OptimizationWorkspace';
import { MapExplorer } from '@/pages/MapExplorer';
import { DemandSimulation } from '@/pages/DemandSimulation';
import { AlgorithmComparison } from '@/pages/AlgorithmComparison';
import { SensitivityAnalysis } from '@/pages/SensitivityAnalysis';
import { ScenarioManager } from '@/pages/ScenarioManager';
import { DataImport } from '@/pages/DataImport';
import { Fulfillment } from '@/pages/Fulfillment';
import { Warehouses } from '@/pages/Warehouses';
import { OptimizationHistory } from '@/pages/OptimizationHistory';
import { Documentation } from '@/pages/Documentation';
import { Settings } from '@/pages/Settings';
import { Tenants } from '@/pages/Tenants';
import { Year } from '@/pages/Year';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function AppPage({ page, navigate }: { page: Page; navigate: (p: Page) => void }) {
  return <div key={page} className="page-enter min-h-full">
    {(() => {
      switch (page) {
        case 'dashboard':    return <Dashboard onNavigate={navigate} />;
        case 'workspace':    return <OptimizationWorkspace />;
        case 'fulfill':      return <Fulfillment />;
        case 'warehouses':   return <Warehouses />;
        case 'map':          return <MapExplorer />;
        case 'demand':       return <DemandSimulation />;
        case 'algorithms':   return <AlgorithmComparison />;
        case 'sensitivity':  return <SensitivityAnalysis />;
        case 'scenarios':    return <ScenarioManager />;
        case 'import':       return <DataImport />;
        case 'history':      return <OptimizationHistory />;
        case 'docs':         return <Documentation />;
        case 'settings':     return <Settings />;
        case 'tenants':      return <Tenants />;
        case 'year':         return <Year />;
        default:             return <Dashboard onNavigate={navigate} />;
      }
    })()}
  </div>;
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { loaded, loadBengaluru } = useStore();

  const navigate = (p: Page) => {
    setPage(p);
    setSidebarOpen(false);
  };

  if (page === 'landing') {
    return (
      <ErrorBoundary>
        <LandingPage onNavigate={navigate} />
      </ErrorBoundary>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#080b12]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop always visible, mobile slide-in */}
      <div className={cn(
        'fixed md:relative z-40 h-full transition-transform duration-200',
        'md:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}>
        <Sidebar
          current={page}
          onNavigate={navigate}
          onClose={() => setSidebarOpen(false)}
          mobile={sidebarOpen}
        />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <TopNav onMenuOpen={() => setSidebarOpen(true)} currentPage={page} onLogout={() => setPage('landing')} />
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <ErrorBoundary>
            <AppPage page={page} navigate={navigate} />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
