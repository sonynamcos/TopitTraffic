#!/usr/bin/env node
/**
 * TopitTraffic Dev Dashboard
 * 3개 Vite 앱(TopIt-Traffic-Web, TopIT-GreenWave, TrafficAgent)을
 * 브라우저에서 시작/중지/모니터링하는 대시보드.
 *
 * 실행: node dashboard.mjs
 * 접속: http://localhost:4000
 */

import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 4000;

// ── App definitions ──────────────────────────────────────────────
const apps = [
  { id: 'traffic-web', name: 'TopIt-Traffic-Web', cwd: __dirname, port: 5173, color: '#60a5fa' },
  { id: 'greenwave',   name: 'TopIT-GreenWave',  cwd: resolve(__dirname, 'TopIT-GreenWave'), port: 5174, color: '#34d399' },
  { id: 'agent',       name: 'TrafficAgent',      cwd: resolve(__dirname, 'TrafficAgent'),    port: 5175, color: '#c084fc' },
];

// ── Process state ────────────────────────────────────────────────
const state = {};          // id → { proc, status, startedAt, logs[] }
const sseClients = [];     // active SSE connections
const MAX_LOGS = 500;

for (const app of apps) {
  state[app.id] = { proc: null, status: 'stopped', startedAt: null, logs: [] };
}

// ── SSE broadcast ────────────────────────────────────────────────
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try { sseClients[i].write(msg); } catch { sseClients.splice(i, 1); }
  }
}

function pushLog(id, text) {
  const line = { ts: Date.now(), text: text.replace(/\r/g, '') };
  const s = state[id];
  s.logs.push(line);
  if (s.logs.length > MAX_LOGS) s.logs.splice(0, s.logs.length - MAX_LOGS);
  broadcast('log', { id, ...line });
}

function broadcastStatus(id) {
  const s = state[id];
  broadcast('status', { id, status: s.status, startedAt: s.startedAt });
}

// ── Process management ───────────────────────────────────────────
async function ensureNodeModules(app) {
  const nmDir = resolve(app.cwd, 'node_modules');
  if (existsSync(nmDir)) return;
  pushLog(app.id, `[dashboard] node_modules not found, running npm install...`);
  try {
    execSync('npm install', { cwd: app.cwd, stdio: 'pipe', shell: true, timeout: 120000 });
    pushLog(app.id, `[dashboard] npm install completed.`);
  } catch (e) {
    pushLog(app.id, `[dashboard] npm install failed: ${e.message}`);
    throw e;
  }
}

async function startApp(app) {
  const s = state[app.id];
  if (s.status === 'running') return;

  s.status = 'starting';
  s.logs = [];
  broadcastStatus(app.id);

  try {
    await ensureNodeModules(app);
  } catch {
    s.status = 'stopped';
    broadcastStatus(app.id);
    return;
  }

  const proc = spawn('cmd', ['/c', 'npx', 'vite', '--port', String(app.port)], {
    cwd: app.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  s.proc = proc;
  s.startedAt = Date.now();

  const onData = (chunk) => {
    const lines = chunk.toString('utf8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      pushLog(app.id, line);
      // Detect "ready" from vite output
      if (line.includes('Local:') || line.includes('ready in')) {
        s.status = 'running';
        broadcastStatus(app.id);
      }
    }
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  proc.on('close', (code) => {
    s.proc = null;
    s.status = 'stopped';
    s.startedAt = null;
    pushLog(app.id, `[dashboard] Process exited with code ${code}`);
    broadcastStatus(app.id);
  });

  // If we haven't detected running status within 15s, assume running anyway
  setTimeout(() => {
    if (s.status === 'starting') {
      s.status = 'running';
      broadcastStatus(app.id);
    }
  }, 15000);
}

function stopApp(app) {
  const s = state[app.id];
  if (!s.proc) return;
  const pid = s.proc.pid;
  pushLog(app.id, `[dashboard] Stopping process (PID ${pid})...`);
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', shell: true });
  } catch {
    try { s.proc.kill('SIGTERM'); } catch { /* ignore */ }
  }
  s.proc = null;
  s.status = 'stopped';
  s.startedAt = null;
  broadcastStatus(app.id);
}

function stopAll() {
  for (const app of apps) stopApp(app);
}

// ── Cleanup on exit ──────────────────────────────────────────────
function cleanup() {
  stopAll();
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => { for (const app of apps) { try { stopApp(app); } catch {} } });

// ── HTTP helpers ─────────────────────────────────────────────────
function json(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getStatusPayload() {
  return apps.map(app => ({
    id: app.id,
    name: app.name,
    port: app.port,
    color: app.color,
    status: state[app.id].status,
    startedAt: state[app.id].startedAt,
  }));
}

// ── HTTP server ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // ── Dashboard HTML ──
  if (req.method === 'GET' && path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(dashboardHTML());
    return;
  }

  // ── SSE ──
  if (req.method === 'GET' && path === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`event: init\ndata: ${JSON.stringify(getStatusPayload())}\n\n`);
    sseClients.push(res);
    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
    return;
  }

  // ── API: status ──
  if (req.method === 'GET' && path === '/api/status') {
    return json(res, getStatusPayload());
  }

  // ── API: logs ──
  if (req.method === 'GET' && path.startsWith('/api/logs/')) {
    const id = path.split('/').pop();
    if (!state[id]) return json(res, { error: 'not found' }, 404);
    return json(res, state[id].logs);
  }

  // ── API: start ──
  if (req.method === 'POST' && path.startsWith('/api/start/')) {
    const id = path.split('/').pop();
    const app = apps.find(a => a.id === id);
    if (!app) return json(res, { error: 'not found' }, 404);
    startApp(app);  // don't await — let it boot in background
    return json(res, { ok: true });
  }

  // ── API: stop ──
  if (req.method === 'POST' && path.startsWith('/api/stop/')) {
    const id = path.split('/').pop();
    const app = apps.find(a => a.id === id);
    if (!app) return json(res, { error: 'not found' }, 404);
    stopApp(app);
    return json(res, { ok: true });
  }

  // ── API: start-all ──
  if (req.method === 'POST' && path === '/api/start-all') {
    for (const app of apps) startApp(app);
    return json(res, { ok: true });
  }

  // ── API: stop-all ──
  if (req.method === 'POST' && path === '/api/stop-all') {
    stopAll();
    return json(res, { ok: true });
  }

  json(res, { error: 'not found' }, 404);
});

