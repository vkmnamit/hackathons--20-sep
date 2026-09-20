import { useState, useCallback } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fmt } from '@/lib/utils';
import {
  Upload, FileText, CheckCircle2, AlertTriangle,
  ArrowRight, X, Inbox, Loader2, Download
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { api, type Point, type Candidate } from '@/lib/api';

// local shape matching store's setData contract (must include name)
type NB = Point & { demand: number; name: string };
type WH = Candidate & { name: string };

interface NBRow { id: string; name: string; lat: number; lng: number; demand: number }

export function DataImport() {
  const { setData, wh: existingWh } = useStore();
  const [step, setStep] = useState<'upload' | 'preview' | 'validate' | 'confirm' | 'done'>('upload');
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<NBRow[]>([]);
  const [validation, setValidation] = useState<{ field: string; msg: string; status: 'valid' | 'invalid' }[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const parseCSV = (text: string): NBRow[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const idIdx = header.findIndex(h => h === 'id' || h === 'neighborhood' || h === 'name');
    const nameIdx = header.findIndex(h => h === 'name' || h === 'neighborhood');
    const latIdx = header.findIndex(h => h === 'lat' || h === 'latitude');
    const lngIdx = header.findIndex(h => h === 'lng' || h === 'lon' || h === 'longitude' || h === 'x');
    const demandIdx = header.findIndex(h => h === 'demand' || h === 'orders' || h === 'volume');
    return lines.slice(1).map((line, i) => {
      const cols = line.split(',').map(c => c.trim());
      const toNum = (v: string, def = 0) => { const n = parseFloat(v); return isNaN(n) ? def : n; };
      return {
        id: cols[idIdx] || `N${i+1}`,
        name: cols[nameIdx] || (cols[idIdx] || `Neighborhood ${i+1}`),
        lat: toNum(cols[lngIdx] ?? cols[latIdx] ?? '0', 0), // x->lng, y->lat
        lng: toNum(cols[latIdx] ?? cols[lngIdx] ?? '0', 0),
        demand: Math.max(1, Math.round(toNum(cols[demandIdx] ?? '100', 100))),
      };
    }).filter(r => r.demand > 0);
  };

  const validate = (rows: NBRow[]) => {
    const rules: { field: string; msg: string; status: 'valid' | 'invalid' }[] = [];
    if (rows.length < 3) rules.push({ field: 'Records', msg: 'Need at least 3 neighborhoods', status: 'invalid' });
    else rules.push({ field: 'Records', msg: `${rows.length} neighborhoods — good`, status: 'valid' });
    const dups = rows.filter((r, i, a) => a.findIndex(x => x.id === r.id) !== i);
    if (dups.length) rules.push({ field: 'Duplicate IDs', msg: `${dups.length} duplicate IDs found`, status: 'invalid' });
    else rules.push({ field: 'Duplicate IDs', msg: 'All IDs unique', status: 'valid' });
    const minLat = Math.min(...rows.map(r => r.lat)), maxLat = Math.max(...rows.map(r => r.lat));
    const minLng = Math.min(...rows.map(r => r.lng)), maxLng = Math.max(...rows.map(r => r.lng));
    if (maxLat - minLat < 1) rules.push({ field: 'Latitude spread', msg: 'Too clustered — spread < 1 unit', status: 'invalid' });
    else rules.push({ field: 'Latitude spread', msg: `${minLat.toFixed(1)} to ${maxLat.toFixed(1)} — OK`, status: 'valid' });
    if (maxLng - minLng < 1) rules.push({ field: 'Longitude spread', msg: 'Too clustered — spread < 1 unit', status: 'invalid' });
    else rules.push({ field: 'Longitude spread', msg: `${minLng.toFixed(1)} to ${maxLng.toFixed(1)} — OK`, status: 'valid' });
    const totalDemand = rows.reduce((a, r) => a + r.demand, 0);
    rules.push({ field: 'Total demand', msg: `${fmt(totalDemand)} units across ${rows.length} neighborhoods`, status: 'valid' });
    const bad = rows.filter(r => r.demand <= 0);
    if (bad.length) rules.push({ field: 'Demand values', msg: `${bad.length} neighborhoods with non-positive demand`, status: 'invalid' });
    else rules.push({ field: 'Demand values', msg: 'All positive', status: 'valid' });
    return rules;
  };

  const loadSample = async () => {
    const text = await fetch('/sample.csv').then(r => r.text());
    setRaw(text);
    const rows = parseCSV(text);
    setFileName('sample.csv (via /api/sample.csv)');
    setParsed(rows);
    setStep('preview');
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setRaw(text);
      const rows = parseCSV(text);
      setFileName(file.name);
      setParsed(rows);
      setStep('preview');
    };
    reader.readAsText(file);
  };

  const nextStep = () => {
    if (step === 'preview') { const v = validate(parsed); setValidation(v); setStep('validate'); }
    else if (step === 'validate') { setStep('confirm'); }
    else if (step === 'confirm') {
      const nbRows: NB[] = parsed.map(n => ({ id: n.id, name: n.name, x: n.lng, y: n.lat, demand: n.demand }));
      // warehouses: use existing from store, or default docks
      const wh: Candidate[] = existingWh.length
        ? existingWh.map((w) => ({ ...w, name: w.name || w.id }))
        : [
            { id: 'W1', x: 20, y: 20, fixedCost: 1500, capacity: 800, name: 'Dock 1' },
            { id: 'W2', x: 80, y: 30, fixedCost: 1500, capacity: 800, name: 'Dock 2' },
            { id: 'W3', x: 50, y: 75, fixedCost: 1500, capacity: 800, name: 'Dock 3' },
            { id: 'W4', x: 25, y: 70, fixedCost: 1500, capacity: 800, name: 'Dock 4' },
            { id: 'W5', x: 75, y: 75, fixedCost: 1500, capacity: 800, name: 'Dock 5' },
          ];
      const whCoerced: WH[] = wh.map((w) => ({ ...w, name: w.name || w.id }));
      setData(nbRows, whCoerced);
      setStep('done');
    }
  };

  const back = (s: typeof step) => setStep(s);

  return (
    <div className="import-shell page-enter h-full overflow-y-auto bg-[#0a0a0f] p-4 md:p-7 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Upload size={16} className="text-blue-400" />Data Import
          </h1>
          <p className="text-xs text-[#4a4a60] mt-0.5">CSV with id, name, x/y (or lat/lng), demand</p>
        </div>
        {step !== 'upload' && step !== 'done' && (
          <Button variant="ghost" size="sm" onClick={() => setStep('upload')}><X size={13}/>Cancel</Button>
        )}
      </div>

      {/* upload step */}
      {step === 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="flex flex-col">
            <CardHeader><span className="text-sm font-medium text-white">Upload CSV</span></CardHeader>
            <CardBody className="flex-1 flex flex-col items-center justify-center py-8">
              <div
                className={`w-full border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-[#1e1e2e] hover:border-[#2a2a3a]'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              >
                <Inbox size={32} className="mx-auto text-[#3a3a50] mb-3" />
                <div className="text-sm text-[#5a5a70] mb-1">Drop CSV here or click to browse</div>
                <div className="text-[10px] text-[#3a3a50] mb-3">id, name, x/y (or lat/lng), demand</div>
                <input type="file" accept=".csv" className="hidden" id="csv-upload"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <Button variant="outline" size="sm">Browse files</Button>
                </label>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><span className="text-sm font-medium text-white">Sample file</span></CardHeader>
            <CardBody className="space-y-3">
              <div className="text-xs text-[#5a5a70] bg-[#0d0d16] p-3 rounded font-mono">
                <div className="text-[#8080a0] mb-1">Expected columns:</div>
                id, name, x (longitude), y (latitude), demand<br/>
                Example:<br/>
                <span className="text-[#c0c0d0]">N01,Gandhi Bazaar,12.934,77.571,420</span>
              </div>
              <Button variant="primary" size="sm" onClick={async () => {
                const res = await fetch('/api/bengaluru').then(r => r.json());
                const nbRows: NB[] = res.neighborhoods.map((n: any) => ({ id: n.id, name: n.name, x: n.x, y: n.y, demand: n.demand }));
                const whRows: WH[] = res.candidates.map((w: any) => ({ id: w.id, name: w.name, x: w.x, y: w.y, fixedCost: w.fixedCost, capacity: w.capacity }));
                setData(nbRows, whRows);
                setFileName('Basavanagudi & Jayanagar (Bangalore) — 16 neighborhoods, 6 candidate hubs');
                setParsed(res.neighborhoods.map((n: any) => ({ id: n.id, name: n.name, lat: n.lat, lng: n.lng, demand: n.demand })));
                setStep('done');
              }} className="w-full justify-start">
                <FileText size={13} className="mr-2" />Load Bangalore (Basavanagudi & Jayanagar) Dataset
              </Button>
              <Button variant="outline" size="sm" onClick={loadSample} className="w-full justify-start">
                <FileText size={13} className="mr-2" />Use sample dataset (32 NYC neighborhoods)
              </Button>
            </CardBody>
          </Card>

          {raw && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">File: {fileName}</span>
                  <span className="text-[9px] font-mono text-[#3a3a50]">{raw.split(/\r?\n/).length} lines</span>
                </div>
              </CardHeader>
              <CardBody>
                <pre className="text-[9px] font-mono text-[#5a5a70] bg-[#0d0d16] p-3 rounded h-24 overflow-auto">{raw.slice(0, 500)}{raw.length > 500 ? '...' : ''}</pre>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* preview */}
      {step === 'preview' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Preview — {fileName}</span>
              <Badge variant="info">{parsed.length} records</Badge>
            </div>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#111118]">
                  <tr className="border-b border-[#1e1e2e]">
                    {['ID', 'Name', 'X (lon)', 'Y (lat)', 'Demand'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[9px] font-mono font-medium text-[#3a3a50] uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 20).map(n => (
                    <tr key={n.id} className="border-b border-[#1a1a24]">
                      <td className="px-4 py-2 font-mono text-[#5a5a70]">{n.id}</td>
                      <td className="px-4 py-2 text-[#c0c0d0]">{n.name}</td>
                      <td className="px-4 py-2 font-mono text-[#8080a0]">{n.lng.toFixed(2)}</td>
                      <td className="px-4 py-2 font-mono text-[#8080a0]">{n.lat.toFixed(2)}</td>
                      <td className="px-4 py-2 font-mono text-white">{fmt(n.demand)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 20 && <div className="text-[10px] text-[#3a3a50] text-center py-2">... and {parsed.length - 20} more rows</div>}
            </div>
            
            <div className="px-5 py-3 border-t border-[#1e1e2e] flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep('upload')}><X size={12}/>Back</Button>
              <Button variant="primary" size="sm" onClick={nextStep}>Validate <ArrowRight size={12}/></Button>
          </div>
            
          </CardBody>
        </Card>
      )}

      {/* validate */}
      {step === 'validate' && (
        <Card>
          <CardHeader><span className="text-sm font-medium text-white">Validation Results</span></CardHeader>
          <CardBody className="space-y-3">
            {validation.map((rule, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded border ${
                rule.status === 'valid' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'
              }`}>
                {rule.status === 'valid'
                  ? <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  : <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                }
                <div>
                  <div className="text-xs font-mono font-medium text-white">{rule.field}</div>
                  <div className="text-xs text-[#6b6b80] mt-0.5">{rule.msg}</div>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('preview')}><X size={12}/>Re-upload</Button>
              <Button variant="primary" size="sm" onClick={nextStep}>Confirm Import <ArrowRight size={12}/></Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* confirm */}
      {step === 'confirm' && (
        <Card>
          <CardHeader><span className="text-sm font-medium text-white">Confirm Import</span></CardHeader>
          <CardBody>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Records', value: fmt(parsed.length) },
                { label: 'Total demand', value: fmt(parsed.reduce((a, r) => a + r.demand, 0)) },
                { label: 'Warnings', value: validation.filter(r => r.status === 'invalid').length.toString() },
              ].map((item, i) => (
                <div key={i} className="p-4 rounded bg-[#0d0d16] border border-[#1e1e2e] text-center">
                  <div className="text-lg font-mono font-bold text-white">{item.value}</div>
                  <div className="text-xs text-[#4a4a60] mt-1">{item.label}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('validate')}>Back</Button>
              <Button variant="primary" size="md" onClick={nextStep}><CheckCircle2 size={13}/>Confirm Import</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* done */}
      {step === 'done' && (
        <Card>
          <CardBody className="py-12 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-4" />
            <div className="text-lg font-semibold text-white mb-2">Import successful</div>
            <div className="text-sm text-[#5a5a70] mb-6">{parsed.length} neighborhoods imported from {fileName}</div>
            <div className="flex gap-3 justify-center">
              <Button variant="primary" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'workspace' }))}>
                Go to workspace <ArrowRight size={12}/>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setStep('upload')}>Import another</Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
