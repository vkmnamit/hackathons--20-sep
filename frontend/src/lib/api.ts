// Typed API client for the WLO backend (Node.js stdlib server on :4000).
// Keep the fallback empty: `'/' + '/api/...'` becomes `//api/...`, which the
// browser treats as a request to a different host named `api` instead of the
// Vite `/api` proxy.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function get<T>(p: string, token?: string): Promise<T> {
  const u = BASE + p;
  const h: Record<string, string> = {};
  if (token) h['Authorization'] = 'Bearer ' + token;
  let r: Response;
  try { r = await fetch(u, { headers: h }); }
  catch { throw new Error('Cannot reach the backend. Start it with `npm start` in the project root, then retry.'); }
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(t || r.statusText); }
  return r.json() as Promise<T>;
}
async function post<T>(p: string, body: unknown, token?: string): Promise<T> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  let r: Response;
  try { r = await fetch(BASE + p, { method: 'POST', headers: h, body: JSON.stringify(body) }); }
  catch { throw new Error('Cannot reach the backend. Start it with `npm start` in the project root, then retry.'); }
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(t || r.statusText); }
  return r.json() as Promise<T>;
}

export const api = {
  health: () => get<{ ok: boolean; wlopt: string; time: string; llm: string; db: string }>('/api/health'),
  demo: () => get<DemoData>('/api/demo'),
  bengaluru: () => get<DemoData & { meta: { city: string; areas: string[]; note: string } }>('/api/bengaluru'),
  generate: (opts: Partial<GenOpts>) => post<DemoData>('/api/generate', opts),
  optimize: (body: OptBody) => post<OptResult>('/api/optimize', body),
  sweep: (body: OptBody & { fixedSetupCost?: number; maxK?: number }) =>
    post<{ sweep: { k: number; deliveryCost: number; fixedCost: number; infraCost: number; totalCost: number; openWarehouses: string[]; unserved: number; algorithmUsed: string; error?: string }[]; note: string }>('/api/sweep', body),
  compare: (body: CompareBody) => post<CompareResult>('/api/compare', body),
  simulate: (body: SimBody) => post<SimResult>('/api/simulate', body),
  expansion: (body: { neighborhoods: Point[]; candidates: Candidate[]; params?: Params; expansion?: { growthPct?: number; utilThreshold?: number; newFixedCost?: number; buffer?: number; maxNewWarehouses?: number } }) =>
    post<ExpansionResult>('/api/expansion', body),
  insights: (body: { solution: OptResult; candidates: Candidate[]; params?: Params; savingsPct?: number; nbCount?: number }) =>
    post<AiInsights>('/api/optimize/insights', body),
  sensitivity: (body: SensBody) => post<SensResult>('/api/sensitivity', body),
  median: (body: MedBody) => post<MedResult>('/api/median', body),
  explain: (body: OptBody) => post<OptResult & { explanation?: string[] }>('/api/explain', body),
  year: (body: YearBody) => post<YearResult>('/api/year', body),
  share: (body: ShareBody) => post<{ warehouses: TenantWarehouse[] }>('/api/share', body),
  tenants: (body: TenantsBody) => post<TenantsResult>('/api/tenants', body),
  login: (body: { email: string; password: string }) => post<AuthToken>('/api/auth/login', body),
  signup: (body: { email: string; password: string; companyName: string }) => post<AuthToken>('/api/auth/signup', body),
  saveDataset: (body: { neighborhoods: Point[]; candidates: Candidate[] }, token: string) => post<{ saved: boolean; via: string }>('/api/datasets', body, token),
  history: (token?: string) => get<{ runs: HistoryRun[]; via: string }>('/api/history', token),
  forecast: (body: { history: Record<string, number[]>; horizon?: number }) =>
    post<{ forecasts: Record<string, { movingAvg: number; trend: number; forecast: number[] }> }>('/api/forecast', body),
  // ---- operational fulfillment layer ----
  fulfillDemo: (opts?: { seed?: number; orders?: number; neighborhoods?: Point[]; warehouses?: Candidate[] }) =>
    post<FulfillDemo>('/api/fulfill/demo', {
      seed: opts?.seed, orders: opts?.orders,
      neighborhoods: opts?.neighborhoods, warehouses: opts?.warehouses,
    }),
  fulfill: (body: FulfillBody) => post<FulfillPlan>('/api/fulfill', body),
  inventory: (body: InventoryBody) => post<InventoryResult>('/api/inventory', body),
  rebalance: (body: RebalanceBody) => post<RebalanceResult>('/api/rebalance', body),
  storage: (body: StorageBody) => post<StorageResult>('/api/storage', body),
  warehouses: () => get<WarehousesResult>('/api/warehouses'),
  saveWarehouses: (body: { warehouses: FulfillWarehouse[] }) =>
    post<WarehousesResult & { saved: boolean; count: number }>('/api/warehouses', body),
};

