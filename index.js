#!/usr/bin/env node
/**
 * OpenClaw Multi-Gateway Dashboard v3
 * 
 * Aggregates health, status, sessions, and cron jobs from multiple OpenClaw gateways.
 * Uses HTTP API instead of CLI for Docker compatibility.
 */

const http = require('http');
const https = require('https');

const PORT = process.env.DASHBOARD_PORT || 3080;
const REFRESH_MS = 30000;

// Gateway configurations
// Format: NAME:HOST:PORT:TOKEN
const GATEWAY_CONFIG = process.env.GATEWAYS 
  ? process.env.GATEWAYS.split(',')
  : ['Robert:127.0.0.1:34567'];

function parseGatewayConfig(config) {
  const parts = config.split(':');
  return {
    name: parts[0] || 'Unknown',
    host: parts[1] || '127.0.0.1',
    port: parts[2] || '34567',
    token: parts[3] || process.env.OPENCLAW_TOKEN || ''
  };
}

function httpGet(host, port, path, token) {
  return new Promise((resolve, reject) => {
    const protocol = port === '443' ? https : http;
    const options = {
      hostname: host,
      port: port,
      path: path,
      method: 'GET',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    };
    
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'Failed to parse response', raw: data.substring(0, 200) });
        }
      });
    });
    
    req.on('error', (e) => resolve({ error: e.message }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ error: 'Timeout' }); });
    req.end();
  });
}

async function getGatewayData(gateway) {
  // Use /health endpoint which returns simple JSON
  const health = await httpGet(gateway.host, gateway.port, '/health', gateway.token);
  
  // Status and cron require WebSocket or CLI, so we use a simple approach
  // For now, just show health status
  return {
    ...gateway,
    health,
    status: {},
    cronJobs: [],
    success: !health.error && health.ok === true
  };
}

async function pollAllGateways() {
  return Promise.all(GATEWAY_CONFIG.map(parseGatewayConfig).map(getGatewayData));
}

