import { useState, useEffect, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AnimatedTopDock } from '@/components/AnimatedTopDock';
import {
  Warehouse, ArrowRight, Map, GitCompare, Sliders,
  TrendingUp, Zap, Shield, ChevronRight, Star, X
} from 'lucide-react';
import type { Page } from '@/components/layout/Sidebar';
import { useStore } from '@/lib/store';

// Animated SVG network visualization
function NetworkViz() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const nodes = [
    { x: 400, y: 220, r: 20, type: 'warehouse', label: 'Hub A' },
    { x: 200, y: 300, r: 20, type: 'warehouse', label: 'Hub B' },
    { x: 620, y: 180, r: 20, type: 'warehouse', label: 'Hub C' },
    { x: 140, y: 160, r: 10, type: 'neighborhood', demand: 840 },
    { x: 310, y: 120, r: 10, type: 'neighborhood', demand: 1200 },
    { x: 500, y: 90,  r: 10, type: 'neighborhood', demand: 560 },
    { x: 680, y: 280, r: 10, type: 'neighborhood', demand: 980 },
    { x: 560, y: 340, r: 10, type: 'neighborhood', demand: 730 },
    { x: 260, y: 400, r: 10, type: 'neighborhood', demand: 1100 },
    { x: 120, y: 380, r: 10, type: 'neighborhood', demand: 450 },
    { x: 720, y: 140, r: 10, type: 'neighborhood', demand: 620 },
    { x: 440, y: 380, r: 10, type: 'neighborhood', demand: 890 },
  ];

  const edges = [
    { from: 0, to: 3, active: tick % 3 !== 0 },
    { from: 0, to: 4, active: true },
    { from: 0, to: 7, active: tick % 2 === 0 },
    { from: 0, to: 11, active: true },
    { from: 1, to: 6, active: true },
    { from: 1, to: 9, active: tick % 3 !== 1 },
    { from: 1, to: 5, active: tick % 2 !== 0 },
    { from: 2, to: 7, active: true },
    { from: 2, to: 8, active: tick % 3 !== 2 },
    { from: 2, to: 10, active: true },
  ];

  return (
    <svg viewBox="0 0 840 480" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      {/* Grid */}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 60} x2="840" y2={i * 60}
          stroke="#1e1e2e" strokeWidth="1" />
      ))}
      {Array.from({ length: 15 }, (_, i) => (
        <line key={`v${i}`} x1={i * 60} y1="0" x2={i * 60} y2="480"
          stroke="#1e1e2e" strokeWidth="1" />
      ))}

      {/* Service radius */}
      {nodes.filter(n => n.type === 'warehouse').map((n, i) => (
        <circle key={`r${i}`} cx={n.x} cy={n.y} r={130}
          fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 6" opacity="0.15" />
      ))}

      {/* Edges */}
      {edges.map((e, i) => {
        const from = nodes[e.from];
        const to = nodes[e.to];
        return (
          <line key={i}
            x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            stroke={e.active ? '#3b82f6' : '#2a2a4a'}
            strokeWidth={e.active ? 1.5 : 0.5}
            strokeDasharray={e.active ? 'none' : '4 4'}
            opacity={e.active ? 0.6 : 0.3}
            style={{ transition: 'all 1s ease' }}
          />
        );
      })}

      {/* Neighborhood nodes */}
      {nodes.filter(n => n.type === 'neighborhood').map((n, i) => {
        const d = (n as any).demand || 500;
        const r = 5 + (d / 1200) * 8;
        return (
          <g key={`n${i}`}>
            <circle cx={n.x} cy={n.y} r={r + 4} fill="#3b82f6" opacity="0.08" />
            <circle cx={n.x} cy={n.y} r={r} fill="#1e3a5f" stroke="#3b82f6" strokeWidth="1.5" opacity="0.9" />
          </g>
        );
      })}

      {/* Warehouse nodes */}
      {nodes.filter(n => n.type === 'warehouse').map((n, i) => (
        <g key={`w${i}`}>
          <circle cx={n.x} cy={n.y} r={24} fill="#3b82f6" opacity="0.1" />
          <circle cx={n.x} cy={n.y} r={16} fill="#1e3a5f" stroke="#3b82f6" strokeWidth="2" />
          <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize="10" fill="#3b82f6" fontWeight="bold">W</text>
          <text x={n.x} y={n.y + 30} textAnchor="middle" fontSize="9" fill="#6080a0">{(n as any).label}</text>
        </g>
      ))}
    </svg>
  );
}