// ---------- types matching backend wlopt JSON ----------
export type Point = { id: string; x: number; y: number; demand?: number; name?: string };
export type Candidate = Point & { fixedCost: number; capacity: number; name?: string };

export interface DemoData {
  neighborhoods: Point[];
  candidates: Candidate[];
}

export interface GenOpts {
  neighborhoods?: number;
  candidates?: number;
  seed?: number;
  mode?: string;
  capacity?: number;
  fixedCost?: number;
}

export interface Params {
  deliveryCostPerKm?: number;
  maxServiceRadius?: number;
  minWarehouses?: number;
  maxWarehouses?: number;
  algorithm?: string;
  distanceMetric?: string;
  roadFactor?: number;
  saIterations?: number;
  capacity?: number;
  fixedCost?: number;
  randomSeed?: number;
  [k: string]: any;
}

export interface OptBody {
  neighborhoods: Point[];
  candidates: Candidate[];
  params?: Params;
  mode?: string;
  explain?: boolean;
}

export interface OptResult {
  openWarehouses: string[];
  assignments: Record<string, string>;
  totalCost: number;
  deliveryCost: number;
  fixedCost: number;
  avgDistance: number;
  runtimeMs: number;
  algorithmUsed: string;
  optimal?: boolean;
  unserved?: string[];
  loads?: { id: string; load: number }[];
  utilization?: { id: string; u: number }[];
  savingsPct?: number;
  infraCost?: number;
  grandTotal?: number;
  baselineSingle?: { total?: number; open: string[]; cost?: number; savingsPct?: number };
  explanation?: string[];
}

export interface CompareBody { neighborhoods: Point[]; candidates: Candidate[]; params?: Params; }

export interface CompareResult { results: OptResult[]; note?: string; }

export interface SimBody { neighborhoods: Point[]; candidates: Candidate[]; params?: Params; scenarios?: number; samples?: number; dist?: string; cv?: number; growthPct?: number; growthMult?: number; }

export interface SimResult {
  expectedTotal: number;
  p90: number;
  worst: number;
  best: number;
  avgFixed: number;
  totals: number[];
  formula: string;
  distribution?: { cost: number; density: number }[];
  samples?: number;
  note?: string;
  growthPct?: number;
  growthMult?: number;
  expectedNetwork?: { openWarehouses: string[]; unserved: string[]; totalCost: number; warehouseLoads: { id: string; name: string; load: number; capacity: number; util: number }[] } | null;
  grownDemand?: Record<string, number>;
  summary?: string[];
  narrVia?: string;
}

export interface AiInsights { summary: string[]; narrVia: string; }

export interface SensBody { neighborhoods: Point[]; candidates: Candidate[]; params?: Params; }

