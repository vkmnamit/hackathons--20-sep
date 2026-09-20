// envdb.js — .env loading, JWT demo auth, OpenRouter LLM, Supabase persistence.
// Zero npm deps (node:crypto + https only).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  lines.forEach(l => {
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] != null) return;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  });
}
loadEnv();

const JWT_SECRET = process.env.JWT_SECRET || 'wlo-hackathon-secret';
// Hackathon-local accounts. They live for the lifetime of the server process;
// deploy with a real identity provider/database for production use.
const localUsers = [];
function b64url(b) { return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function sign(payload) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(payload));
  const s = b64url(crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + p).digest());
  return h + '.' + p + '.' + s;
}
function verify(tok) {
  try {
    const [h, p, s] = tok.split('.');
    const e = b64url(crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + p).digest());
    if (e !== s) return null;
    const d = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (d.exp && Date.now() > d.exp) return null;
    return d;
  } catch { return null; }
}
function users() {
  let configured = [];
  try { if (process.env.USERS_JSON) configured = JSON.parse(process.env.USERS_JSON); } catch {}
  return configured.concat([
    { email: 'planner@northstar.demo', password: 'northstar123', companyId: 'Northstar Logistics', companyName: 'Northstar Logistics', datasetSize: 56, seed: 56 },
    { email: 'planner@harbor.demo', password: 'harbor123', companyId: 'Harbor Retail', companyName: 'Harbor Retail', datasetSize: 90, seed: 90 },
    { email: 'planner@karnataka300.demo', password: 'karnataka300', companyId: 'Karnataka Logistics 300', companyName: 'Karnataka Logistics', datasetSize: 300, seed: 300 },
    { email: 'planner@karnataka500.demo', password: 'karnataka500', companyId: 'Karnataka Logistics 500', companyName: 'Karnataka Logistics Enterprise', datasetSize: 500, seed: 500 },
    { email: 'namit@gmail.com', password: '12345678', companyId: 'Namit Logistics', companyName: 'Namit Logistics', datasetSize: 500, seed: 501, warehouseCapacity: 300 },
    { email: 'panda@gmail.com', password: '12345678', companyId: 'Panda Logistics', companyName: 'Panda Logistics', datasetSize: 500, seed: 502, warehouseCapacity: 300 },
    { email: 'demo@flipkart.com', password: 'demo123', companyId: 'Flipkart', companyName: 'Flipkart', datasetSize: 56, seed: 56 },
    { email: 'partner@acme.com', password: 'partner123', companyId: 'Partner', companyName: 'Partner', datasetSize: 90, seed: 90 },
  ], localUsers);
}
function authResponse(u) {
  const companyName = u.companyName || u.companyId;
  const warehouseCapacity = u.warehouseCapacity || 1100;
  return { token: sign({ sub: u.email, companyId: u.companyId, companyName, datasetSize: u.datasetSize || 56, seed: u.seed || 56, warehouseCapacity, exp: Date.now() + 12 * 3600e3 }), user: { id: u.email, email: u.email, companyId: u.companyId, companyName, role: 'planner', datasetSize: u.datasetSize || 56, seed: u.seed || 56, warehouseCapacity } };
}
function passwordHash(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function passwordMatches(password, encoded) {
  const parts = String(encoded || '').split(':');
  if (parts.length !== 2) return false;
  return crypto.timingSafeEqual(Buffer.from(parts[1], 'hex'), Buffer.from(passwordHash(password, parts[0]).split(':')[1], 'hex'));
}
async function storedUser(email) {
  if (!sbUrl()) return null;
  const r = await sb({ path: '/rest/v1/wlo_users?email=eq.' + encodeURIComponent(email) + '&limit=1', method: 'GET', service: true });
  try { return r.ok ? JSON.parse(r.body)[0] || null : null; } catch { return null; }
}
async function login(email, password) {
  const u = users().find(x => x.email === email && x.password === password);
  if (u) return authResponse(u);
  const saved = await storedUser(String(email || '').trim().toLowerCase());
  if (!saved || !passwordMatches(password, saved.password_hash)) return null;
  return authResponse({ email: saved.email, companyId: saved.company_id, companyName: saved.company_name, datasetSize: saved.dataset_size, seed: saved.dataset_seed });
}
async function signup(email, password, companyName) {
  email = String(email || '').trim().toLowerCase();
  companyName = String(companyName || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address');
  if (String(password || '').length < 6) throw new Error('Password must be at least 6 characters');
  if (!companyName) throw new Error('Enter a company name');
  if (users().some(u => u.email.toLowerCase() === email)) throw new Error('An account with this email already exists');
  const companyId = companyName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'company';
  const seed = Array.from(email).reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const u = { email, password, companyId, companyName, datasetSize: 56, seed };
  const alreadyStored = await storedUser(email);
  if (alreadyStored) throw new Error('An account with this email already exists');
  if (sbUrl()) {
    const r = await sb({ path: '/rest/v1/wlo_users', method: 'POST', service: true }, {
      email, password_hash: passwordHash(password), company_id: companyId, company_name: companyName, dataset_size: 56, dataset_seed: seed,
    });
    if (!r.ok) throw new Error('Supabase could not create this account. Run backend/supabase.sql and check your service-role key.');
  }
  localUsers.push(u);
  return authResponse(u);
}
async function saveDataset(dataset) {
  if (!sbUrl()) return { saved: false, via: 'local-only' };
  const r = await sb({ path: '/rest/v1/wlo_datasets?on_conflict=company_id', method: 'POST', service: true }, dataset);
  return { saved: r.ok, via: 'supabase' };
}
function sbHeaders(service) {
  const key = service ? process.env['supabase-service-key'] : process.env['supabase-anon-key'];
  return { 'apikey': key || '', 'Authorization': 'Bearer ' + (key || ''), 'Content-Type': 'application/json' };
}
function sbUrl() { return (process.env['supabase-project-id'] || '').replace(/\/$/, ''); }
function sb(req2, body) {
  return new Promise(resolve => {
    if (!sbUrl()) return resolve({ ok: false, skip: true });
    const u = new URL(sbUrl() + req2.path);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: req2.method || 'GET', headers: Object.assign(sbHeaders(req2.service), req2.method === 'POST' ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : {}) }, res => {
      let b = ''; res.on('data', c => { b += c; }); res.on('end', () => resolve({ ok: res.statusCode < 300, status: res.statusCode, body: b.slice(0, 4000) }));
    });
    req.on('error', () => resolve({ ok: false, err: true }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, err: true }); });
    if (data) req.end(data); else req.end();
  });
}
async function saveRun(run) { // table wlo_runs (create in supabase SQL editor; ignored if missing)
  return sb({ path: '/rest/v1/wlo_runs', method: 'POST', service: true }, run);
}
async function listRuns(companyId) {
  const q = companyId ? `?company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=50` : '?order=created_at.desc&limit=50';
  const r = await sb({ path: '/rest/v1/wlo_runs' + q, method: 'GET' });
  if (!r.ok) return null;
  try { return JSON.parse(r.body); } catch { return null; }
}
// Free OpenRouter routes (e.g. `openrouter/free`) sometimes pick a reasoning
// model that spends the entire token budget on hidden reasoning and returns
// `content: null`. These instruction-tuned models are used as fallbacks so the
// demo always gets usable prose; override with OPENROUTER_FALLBACK_MODELS.
// NOTE: check https://openrouter.ai/api/v1/models for `:free` slugs — the free
// catalogue rotates, and dead slugs just waste a round-trip.
const LLM_FALLBACKS = (process.env.OPENROUTER_FALLBACK_MODELS ||
  'google/gemma-4-31b-it:free,qwen/qwen3.8-27b:free,z-ai/glm-5.2:free,nvidia/nemotron-3-super-120b-a12b:free,liquid/lfm-2.5-2.6b:free')
  .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

