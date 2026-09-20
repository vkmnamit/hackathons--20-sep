import React, { useState, useRef } from 'react';
import { motion, useSpring, useTransform, useMotionValue } from 'framer-motion';
import {
  Boxes, Map, Truck, Users, Clock, TrendingUp, GitCompare,
  Sliders, Settings, Warehouse, ArrowRight, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DockItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string;
  onClick?: () => void;
  badge?: string;
}

export interface AnimatedTopDockProps {
  variant?: 'modern' | 'sable' | 'retro' | 'glass';
  proximity?: number;
  spring?: number;
  damping?: number;
  widthGrowth?: number;
  heightGrowth?: number;
  drop?: number;
  className?: string;
  onNavigate?: (id: string) => void;
  onSignIn?: () => void;
  onCreateAccount?: () => void;
}

const DEFAULT_ITEMS: DockItem[] = [
  { id: 'workspace', label: 'Optimize', icon: Boxes },
  { id: 'fulfill', label: 'Fulfillment', icon: Truck },
  { id: 'map', label: 'Map Explorer', icon: Map },
  { id: 'year', label: 'Year Sim', icon: Clock },
  { id: 'demand', label: 'Demand', icon: TrendingUp },
  { id: 'algorithms', label: 'Algorithms', icon: GitCompare },
  { id: 'sensitivity', label: 'Sensitivity', icon: Sliders },
];

function DockIcon({
  item,
  mouseX,
  proximity,
  springVal,
  dampingVal,
  widthGrowth,
  heightGrowth,
  onClick,
}: {
  item: DockItem;
  mouseX: any;
  proximity: number;
  springVal: number;
  dampingVal: number;
  widthGrowth: number;
  heightGrowth: number;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const distance = useTransform(mouseX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthSync = useTransform(
    distance,
    [-proximity, 0, proximity],
    [38, 38 + widthGrowth, 38]
  );
  const width = useSpring(widthSync, {
    mass: 0.1,
    stiffness: springVal * 1000,
    damping: dampingVal * 50,
  });

  const heightSync = useTransform(
    distance,
    [-proximity, 0, proximity],
    [38, 38 + heightGrowth, 38]
  );
  const height = useSpring(heightSync, {
    mass: 0.1,
    stiffness: springVal * 1000,
    damping: dampingVal * 50,
  });

  const Icon = item.icon;

  return (
    <motion.div
      ref={ref}
      style={{ width, height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      className={cn(
        'relative flex items-center justify-center rounded-xl cursor-pointer select-none',
        'bg-[#101824]/80 hover:bg-[#182638] border border-[#22354c]/60 hover:border-cyan-400/50',
        'backdrop-blur-md transition-colors duration-150',
        'shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:shadow-[0_0_15px_rgba(34,211,238,0.25)]'
      )}
    >
      <Icon size={16} className="text-[#a0c0e0] group-hover:text-cyan-300 transition-colors" />

      {/* Floating tooltip */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: -8 }}
          exit={{ opacity: 0, y: -4 }}
          className="absolute -bottom-8 px-2 py-0.5 rounded-md bg-[#0a121e]/95 border border-cyan-400/30 text-[10px] font-mono text-cyan-200 whitespace-nowrap pointer-events-none z-50 shadow-lg"
        >
          {item.label}
        </motion.div>
      )}

      {item.badge && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
      )}
    </motion.div>
  );
}

export function AnimatedTopDock({
  variant = 'modern',
  proximity = 122,
  spring = 0.19,
  damping = 0.7,
  widthGrowth = 17,
  heightGrowth = 16,
  drop = 3.5,
  className,
  onNavigate,
  onSignIn,
  onCreateAccount,
}: AnimatedTopDockProps) {
  const mouseX = useMotionValue(Infinity);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full px-4 md:px-8 py-3',
        'border-b border-[#22354c]/40 bg-[#080d16]/80 backdrop-blur-xl',
        className
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Wordmark */}
        <div
          onClick={() => onNavigate?.('landing')}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-400/40 transition-shadow">
            <Warehouse size={15} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white tracking-tight leading-none group-hover:text-cyan-200 transition-colors">
              Wherehouse
            </span>
            <span className="text-[9px] font-mono text-cyan-400/70 tracking-widest uppercase mt-0.5">
              Vector Intelligence
            </span>
          </div>
        </div>

        {/* Center: Proximity Dock */}
        <div
          onMouseMove={(e) => mouseX.set(e.pageX)}
          onMouseLeave={() => mouseX.set(Infinity)}
          className={cn(
            'hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl',
            'bg-[#0b1320]/70 border border-[#1e3048]/80 backdrop-blur-md',
            'shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_8px_32px_rgba(0,0,0,0.37)]'
          )}
        >
          {DEFAULT_ITEMS.map((item) => (
            <DockIcon
              key={item.id}
              item={item}
              mouseX={mouseX}
              proximity={proximity}
              springVal={spring}
              dampingVal={damping}
              widthGrowth={widthGrowth}
              heightGrowth={heightGrowth}
              onClick={() => onNavigate?.(item.id)}
            />
          ))}
        </div>

        {/* Right: Sign-in & Call to Action */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onSignIn}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[#a0c0e0] hover:text-white hover:bg-[#142032] border border-transparent hover:border-[#22354c] transition-all"
          >
            Sign in
          </button>
          <button
            onClick={onCreateAccount || (() => onNavigate?.('dashboard'))}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white',
              'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500',
              'shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/40 transition-all cursor-pointer'
            )}
          >
            <span>Launch App</span>
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </header>
  );
}