// ---- Expansion advisor (demand-growth what-if on the optimization page) ----
export interface ExpansionAction {
  id: string; name?: string; utilBefore: number;
  capacityFrom: number; capacityTo: number; addUnits: number;
}
export interface ExpansionProposal {
  id: string; name?: string; x: number; y: number; lat?: number; lng?: number;
  capacity: number; fixedCost: number; catchment?: number; note?: string;
}
export interface ExpansionResult {
  growthPct: number; utilThreshold: number; grownDemandTotal: number;
  grownDemand?: Record<string, number>;
  base: { openWarehouses: string[]; utilization: { id: string; u: number }[]; unserved: string[]; totalCost: number; maxUtil: number; warehouseLoads?: { id: string; name: string; load: number; capacity: number; util: number }[]; };
  expansions: ExpansionAction[]; proposal: ExpansionProposal | null; proposals?: ExpansionProposal[];
  final: { openWarehouses: string[]; utilization: { id: string; u: number }[]; unserved: string[]; totalCost: number; maxUtil: number; assignments?: Record<string, string> | { neighborhoodId: string; warehouseId: string }[]; warehouseLoads?: { id: string; name: string; load: number; capacity: number; util: number }[]; };
  savings: { savedPerPeriod: number; unmetBefore: number; unmetAfter: number; unservedBefore: number; unservedAfter: number; paybackDays: number | null };
  summary?: string[]; narrVia?: string;
}

export interface SensRow {
  algo: string;
  mult: number;
  open: string[];
  total: number;
  delivery?: number;
  fixed?: number;
}
export interface SensResult {
  demandGrowth: SensRow[];
  fuelSweep: SensRow[];
  note: string;
}

export interface MedBody { neighborhoods: Point[]; iterations?: number; initial?: { x: number; y: number }; }

export interface MedResult {
  centroid: { x: number; y: number };
  centroidCost: number;
  median: { x: number; y: number };
  weberCost: number;
  // /api/median also reports the Weiszfeld point directly plus the nearest
  // candidate hub, which the Optimization page surfaces.
  x: number; y: number;
  nearestWarehouse: string; distanceToNearest: number;
}

export interface YearBody {
  neighborhoods: Point[];
  candidates: Candidate[];
  params?: Params;
  year?: {
    months?: number;
    dailyGrowthPct?: number;
    hotspotMult?: number;
    weeklyAmp?: number;
    annualAmp?: number;
    noiseCv?: number;
    utilThreshold?: number;
    newCapacity?: number;
    newFixedCost?: number;
    kmPerHour?: number;
    wagePerHour?: number;
    litresPerKm?: number;
    fuelPrice?: number;
  };
}

export interface YearCurveRow {
  month: number;
  day: number;
  avgDayCost: number;
  delivery?: number;
  fixed?: number;
  maxUtil: number;
  unserved?: number;
  avgKm?: number;
  open: string[];
}
export interface YearCurveRowNew {
  month: number;
  day: number;
  avgDayCost: number;
  maxUtil: number;
  open: string[];
}

export interface YearProposal { id: string; x: number; y: number; lat?: number; lng?: number; fixedCost: number; capacity: number; catchment?: number; note: string; }

export interface YearResult {
  baseSolMonth0: OptResult;
  newSolEnd: OptResult;
  firstPressure: { month: number; day: number; maxUtil: number; unserved: number; avgKm: number } | null;
  proposal: YearProposal | null;
  proposals?: YearProposal[];
  hotspot?: { x: number; y: number };
  hotspotMode?: string;
  stats: {
    money: { deliverySaved: number; yearBase: number; yearNew: number; avgDaySave: number; paybackDays: number };
    kmSaved: number;
    driveHrsSaved: number;
    labourSaved: number;
    fuelSaved: number;
  };
  curve: YearCurveRow[];
  curveNew: YearCurveRowNew[];
  saved: number;
  totalYearBase: number;
  totalYearNew: number;
  narrVia?: string;
  narration?: string[];
  params?: any;
  year?: any;
}


export interface TenantWarehouse {
  id: string;
  name: string;
  x: number;
  y: number;
  fixedCost: number;
  capacity: number;
  owner: string;
  visibility: 'solo' | 'shared' | 'open';
  partners: Record<string, { sharePct: number; fixedPct: number }>;
}

