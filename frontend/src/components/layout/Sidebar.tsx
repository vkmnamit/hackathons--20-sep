import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Map, Boxes, TrendingUp, GitCompare, Sliders,
  Bookmark, Upload, History, BookOpen, Settings, ChevronRight,
  Warehouse, X, Users, Clock, Truck
} from 'lucide-react';

export type Page =
  | 'landing' | 'dashboard' | 'workspace' | 'fulfill' | 'map'
  | 'demand' | 'algorithms' | 'sensitivity' | 'scenarios'
  | 'import' | 'history' | 'docs' | 'settings'
  | 'tenants' | 'year' | 'warehouses';

const navItems: { id: Page; label: string; icon: React.ElementType; section?: string }[] = [
  { id: 'dashboard',   label: 'Overview',              icon: LayoutDashboard, section: 'Main' },
  { id: 'workspace',   label: 'Optimization',         icon: Boxes },
  { id: 'fulfill',     label: 'Fulfillment',          icon: Truck },
  { id: 'map',         label: 'Map Explorer',         icon: Map },
  { id: 'tenants',     label: 'Multi-Tenant Sharing', icon: Users },
  { id: 'year',        label: 'Year Simulation',      icon: Clock },
  { id: 'demand',      label: 'Demand Simulation',    icon: TrendingUp },
  { id: 'algorithms',  label: 'Algorithms',           icon: GitCompare },
  { id: 'sensitivity', label: 'Sensitivity',          icon: Sliders, section: 'Analysis' },
  { id: 'scenarios',   label: 'Scenarios',            icon: Bookmark },
  { id: 'import',      label: 'Data Import',          icon: Upload, section: 'Data' },
  { id: 'warehouses',  label: 'Warehouses',           icon: Warehouse },
  { id: 'history',     label: 'History',              icon: History },
  { id: 'docs',        label: 'Documentation',        icon: BookOpen, section: 'Help' },
  { id: 'settings',    label: 'Settings',             icon: Settings },
];

export function Sidebar({ current, onNavigate, onClose, mobile }: {
  current: Page;
  onNavigate: (p: Page) => void;
  onClose?: () => void;
  mobile?: boolean;
}) {
  return (
    <aside className={cn(
      'flex flex-col h-full bg-[#0c121b]/95 border-r border-[#223044] w-64 shadow-[18px_0_40px_rgba(0,0,0,0.18)]',
    )}>
      <div className="flex items-center justify-between px-5 h-[4.5rem] border-b border-[#223044] flex-shrink-0">
        <button
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Warehouse size={14} className="text-white" />
          </div>
           <div className="text-sm font-semibold text-white tracking-tight">Wherehouse<div className="text-[9px] font-mono font-normal text-cyan-400/70 tracking-[0.18em] uppercase">Network intelligence</div></div>
        </button>
        {mobile && (
          <button onClick={onClose} className="text-[#6b6b80] hover:text-white p-1">
            <X size={16} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navItems.map((item, i) => {
          const Icon = item.icon;
          const active = current === item.id;
          const prevItem = navItems[i - 1];
          const showSection = item.section && item.section !== prevItem?.section;
          return (
            <div key={item.id}>
              {showSection && (
                <div className="px-3 pt-4 pb-1 text-[10px] font-mono font-medium text-[#3a3a50] uppercase tracking-widest">
                  {item.section}
                </div>
              )}
              <button
                onClick={() => onNavigate(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group mb-0.5',
                  active
                    ? 'bg-gradient-to-r from-blue-500/15 to-cyan-400/5 text-blue-300 border border-blue-400/25 shadow-inner shadow-blue-500/5'
                    : 'text-[#76859c] hover:text-[#d8e2ef] hover:bg-[#182130]'
                )}
              >
                 <Icon size={16} className={cn(active ? 'text-cyan-300' : 'text-[#53647c] group-hover:text-[#8fa8c4]')} />
                <span className="truncate flex-1 text-left">{item.label}</span>
                {active && <ChevronRight size={12} className="text-blue-500/60" />}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-[#1e1e2e]">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded hover:bg-[#1a1a24] cursor-pointer transition-colors">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
            A
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-[#c0c0d0] truncate">Alex Chen</div>
            <div className="text-[10px] text-[#4a4a60] truncate">Pro Plan</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