server.listen(PORT, () => {
  console.log(`\n  TopitTraffic Dev Dashboard`);
  console.log(`  http://localhost:${PORT}\n`);
  // Auto-start all apps on launch
  for (const app of apps) startApp(app);
});

// ── Dashboard HTML ───────────────────────────────────────────────
function dashboardHTML() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TopitTraffic Dev Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f172a;--card:#1e293b;--border:#334155;--text:#e2e8f0;--muted:#94a3b8;--green:#34d399;--red:#f87171;--yellow:#fbbf24;--blue:#60a5fa;--purple:#c084fc}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
.header{padding:24px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}
.header h1{font-size:20px;font-weight:600;letter-spacing:-0.5px}
.header h1 span{color:var(--blue);font-weight:700}
.header-actions{display:flex;gap:8px}
.btn{padding:8px 18px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
.btn-start{background:#065f46;color:var(--green)}
.btn-start:hover{background:#047857}
.btn-stop{background:#7f1d1d;color:var(--red)}
.btn-stop:hover{background:#991b1b}
.btn-sm{padding:6px 14px;font-size:12px}
.btn:disabled{opacity:.4;cursor:not-allowed}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:24px 32px}
@media(max-width:900px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;position:relative;overflow:hidden;backdrop-filter:blur(12px);transition:border-color .2s}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px}
.card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.app-name{font-size:15px;font-weight:600}
.badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.badge-stopped{background:rgba(248,113,113,.15);color:var(--red)}
.badge-starting{background:rgba(251,191,36,.15);color:var(--yellow)}
.badge-running{background:rgba(52,211,153,.15);color:var(--green)}
.card-info{display:flex;flex-direction:column;gap:6px;margin-bottom:16px;font-size:13px;color:var(--muted)}
.card-info a{color:inherit;text-decoration:none}
.card-info a:hover{color:var(--text);text-decoration:underline}
.card-actions{display:flex;gap:8px}
.console-section{padding:0 32px 32px}
.tabs{display:flex;gap:4px;margin-bottom:0}
.tab{padding:8px 18px;background:transparent;border:1px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
.tab.active{background:var(--card);color:var(--text);border-color:var(--border)}
.console{background:var(--card);border:1px solid var(--border);border-radius:0 8px 8px 8px;height:300px;overflow-y:auto;padding:12px 16px;font-family:'Cascadia Code','Fira Code','Consolas',monospace;font-size:12px;line-height:1.7}
.console::-webkit-scrollbar{width:6px}
.console::-webkit-scrollbar-track{background:transparent}
.console::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
.log-line{white-space:pre-wrap;word-break:break-all}
.log-line .ts{color:var(--muted);margin-right:8px;font-size:11px}
.uptime{font-variant-numeric:tabular-nums}
</style>
</head>
<body>

<div class="header">
  <h1><span>Topit</span>Traffic Dev Dashboard</h1>
  <div class="header-actions">
    <button class="btn btn-start" onclick="api('/api/start-all','POST')">Start All</button>
    <button class="btn btn-stop" onclick="api('/api/stop-all','POST')">Stop All</button>
  </div>
</div>

<div class="grid" id="grid"></div>

<div class="console-section">
  <div class="tabs" id="tabs"></div>
  <div class="console" id="console"></div>
</div>

<script>
const APPS = ${JSON.stringify(apps.map(a => ({ id: a.id, name: a.name, port: a.port, color: a.color })))};
const appState = {};
const logs = {};
let activeTab = APPS[0].id;

APPS.forEach(a => { appState[a.id] = { status: 'stopped', startedAt: null }; logs[a.id] = []; });

// ── Render ──
function render() {
  // Cards
  document.getElementById('grid').innerHTML = APPS.map(a => {
    const s = appState[a.id];
    const badgeCls = 'badge badge-' + s.status;
    const uptime = s.status === 'running' && s.startedAt ? formatUptime(Date.now() - s.startedAt) : '-';
    const portLink = s.status === 'running'
      ? '<a href="http://localhost:' + a.port + '" target="_blank">localhost:' + a.port + ' \\u2197</a>'
      : 'Port ' + a.port;
    const isRunning = s.status === 'running' || s.status === 'starting';
    return '<div class="card" style="border-color:' + (isRunning ? a.color + '40' : 'var(--border)') + '">'
      + '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:' + (isRunning ? a.color : 'transparent') + '"></div>'
      + '<div class="card-header">'
      + '<span class="app-name" style="color:' + a.color + '">' + a.name + '</span>'
      + '<span class="' + badgeCls + '">' + s.status + '</span>'
      + '</div>'
      + '<div class="card-info">'
      + '<div>' + portLink + '</div>'
      + '<div class="uptime">Uptime: ' + uptime + '</div>'
      + '</div>'
      + '<div class="card-actions">'
      + (isRunning
        ? '<button class="btn btn-stop btn-sm" onclick="api(\\'/api/stop/' + a.id + '\\',\\'POST\\')">Stop</button>'
        : '<button class="btn btn-start btn-sm" onclick="api(\\'/api/start/' + a.id + '\\',\\'POST\\')">Start</button>')
      + '</div>'
      + '</div>';
  }).join('');

  // Tabs
  document.getElementById('tabs').innerHTML = APPS.map(a =>
    '<div class="tab' + (activeTab === a.id ? ' active' : '') + '" '
    + 'style="' + (activeTab === a.id ? 'border-top:2px solid ' + a.color : '') + '" '
    + 'onclick="setTab(\\'' + a.id + '\\')">' + a.name + '</div>'
  ).join('');

  renderLogs();
}

function renderLogs() {
  const con = document.getElementById('console');
  const app = APPS.find(a => a.id === activeTab);
  const entries = logs[activeTab] || [];
  con.innerHTML = entries.map(l =>
    '<div class="log-line"><span class="ts">' + formatTime(l.ts) + '</span>'
    + '<span style="color:' + app.color + '">' + escapeHtml(l.text) + '</span></div>'
  ).join('');
  con.scrollTop = con.scrollHeight;
}

function setTab(id) { activeTab = id; render(); }

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return h + 'h ' + (m % 60) + 'm';
  if (m > 0) return m + 'm ' + (s % 60) + 's';
  return s + 's';
}

function formatTime(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2,'0') + ':'
    + String(d.getMinutes()).padStart(2,'0') + ':'
    + String(d.getSeconds()).padStart(2,'0');
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── API calls ──
async function api(path, method) {
  await fetch(path, { method });
}

// ── SSE ──
const es = new EventSource('/events');

es.addEventListener('init', e => {
  const data = JSON.parse(e.data);
  data.forEach(d => {
    appState[d.id] = { status: d.status, startedAt: d.startedAt };
  });
  render();
});

es.addEventListener('status', e => {
  const d = JSON.parse(e.data);
  appState[d.id] = { status: d.status, startedAt: d.startedAt };
  render();
});

es.addEventListener('log', e => {
  const d = JSON.parse(e.data);
  if (!logs[d.id]) logs[d.id] = [];
  logs[d.id].push({ ts: d.ts, text: d.text });
  if (logs[d.id].length > 500) logs[d.id].splice(0, logs[d.id].length - 500);
  if (d.id === activeTab) {
    const con = document.getElementById('console');
    const app = APPS.find(a => a.id === d.id);
    const div = document.createElement('div');
    div.className = 'log-line';
    div.innerHTML = '<span class="ts">' + formatTime(d.ts) + '</span>'
      + '<span style="color:' + app.color + '">' + escapeHtml(d.text) + '</span>';
    con.appendChild(div);
    // Auto-scroll if near bottom
    if (con.scrollHeight - con.scrollTop - con.clientHeight < 80) {
      con.scrollTop = con.scrollHeight;
    }
  }
});

// Update uptime every second
setInterval(() => {
  document.querySelectorAll('.uptime').forEach((el, i) => {
    const a = APPS[i];
    const s = appState[a.id];
    if (s.status === 'running' && s.startedAt) {
      el.textContent = 'Uptime: ' + formatUptime(Date.now() - s.startedAt);
    }
  });
}, 1000);

render();
</script>
</body>
</html>`;
}