export interface TenantsBody {
  companies: { id: string; name: string }[];
  warehouses: TenantWarehouse[];
  demands: Record<string, Point[]>;
  params?: Params;
}

export interface TenantsResult {
  companies: { id: string; name: string }[];
  warehouses: TenantWarehouse[];
  views: Record<string, TenantWarehouse[]>;
  solo: Record<string, OptResult>;
  joint: OptResult;
  compare: {
    soloTotal: number;
    jointTotal: number;
    saved: number;
    savedPct: number;
    perCompany: { companyId: string; companyName: string; soloCost: number; jointShare: number; saved: number; savedPct: number }[];
  };
  note: string;
}

export interface ShareBody { warehouses: TenantWarehouse[]; op: { type: 'setSolo' | 'setShared' | 'setOpen' | 'agree' | 'close'; whId: string; partner?: string; sharePct?: number; fixedPct?: number } }

export interface AuthToken { token: string; user: { email: string; companyId: string; companyName: string; role: string; datasetSize?: number; seed?: number; warehouseCapacity?: number } }

export interface HistoryRun { id: string; name: string; algorithm: string; warehouse_count: number; total_cost: number; avg_distance: number; runtime_ms: number; created_at: string }

// ================= operational fulfillment layer (LogiOpt) =================
// Order allocation -> dispatch scheduling -> delivery assignment -> inventory,
// backed by cpp/wlopt modes fulfill | rebalance | storeopt.
export interface FulfillProduct {
  id: string; name?: string; unitValue?: number; weightKg?: number;
  volumeM3?: number; holdingCostPerUnitDay?: number;
}

export interface FulfillVehicle {
  id: string; capacityUnits?: number; capacityKg?: number; capacityM3?: number;
  costPerKm?: number; speedKmH?: number; driverCostPerTrip?: number; maxStops?: number;
}

export interface WarehouseIncoming { productId: string; qty: number; etaHr?: number }

export interface FulfillWarehouse {
  id: string; name?: string; x: number; y: number;
  capacity?: number; storageM3?: number; throughputPerHr?: number;
  handlingCostPerUnit?: number; fixedOperatingCost?: number; open?: boolean;
  waves?: number[]; stock?: Record<string, number>; reserved?: Record<string, number>;
  incoming?: WarehouseIncoming[]; vehicles?: FulfillVehicle[];
}

export interface OrderLineIn {
  productId: string; qty: number; unitPrice?: number;
  weightKg?: number; volumeM3?: number;
  weightKgPerUnit?: number; volumeM3PerUnit?: number;
  weightKgTotal?: number; volumeM3Total?: number;
}

export type Priority = 'standard' | 'express' | 'critical';

export interface FulfillOrderIn {
  id: string; customerId?: string; customerName?: string; x: number; y: number;
  placedHr?: number; dueHr: number; priority?: Priority | number;
  lines: OrderLineIn[];
}

export interface FulfillParamsIn {
  deliveryCostPerKm?: number; shipmentFixedCost?: number; handlingCostPerUnit?: number;
  latePenaltyPerHr?: number; transferCostPerKmPerUnit?: number;
  kmPerHour?: number; roadFactor?: number; pickMinPerOrder?: number; packMinPerOrder?: number;
  allowLate?: boolean; maxLateHr?: number; maxServiceRadius?: number;
  maxSplitShipments?: number; strategy?: 'cost' | 'speed' | 'balanced' | 'green';
  distanceMetric?: string; improvementPasses?: number;
  serviceMinPerStop?: number; waveSlackMin?: number;
}

export type DemandMap = Record<string, Record<string, number>>;

export interface FulfillDemo {
  products: FulfillProduct[];
  warehouses: FulfillWarehouse[];
  orders: FulfillOrderIn[];
  demand: DemandMap;
  params: FulfillParamsIn;
  note: string;
  source?: 'dataset' | 'demo';
  warehouseVia?: string;
}

