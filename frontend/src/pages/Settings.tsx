import { useState } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, AlertCircle, Loader2, Palette, Map, Paintbrush, Sun, Moon } from 'lucide-react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';

export function Settings() {
  const { token, companyId, companyName, login, signup, logout, prefs, setPrefs, theme, setTheme } = useStore();
  const [email, setEmail] = useState('namit@gmail.com');
  const [password, setPassword] = useState('12345678');
  const [company, setCompany] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoginLoading(true); setLoginError(null);
    try {
      await login(email, password);
      setMsg('Logged in as ' + companyName);
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) {
      setLoginError(e.message || 'Login failed');
    } finally { setLoginLoading(false); }
  };

  const handleLogout = () => {
    logout();
    setMsg('Logged out');
    setTimeout(() => setMsg(null), 2000);
  };

  const handleSignup = async () => {
    setLoginLoading(true); setLoginError(null);
    try {
      await signup(email, password, company);
      setMsg('Account created. Your 56-location starter network is ready.');
    } catch (e: any) {
      setLoginError(e.message || 'Sign-up failed');
    } finally { setLoginLoading(false); }
  };

  const isLoggedIn = !!token && !!companyId;

  const presetColors = [
    { label: 'Ocean', accent: '#38bdf8', warehouse: '#22c55e', neighborhood: '#0f172a', unserved: '#ef4444' },
    { label: 'Sunset', accent: '#f97316', warehouse: '#a855f7', neighborhood: '#1e0a2e', unserved: '#fca5a5' },
    { label: 'Forest', accent: '#10b981', warehouse: '#0ea5e9', neighborhood: '#022c22', unserved: '#fbbf24' },
    { label: 'Rose', accent: '#ec4899', warehouse: '#f43f5e', neighborhood: '#1f0a14', unserved: '#fef08a' },
    { label: 'Slate', accent: '#64748b', warehouse: '#38bdf8', neighborhood: '#0f172a', unserved: '#f87171' },
    { label: 'Amber', accent: '#f59e0b', warehouse: '#14b8a6', neighborhood: '#1c1917', unserved: '#fcd34d' },
  ];

  const applyPreset = (p: typeof presetColors[0]) => {
    setPrefs({ accent: p.accent, warehouse: p.warehouse, neighborhood: p.neighborhood, unserved: p.unserved });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="settings-shell page-enter h-full overflow-y-auto bg-[#0a0a0f] p-4 md:p-7 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Palette size={16} className="text-blue-400" />Settings
          </h1>
          <p className="text-xs text-[#4a4a60] mt-0.5">Account, database & visual customization</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setSaved(true)}>
          {saved ? <><CheckCircle2 size={13} />Saved</> : 'Save Changes'}
        </Button>
      </div>

      {msg && (
        <div className="text-xs text-emerald-400 bg-emerald-500/8 p-3 rounded border border-emerald-500/20 flex items-center gap-2">
          <CheckCircle2 size={12} />{msg}
        </div>
      )}
      {loginError && (
        <div className="text-xs text-amber-400 bg-amber-500/8 p-3 rounded border border-amber-500/20 flex items-center gap-2">
          <AlertCircle size={12} />{loginError}
        </div>
      )}

      {/* Auth */}
      <Card>
        <CardHeader><span className="text-sm font-medium text-white flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />Authentication
        </span></CardHeader>
        <CardBody className="space-y-4">
          {isLoggedIn ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">
                  {companyName?.[0] || 'U'}
                </div>
                <div>
                  <div className="text-xs font-medium text-white">{companyName}</div>
                  <div className="text-[10px] text-[#4a4a60] font-mono">{companyId}</div>
                </div>
                <Badge variant="success" className="ml-auto">Authenticated</Badge>
              </div>
              <div>
                <label className="text-xs text-[#5a5a70] block mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full max-w-xs px-3 py-1.5 rounded text-xs bg-[#0d0d16] border border-[#1e1e2e] text-[#c0c0d0] font-mono focus:outline-none focus:border-blue-500/40" />
              </div>
              <div>
                <label className="text-xs text-[#5a5a70] block mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full max-w-xs px-3 py-1.5 rounded text-xs bg-[#0d0d16] border border-[#1e1e2e] text-[#c0c0d0] font-mono focus:outline-none focus:border-blue-500/40" />
              </div>
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handleLogin} loading={loginLoading}>
                  <Loader2 size={12} className={loginLoading ? 'animate-spin' : ''} />Re-auth
                </Button>
                <Button variant="danger" size="sm" onClick={handleLogout}>Logout</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-1 p-1 rounded bg-[#0d0d16] border border-[#1e1e2e] max-w-xs">
                {(['login', 'signup'] as const).map(mode => (
                  <button key={mode} onClick={() => setAuthMode(mode)} className={`flex-1 py-1 rounded text-[10px] font-mono ${authMode === mode ? 'bg-blue-600 text-white' : 'text-[#6b6b80]'}`}>
                    {mode === 'login' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>
              {authMode === 'signup' && (
                <div>
                  <label className="text-xs text-[#5a5a70] block mb-1.5">Company name</label>
                  <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Logistics"
                    className="w-full max-w-xs px-3 py-1.5 rounded text-xs bg-[#0d0d16] border border-[#1e1e2e] text-[#c0c0d0] font-mono focus:outline-none focus:border-blue-500/40" />
                </div>
              )}
              <div>
                <label className="text-xs text-[#5a5a70] block mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full max-w-xs px-3 py-1.5 rounded text-xs bg-[#0d0d16] border border-[#1e1e2e] text-[#c0c0d0] font-mono focus:outline-none focus:border-blue-500/40" />
              </div>
              <div>
                <label className="text-xs text-[#5a5a70] block mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full max-w-xs px-3 py-1.5 rounded text-xs bg-[#0d0d16] border border-[#1e1e2e] text-[#c0c0d0] font-mono focus:outline-none focus:border-blue-500/40" />
                <div className="text-[10px] text-[#4a4a60] mt-1 flex flex-wrap gap-2 items-center">
                  <span>Demo account:</span>
                  <button
                    type="button"
                    onClick={() => { setEmail('namit@gmail.com'); setPassword('12345678'); }}
                    className="text-blue-400 hover:underline cursor-pointer font-mono"
                  >
                    namit@gmail.com / 12345678
                  </button>
                </div>
              </div>
              <Button variant="primary" size="sm" onClick={authMode === 'login' ? handleLogin : handleSignup} loading={loginLoading} className="w-full">
                <Loader2 size={12} className={loginLoading ? 'animate-spin' : ''} />{authMode === 'login' ? 'Login' : 'Create account'}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* DB config */}
      <Card>
        <CardHeader><span className="text-sm font-medium text-white flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Database (Supabase)
        </span></CardHeader>
        <CardBody className="space-y-4">
          <div className="p-3 rounded-lg bg-[#0d0d16] border border-[#1e1e2e] text-xs text-[#8080a0] leading-relaxed">
            <strong className="text-white">Status:</strong> {isLoggedIn ? 'Connected (auth active)' : 'Local — login to enable Supabase sync'}<br />
            <strong className="text-white">Table:</strong> wlo_runs (public schema)<br />
            <strong className="text-white">Fields:</strong> id, name, company_id, algorithm, warehouse_count, total_cost, avg_distance, runtime_ms, created_at
          </div>
          {isLoggedIn && (
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span className="text-emerald-400">Optimization runs persist to Supabase</span>
            </div>
          )}
        </CardBody>
      </Card>

      {/* App config */}
      <Card>
        <CardHeader><span className="text-sm font-medium text-white">Application</span></CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className="text-xs text-[#5a5a70] block mb-1.5">Backend URL</label>
            <input type="text" defaultValue={import.meta.env.VITE_API_URL || 'http://localhost:4000'}
              className="w-full max-w-xs px-3 py-1.5 rounded text-xs bg-[#0d0d16] border border-[#1e1e2e] text-[#c0c0d0] font-mono focus:outline-none focus:border-blue-500/40" />
          </div>
          <div>
            <label className="text-xs text-[#5a5a70] block mb-1.5">Distance unit</label>
            <select defaultValue="km"
              className="w-full max-w-xs px-3 py-1.5 rounded text-xs bg-[#0d0d16] border border-[#1e1e2e] text-[#c0c0d0] focus:outline-none focus:border-blue-500/40">
              <option>km</option>
              <option>miles</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#5a5a70] block mb-1.5">Currency</label>
            <select defaultValue="USD"
              className="w-full max-w-xs px-3 py-1.5 rounded text-xs bg-[#0d0d16] border border-[#1e1e2e] text-[#c0c0d0] focus:outline-none focus:border-blue-500/40">
              <option>USD</option>
              <option>EUR</option>
              <option>INR</option>
            </select>
          </div>
        </CardBody>
      </Card>

      {/* Visual customization */}
      <Card>
        <CardHeader>
          <span className="text-sm font-medium text-white flex items-center gap-2">
            <Paintbrush size={14} className="text-amber-400" />Visual Customization
          </span>
        </CardHeader>
        <CardBody className="space-y-5">
          {/* Theme Mode */}
          <div>
            <label className="text-xs text-[#5a5a70] block mb-2">Interface Theme</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-2 px-4 py-2 rounded border text-xs font-mono transition-all ${
                  theme === 'dark'
                    ? 'border-blue-500 bg-blue-500/10 text-white font-semibold shadow-sm'
                    : 'border-[#1e1e2e] bg-[#0d0d16] text-[#8080a0] hover:text-white'
                }`}
              >
                <Moon size={14} className={theme === 'dark' ? 'text-blue-400' : 'text-[#6b6b80]'} />
                <span>Dark Mode</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center gap-2 px-4 py-2 rounded border text-xs font-mono transition-all ${
                  theme === 'light'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-600 font-semibold shadow-sm'
                    : 'border-[#1e1e2e] bg-[#0d0d16] text-[#8080a0] hover:text-white'
                }`}
              >
                <Sun size={14} className={theme === 'light' ? 'text-amber-500' : 'text-[#6b6b80]'} />
                <span>Light Mode</span>
              </button>
            </div>
          </div>

          {/* Color presets */}
          <div>
            <label className="text-xs text-[#5a5a70] block mb-2">Color Presets</label>
            <div className="flex flex-wrap gap-2">
              {presetColors.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={`px-3 py-1.5 rounded text-[10px] font-mono border transition-all \`
                    border-${prefs.accent === p.accent ? p.accent.replace('#','border-') : 'border-[#2a2a3a]'}
                    bg-${prefs.accent === p.accent ? p.accent.replace('#','') : ''}`}
                  style={{
                    background: prefs.accent === p.accent ? `${p.accent}22` : '#111118',
                    borderColor: prefs.accent === p.accent ? p.accent : '#2a2a3a',
                    color: prefs.accent === p.accent ? p.accent : '#8080a0',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color pickers */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#5a5a70] block mb-1.5">Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={prefs.accent}
                  onChange={e => setPrefs({ accent: e.target.value })}
                  className="w-10 h-8 rounded cursor-pointer bg-transparent border border-[#2a2a3a]"
                />
                <span className="text-[10px] font-mono text-[#8080a0]">{prefs.accent}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-[#5a5a70] block mb-1.5">Warehouse Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={prefs.warehouse}
                  onChange={e => { const v = e.target.value; setPrefs({ warehouse: v, openWarehouse: v }); }}
                  className="w-10 h-8 rounded cursor-pointer bg-transparent border border-[#2a2a3a]"
                />
                <span className="text-[10px] font-mono text-[#8080a0]">{prefs.warehouse}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-[#5a5a70] block mb-1.5">Neighborhood Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={prefs.neighborhood}
                  onChange={e => setPrefs({ neighborhood: e.target.value })}
                  className="w-10 h-8 rounded cursor-pointer bg-transparent border border-[#2a2a3a]"
                />
                <span className="text-[10px] font-mono text-[#8080a0]">{prefs.neighborhood}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-[#5a5a70] block mb-1.5">Unserved Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={prefs.unserved}
                  onChange={e => setPrefs({ unserved: e.target.value })}
                  className="w-10 h-8 rounded cursor-pointer bg-transparent border border-[#2a2a3a]"
                />
                <span className="text-[10px] font-mono text-[#8080a0]">{prefs.unserved}</span>
              </div>
            </div>
          </div>

          {/* Map tile */}
          <div>
            <label className="text-xs text-[#5a5a70] block mb-1.5">Map Style</label>
            <div className="flex gap-2">
              {(['dark', 'light', 'satellite', 'outdoor'] as const).map(tile => (
                <button
                  key={tile}
                  onClick={() => setPrefs({ mapTile: tile })}
                  className={`px-3 py-1.5 rounded text-[10px] font-mono border transition-all \`
                    border-${prefs.mapTile === tile ? 'blue' : '-[#2a2a3a]'}
                    bg-${prefs.mapTile === tile ? 'blue-500/10' : ''}`}
                  style={{
                    background: prefs.mapTile === tile ? 'rgba(59,130,246,0.1)' : '#111118',
                    borderColor: prefs.mapTile === tile ? '#3b82f6' : '#2a2a3a',
                    color: prefs.mapTile === tile ? '#3b82f6' : '#8080a0',
                  }}
                >
                  {tile.charAt(0).toUpperCase() + tile.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="p-3 rounded-lg bg-[#0d0d16] border border-[#1e1e2e]">
            <div className="text-[10px] text-[#4a4a60] mb-2">Live Preview</div>
            <div className="flex gap-4 items-center">
              <div className="w-8 h-8 rounded-full border-2" style={{ borderColor: prefs.warehouse, background: prefs.warehouse }} />
              <div className="w-6 h-6 rounded-full" style={{ background: prefs.neighborhood, border: `2px solid ${prefs.accent}` }} />
              <span className="text-[10px] text-[#4a4a60]">
                Marker: <span style={{ color: prefs.warehouse }}>●</span> Warehouse
                <span className="mx-2">·</span>
                <span style={{ color: prefs.neighborhood }}>●</span> Neighborhood
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-[#0d0d16] border border-[#1e1e2e] text-xs text-[#4a4a60]">
        <Badge variant="muted">v2.0-react</Badge>
        <span>Wherehouse · Hackathon Demo. Real credentials stored server-side only.</span>
      </div>
    </div>
  );
}