// Turn a raw OpenRouter/OpenAI response body into a classified failure so the
// UI can say WHY the AI card fell back to the deterministic template.
function classifyLlmError(body){
  const raw = String(body || '');
  let apiMsg = '';
  try { const j = JSON.parse(raw); apiMsg = (j.error && (j.error.message || j.error.code)) || ''; } catch (e) {}
  const low = (raw + ' ' + apiMsg).toLowerCase();
  if (low.indexOf('rate limit') >= 0 || low.indexOf('429') >= 0)
    return { reason: 'rate-limit', detail: apiMsg || 'free daily quota exhausted' };
  if (low.indexOf('no endpoints found') >= 0 || low.indexOf('unavailable for free') >= 0)
    return { reason: 'model-unavailable', detail: apiMsg || 'model slug not served' };
  if (low.indexOf('insufficient') >= 0 || low.indexOf('401') >= 0 || low.indexOf('invalid api key') >= 0)
    return { reason: 'auth', detail: apiMsg || 'bad API key' };
  return { reason: 'error', detail: apiMsg || raw.slice(0, 160) };
}

function llmOnce(model, messages, opts, key, host, rpath, useOR) {
  return new Promise(resolve => {
    const body = JSON.stringify({ model: model, messages: messages, max_tokens: opts.maxTokens || 900, temperature: opts.temperature != null ? opts.temperature : 0.5 });
    const req = https.request({ hostname: host, path: rpath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body), ...(useOR ? { 'HTTP-Referer': 'http://localhost:4000', 'X-Title': 'WLO-hackathon' } : {}) } },
      res => { let b = ''; res.on('data', c => { b += c; }); res.on('end', () => { try { const j = JSON.parse(b); const msg = (j.choices && j.choices[0] && j.choices[0].message) || {}; const text = String(msg.content || '').trim(); if (!text) { const cls = classifyLlmError(b); resolve({ ok: false, model: j.model || model, finish: j.choices && j.choices[0] && j.choices[0].finish_reason, reasoning: !!msg.reasoning, reason: cls.reason, detail: cls.detail, raw: b.slice(0, 400) }); return; } resolve({ ok: true, model: j.model || model, text: text, finish: j.choices && j.choices[0] && j.choices[0].finish_reason, reasoning: !!msg.reasoning, raw: b.slice(0, 500) }); } catch { const cls = classifyLlmError(b); resolve({ ok: false, model: model, reason: cls.reason, detail: cls.detail, body: b.slice(0, 400) }); } }); });
    req.on('error', () => resolve({ ok: false, model: model, err: true, reason: 'network' }));
    req.setTimeout(opts.timeout || 15000, () => { req.destroy(); resolve({ ok: false, model: model, err: true, timeout: true, reason: 'timeout' }); });
    req.end(body);
  });
}