export interface WarehousesResult {
  warehouses: FulfillWarehouse[];
  via: string;
  updatedAt?: string | null;
}

export interface FulfillBody {
  warehouses: FulfillWarehouse[];
  orders: FulfillOrderIn[];
  products?: FulfillProduct[];
  demand?: DemandMap;
  params?: FulfillParamsIn;
  options?: { commit?: boolean; includeRoutes?: boolean; includeStorage?: boolean; includeRebalance?: boolean };
  inventory?: InventoryState;
  useStored?: boolean;
  stockoutPenaltyPerUnit?: number;
}

export interface CandidateRow {
  warehouseId: string; name: string; distKm: number; transitHr: number; handlingHr: number;
  etaHr: number; onHand: number; reserved: number; available: number;
  incomingByDue: number; feasible: boolean; reason: string;
}

export interface Assignment {
  key: string; orderId: string; productId: string; customerId: string; customerName: string;
  x: number; y: number; priority: Priority; dueHr: number;
  requestedQty: number; qty: number; split: boolean;
  warehouseId: string; warehouseName: string;
  distKm: number; transitHr: number; handlingHr: number; etaHr: number;
  departHr: number; cutoffHr: number; slackHr: number; lateHr: number; atRisk: boolean;
  wavePolicy: 'on-demand-immediate' | 'earliest-safe-wave' | 'latest-safe-wave' | 'first-wave' | string;
  deliveryCost: number; shipmentCost: number; handlingCost: number; latePenalty: number; totalCost: number;
  stockAtPick: { onHand: number; reserved: number; available: number; incomingByDue: number };
  tripId?: string; vehicleId?: string; stopSeq?: number; stopEtaHr?: number; stopLateHr?: number;
  candidates: CandidateRow[];
}

export interface TripStop {
  seq: number; orderId: string; customerId: string; customerName: string;
  x: number; y: number; units: number; weightKg: number;
  etaHr: number; dueHr: number; stopLateHr: number;
}

export interface Trip {
  tripId: string; warehouseId: string; warehouseName: string; vehicleId: string;
  departHr: number; returnHr: number; stopsCount: number; stops: TripStop[];
  loadUnits: number; loadKg: number; loadM3: number; loadPct: number;
  distanceKm: number; driveHr: number; cost: number;
  capacityUnits: number; speedKmH: number; vehicleReused?: boolean;
}

export interface DispatchWave { departHr: number; orders: number; units: number; trips: number }
export interface DispatchBoardRow { warehouseId: string; warehouseName: string; waves: DispatchWave[] }

export interface InventoryRow {
  warehouseId: string; warehouseName: string; productId: string;
  onHand: number; reserved: number; available: number;
  incomingQty: number; incoming: { qty: number; etaHr?: number }[];
  allocated: number; afterOnHand: number; afterAvailable: number; overloaded: boolean;
}

export interface FulfillOrderLineOut {
  productId: string; qty: number; allocated: number;
  warehouses: {
    warehouseId: string; warehouseName?: string; qty: number; tripId?: string; vehicleId?: string;
    departHr?: number; etaHr?: number; split: boolean; atRisk?: boolean;
  }[];
}

export interface FulfillOrderRow {
  orderId: string; customerId: string; customerName: string; x: number; y: number;
  priority: Priority; placedHr: number; dueHr: number;
  requestedUnits: number; fulfilledUnits: number;
  status: 'fulfilled' | 'partial' | 'unfulfilled';
  warehouses: string[]; shipments: number; cost: number;
  departHr: number | null; etaHr: number | null; slackHr: number | null;
  lateHr: number; onTime: boolean; lines: FulfillOrderLineOut[];
}

export interface FulfillUnfulfilled {
  orderId: string; productId: string; qty: number; reason: string;
  recovery: {
    type: 'backorder' | 'transfer' | 'lost';
    warehouseId?: string; qty?: number; etaHr?: number; distKm?: number; note: string;
  };
}