const features = [
  {
    icon: Map,
    title: 'Multi-Warehouse Optimization',
    desc: 'Simultaneously optimize placement of multiple warehouse facilities accounting for capacity, cost, and geographic constraints.',
  },
  {
    icon: Shield,
    title: 'Capacity-Aware Allocation',
    desc: 'Each warehouse has defined capacity limits. The optimizer ensures no facility is overloaded while minimizing total cost.',
  },
  {
    icon: TrendingUp,
    title: 'Demand-Weighted Delivery',
    desc: 'Delivery costs are proportional to neighborhood demand and distance, reflecting real-world logistics pricing.',
  },
  {
    icon: GitCompare,
    title: 'Road-Network Distance',
    desc: 'Supports Euclidean, road-network, and precomputed distance matrices for accurate cost modeling.',
  },
  {
    icon: Sliders,
    title: 'Demand Uncertainty',
    desc: 'Monte Carlo simulation quantifies how demand variability affects optimal warehouse placement.',
  },
  {
    icon: Zap,
    title: 'Explainable Optimization',
    desc: 'Understand exactly why each warehouse was selected, which neighborhoods it serves, and what would happen if it moved.',
  },
];

const mathConcepts = [
  {
    symbol: 'min',
    formula: 'Σᵢ fᵢyᵢ + Σᵢ Σⱼ cᵢⱼ dⱼ xᵢⱼ',
    name: 'Capacitated Facility Location',
    desc: 'Minimize the sum of fixed warehouse opening costs and demand-weighted delivery costs across all assignments.',
  },
  {
    symbol: 's.t.',
    formula: 'Σᵢ xᵢⱼ = 1  ∀j',
    name: 'Assignment Completeness',
    desc: 'Every neighborhood must be assigned to exactly one warehouse.',
  },
  {
    symbol: '∑',
    formula: 'Σⱼ dⱼ xᵢⱼ ≤ Cᵢ yᵢ  ∀i',
    name: 'Capacity Constraint',
    desc: 'Total demand assigned to a warehouse cannot exceed its capacity, and only open warehouses can receive assignments.',
  },
];

