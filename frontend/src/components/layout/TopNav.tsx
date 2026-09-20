import { useState } from 'react';
import { Search, Bell, ChevronDown, Menu, Zap, Sun, Moon, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Page } from './Sidebar';
import { useStore } from '@/lib/store';

export function TopNav({ onMenuOpen, currentPage, onLogout }: {
  onMenuOpen: () => void;
  currentPage: Page;
  onLogout: () => void;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const { companyName, logout, theme, toggleTheme } = useStore();
  const initial = (companyName || 'Account').trim().charAt(0).toUpperCase();

  const pageLabels: Partial<Record<Page, string>> = {
    dashboard: 'Overview',
    workspace: 'Optimization Workspace',
    fulfill: 'Order Fulfillment',
    map: 'Map Explorer',
    demand: 'Demand Simulation',
    algorithms: 'Algorithm Comparison',
    sensitivity: 'Sensitivity Analysis',
    scenarios: 'Scenarios',
    import: 'Data Import',
    history: 'Optimization History',
    docs: 'Documentation',
    settings: 'Settings',
    tenants: 'Multi-Tenant Sharing',
    year: 'Year Simulation',
  };

  return (
    <header className="h-[4.5rem] border-b border-[#223044] bg-[#0a0f18]/75 backdrop-blur-xl flex items-center px-5 gap-4 flex-shrink-0">
      {/* Mobile menu */}
      <button onClick={onMenuOpen} className="md:hidden text-[#6b6b80] hover:text-white p-1">
        <Menu size={18} />
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-cyan-400/70 font-mono text-[10px] tracking-widest">WLO / 02</span>
        <span className="text-[#2a2a3a]">/</span>
        <span className="text-[#e4edf7] font-medium">{pageLabels[currentPage] ?? currentPage}</span>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden lg:block">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a3a50]" />
         <input
          type="text"
          placeholder="Search..."
           className="w-52 pl-8 pr-3 py-2 rounded-lg text-xs bg-[#101620] border border-[#223044] text-[#a0a0b0] placeholder-[#53647c] focus:border-cyan-400/50 focus:bg-[#142030]"
        />
      </div>

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#1a1a24] text-[#6b6b80] hover:text-[#c0c0d0] transition-colors"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-blue-500" />}
      </button>

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => setNotifOpen(!notifOpen)}
          className="relative w-8 h-8 flex items-center justify-center rounded hover:bg-[#1a1a24] text-[#6b6b80] hover:text-[#c0c0d0] transition-colors"
        >
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
        </button>
        {notifOpen && (
          <div className="absolute right-0 top-10 w-72 bg-[#111118] border border-[#1e1e2e] rounded-lg shadow-2xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e1e2e] text-xs font-medium text-[#a0a0b0]">Notifications</div>
            {[
              { icon: CheckCircle2, color: 'text-emerald-400', msg: 'MILP optimization completed', time: '2m ago' },
              { icon: Zap, color: 'text-blue-400', msg: 'New dataset NYC Metro v2 loaded', time: '1h ago' },
            ].map((n, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-[#1a1a24] cursor-pointer border-b border-[#1e1e2e]/50">
                <n.icon size={14} className={cn(n.color, 'mt-0.5 flex-shrink-0')} />
                <div>
                  <div className="text-xs text-[#c0c0d0]">{n.msg}</div>
                  <div className="text-[10px] text-[#4a4a60] mt-0.5">{n.time}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button onClick={() => setUserOpen(!userOpen)} className="flex items-center gap-2 pl-2 hover:bg-[#1a1a24] rounded px-2 py-1 transition-colors">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
            {initial}
          </div>
          <span className="hidden md:block max-w-28 truncate text-xs text-[#c0c0d0]">{companyName || 'Account'}</span>
          <ChevronDown size={12} className="text-[#3a3a50] hidden sm:block" />
        </button>
        {userOpen && (
          <div className="absolute right-0 top-10 w-48 rounded-lg border border-[#1e1e2e] bg-[#111118] p-1 shadow-2xl z-50">
            <div className="px-3 py-2 text-[10px] text-[#6b6b80] truncate">{companyName || 'Signed in account'}</div>
            <button onClick={() => { logout(); setUserOpen(false); onLogout(); }} className="w-full rounded px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/10">
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