function formatAge(ms) {
  if (!ms) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function timeAgo(ms) {
  if (!ms) return '—';
  return formatAge(Date.now() - ms);
}

function renderCronJob(job) {
  const status = job.state?.lastRunStatus || 'unknown';
  const statusColor = status === 'ok' ? '#22c55e' : status === 'error' ? '#ef4444' : '#f59e0b';
  const lastRun = job.state?.lastRunAtMs ? timeAgo(job.state.lastRunAtMs) : 'never';
  const nextRun = job.state?.nextRunAtMs ? timeAgo(job.state.nextRunAtMs) : '—';
  const enabled = job.enabled ? '🟢' : '🔴';
  
  return `
    <div class="cron-job">
      <div class="cron-header">
        <span class="cron-name">${enabled} ${job.name}</span>
        <span class="cron-status" style="color: ${statusColor}">${status}</span>
      </div>
      <div class="cron-meta">
        <span>Last: ${lastRun}</span>
        <span>Next: ${nextRun}</span>
      </div>
    </div>
  `;
}

function renderRecentSession(session) {
  const age = session.age ? timeAgo(session.age) : '—';
  const ctxPct = session.percentUsed ? `${session.percentUsed}%` : '—';
  const tokens = session.totalTokens ? Math.round(session.totalTokens / 1000) + 'k' : '—';
  const kind = session.kind === 'group' ? '👥' : '📱';
  
  return `
    <div class="session-item">
      <span class="session-kind">${kind}</span>
      <span class="session-info">
        <span class="session-key">${session.key?.split(':').slice(-2).join(':').substring(0, 30) || '—'}</span>
        <span class="session-meta">${ctxPct} ctx • ${tokens} tok • ${age} ago</span>
      </span>
    </div>
  `;
}

function renderGatewayCard(gw) {
  const status = gw.success ? 'OK' : 'ERROR';
  const statusColor = gw.success ? '#22c55e' : '#ef4444';
  const health = gw.health || {};
  const statusData = gw.status || {};
  const cronJobs = gw.cronJobs || [];
  
  // Channel info
  const channels = health.channels || {};
  const discord = channels.discord;
  const discordOk = discord?.running;
  
  // Sessions
  const sessionCount = statusData.sessions?.count || 
                       health.agents?.[0]?.sessions?.count || 
                       status?.sessions?.count || 0;
  const recentSessions = (statusData.sessions?.recent || 
                         health.agents?.[0]?.sessions?.recent || 
                         status?.sessions?.recent || []).slice(0, 5);
  
  // Runtime version
  const version = statusData.runtimeVersion || status?.runtimeVersion || '—';
  
  // Cron stats
  const cronOk = cronJobs.filter(j => j.state?.lastRunStatus === 'ok').length;
  const cronError = cronJobs.filter(j => j.state?.lastRunStatus === 'error').length;
  
  const errorMsg = gw.health?.error || statusData?.error || '';
  
  return `
    <div class="gateway-card" style="border-left: 4px solid ${statusColor}">
      <div class="card-header">
        <h2>${gw.name}</h2>
        <span class="status-badge" style="background: ${statusColor}">${status}</span>
      </div>
      <p class="host-info">${gw.host}:${gw.port} • v${version}</p>
      
      <div class="metrics-grid">
        <div class="metric-box">
          <span class="metric-value">${sessionCount}</span>
          <span class="metric-label">Sessions</span>
        </div>
        <div class="metric-box">
          <span class="metric-value" style="color: ${discordOk ? '#22c55e' : '#ef4444'}">${discordOk ? 'ON' : 'OFF'}</span>
          <span class="metric-label">Discord</span>
        </div>
        <div class="metric-box">
          <span class="metric-value" style="color: ${cronError > 0 ? '#f59e0b' : '#60a5fa'}">${cronOk}/${cronJobs.length}</span>
          <span class="metric-label">Cron Jobs</span>
        </div>
        <div class="metric-box">
          <span class="metric-value">${formatAge(health.durationMs || 0)}</span>
          <span class="metric-label">Response</span>
        </div>
      </div>
      
      ${cronJobs.length > 0 ? `
      <div class="section">
        <h3>Cron Jobs</h3>
        <div class="cron-list">
          ${cronJobs.slice(0, 4).map(renderCronJob).join('')}
        </div>
      </div>
      ` : ''}
      
      ${recentSessions.length > 0 ? `
      <div class="section">
        <h3>Recent Sessions</h3>
        <div class="session-list">
          ${recentSessions.map(renderRecentSession).join('')}
        </div>
      </div>
      ` : ''}
      
      ${errorMsg ? `<p class="error-msg">⚠️ ${errorMsg}</p>` : ''}
    </div>
  `;
}

function renderDashboard(gateways) {
  const timestamp = new Date().toLocaleString('sv-SE');
  const allCronJobs = gateways.flatMap(g => g.cronJobs || []);
  const totalCronErrors = allCronJobs.filter(j => j.state?.lastRunStatus === 'error').length;
  
  const alertBanner = totalCronErrors > 0 
    ? `<div class="alert-banner">⚠️ ${totalCronErrors} cron job(s) with errors</div>` 
    : '';

  return `<!DOCTYPE html>
<html lang="sv-SE">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔮 OpenClaw Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0f0f1a;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    .header h1 { 
      font-size: 28px;
      color: #fff;
      margin-bottom: 5px;
    }
    .timestamp {
      color: #666;
      font-size: 12px;
    }
    .alert-banner {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      padding: 10px 20px;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 20px;
      font-weight: 600;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      gap: 20px;
    }
    .gateway-card {
      background: #1a1a2e;
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 5px;
    }
    .gateway-card h2 {
      font-size: 20px;
      font-weight: 600;
    }
    .status-badge {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #fff;
    }
    .host-info {
      font-size: 12px;
      color: #666;
      margin-bottom: 20px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    .metric-box {
      background: #16213e;
      border-radius: 10px;
      padding: 12px 8px;
      text-align: center;
    }
    .metric-value {
      font-size: 20px;
      font-weight: 700;
      color: #60a5fa;
      display: block;
    }
    .metric-label {
      font-size: 10px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .section {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #2a2a4a;
    }
    .section h3 {
      font-size: 12px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .cron-list, .session-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .cron-job {
      background: #16213e;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .cron-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .cron-name {
      font-size: 13px;
      font-weight: 500;
    }
    .cron-status {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .cron-meta {
      display: flex;
      gap: 15px;
      font-size: 11px;
      color: #666;
      margin-top: 4px;
    }
    .session-item {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #16213e;
      border-radius: 8px;
      padding: 8px 12px;
    }
    .session-kind {
      font-size: 16px;
    }
    .session-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .session-key {
      font-size: 12px;
      color: #888;
    }
    .session-meta {
      font-size: 11px;
      color: #555;
    }
    .error-msg {
      color: #ef4444;
      font-size: 12px;
      margin-top: 15px;
      padding: 10px;
      background: rgba(239,68,68,0.1);
      border-radius: 8px;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      color: #444;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔮 OpenClaw Dashboard</h1>
    <p class="timestamp">${timestamp}</p>
  </div>
  
  ${alertBanner}
  
  <div class="container">
    ${gateways.map(renderGatewayCard).join('')}
  </div>
  
  <p class="footer">Auto-refresh: ${REFRESH_MS/1000}s • Press Ctrl+C to stop</p>
  
  <script>
    setTimeout(() => location.reload(), ${REFRESH_MS});
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    try {
      const gateways = await pollAllGateways();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderDashboard(gateways));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Error: ${error.message}`);
    }
  } else if (req.url === '/api/health') {
    try {
      const gateways = await pollAllGateways();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ gateways, timestamp: new Date().toISOString() }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 OpenClaw Dashboard v3 running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Monitoring ${GATEWAY_CONFIG.length} gateway(s)`);
  console.log(`Gateways: ${GATEWAY_CONFIG.join(', ')}`);
});