export function LandingPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { login, signup } = useStore();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('planner@northstar.demo');
  const [password, setPassword] = useState('northstar123');
  const [companyName, setCompanyName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const openAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode); setAuthError(null); setAuthOpen(true);
  };
  const submitAuth = async (event: FormEvent) => {
    event.preventDefault(); setAuthLoading(true); setAuthError(null);
    try {
      if (authMode === 'login') await login(email, password);
      else await signup(email, password, companyName);
      setAuthOpen(false);
      onNavigate('map');
    } catch (error: any) {
      setAuthError(error.message || 'Unable to authenticate');
    } finally { setAuthLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8ed] overflow-x-hidden">
      {/* Animated Command Bar Top Dock */}
      <AnimatedTopDock
        variant="modern"
        proximity={122}
        spring={0.19}
        damping={0.70}
        widthGrowth={17}
        heightGrowth={16}
        drop={3.5}
        onNavigate={(p) => onNavigate(p as Page)}
        onSignIn={() => openAuth('login')}
        onCreateAccount={() => openAuth('signup')}
      />

      {/* Hero */}
      <section className="relative px-6 md:px-12 pt-20 pb-12 max-w-7xl mx-auto">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,_rgba(59,130,246,0.08),_transparent_60%)] pointer-events-none" />

        <div className="flex items-center gap-2 mb-6">
          <Badge variant="info">Demo · Simulated data</Badge>
          <Badge variant="muted">Hackathon Project</Badge>
        </div>

        <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight max-w-3xl mb-6">
          Find the Optimal Location<br />
          <span className="text-blue-400">for Every Delivery.</span>
        </h1>

        <p className="text-[#6b6b80] text-lg max-w-xl mb-8 leading-relaxed">
          Optimize warehouse placement, reduce delivery costs, and simulate real-world
          logistics constraints using mathematical optimization.
        </p>

        <div className="flex items-center gap-3 mb-4">
          <Button variant="primary" size="lg" onClick={() => onNavigate('dashboard')}>
            Explore Live Demo <ArrowRight size={15} />
          </Button>
          <Button variant="outline" size="lg" onClick={() => openAuth('login')}>
            Sign in
          </Button>
        </div>
        <p className="mb-12 text-[12px] text-[#6b6b80] dark:text-[#8080a0]">Instant demo access with Bangalore Basavanagudi & Jayanagar dataset pre-loaded.</p>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-6 mb-12 max-w-lg">
          {[
            { value: '18.3%', label: 'Cost reduction (simulated)' },
            { value: '4.2 km', label: 'Avg delivery distance' },
            { value: '5', label: 'Optimized warehouses' },
          ].map((m, i) => (
            <div key={i}>
              <div className="text-2xl font-mono font-bold text-white">{m.value}</div>
              <div className="text-xs text-[#4a4a60] mt-1">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Network visualization */}
        <div className="relative rounded-xl border border-[#1e1e2e] overflow-hidden bg-[#0d0d18] h-64 md:h-80">
          <div className="absolute inset-0">
            <NetworkViz />
          </div>
          <div className="absolute bottom-3 right-3">
            <Badge variant="muted">32 neighborhoods · 5 warehouses · NYC Metro</Badge>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 md:px-12 py-16 max-w-7xl mx-auto">
        <div className="mb-10">
          <div className="text-xs font-mono font-medium text-blue-400 mb-3 uppercase tracking-widest">Capabilities</div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Built for real logistics decisions</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={i} className="p-5 rounded-lg border border-[#1e1e2e] bg-[#111118] hover:border-[#2a2a3a] transition-colors group">
              <div className="w-8 h-8 rounded bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <f.icon size={15} className="text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-xs text-[#5a5a70] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Math Foundation */}
      <section className="px-6 md:px-12 py-16 max-w-7xl mx-auto border-t border-[#1a1a24]">
        <div className="mb-10">
          <div className="text-xs font-mono font-medium text-blue-400 mb-3 uppercase tracking-widest">Mathematical Foundation</div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Grounded in operations research</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {mathConcepts.map((c, i) => (
            <div key={i} className="p-6 rounded-lg border border-[#1e1e2e] bg-[#0d0d16]">
              <div className="font-mono text-lg text-blue-300 mb-3 bg-[#0a0f1a] rounded px-4 py-3 border border-blue-500/10">
                {c.formula}
              </div>
              <div className="text-sm font-semibold text-[#c0c0d0] mb-2">{c.name}</div>
              <p className="text-xs text-[#5a5a70] leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-12 py-20 max-w-7xl mx-auto border-t border-[#1a1a24] text-center">
        <div className="flex items-center justify-center gap-1 mb-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
          ))}
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Build a smarter logistics network.
        </h2>
        <p className="text-[#5a5a70] mb-8 max-w-md mx-auto">
          Load a dataset, configure constraints, and find optimal warehouse locations in seconds.
        </p>
        <div className="flex items-center gap-3 justify-center">
          <Button variant="primary" size="lg" onClick={() => onNavigate('dashboard')}>
            Launch Workspace <ChevronRight size={15} />
          </Button>
          <Button variant="outline" size="lg" onClick={() => openAuth('login')}>
            Sign in
          </Button>
        </div>
      </section>

      <footer className="border-t border-[#1a1a24] px-6 md:px-12 py-6 text-center text-xs text-[#3a3a50] font-mono">
        Wherehouse · Hackathon Demo · All results are simulated · Not for production logistics use
      </footer>

      {authOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Authentication">
          <form onSubmit={submitAuth} className="relative w-full max-w-md rounded-xl border border-[#2a2a3a] bg-[#111118] shadow-2xl p-6 space-y-4">
            <button type="button" onClick={() => setAuthOpen(false)} className="absolute top-4 right-4 text-[#6b6b80] hover:text-white"><X size={18} /></button>
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-blue-400 mb-2">Wherehouse account</div>
              <h2 className="text-xl font-semibold text-white">{authMode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2>
              <p className="text-xs text-[#6b6b80] mt-1">{authMode === 'login' ? 'Sign in to access your map, optimizer, and shared workspace.' : 'You will receive a ready-to-optimize 56-location network.'}</p>
            </div>
            <div className="flex p-1 rounded-lg bg-[#0a0a0f] border border-[#1e1e2e]">
              {(['login', 'signup'] as const).map(mode => <button key={mode} type="button" onClick={() => { setAuthMode(mode); setAuthError(null); }} className={`flex-1 rounded py-2 text-xs ${authMode === mode ? 'bg-blue-600 text-white' : 'text-[#6b6b80]'}`}>{mode === 'login' ? 'Sign in' : 'Sign up'}</button>)}
            </div>
            {authMode === 'signup' && <label className="block text-xs text-[#a0a0b0]">Company name<input required value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Logistics" className="mt-1.5 w-full rounded border border-[#2a2a3a] bg-[#0a0a0f] px-3 py-2 text-sm text-white outline-none focus:border-blue-500" /></label>}
            <label className="block text-xs text-[#a0a0b0]">Email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 w-full rounded border border-[#2a2a3a] bg-[#0a0a0f] px-3 py-2 text-sm text-white outline-none focus:border-blue-500" /></label>
            <label className="block text-xs text-[#a0a0b0]">Password<input required minLength={6} type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1.5 w-full rounded border border-[#2a2a3a] bg-[#0a0a0f] px-3 py-2 text-sm text-white outline-none focus:border-blue-500" /></label>
            {authError && <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{authError}</p>}
            <Button type="submit" variant="primary" size="md" loading={authLoading} className="w-full">{authMode === 'login' ? 'Sign in and open map' : 'Create account and open map'}</Button>
            {authMode === 'login' && (
              <div className="text-[11px] leading-relaxed text-[#6b6b80] flex flex-wrap gap-2 items-center">
                <span>Demo account:</span>
                <button
                  type="button"
                  onClick={() => { setEmail('namit@gmail.com'); setPassword('12345678'); }}
                  className="text-blue-400 hover:underline cursor-pointer font-mono"
                >
                  namit@gmail.com / 12345678
                </button>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
