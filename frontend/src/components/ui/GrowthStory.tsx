// GrowthStory — structured, sectioned breakdown of the Year-Simulation
// narration. Parses the template/LLM "Title: detail" lines into labelled
// sections (growth chips, pressure alert banner, hub proposal cards,
// savings comparison, ops-impact tiles, rationale, payback badge) so the
// story reads like an analyst report instead of a wall of text.
import { ReactNode } from 'react';
import {
  TrendingUp, AlertTriangle, MapPin, RefreshCw, TrendingDown,
  Truck, Fuel, Users, Clock, Wallet, Crosshair, Boxes, Sparkles,
} from 'lucide-react';

const GREEN = 'text-emerald-400';

// highlight money / % / km tokens inside free text
function metrics(text: string): ReactNode[] {
  return text
    .split(/(\$[\d,.]+|~?\d[\d,.]*%|~?\d[\d,.]*\s?(?:km|kms|days?|hrs?|hours?)|~\$\d[\d,.]*\/day)/gi)
    .filter(Boolean)
    .map((p, i) =>
      /^[$~\d]/.test(p.trim())
        ? <span key={i} className="font-mono font-semibold text-white">{p}</span>
        : <span key={i}>{p}</span>
    );
}

function SectionTitle({ icon, label, accent }: { icon: ReactNode; label: string; accent: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className={`flex items-center justify-center w-6 h-6 rounded-md bg-[#111118] border border-[#2a2a3a] ${accent}`}>
        {icon}
      </span>
      <span className="text-[10px] font-mono uppercase tracking-widest text-[#8080a0]">{label}</span>
    </div>
  );
}

