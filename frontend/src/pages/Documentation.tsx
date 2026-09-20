import { useState } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ChevronDown, ChevronRight, BookOpen } from 'lucide-react';

const concepts = [
  {
    title: 'Order Allocation (operational layer)',
    tag: 'Fulfillment',
    formula: 'argmin_w  delivery + shipment + handling + late-penalty,  s.t. stock, radius, capacity',
    what: 'Every incoming order line is routed to the warehouse that minimizes the true cost of serving it — under stock, service-radius, vehicle-capacity and deadline constraints.',
    why: 'Strategic placement answers "where should the docks be". Allocation answers the question asked every second: "who ships THIS order".',
    example: 'A laptop ordered in Whitefield ships from Warehouse B because it has stock and arrives 2h sooner — even though Warehouse A is marginally closer.',
    impact: 'Decides the assignment, dispatch wave, vehicle trip, inventory deduction and explained trade-off shown on the Fulfillment page.',
  },
  {
    title: 'Weighted Distance',
    tag: 'Core Metric',
    formula: 'cost(i,j) = cₖₘ · dᵢⱼ · dⱼ',
    what: 'The cost of serving neighborhood j from warehouse i, weighted by demand volume.',
    why: 'High-demand areas cost more to serve at a distance — this captures real logistics pricing.',
    example: 'A neighborhood with 2,000 unit demand 5 km away costs 10× more to serve than a 200-unit one at the same distance.',
    impact: 'Drives the optimizer to place warehouses near high-demand centers.',
  },
  {
    title: 'Capacitated Facility Location Problem',
    tag: 'Optimization Model',
    formula: 'min Σᵢ fᵢyᵢ + Σᵢ Σⱼ cᵢⱼ dⱼ xᵢⱼ',
    what: 'Choose which warehouses to open and assign each neighborhood to exactly one, minimizing total cost.',
    why: 'This is the canonical formulation for supply-chain network design with fixed and variable costs.',
    example: 'Opening 5 of 12 candidate warehouses at $35k each saves $238k in delivery vs. the 6-warehouse baseline.',
    impact: 'The optimizer trades off fixed opening costs against delivery cost savings.',
  },
  {
    title: 'Assignment Constraint',
    tag: 'Constraint',
    formula: 'Σᵢ xᵢⱼ = 1  ∀j',
    what: 'Every neighborhood must be assigned to exactly one open warehouse.',
    why: 'Prevents demand from being split across warehouses or left unserved.',
    example: 'Downtown Core (demand 2,840) is assigned fully to Midtown Hub, not split.',
    impact: 'Ensures feasibility — all demand is always served.',
  },
  {
    title: 'Capacity Constraint',
    tag: 'Constraint',
    formula: 'Σⱼ dⱼ xᵢⱼ ≤ Cᵢ yᵢ  ∀i',
    what: 'Total demand assigned to a warehouse cannot exceed its capacity Cᵢ.',
    why: 'Prevents warehouse overload, which leads to delays and operational failures.',
    example: 'Brooklyn Gateway (capacity 6,000) carries 5,830 units — 97% utilization, nearing the limit.',
    impact: 'Forces the optimizer to open more warehouses when demand is concentrated.',
  },
  {
    title: 'Monte Carlo Simulation',
    tag: 'Uncertainty',
    formula: 'E[cost] ≈ (1/N) Σₙ cost(dₙ)',
    what: 'Simulate many demand scenarios drawn from a distribution to estimate cost variability.',
    why: 'Real demand is uncertain. Understanding variance helps plan for worst cases.',
    example: 'At 15% demand growth, the P95 cost is 18% above the expected value.',
    impact: 'Risk-aware planning — size warehouses for percentile scenarios, not just the mean.',
  },
  {
    title: 'Mixed-Integer Linear Programming',
    tag: 'Algorithm',
    formula: 'y ∈ {0,1}, x ≥ 0',
    what: 'An exact optimization method that finds the provably minimum-cost solution.',
    why: 'For small-to-medium instances, MILP can guarantee optimality — no heuristic can beat the result.',
    example: 'MILP finds $412,850 total cost. No other valid assignment can be cheaper.',
    impact: 'Use MILP when you need a certified optimal solution and have <500 neighborhoods.',
  },
];

function ConceptCard({ c }: { c: typeof concepts[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#111118] transition-colors"
      >
        <div className="flex items-center gap-3">
          <Badge variant="info">{c.tag}</Badge>
          <span className="text-sm font-medium text-white">{c.title}</span>
        </div>
        {open ? <ChevronDown size={14} className="text-[#5a5a70]" /> : <ChevronRight size={14} className="text-[#5a5a70]" />}
      </button>
      {open && (
        <CardBody className="border-t border-[#1e1e2e] space-y-4">
          <div className="font-mono text-sm text-blue-300 bg-[#0a0f1a] rounded px-4 py-3 border border-blue-500/10">
            {c.formula}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'What it means', text: c.what },
              { label: 'Why we use it', text: c.why },
              { label: 'Simple example', text: c.example },
              { label: 'Impact on decisions', text: c.impact },
            ].map((item, i) => (
              <div key={i}>
                <div className="text-[10px] font-mono font-medium text-[#4a4a60] uppercase tracking-wide mb-1">{item.label}</div>
                <p className="text-xs text-[#8080a0] leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </CardBody>
      )}
    </Card>
  );
}

export function Documentation() {
  return (
    <div className="docs-shell page-enter h-full overflow-y-auto bg-[#0a0a0f] p-4 md:p-7 space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen size={20} className="text-blue-400" />
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">Documentation</h1>
          <p className="text-xs text-[#4a4a60] mt-0.5">Mathematical concepts and user guide</p>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-[#0d0d16] border border-blue-500/20 text-xs text-[#8080a0] leading-relaxed">
        <strong className="text-blue-400">Progressive disclosure:</strong> Click any concept to expand the full explanation, formula, example, and decision impact.
      </div>

      <div className="space-y-2">
        {concepts.map((c, i) => <ConceptCard key={i} c={c} />)}
      </div>
    </div>
  );
}