async function llmChat(messages, opts) { // OpenRouter (backend .env), fallback to OpenAI layout
  opts = opts || {};
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  if (!key) return { ok: false, noKey: true, reason: 'no-key', detail: 'no LLM API key configured' };
  const useOR = !!process.env.OPENROUTER_API_KEY;
  const host = useOR ? 'openrouter.ai' : new URL(process.env.LLM_BASE || 'https://api.openai.com').hostname;
  const rpath = useOR ? '/api/v1/chat/completions' : '/v1/chat/completions';
  const budget = opts.maxTokens || 900;
  const primary = process.env.OPENROUTER_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini';
  const attempts = [{ model: primary, maxTokens: budget }];
  if (useOR) {
    // same model again with double the budget in case reasoning ate it all
    attempts.push({ model: primary, maxTokens: budget * 2 });
    LLM_FALLBACKS.forEach(function (m) { if (m !== primary) attempts.push({ model: m, maxTokens: budget }); });
  }
  let last = { ok: false, err: true, reason: 'error' };
  let sawText = false;
  const deadline = Date.now() + (opts.deadlineMs || 45000);
  for (let i = 0; i < attempts.length; i++) {
    if (Date.now() > deadline) { last = { ok: false, timeout: true, reason: 'timeout', detail: 'LLM deadline exceeded' }; break; }
    const r = await llmOnce(attempts[i].model, messages, { maxTokens: attempts[i].maxTokens, temperature: opts.temperature }, key, host, rpath, useOR);
    if (r && r.ok && r.text) { sawText = true; return r; }
    if (r && r.noKey) return r;
    // a rate-limit is account-wide: trying more free slugs just burns time
    if (r && r.reason === 'rate-limit') { last = r; break; }
    if (r && r.reason === 'auth') { last = r; break; }
    last = r || last;
  }
  if (!last || !last.reason) last = { ok: false, reason: 'empty', detail: 'model returned no text' };
  last.ok = false; last.empty = !sawText;
  return last;
}
async function listWarehouses() {
  const r = await sb({ path: '/rest/v1/wlo_warehouses?select=*&order=id', method: 'GET' });
  if (!r.ok) return null;
  try {
    const rows = JSON.parse(r.body);
    return rows.map(function (w) {
      return { id: w.id, name: w.name, x: +w.x, y: +w.y, capacity: +w.capacity,
        storageM3: +w.storage_m3, throughputPerHr: +w.throughput_per_hr,
        handlingCostPerUnit: +w.handling_cost_per_unit,
        fixedOperatingCost: +w.fixed_operating_cost,
        open: w.open !== false, waves: w.waves || [8, 12, 16, 20],
        vehicles: w.vehicles || [{ id: w.id + '-V1', capacityUnits: 20, speedKmH: 30, maxStops: 8 }] };
    });
  } catch { return null; }
}
async function saveWarehouses(warehouses) {
  if (!sbUrl()) return { saved: false, via: 'local-only' };
  const rows = (warehouses || []).map(function (w) {
    return { id: w.id, name: w.name || w.id, x: +w.x || 0, y: +w.y || 0,
      capacity: +w.capacity || 500, storage_m3: +w.storageM3 || 3,
      throughput_per_hr: +w.throughputPerHr || 100,
      handling_cost_per_unit: +w.handlingCostPerUnit || 1.2,
      fixed_operating_cost: +w.fixedOperatingCost || 600,
      open: w.open !== false, waves: w.waves || [8, 12, 16, 20],
      vehicles: w.vehicles || [], updated_at: new Date().toISOString() };
  });
  for (const row of rows) {
    const r = await sb({ path: '/rest/v1/wlo_warehouses?on_conflict=id', method: 'POST', service: true }, row);
    if (!r.ok) return { saved: false, via: 'supabase-error', status: r.status };
  }
  return { saved: true, via: 'supabase', count: rows.length };
}
module.exports = { login, signup, verify, saveDataset, saveRun, listRuns, llmChat, sbUrl, listWarehouses, saveWarehouses };