function Chip({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex-1 min-w-[92px] px-2.5 py-1.5 rounded-lg bg-[#111118] border border-[#1e1e2e]">
      <div className="text-[9px] font-mono uppercase tracking-wider text-[#5a5a70]">{label}</div>
      <div className={`text-xs font-mono font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

export function GrowthStory({ lines }: { lines: string[] }) {
  type Hub = { id: string; coord: string; cap: string; fixed: string; note: string };
  const hubs: Hub[] = [];
  let growth = '', pressure = '', reconnect = '', savings = '', ops = '', why = '', payback = '';
  const extra: string[] = [];

  for (const raw of lines || []) {
    const s = (raw || '').trim();
    if (!s) continue;
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^Growth story:\s*(.*)/i))) growth = m[1];
    else if ((m = s.match(/^Pressure alert:\s*(.*)/i))) pressure = m[1];
    else if ((m = s.match(/^New hub \d+:\s*(.*)/i))) {
      const d = m[1];
      hubs.push({
        id: (d.match(/^([\w-]+)/) || ['', 'New'])[1],
        coord: (d.match(/@\(?([\d.,\s-]+)\)?/) || ['', ''])[1].trim(),
        cap: (d.match(/cap\s+(\d[\d,]*)/i) || ['', '—'])[1],
        fixed: (d.match(/fixed\s+\$?([\d,]+)/i) || ['', '—'])[1],
        note: (d.match(/\.\s*([A-Z].*)$/) || ['', ''])[1].replace(/\.$/, '').trim(),
      });
    }
    else if ((m = s.match(/^Reconnect:\s*(.*)/i))) reconnect = m[1];
    else if ((m = s.match(/^Savings:\s*(.*)/i))) savings = m[1];
    else if ((m = s.match(/^Ops impact:\s*(.*)/i))) ops = m[1];
    else if ((m = s.match(/^Why here:\s*(.*)/i))) why = m[1];
    else if ((m = s.match(/^Payback:\s*(.*)/i))) payback = m[1];
    else if ((m = s.match(/^Bottom line:\s*(.*)/i))) { if (!payback) payback = m[1]; }
    else extra.push(s);
  }

  if (!growth && !pressure && !hubs.length && !savings && !ops && !extra.length) return null;

  const growthPct = (growth.match(/~?([\d.]+)%\/day/) || [])[1];
  const hotspotMult = (growth.match(/hotspot\s+x([\d.]+)/i) || [])[1];
  const hotspotAt = (growth.match(/@\s*([\d.,]+,\s*[\d.,]+)/) || [])[1];
  const prMonth = (pressure.match(/month\s+(\d+)/i) || [])[1];
  const prDay = (pressure.match(/day\s+(\d+)/i) || [])[1];
  const prUtil = (pressure.match(/utilization\s+([\d.]+)%/i) || [])[1];
  const prUnserved = (pressure.match(/([\d,]+)\s+unserved/i) || [])[1];
  const prKm = (pressure.match(/avg\s+([\d.]+)\s*km/i) || [])[1];
  const baseNet = (reconnect.match(/base\s*\[([^\]]*)\]/i) || ['', ''])[1];
  const endNet = (reconnect.match(/(?:year-end|with-new|new)[^\[]*\[([^\]]*)\]/i) || ['', ''])[1];
  const saveAmt = (savings.match(/save\s+\$([\d,.]+)/i) || [])[1];
  const saveDay = (savings.match(/~\$([\d,.]+)\/day/i) || [])[1];
  const yearBase = (savings.match(/base\s+year\s+\$?([\d,.]+)/i) || [])[1];
  const yearNew = (savings.match(/with-new\s+\$?([\d,.]+)/i) || [])[1];
  const opsKm = (ops.match(/~?([\d,.]+)\s+fewer\s*km/i) || [])[1];
  const opsHrs = (ops.match(/~?([\d,.]+)\s+drive-?hours/i) || [])[1];
  const opsLabour = (ops.match(/~\$([\d,.]+)\s+labour/i) || [])[1];
  const opsFuel = (ops.match(/~\$([\d,.]+)\s+fuel/i) || [])[1];
  const pbDays = (payback.match(/~?([\d,.]+)\s*days/i) || [])[1];
  const pbYears = (payback.match(/~?([\d.]+)\s*years?/i) || [])[1];
  const urgent = prUtil ? parseFloat(prUtil) >= 95 : false;


  return (
    <div className="space-y-4">
      {/* 01 — Growth story */}
      {(growth || growthPct) && (
        <div>
          <SectionTitle icon={<TrendingUp size={12} />} label="01 · Growth story" accent="text-cyan-400" />
          <div className="flex flex-wrap gap-2">
            <Chip label="Daily demand growth" value={`~${growthPct || '?'}%/day`} tone="text-cyan-300" />
            {hotspotMult && <Chip label={`Hotspot${hotspotAt ? ` @ ${hotspotAt}` : ''}`} value={`×${hotspotMult}`} tone="text-fuchsia-300" />}
            <Chip label="Seasonality" value="weekly + annual" />
          </div>
        </div>
      )}

      {/* 02 — Pressure alert */}
      {pressure && (
        <div>
          <SectionTitle icon={<AlertTriangle size={12} />} label="02 · Pressure alert" accent="text-amber-400" />
          <div className={`rounded-lg border p-3 ${urgent ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
            <div className={`text-[11px] mb-2.5 ${urgent ? 'text-red-300' : 'text-amber-300'}`}>
              <AlertTriangle size={11} className="inline mr-1.5 -mt-0.5" />
              Strain peaks <strong>month {prMonth || '?'}</strong>{prDay ? ` (day ${prDay})` : ''} on the base network
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip label="Peak utilization" value={`${prUtil || '?'}%`} tone={urgent ? 'text-red-400' : 'text-amber-300'} />
              <Chip label="Unserved areas" value={prUnserved || '0'} tone="text-red-400" />
              <Chip label="Avg delivery distance" value={`${prKm || '?'} km`} />
            </div>
          </div>
        </div>
      )}

      {/* 03 — New hub proposals */}
      {hubs.length > 0 && (
        <div>
          <SectionTitle icon={<MapPin size={12} />} label={`03 · New hub proposal${hubs.length > 1 ? 's' : ''}`} accent="text-violet-400" />
          <div className={`grid gap-2 ${hubs.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {hubs.map((h, i) => (
              <div key={i} className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-violet-300 font-mono flex items-center gap-1.5">
                    <Boxes size={11} /> {h.id}
                  </span>
                  <span className="text-[9px] font-mono text-[#5a5a70]">round {i + 1}</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-1.5">
                  <Chip label="Location (x, y)" value={h.coord || '—'} tone="text-violet-300" />
                  <Chip label="Capacity" value={h.cap} />
                  <Chip label="Fixed setup" value={`$${h.fixed}`} />
                </div>
                {h.note && <div className="text-[10px] text-[#8a8aa0] leading-relaxed">{metrics(h.note)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 04 — Reconnect */}
      {(reconnect || baseNet) && (
        <div>
          <SectionTitle icon={<RefreshCw size={12} />} label="04 · Network reconnect" accent="text-sky-400" />
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="text-[#5a5a70] uppercase text-[9px] tracking-wider mr-1">base</span>
            {(baseNet || '').split(',').filter(Boolean).map((w, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/25 text-red-300">{w.trim()}</span>
            ))}
            <span className="text-[#4a4a60] mx-1">→</span>
            <span className="text-[#5a5a70] uppercase text-[9px] tracking-wider mr-1">year-end</span>
            {(endNet || '').split(',').filter(Boolean).map((w, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">{w.trim()}</span>
            ))}
          </div>
        </div>
      )}

      {/* 05 — Savings */}
      {(savings || saveAmt) && (
        <div>
          <SectionTitle icon={<TrendingDown size={12} />} label="05 · Savings snapshot" accent="text-emerald-400" />
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
            <div className="flex flex-wrap gap-2 mb-2">
              {yearBase && <Chip label="Base year cost" value={`$${yearBase}`} tone="text-[#a0a0b0]" />}
              {yearNew && <Chip label="With-new year cost" value={`$${yearNew}`} tone={GREEN} />}
              {saveAmt && <Chip label="Saved / year" value={`$${saveAmt}`} tone={GREEN} />}
              {saveDay && <Chip label="Saved / day" value={`$${saveDay}`} tone={GREEN} />}
            </div>
          </div>
        </div>
      )}

      {/* 06 — Ops impact */}
      {(ops || opsKm) && (
        <div>
          <SectionTitle icon={<Truck size={12} />} label="06 · Ops impact" accent="text-orange-400" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg bg-[#111118] border border-[#1e1e2e] p-2.5 text-center">
              <TrendingDown size={13} className="mx-auto text-orange-400 mb-1" />
              <div className="text-sm font-mono font-bold text-white">{opsKm ? `~${opsKm}` : '—'}</div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-[#5a5a70]">km fewer</div>
            </div>
            <div className="rounded-lg bg-[#111118] border border-[#1e1e2e] p-2.5 text-center">
              <Clock size={13} className="mx-auto text-blue-300 mb-1" />
              <div className="text-sm font-mono font-bold text-white">{opsHrs ? `~${opsHrs}` : '—'}</div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-[#5a5a70]">drive-hours saved</div>
            </div>
            <div className="rounded-lg bg-[#111118] border border-[#1e1e2e] p-2.5 text-center">
              <Users size={13} className="mx-auto text-purple-400 mb-1" />
              <div className="text-sm font-mono font-bold text-white">{opsLabour ? `$${opsLabour}` : '—'}</div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-[#5a5a70]">labour saved</div>
            </div>
            <div className="rounded-lg bg-[#111118] border border-[#1e1e2e] p-2.5 text-center">
              <Fuel size={13} className="mx-auto text-amber-400 mb-1" />
              <div className="text-sm font-mono font-bold text-white">{opsFuel ? `$${opsFuel}` : '—'}</div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-[#5a5a70]">fuel saved</div>
            </div>
          </div>
        </div>
      )}

      {/* 07 — Why here */}
      {why && (
        <div>
          <SectionTitle icon={<Crosshair size={12} />} label="07 · Why here" accent="text-blue-400" />
          <div className="rounded-lg border border-[#1e1e2e] bg-[#0d0d16] p-3 text-[11px] text-[#8a8aa0] leading-relaxed">
            {metrics(why)}
          </div>
        </div>
      )}

      {/* 08 — Payback */}
      {(payback || pbDays) && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <Wallet size={14} className="text-emerald-400" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#8080a0]">08 · Payback</span>
          </div>
          <div className="text-xs font-mono text-emerald-300 font-semibold">
            Break even in ~{pbDays || '?'} days{pbYears ? ` (~${pbYears} yrs)` : ''}
          </div>
        </div>
      )}

      {/* fallback for LLM lines that don't match the template titles */}
      {extra.length > 0 && (
        <div>
          <SectionTitle icon={<Sparkles size={12} />} label="Analyst notes" accent="text-pink-400" />
          <ul className="space-y-1.5">
            {extra.map((e, i) => (
              <li key={i} className="text-[11px] text-[#8a8aa0] leading-relaxed flex gap-1.5">
                <span className="text-pink-400 font-bold">•</span><span>{metrics(e)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

