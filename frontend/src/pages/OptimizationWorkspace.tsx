import { useState, useCallback, useMemo } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fmtCurrency, fmtPct } from '@/lib/utils';
import {
  Play, X, CheckCircle2, AlertTriangle,
  Loader2, Info, ChevronDown, Truck, Fuel, Clock,
  TrendingUp, Compass, BarChart3,
  Maximize2, ArrowRight, ShieldAlert, Sparkles, MapPin
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { api, type Params, type OptResult, type Point, type Candidate, type ExpansionResult } from '@/lib/api';
import { StepNarration } from '@/components/ui/StepNarration';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  Legend, CartesianGrid, ResponsiveContainer, ReferenceLine
} from 'recharts';

type AlgoKey = 'exact' | 'annealing' | 'localsearch' | 'kmedoids' | 'kmeans' | 'greedy' | 'median';

const ALGORITHMS: { key: AlgoKey; label: string; desc: string }[] = [
  { key: 'exact',       label: 'Branch & Bound (MILP)', desc: 'Guaranteed mathematical global optimum via branch-and-bound' },
  { key: 'annealing',   label: 'Simulated Annealing',   desc: 'Probabilistic metaheuristic exploring 8,000 temperature states' },
  { key: 'localsearch', label: 'Local Search (Add/Drop/Swap)', desc: 'Fast iterative neighborhood improvement' },
  { key: 'kmedoids',    label: 'Demand-Weighted K-Medoids', desc: 'PAM clustering restricted to warehouse candidate sites' },
  { key: 'kmeans',      label: 'Demand-Weighted K-Means', desc: 'Continuous cluster centroids snapped to candidate hubs' },
  { key: 'greedy',      label: 'Capacitated Greedy',    desc: 'Iteratively opens docks with maximum demand coverage' },
  { key: 'median',      label: 'Weiszfeld Geometric Median (k=1)', desc: 'Iterative Fermat-Weber median minimizing total weighted distance' },
];

const DIST_METRICS = [
  { key: 'euclidean', label: 'Euclidean (Straight-Line, L2)' },
  { key: 'manhattan', label: 'Manhattan Grid (L1 Metric)' },
  { key: 'road',      label: 'Road Network (1.35x Circuity Multiplier)' },
];

// Vehicle fleet profiles
export interface VehicleType {
  id: string;
  name: string;
  icon: string;
  capacity: number; // max units
  baseCostPerKm: number; // $/km or ₹/km base operating cost
  fuelEfficiencyKmPerL: number; // km per liter
}

const VEHICLE_TYPES: VehicleType[] = [
  { id: 'bike',        name: 'Two-Wheeler / Electric Bike', icon: '🛵', capacity: 40,   baseCostPerKm: 0.6, fuelEfficiencyKmPerL: 45 },
  { id: 'ev_van',      name: 'Electric Cargo Van',          icon: '🚐', capacity: 250,  baseCostPerKm: 1.2, fuelEfficiencyKmPerL: 20 },
  { id: 'diesel_van',  name: 'Standard Diesel Van',         icon: '🚚', capacity: 500,  baseCostPerKm: 1.6, fuelEfficiencyKmPerL: 10 },
  { id: 'truck_14ft',  name: 'Heavy 14ft Truck',            icon: '🚛', capacity: 1200, baseCostPerKm: 2.8, fuelEfficiencyKmPerL: 4.5 },
];

// Traffic condition profiles
export interface TrafficProfile {
  id: string;
  name: string;
  timeMultiplier: number; // delivery time multiplier
  roadMultiplier: number; // congestion circuity multiplier
  badge: string;
}

const TRAFFIC_PROFILES: TrafficProfile[] = [
  { id: 'offpeak',      name: 'Off-Peak / Night (Free Flow)',        timeMultiplier: 0.85, roadMultiplier: 1.00, badge: '🌙 Off-Peak' },
  { id: 'normal',       name: 'Normal Daylight (Standard)',          timeMultiplier: 1.00, roadMultiplier: 1.00, badge: '☀️ Normal' },
  { id: 'rush_morning', name: 'Morning Rush Hour (8:30 - 11:00 AM)', timeMultiplier: 1.50, roadMultiplier: 1.15, badge: '🚗 Morning Peak' },
  { id: 'rush_evening', name: 'Evening Peak Hour (5:30 - 8:30 PM)',  timeMultiplier: 1.75, roadMultiplier: 1.25, badge: '🚦 Evening Peak' },
  { id: 'monsoon',      name: 'Monsoon / Heavy Rain Congestion',     timeMultiplier: 2.00, roadMultiplier: 1.35, badge: '🌧️ Weather Alert' },
];