export interface FulfillTotals {
  deliveryCost: number; shipmentCost: number; handlingCost: number; latePenalty: number; totalCost: number;
  avgTransitHr: number; avgEtaHr: number; onTimePct: number; fillRate: number;
  lines: number; orders: number; shipments: number; splits: number;
  consolidatedOrders: number; lateLines: number;
  routeCost: number; routeKm: number; trips: number; vehiclesUsed: number; avgTruckLoadPct: number;
  atRiskLines: number; ordersUnfulfilled: number; ordersPartial: number; ordersFulfilled: number;
  linesRequested: number; linesUnfulfilled: number; sitesUsed: number;
  reasonCounts: Record<string, number>;
}

export interface StorageLevel {
  warehouseId: string; productId: string; onHand: number; expectedDemand: number;
  recommended: number; delta: number; cycleStock: number; safetyStock: number; reorderPoint: number;
  volumeUsed: number; unitValue: number; valueDensity: number; holdingCost: number;
  action: 'restock' | 'hold' | 'excess' | 'capacity_limited';
}

export interface StorageResult {
  levels: StorageLevel[];
  expectedDemand: number; expectedServed: number; coveragePct: number;
  volumeUsed: number; volumeCapacity: number; cubeUtilPct: number; holdingCostTotal: number;
  underStocked: string[]; excess: string[]; algorithmUsed: string; note: string;
}

export interface RebalanceMove { productId: string; from: string; to: string; qty: number; distKm: number; cost: number }

export interface RebalanceResult {
  moves: RebalanceMove[]; totalCost: number; movedUnits: number; unmetDeficit: number;
  productsRebalanced: number; benefit?: number; stockoutPenaltyPerUnit?: number;
  algorithmUsed: string; note: string; applied?: number;
}

export interface FulfillPlan {
  orders: FulfillOrderRow[]; assignments: Assignment[]; unfulfilled: FulfillUnfulfilled[];
  trips: Trip[]; dispatchBoard: DispatchBoardRow[];
  productWarehouseMap: Record<string, {
    warehouseId: string; warehouseName: string; onHand: number; reserved: number;
    available: number; incoming: number; allocated: number; afterOnHand: number;
  }[]>;
  inventory: InventoryRow[];
  loads: { id: string; units: number; capacity: number; usedPct: number; orders: number; stockUnits: number; laborHr: number }[];
  coverage: { productId: string; demandQty: number; allocatedQty: number; fillRate: number }[];
  totals: FulfillTotals;
  storage: StorageResult | null; rebalance: RebalanceResult | null;
  committed: { applied: number; units: number; inventory: InventoryState } | null;
  params: FulfillParamsIn; options: Record<string, boolean>; explain: string[];
  algorithmUsed: string; runtimeMs: number; note: string;
}

export type InventoryState = Record<string, Record<string, {
  onHand: number; reserved: number; incoming: { qty: number; etaHr?: number }[];
}>>;

export type InventoryOp =
  | { type: 'snapshot' | 'reset' }
  | { type: 'receive'; warehouseId: string; productId: string; qty: number; etaHr?: number }
  | { type: 'reserve' | 'release' | 'commit' | 'adjust'; warehouseId: string; productId: string; qty: number };

export interface InventoryBody {
  op: InventoryOp;
  warehouses?: { id: string; name?: string }[];
  inventory?: InventoryState;
}

export interface InventoryResult {
  result: {
    ok: boolean; type: string; error?: string; warehouseId?: string; productId?: string;
    qty?: number; onHand?: number; reserved?: number; available?: number;
  };
  inventory: InventoryState;
  rows: InventoryRow[];
}

export interface RebalanceBody {
  warehouses: FulfillWarehouse[]; orders?: FulfillOrderIn[]; demand?: DemandMap;
  params?: FulfillParamsIn; commit?: boolean; stockoutPenaltyPerUnit?: number;
}

export interface StorageBody {
  warehouses: FulfillWarehouse[]; products?: FulfillProduct[]; demand?: DemandMap;
  defaultVolumeM3?: number;
}