export function OptimizationWorkspace() {
  const { nb, wh, loaded } = useStore();

  // Core settings
  const [algo, setAlgo] = useState<AlgoKey>('exact');
  const [dist, setDist] = useState<string>('road');
  const [radius, setRadius] = useState<number>(60);
  const [capacity, setCapacity] = useState<number>(() => wh[0]?.capacity || 900);
  const [fixedCost, setFixedCost] = useState<number>(1500);
  const [minW, setMinW] = useState<number>(1);
  const [maxW, setMaxW] = useState<number>(4);

  // Advanced / Bonus settings
  const [selectedVehicle, setSelectedVehicle] = useState<string>('diesel_van');
  const [fuelPrice, setFuelPrice] = useState<number>(1.40); // $/L or ₹/L
  const [trafficProfile, setTrafficProfile] = useState<string>('normal');
  const [demandGrowthPct, setDemandGrowthPct] = useState<number>(0);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'map' | 'baseline' | 'sweep' | 'median' | 'expand'>('map');

  // Execution state
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [result, setResult] = useState<OptResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Sweep and Median results
  const [sweepData, setSweepData] = useState<any[]>([]);
  const [sweepLoading, setSweepLoading] = useState(false);
  const [medianResult, setMedianResult] = useState<{ x: number; y: number; nearestWarehouse: string; distanceToNearest: number } | null>(null);

  // Map state
  const [mapZoom, setMapZoom] = useState(1);
  const [mapSelection, setMapSelection] = useState<{ kind: 'demand' | 'warehouse'; id: string; label: string; detail: string } | null>(null);

  // Compute effective delivery cost per km taking vehicle type, fuel price, and traffic into account
  const currentVehicle = useMemo(() => VEHICLE_TYPES.find(v => v.id === selectedVehicle) || VEHICLE_TYPES[2], [selectedVehicle]);
  const currentTraffic = useMemo(() => TRAFFIC_PROFILES.find(t => t.id === trafficProfile) || TRAFFIC_PROFILES[1], [trafficProfile]);

  const fuelCostPerKm = useMemo(() => {
    return +(fuelPrice / currentVehicle.fuelEfficiencyKmPerL).toFixed(3);
  }, [fuelPrice, currentVehicle]);

  const effectiveCostPerKm = useMemo(() => {
    return +(currentVehicle.baseCostPerKm + fuelCostPerKm).toFixed(3);
  }, [currentVehicle, fuelCostPerKm]);

  // Scaled neighborhoods with demand growth applied
  const scaledNb = useMemo(() => {
    const factor = 1 + (demandGrowthPct / 100);
    return nb.map(n => ({
      ...n,
      demand: Math.max(1, Math.round(n.demand * factor)),
    }));
  }, [nb, demandGrowthPct]);

  // Main Optimization Runner
  const run = useCallback(async () => {
    if (!loaded || !scaledNb.length || !wh.length) return;
    setRunning(true);
    setErr(null);
    setRan(false);

    try {
      if (algo === 'median') {
        // Calculate Weiszfeld geometric median
        const out = await api.median({ neighborhoods: scaledNb });
        setMedianResult({
          x: out.x,
          y: out.y,
          nearestWarehouse: out.nearestWarehouse,
          distanceToNearest: out.distanceToNearest,
        });
        setActiveTab('median');
        setRan(true);
        setRunning(false);
        return;
      }

      const out = await api.optimize({
        neighborhoods: scaledNb,
        candidates: wh,
        params: {
          algorithm: algo,
          distanceMetric: dist,
          maxServiceRadius: radius,
          deliveryCostPerKm: effectiveCostPerKm,
          roadFactor: (dist === 'road' ? 1.35 : 1.0) * currentTraffic.roadMultiplier,
          capacity,
          fixedCost,
          minWarehouses: minW,
          maxWarehouses: maxW,
        },
        explain: true,
      });

      setResult(out);
      setRan(true);
    } catch (e: any) {
      setErr(e.message || 'Optimization solver failed');
    } finally {
      setRunning(false);
    }
  }, [loaded, scaledNb, wh, algo, dist, radius, effectiveCostPerKm, currentTraffic, capacity, fixedCost, minW, maxW]);

  // Run Trade-off Sweep k = 1..N
  const runSweep = useCallback(async () => {
    if (!loaded || !scaledNb.length || !wh.length) return;
    setSweepLoading(true);
    try {
      const out = await api.sweep({
        neighborhoods: scaledNb,
        candidates: wh,
        fixedSetupCost: fixedCost,
        maxK: Math.min(wh.length, 8),
        params: {
          deliveryCostPerKm: effectiveCostPerKm,
          maxServiceRadius: radius,
          distanceMetric: dist,
          roadFactor: (dist === 'road' ? 1.35 : 1.0) * currentTraffic.roadMultiplier,
        },
      });
      setSweepData(out.sweep);
      setActiveTab('sweep');
    } catch (e: any) {
      setErr(e.message || 'Sweep calculation failed');
    } finally {
      setSweepLoading(false);
    }
  }, [loaded, scaledNb, wh, fixedCost, effectiveCostPerKm, radius, dist, currentTraffic]);

  // Run Weiszfeld Median
  const runWeiszfeld = useCallback(async () => {
    if (!loaded || !scaledNb.length) return;
    try {
      const out = await api.median({ neighborhoods: scaledNb });
      setMedianResult({
        x: out.x,
        y: out.y,
        nearestWarehouse: out.nearestWarehouse,
        distanceToNearest: out.distanceToNearest,
      });
      setActiveTab('median');
    } catch (e: any) {
      setErr(e.message || 'Weiszfeld computation failed');
    }
  }, [loaded, scaledNb]);

  // Expansion advisor state
  const [expGrowth, setExpGrowth] = useState(30);
  const [expThr, setExpThr] = useState(85);
  const [expRunning, setExpRunning] = useState(false);
  const [expRan, setExpRan] = useState(false);
  const [expRes, setExpRes] = useState<ExpansionResult | null>(null);

  // Expansion advisor runner: growth what-if -> expand/locate plan + LLM summary
  const runExpansion = useCallback(async () => {
    if (!loaded || !scaledNb.length || !wh.length) return;
    setExpRunning(true); setErr(null);
    try {
      const out = await api.expansion({
        neighborhoods: scaledNb,
        candidates: wh,
        params: {
          algorithm: algo === 'median' ? 'localsearch' : algo,
          distanceMetric: dist,
          maxServiceRadius: radius,
          deliveryCostPerKm: effectiveCostPerKm,
          roadFactor: (dist === 'road' ? 1.35 : 1.0) * currentTraffic.roadMultiplier,
          capacity, fixedCost, minWarehouses: minW, maxWarehouses: maxW,
        },
        expansion: { growthPct: expGrowth, utilThreshold: expThr / 100, newFixedCost: fixedCost },
      });
      setExpRes(out); setExpRan(true);
    } catch (e: any) {
      setErr(e.message || 'Expansion analysis failed');
    } finally { setExpRunning(false); }
  }, [loaded, scaledNb, wh, algo, dist, radius, effectiveCostPerKm, currentTraffic, capacity, fixedCost, minW, maxW, expGrowth, expThr]);

  const whList = result?.utilization?.map(u => {
    const w = wh.find(x => x.id === u.id);
    return { ...u, name: w?.name || u.id, fixedCost: w?.fixedCost ?? 0, capacity: w?.capacity ?? 0 };
  }) || [];

  return (
    <div className="optimization-shell h-full min-h-0 flex flex-col overflow-visible bg-[#0a0a0f]">
      {/* Left Column: Controls & Configuration */}
      <div className="optimization-controls w-full flex-shrink-0 border-b border-[#1e1e2e] bg-[#0d0d16] flex flex-col overflow-visible">
        <div className="optimization-heading px-6 py-5 border-b border-[#1e1e2e]">
          <div className="flex items-center justify-between">
            <div><h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">Optimization Workspace</h1><p className="mt-1 text-sm text-[#7f96af]">Design the most efficient warehouse network.</p></div>
            <Button variant="primary" size="md" loading={running} onClick={run} className="shadow-lg shadow-blue-500/20"><Play size={14} />Run Optimization</Button>
           </div>
          <div className="optimization-metrics-row mt-5 grid grid-cols-3 gap-3 max-w-lg"><div><strong>{scaledNb.length}</strong><span>Demand Nodes</span></div><div><strong>{wh.length}</strong><span>Candidate Hubs</span></div><div><strong>{result?.runtimeMs ?? '—'}</strong><span>Solve Time</span></div></div>
        </div>

        <div className="optimization-controlbar px-6 py-4 space-y-4">
          {/* Algorithm Selector */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-[#8080a0] block mb-1">
              Optimization Algorithm
            </label>
            <div className="relative">
              <select
                value={algo}
                onChange={e => setAlgo(e.target.value as AlgoKey)}
                className="w-full appearance-none px-3 py-2 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-[#e0e0f0] focus:border-blue-500/60 focus:outline-none"
              >
                {ALGORITHMS.map(a => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4a4a60] pointer-events-none" />
            </div>
            <p className="text-[10px] text-[#4a4a60] mt-1">
              {ALGORITHMS.find(a => a.key === algo)?.desc}
            </p>
          </div>

          {/* Warehouse Count Bounds */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono text-[#8080a0] block mb-1">Min Warehouses (k)</label>
              <input
                type="number"
                min={1}
                max={maxW}
                value={minW}
                onChange={e => setMinW(Math.max(1, Math.min(+e.target.value, maxW)))}
                className="w-full px-2.5 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white font-mono focus:border-blue-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#8080a0] block mb-1">Max Warehouses (k)</label>
              <input
                type="number"
                min={minW}
                max={wh.length}
                value={maxW}
                onChange={e => setMaxW(Math.max(minW, Math.min(+e.target.value, wh.length)))}
                className="w-full px-2.5 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white font-mono focus:border-blue-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Capacity & Service Radius Constraints */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono text-[#8080a0] block mb-1">Max Radius (km)</label>
              <input
                type="number"
                min={1}
                value={radius}
                onChange={e => setRadius(Math.max(1, +e.target.value))}
                className="w-full px-2.5 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white font-mono focus:border-blue-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#8080a0] block mb-1">Capacity / Hub</label>
              <input
                type="number"
                min={10}
                value={capacity}
                onChange={e => setCapacity(Math.max(10, +e.target.value))}
                className="w-full px-2.5 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white font-mono focus:border-blue-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Fixed Hub Setup Cost */}
          <div>
            <div>
              <label className="text-[10px] font-mono text-[#8080a0] block mb-1">Fixed Cost / Hub ($)</label>
              <input
                type="number"
                min={0}
                value={fixedCost}
                onChange={e => setFixedCost(Math.max(0, +e.target.value))}
                className="w-full px-2.5 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white font-mono focus:border-blue-500/50 focus:outline-none"
              />
            </div>
          </div>

          <details className="advanced-controls">
            <summary>Advanced controls <ChevronDown size={13} /></summary>
            <div className="advanced-controls-body space-y-4">
          <div>
            <label className="text-[10px] font-mono text-[#8080a0] block mb-1">Distance Metric</label>
            <div className="relative">
              <select value={dist} onChange={e => setDist(e.target.value)} className="w-full appearance-none px-2 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-[#e0e0f0] focus:border-blue-500/50 focus:outline-none">
                {DIST_METRICS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#4a4a60] pointer-events-none" />
            </div>
          </div>
          {/* Vehicle Fleet Type Picker (Bonus 4) */}
          <div className="pt-2 border-t border-[#1e1e2e]">
            <label className="text-[10px] font-mono uppercase tracking-wider text-blue-400 flex items-center gap-1 mb-1.5">
              <Truck size={12} /> Vehicle Type & Cost Profile
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {VEHICLE_TYPES.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVehicle(v.id)}
                  className={`p-2 rounded text-left border transition-all ${
                    selectedVehicle === v.id
                      ? 'bg-blue-600/15 border-blue-500/40 text-white'
                      : 'bg-[#111118] border-[#1e1e2e] text-[#8080a0] hover:text-white hover:border-[#2a2a3a]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <span>{v.icon}</span>
                    <span className="truncate">{v.name.split('/')[0]}</span>
                  </div>
                  <div className="text-[10px] font-mono text-[#6b6b80] mt-0.5">
                    Cap: {v.capacity} | ${v.baseCostPerKm}/km
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Fuel & Traffic Conditions (Bonus 5 & 6) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono text-[#8080a0] flex items-center gap-1 mb-1">
                <Fuel size={11} className="text-amber-400" /> Fuel Price ($/L)
              </label>
              <input
                type="number"
                step="0.05"
                min={0}
                value={fuelPrice}
                onChange={e => setFuelPrice(Math.max(0, +e.target.value))}
                className="w-full px-2.5 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white font-mono focus:border-blue-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#8080a0] flex items-center gap-1 mb-1">
                <Clock size={11} className="text-purple-400" /> Traffic Multiplier
              </label>
              <div className="relative">
                <select
                  value={trafficProfile}
                  onChange={e => setTrafficProfile(e.target.value)}
                  className="w-full appearance-none px-2 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-[#e0e0f0] focus:border-blue-500/50 focus:outline-none"
                >
                  {TRAFFIC_PROFILES.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#4a4a60] pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Effective Cost Preview Badge */}
          <div className="p-2.5 rounded bg-[#111118] border border-[#1e1e2e] flex items-center justify-between text-xs font-mono">
            <span className="text-[#6b6b80]">Landed Transit Rate:</span>
            <span className="text-emerald-400 font-semibold">${effectiveCostPerKm}/km</span>
          </div>

          {/* Demand Growth Scenario Slider (Bonus 7) */}
          <div className="pt-2 border-t border-[#1e1e2e]">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#8080a0] flex items-center gap-1 font-mono text-[10px] uppercase">
                <TrendingUp size={12} className="text-emerald-400" /> Demand Growth Horizon
              </span>
              <span className="font-mono text-white text-xs">
                {demandGrowthPct > 0 ? `+${demandGrowthPct}%` : demandGrowthPct < 0 ? `${demandGrowthPct}%` : 'Baseline (0%)'}
              </span>
            </div>
            <input
              type="range"
              min={-20}
              max={100}
              step={5}
              value={demandGrowthPct}
              onChange={e => setDemandGrowthPct(+e.target.value)}
              className="w-full h-1.5 bg-[#1e1e2e] rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#4a4a60] mt-1">
              <span>-20% (Downturn)</span>
              <span>Baseline</span>
              <span>+100% (2x)</span>
            </div>
          </div>

            </div>
          </details>

        </div>
      </div>

      {/* Main Center & Right Area */}
      <div className="optimization-workspace flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top View Switcher Tabs */}
        <div className="workspace-tabs h-14 border-b border-[#1e1e2e] bg-[#0d0d16] px-4 flex items-center justify-between flex-shrink-0">
          <div className="optimization-view-switcher flex items-center gap-2">
            <span className="hidden sm:block text-[10px] font-mono uppercase tracking-wider text-[#617892]">View</span>
            <select value={activeTab} onChange={e => setActiveTab(e.target.value as typeof activeTab)} className="optimization-view-select">
              <option value="map">Map & Network Visualizer</option>
              <option value="baseline">Baseline vs. Optimized</option>
              <option value="sweep">Infra vs Delivery Sweep</option>
              <option value="median">Weiszfeld Geometric Center</option>
              <option value="expand">Expansion Advisor</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {ran && result && (
              <Badge variant={result.optimal ? 'success' : 'info'}>
                {result.optimal ? '✓ Global Optimum Proven' : result.algorithmUsed}
              </Badge>
            )}
          </div>
        </div>

        {/* Tab Contents */}
        <div className="workspace-content flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4">
          {err && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} />
                <span>{err}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setErr(null)}>Dismiss</Button>
            </div>
          )}

          {/* TAB 1: Map Visualizer */}
          {activeTab === 'map' && (
            <div className="optimization-map-zone grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_290px] gap-4 h-[calc(100vh-140px)] min-h-[550px]">
              {/* SVG Map Canvas */}
              <div className="optimization-map rounded-xl border border-[#1e1e2e] bg-[#0d0f1a] relative overflow-hidden flex flex-col">
                <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                  <div className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-[#111118]/90 border border-[#1e1e2e] text-white flex items-center gap-1.5 backdrop-blur shadow-md">
                    <span>{scaledNb.length} Demand Nodes</span>
                    <span className="text-[#4a4a60]">·</span>
                    <span className="text-emerald-400">{wh.filter(w => result?.openWarehouses?.includes(w.id)).length || '—'} Open Hubs</span>
                  </div>
                  {result?.unserved && result.unserved.length > 0 && (
                    <div className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-red-500/15 border border-red-500/30 text-red-400 flex items-center gap-1 backdrop-blur shadow-md">
                      <ShieldAlert size={12} /> {result.unserved.length} Unserved (Exceeds Radius/Capacity)
                    </div>
                  )}
                </div>

                <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-[#111118]/90 p-1 rounded-lg border border-[#1e1e2e] backdrop-blur">
                  <button onClick={() => setMapZoom(z => Math.min(2.5, +(z + 0.2).toFixed(1)))} className="w-7 h-7 rounded hover:bg-[#1e1e2e] text-white flex items-center justify-center font-bold text-sm">+</button>
                  <button onClick={() => setMapZoom(z => Math.max(0.8, +(z - 0.2).toFixed(1)))} className="w-7 h-7 rounded hover:bg-[#1e1e2e] text-white flex items-center justify-center font-bold text-sm">−</button>
                  <button onClick={() => { setMapZoom(1); setMapSelection(null); }} className="px-2 h-7 rounded hover:bg-[#1e1e2e] text-[10px] text-[#a0a0b0] font-mono">1x</button>
                </div>

                <div className="flex-1 w-full h-full relative">
                  <WloMapSVG
                    neighborhoods={scaledNb}
                    warehouses={wh}
                    result={result}
                    zoom={mapZoom}
                    onSelect={setMapSelection}
                  />
                </div>

                {/* Map Legend Bar */}
                <div className="p-2.5 border-t border-[#1e1e2e] bg-[#0d0d16]/95 backdrop-blur flex items-center justify-between text-[11px] text-[#8080a0] flex-wrap gap-2">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500/30 border border-blue-400 inline-block" /> Demand Area (Circle Area = Daily Orders)</span>
                    <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-emerald-500 border border-white inline-block" /> Selected Open Hub</span>
                    <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-[#1e1e2e] border border-[#3a3a50] inline-block" /> Inactive Candidate</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Unserved Radius/Cap Violation</span>
                  </div>
                  {mapSelection && (
                    <div className="text-white font-mono text-[10px] bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded">
                      Selected: <strong>{mapSelection.label}</strong> ({mapSelection.detail})
                    </div>
                  )}
                </div>
              </div>

              {/* Right KPI Summary Sidebar */}
              <div className="optimization-results space-y-4 flex flex-col justify-between">
                <Card className="results-panel">
                  <CardHeader><span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">Plan Performance</span></CardHeader>
                  <CardBody className="space-y-3">
                    {result ? (
                      <>
                        <div className="p-3 rounded-lg bg-[#161622] border border-[#222234]">
                          <div className="text-[10px] font-mono text-[#6b6b80]">TOTAL LOGISTICS COST</div>
                          <div className="text-2xl font-bold font-mono text-white mt-0.5">{fmtCurrency(result.totalCost)}</div>
                          {result.savingsPct != null && (
                            <div className="mt-1 text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                              <Sparkles size={12} /> Saves {result.savingsPct}% vs single hub baseline
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded bg-[#111118] border border-[#1e1e2e]">
                            <div className="text-[10px] text-[#6b6b80]">Variable Delivery</div>
                            <div className="font-mono text-white font-medium">{fmtCurrency(result.deliveryCost)}</div>
                          </div>
                          <div className="p-2 rounded bg-[#111118] border border-[#1e1e2e]">
                            <div className="text-[10px] text-[#6b6b80]">Fixed Infrastructure</div>
                            <div className="font-mono text-white font-medium">{fmtCurrency(result.fixedCost)}</div>
                          </div>
                          <div className="p-2 rounded bg-[#111118] border border-[#1e1e2e]">
                            <div className="text-[10px] text-[#6b6b80]">Avg Transit Dist</div>
                            <div className="font-mono text-blue-400 font-medium">{result.avgDistance.toFixed(2)} km</div>
                          </div>
                          <div className="p-2 rounded bg-[#111118] border border-[#1e1e2e]">
                            <div className="text-[10px] text-[#6b6b80]">Solver Runtime</div>
                            <div className="font-mono text-purple-400 font-medium">{result.runtimeMs} ms</div>
                          </div>
                        </div>

                        {/* Hub Utilization List */}
                        <div className="pt-2 border-t border-[#1e1e2e]">
                          <div className="text-[10px] font-mono text-[#6b6b80] uppercase tracking-wider mb-2">Hub Utilization</div>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {whList.map(w => (
                              <div key={w.id} className="p-2 rounded bg-[#111118] border border-[#1e1e2e] text-xs">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium text-white truncate">{w.name}</span>
                                  <span className="font-mono text-emerald-400">{fmtPct(w.u)}</span>
                                </div>
                                <div className="w-full h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${w.u > 0.9 ? 'bg-red-500' : w.u > 0.75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${Math.min(100, w.u * 100)}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-12 text-[#6b6b80]">
                        <Play size={28} className="mx-auto text-[#2a2a3a] mb-2" />
                        <p className="text-xs">Configure parameters on the left and click <strong>Run Optimization</strong></p>
                      </div>
                    )}
                  </CardBody>
                </Card>

                {/* Explanation Card */}
                {result?.explanation && (
                  <Card>
                    <CardHeader><span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">Mathematical Rationale</span></CardHeader>
                    <CardBody>
                      <ul className="text-[11px] text-[#8080a0] space-y-1.5 leading-relaxed">
                        {result.explanation.slice(0, 4).map((line, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-blue-400 font-bold">•</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Baseline vs Optimized Comparison */}
          {activeTab === 'baseline' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardBody className="pt-4">
                    <div className="text-[10px] font-mono text-[#8080a0]">SINGLE CENTRAL HUB BASELINE</div>
                    <div className="text-xl font-bold font-mono text-white mt-1">
                      {result?.baselineSingle ? fmtCurrency(result.baselineSingle.total || result.baselineSingle.cost || 0) : '—'}
                    </div>
                    <p className="text-[11px] text-[#6b6b80] mt-1">1 Central warehouse serving all demand</p>
                  </CardBody>
                </Card>
                <Card>
                  <CardBody className="pt-4">
                    <div className="text-[10px] font-mono text-blue-400">OPTIMIZED MULTI-HUB NETWORK</div>
                    <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                      {result ? fmtCurrency(result.totalCost) : '—'}
                    </div>
                    <p className="text-[11px] text-[#6b6b80] mt-1">{result?.openWarehouses.length || 0} Decentralized strategic hubs</p>
                  </CardBody>
                </Card>
                <Card>
                  <CardBody className="pt-4">
                    <div className="text-[10px] font-mono text-emerald-400">NET EFFICIENCY GAIN</div>
                    <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                      {result?.savingsPct != null ? `+${result.savingsPct}% Savings` : '—'}
                    </div>
                    <p className="text-[11px] text-[#6b6b80] mt-1">Reduced transit time & fuel consumption</p>
                  </CardBody>
                </Card>
              </div>

              {/* Assignment Table */}
              <Card>
                <CardHeader>
                  <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                    Neighborhood Assignment Ledger ({scaledNb.length} Areas)
                  </span>
                </CardHeader>
                <CardBody>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px] text-left">
                      <thead>
                        <tr className="border-b border-[#1e1e2e] text-[#6b6b80] font-mono text-[10px] uppercase">
                          <th className="py-2 px-3">Neighborhood</th>
                          <th className="py-2 px-3">Daily Orders</th>
                          <th className="py-2 px-3">Assigned Warehouse</th>
                          <th className="py-2 px-3">Transit Distance</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scaledNb.map(n => {
                          const wid = result?.assignments?.[n.id];
                          const w = wh.find(x => x.id === wid);
                          const isUnserved = result?.unserved?.includes(n.id);
                          return (
                            <tr key={n.id} className="border-b border-[#1a1a24] hover:bg-[#14141e]">
                              <td className="py-2 px-3 font-medium text-white">{n.name || n.id}</td>
                              <td className="py-2 px-3 font-mono text-[#a0a0b0]">{n.demand} orders</td>
                              <td className="py-2 px-3 font-mono text-blue-400">{w ? `${w.name} (${w.id})` : isUnserved ? '—' : 'Auto-routed'}</td>
                              <td className="py-2 px-3 font-mono text-[#a0a0b0]">
                                {w ? `${Math.hypot(n.x - w.x, n.y - w.y).toFixed(2)} km` : '—'}
                              </td>
                              <td className="py-2 px-3">
                                {isUnserved ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20">UNSERVED</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">COVERED</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB 3: Infrastructure vs Delivery Cost Trade-Off Sweep (Bonus 8) */}
          {activeTab === 'sweep' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                        Network Cost Curve: Infrastructure Setup vs. Delivery Mileage (k = 1..N)
                      </span>
                      <p className="text-[11px] text-[#6b6b80] mt-0.5">
                        Trade-off: TotalCost(k) = DeliveryCost(k) + k × FixedSetupCost. The minimum of this curve indicates the optimal fleet size.
                      </p>
                    </div>
                    <Button variant="primary" size="sm" loading={sweepLoading} onClick={runSweep}>
                      Re-run Sweep
                    </Button>
                  </div>
                </CardHeader>
                <CardBody>
                  {sweepData.length > 0 ? (
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sweepData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                          <XAxis dataKey="k" label={{ value: 'Number of Open Warehouses (k)', position: 'insideBottom', offset: -10, fill: '#8080a0', fontSize: 11 }} tick={{ fill: '#8080a0', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#8080a0', fontSize: 11 }} tickFormatter={v => `$${v}`} />
                          <Tooltip
                            contentStyle={{ background: '#111118', border: '1px solid #2a2a3a', borderRadius: 8, fontSize: 11 }}
                            formatter={(v: any) => fmtCurrency(Number(v))}
                          />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                          <Line type="monotone" dataKey="deliveryCost" name="Delivery Cost (Variable)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="infraCost" name="Fixed Hub Setup Cost" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="totalCost" name="Grand Total Cost" stroke="#22c55e" strokeWidth={3} dot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-16">
                      <BarChart3 size={32} className="mx-auto text-[#2a2a3a] mb-3" />
                      <p className="text-xs text-[#8080a0]">Click <strong>k-Sweep Curve</strong> to compute costs across k = 1..{wh.length} candidate hubs.</p>
                      <Button variant="primary" size="sm" onClick={runSweep} className="mt-3">Compute Cost Curve</Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB 4: Weiszfeld Geometric Median Center */}
          {activeTab === 'median' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                    Weiszfeld Demand-Weighted Continuous Geometric Median (k = 1)
                  </span>
                </CardHeader>
                <CardBody className="space-y-4">
                  <p className="text-xs text-[#a0a0b0] leading-relaxed">
                    The <strong>Weiszfeld Algorithm</strong> solves the continuous Fermat-Weber location problem:
                    <br />
                    <code className="text-blue-400 font-mono text-[11px] block my-2 p-2 bg-[#111118] rounded border border-[#1e1e2e]">
                      min_(x,y) ∑ D_i · √((x - x_i)² + (y - y_i)²)
                    </code>
                    Unlike a simple center of mass (centroid/mean) which minimizes <em>squared</em> Euclidean distances and over-weights remote outliers, the geometric median minimizes the direct sum of weighted distances—representing true transportation cost.
                  </p>

                  {medianResult ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-[#141420] border border-[#222234]">
                        <div className="text-[10px] font-mono text-[#8080a0]">OPTIMAL CONTINUOUS COORDINATE</div>
                        <div className="text-xl font-bold font-mono text-white mt-1">
                          ({medianResult.x.toFixed(4)}, {medianResult.y.toFixed(4)})
                        </div>
                        <p className="text-[11px] text-[#6b6b80] mt-1">Exact global Fermat-Weber median</p>
                      </div>
                      <div className="p-4 rounded-xl bg-[#141420] border border-[#222234]">
                        <div className="text-[10px] font-mono text-[#8080a0]">CLOSEST CANDIDATE DOCK</div>
                        <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                          {medianResult.nearestWarehouse}
                        </div>
                        <p className="text-[11px] text-[#6b6b80] mt-1">Optimal discrete hub recommendation</p>
                      </div>
                      <div className="p-4 rounded-xl bg-[#141420] border border-[#222234]">
                        <div className="text-[10px] font-mono text-[#8080a0]">PROXIMITY OFFSET</div>
                        <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                          {medianResult.distanceToNearest.toFixed(2)} km
                        </div>
                        <p className="text-[11px] text-[#6b6b80] mt-1">Distance between ideal point and real site</p>
                      </div>
                    </div>
                  ) : (
                    <Button variant="primary" size="sm" onClick={runWeiszfeld}>Compute Weiszfeld Median Point</Button>
                  )}
                </CardBody>
              </Card>
            </div>
          )}
          {/* TAB 5: Expansion Advisor */}
          {activeTab === 'expand' && (
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
              <div className="space-y-4">
                <Card>
                  <CardHeader><span className="text-sm font-medium text-white">Demand Growth What-If</span></CardHeader>
                  <CardBody className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs text-[#5a5a70] mb-1">
                        <span>Demand surge</span>
                        <span className="font-mono text-white">+{expGrowth}%</span>
                      </div>
                      <input type="range" min={5} max={150} step={5} value={expGrowth}
                        onChange={e => setExpGrowth(+e.target.value)}
                        className="w-full h-1 accent-blue-500 cursor-pointer" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-[#5a5a70] mb-1">
                        <span>Utilization threshold</span>
                        <span className="font-mono text-white">{expThr}%</span>
                      </div>
                      <input type="range" min={60} max={98} step={1} value={expThr}
                        onChange={e => setExpThr(+e.target.value)}
                        className="w-full h-1 accent-blue-500 cursor-pointer" />
                    </div>
                    <Button variant="primary" size="sm" className="w-full" loading={expRunning} onClick={runExpansion}>
                      {expRunning ? <><Loader2 size={13} className="animate-spin" /> Analyzing…</> : <><TrendingUp size={13} /> Recommend Expansion Plan</>}
                    </Button>
                    <div className="text-[10px] text-[#4a4a60] text-center font-mono">
                      solver: {algo === 'median' ? 'localsearch' : algo} · computed from your data &amp; seed
                    </div>
                    {expRes && (
                      <div className="pt-2 border-t border-[#1e1e2e] space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-[#5a5a70]">Grown demand</span><span className="font-mono text-white">{expRes.grownDemandTotal}/day</span></div>
                        <div className="flex justify-between"><span className="text-[#5a5a70]">Peak utilization</span><span className="font-mono"><span className="text-red-400">{Math.round(expRes.base.maxUtil * 100)}%</span> → <span className="text-emerald-400">{Math.round(expRes.final.maxUtil * 100)}%</span></span></div>
                        <div className="flex justify-between"><span className="text-[#5a5a70]">Unserved areas</span><span className="font-mono"><span className="text-red-400">{expRes.savings.unservedBefore}</span> → <span className="text-emerald-400">{expRes.savings.unservedAfter}</span></span></div>
                        <div className="flex justify-between"><span className="text-[#5a5a70]">Delivery cost</span><span className="font-mono text-white">{fmtCurrency(expRes.base.totalCost)} → {fmtCurrency(expRes.final.totalCost)}</span></div>
                      </div>
                    )}
                  </CardBody>
                </Card>

                {expRes && (expRes.expansions.length > 0 || expRes.proposal) && (
                  <Card>
                    <CardHeader><span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">Recommended Actions</span></CardHeader>
                    <CardBody className="space-y-3">
                      {expRes.expansions.map(e => (
                        <div key={e.id} className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-amber-300 flex items-center gap-1.5"><ArrowRight size={12} /> Expand {e.name}</span>
                            <span className="font-mono text-amber-300">+{e.addUnits} units</span>
                          </div>
                          <div className="text-[10px] text-[#8080a0] mt-1 font-mono">
                            capacity {e.capacityFrom} → {e.capacityTo} · was {Math.round(e.utilBefore * 100)}% full
                          </div>
                        </div>
                      ))}
                      {(expRes.proposals && expRes.proposals.length ? expRes.proposals : (expRes.proposal ? [expRes.proposal] : [])).map(p => (
                        <div key={p.id} className="p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/20">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-violet-300 flex items-center gap-1.5"><MapPin size={12} /> Open {p.id}</span>
                            <span className="font-mono text-violet-300">cap {p.capacity}</span>
                          </div>
                          <div className="text-[10px] text-[#8080a0] mt-1 font-mono">
                            @ ({p.x}, {p.y}) · setup {fmtCurrency(p.fixedCost)} · covers {p.catchment} stressed areas
                          </div>
                          {p.note && <div className="text-[10px] text-[#4a4a60] mt-0.5">{p.note}</div>}
                        </div>
                      ))}
                      {!expRes.proposal && expRes.expansions.length === 0 && (
                        <div className="text-xs text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={13} /> No expansion needed at this growth level.</div>
                      )}
                    </CardBody>
                  </Card>
                )}
              </div>

              {/* Map + LLM summary */}
              <div className="xl:col-span-3 space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between w-full flex-wrap gap-2">
                      <span className="text-sm font-medium text-white">Expansion Plan Map (+{expGrowth}% demand)</span>
                      <div className="flex items-center gap-3 text-[10px] text-[#8080a0] font-mono">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-red-500 inline-block" /> Overloaded</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-amber-500 inline-block" /> Capacity Boost</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-violet-400 inline-block" /> New Warehouse</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardBody>
                    <div className="h-[430px] rounded-lg border border-[#1e1e2e] bg-[#0d0f1a] overflow-hidden">
                      <WloMapSVG
                        neighborhoods={scaledNb}
                        warehouses={wh}
                        result={(expRes ? {
                          openWarehouses: expRes.final.openWarehouses,
                          utilization: expRes.final.utilization,
                          unserved: expRes.final.unserved,
                          assignments: expRes.final.assignments,
                        } : result) as any}
                        expansion={expRes as any}
                        zoom={mapZoom}
                        onSelect={setMapSelection}
                      />
                    </div>
                  </CardBody>
                </Card>

                {expRes?.summary && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between w-full">
                        <span className="text-sm font-medium text-white flex items-center gap-1.5"><Sparkles size={14} className="text-violet-400" /> AI Executive Summary</span>
                        <Badge variant={expRes.narrVia?.startsWith('llm') ? 'info' : 'muted'}>{expRes.narrVia}</Badge>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <StepNarration lines={expRes.summary} via={expRes.narrVia} />
                    </CardBody>
                  </Card>
                )}
                {!expRan && !expRunning && (
                  <div className="text-center py-10 text-[#6b6b80]">
                    <TrendingUp size={26} className="mx-auto text-[#2a2a3a] mb-2" />
                    <p className="text-xs">Set a demand surge and run the advisor to see which warehouses to expand,<br />where to open a new one, and an AI summary of the plan.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="optimization-tools-row flex items-center justify-end gap-2 px-6 py-2 border-t border-[#1e1e2e] bg-[#0b1420]">
        <span className="mr-2 text-[10px] font-mono uppercase tracking-wider text-[#617892]">Secondary tools</span>
        <Button variant="outline" size="sm" loading={sweepLoading} onClick={runSweep} className="text-[11px] flex items-center gap-1" title="Sweep k=1..N to find optimal infrastructure vs delivery trade-off curve"><BarChart3 size={13} />k-Sweep Curve</Button>
        <Button variant="outline" size="sm" onClick={runWeiszfeld} className="text-[11px] flex items-center gap-1" title="Find continuous demand-weighted geometric median center"><Compass size={13} />Weiszfeld (k=1)</Button>
      </div>
    </div>
  );
}

// ----------------- SVG MAP CANVAS HELPER -----------------
function WloMapSVG({
  neighborhoods,
  warehouses,
  result,
  zoom,
  onSelect,
  expansion,
}: {
  neighborhoods: (Point & { demand: number })[];
  warehouses: Candidate[];
  result?: OptResult | null;
  zoom: number;
  onSelect: (item: { kind: 'demand' | 'warehouse'; id: string; label: string; detail: string }) => void;
  expansion?: any;
}) {
  const xs = [...neighborhoods.map(n => n.x), ...warehouses.map(w => w.x)];
  const ys = [...neighborhoods.map(n => n.y), ...warehouses.map(w => w.y)];
  const allProposals = expansion
    ? (expansion.proposals && expansion.proposals.length ? expansion.proposals : (expansion.proposal ? [expansion.proposal] : []))
    : [];
  allProposals.forEach(p => { xs.push(p.x); ys.push(p.y); });

  const minX = xs.length ? Math.min(...xs) - 0.005 : 12.9;
  const maxX = xs.length ? Math.max(...xs) + 0.005 : 13.0;
  const minY = ys.length ? Math.min(...ys) - 0.005 : 77.5;
  const maxY = ys.length ? Math.max(...ys) + 0.005 : 77.6;

  const dx = Math.max(0.001, maxX - minX);
  const dy = Math.max(0.001, maxY - minY);

  const W = 800;
  const H = 550;

  const toX = (x: number) => ((x - minX) / dx) * (W - 80) + 40;
  const toY = (y: number) => ((y - minY) / dy) * (H - 80) + 40;

  const safeZoom = Math.max(0.5, zoom || 1);
  const openIds = new Set(result?.openWarehouses || []);
  // assignments may arrive as {nid: wid} record or [{neighborhoodId, warehouseId}] array
  const assignedRaw: any = result?.assignments || {};
  const assigned: Record<string, string> = Array.isArray(assignedRaw)
    ? Object.fromEntries(assignedRaw.map((a: any) => [a.neighborhoodId, a.warehouseId]))
    : assignedRaw;
  const maxDemand = Math.max(...neighborhoods.map(n => n.demand), 1);

  // expansion overlays: overloaded hubs, capacity boosts, proposed new site
  const finalAsgRaw: any = expansion?.final?.assignments || {};
  const finalAsg: Record<string, string> = Array.isArray(finalAsgRaw)
    ? Object.fromEntries(finalAsgRaw.map((a: any) => [a.neighborhoodId, a.warehouseId]))
    : finalAsgRaw;
  const overloaded = (expansion?.base?.utilization || []).filter((u: any) => u.u >= (expansion?.utilThreshold ?? 0.85));

  return (
    <svg
      viewBox={`${(W - W / safeZoom) / 2} ${(H - H / safeZoom) / 2} ${W / safeZoom} ${H / safeZoom}`}
      className="w-full h-full select-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background Grid */}
      {Array.from({ length: 16 }, (_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 40} x2={W} y2={i * 40} stroke="#141426" strokeWidth="1" />
      ))}
      {Array.from({ length: 22 }, (_, i) => (
        <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2={H} stroke="#141426" strokeWidth="1" />
      ))}

      {/* Assignment Lines */}
      {Object.entries(assigned).map(([nid, wid]) => {
        const n = neighborhoods.find(x => x.id === nid);
        const w = warehouses.find(x => x.id === wid);
        if (!n || !w || !openIds.has(wid)) return null;
        return (
          <line
            key={nid}
            x1={toX(n.x)}
            y1={toY(n.y)}
            x2={toX(w.x)}
            y2={toY(w.y)}
            stroke="#3b82f6"
            strokeWidth="1.2"
            strokeOpacity="0.25"
            strokeDasharray="3 3"
          />
        );
      })}

      {/* Service Radius Rings */}
      {warehouses.filter(w => openIds.has(w.id)).map(w => (
        <circle
          key={w.id}
          cx={toX(w.x)}
          cy={toY(w.y)}
          r={75}
          fill="#3b82f6"
          fillOpacity="0.03"
          stroke="#3b82f6"
          strokeWidth="1"
          strokeDasharray="4 4"
          strokeOpacity="0.3"
        />
      ))}

      {/* Neighborhood Nodes */}
      {neighborhoods.map(n => {
        const r = 4 + (n.demand / maxDemand) * 8;
        const isUnserved = result?.unserved?.includes(n.id);
        const wid = assigned[n.id];
        const w = warehouses.find(x => x.id === wid);

        return (
          <g
            key={n.id}
            className="cursor-pointer group"
            onClick={() => onSelect({
              kind: 'demand',
              id: n.id,
              label: n.name || n.id,
              detail: `Daily demand: ${n.demand} orders · Assigned to: ${w ? w.name || w.id : isUnserved ? 'None (Unserved)' : 'Auto-routed'}`,
            })}
          >
            <title>{`${n.name || n.id}: ${n.demand} orders`}</title>
            <circle cx={toX(n.x)} cy={toY(n.y)} r={r + 4} fill={isUnserved ? '#ef4444' : '#3b82f6'} fillOpacity="0.1" />
            <circle
              cx={toX(n.x)}
              cy={toY(n.y)}
              r={r}
              fill={isUnserved ? '#ef4444' : '#1e3a5f'}
              stroke={isUnserved ? '#fca5a5' : '#60a5fa'}
              strokeWidth={isUnserved ? 2 : 1}
            />
            <text
              x={toX(n.x)}
              y={toY(n.y) + r + 10}
              textAnchor="middle"
              fontSize="9"
              fill="#8080a0"
              fontFamily="system-ui, sans-serif"
            >
              {n.name || n.id}
            </text>
          </g>
        );
      })}

      {/* Warehouse Candidate / Open Hub Nodes */}
      {warehouses.map(w => {
        const isOpen = openIds.has(w.id);
        const u = result?.utilization?.find(x => x.id === w.id);

        return (
          <g
            key={w.id}
            className="cursor-pointer"
            onClick={() => onSelect({
              kind: 'warehouse',
              id: w.id,
              label: w.name || w.id,
              detail: `${isOpen ? 'Open Hub' : 'Candidate Site'} · Capacity: ${w.capacity} · Fixed setup: $${w.fixedCost}${u ? ` · ${Math.round(u.u * 100)}% utilized` : ''}`,
            })}
          >
            <title>{`${w.name || w.id}: ${isOpen ? 'OPEN' : 'Candidate'}, Cap: ${w.capacity}`}</title>
            <circle
              cx={toX(w.x)}
              cy={toY(w.y)}
              r={isOpen ? 16 : 12}
              fill={isOpen ? '#22c55e' : '#1e1e2e'}
              fillOpacity={isOpen ? 0.2 : 0.6}
              stroke={isOpen ? '#4ade80' : '#4a4a60'}
              strokeWidth={isOpen ? 2 : 1}
            />
            <rect
              x={toX(w.x) - 7}
              y={toY(w.y) - 5}
              width={14}
              height={10}
              rx={2}
              fill={isOpen ? '#22c55e' : '#3a3a50'}
            />
            <text
              x={toX(w.x)}
              y={toY(w.y) - 14}
              textAnchor="middle"
              fontSize="10"
              fontWeight="bold"
              fill={isOpen ? '#4ade80' : '#8080a0'}
              fontFamily="monospace"
            >
              {w.name || w.id}
            </text>
            {isOpen && u && (
              <text
                x={toX(w.x)}
                y={toY(w.y) + 18}
                textAnchor="middle"
                fontSize="9"
                fill="#4ade80"
                fontFamily="monospace"
              >
                {Math.round(u.u * 100)}%
              </text>
            )}
          </g>
        );
      })}
      {/* ---- Expansion Advisor Overlays ---- */}
      {expansion && (
        <>
          {/* red ring: hubs overloaded at grown demand (before plan) */}
          {overloaded.map((u: any) => {
            const w = warehouses.find(x => x.id === u.id);
            if (!w) return null;
            return (
              <circle key={`ovl-${u.id}`} cx={toX(w.x)} cy={toY(w.y)} r={22}
                fill="#ef4444" fillOpacity="0.06" stroke="#ef4444" strokeWidth="2"
                strokeDasharray="5 3" strokeOpacity="0.8" />
            );
          })}
          {/* amber ring: capacity boost */}
          {(expansion.expansions || []).map((e: any) => {
            const w = warehouses.find(x => x.id === e.id);
            if (!w) return null;
            return (
              <g key={`exp-${e.id}`}>
                <circle cx={toX(w.x)} cy={toY(w.y)} r={26}
                  fill="#f59e0b" fillOpacity="0.08" stroke="#f59e0b" strokeWidth="2" />
                <text x={toX(w.x)} y={toY(w.y) - 30} textAnchor="middle" fontSize="11"
                  fontWeight="bold" fill="#fbbf24" fontFamily="monospace">
                  +{e.addUnits}
                </text>
              </g>
            );
          })}
          {/* violet: proposed new warehouses + their catchment lines */}
          {allProposals.map(p => (
            <g key={'proposal-' + p.id}>
              {Object.entries(finalAsg).filter(([, wid]) => wid === p.id).map(([nid]) => {
                const n = neighborhoods.find(x => x.id === nid);
                if (!n) return null;
                return (
                  <line key={`pl-${nid}`} x1={toX(n.x)} y1={toY(n.y)}
                    x2={toX(p.x)} y2={toY(p.y)} stroke="#a78bfa" strokeWidth="1.2"
                    strokeOpacity="0.5" strokeDasharray="2 3" />
                );
              })}
              <circle cx={toX(p.x)} cy={toY(p.y)} r={20}
                fill="#8b5cf6" fillOpacity="0.15" stroke="#a78bfa" strokeWidth="2" />
              <rect x={toX(p.x) - 8} y={toY(p.y) - 3} width={16} height={8} rx={2} fill="#8b5cf6" />
              <text x={toX(p.x)} y={toY(p.y) - 26} textAnchor="middle" fontSize="11"
                fontWeight="bold" fill="#c4b5fd" fontFamily="monospace">
                {p.id} · NEW
              </text>
              <text x={toX(p.x)} y={toY(p.y) + 34} textAnchor="middle" fontSize="9"
                fill="#a78bfa" fontFamily="monospace">
                cap {p.capacity}
              </text>
            </g>
          ))}
        </>
      )}
    </svg>
  );
}
