# OpenClaw Dashboard

Real-time monitoring dashboard for OpenClaw gateways.

![Dashboard Preview](screenshot.png)

## Features

- **Multi-gateway support** - Monitor up to 10 gateways simultaneously
- **Real-time health monitoring** - Gateway status, latency, version info
- **Session tracking** - Active sessions and recent activity
- **Cron job monitoring** - Next run times and last execution status
- **Dark theme** - Easy on the eyes terminal-inspired design

## Quick Start

```bash
# Clone and run
npm install
npm start

# Custom port (default: 3080)
PORT=3000 npm start

# Multiple gateways
GATEWAYS="Robert:127.0.0.1:34567,Lillian:192.168.1.100:34567" npm start
```

## Gateway Configuration

Format: `NAME:HOST:PORT:TOKEN`

- `NAME` - Display name for the gateway card
- `HOST` - Gateway IP or hostname
- `PORT` - Gateway port (default: 34567)
- `TOKEN` - Optional auth token

Environment variables:
- `OPENCLAW_TOKEN` - Default token if not specified in gateway config
- `DASHBOARD_PORT` - Port for the dashboard itself (default: 3080)

## API Endpoints

- `GET /` - Dashboard HTML
- `GET /health` - Dashboard health check
- `GET /api/gateways` - JSON data for all gateways
- `GET /api/gateways/:name` - JSON data for specific gateway

## Architecture

Single HTML file with embedded CSS/JS polls gateways every 30 seconds.
No external dependencies - pure Node.js built-ins.

## License

MIT

## Windows Setup

```batch
# Clone the repo
git clone https://github.com/fam-hulten/openclaw-dashboard.git
cd openclaw-dashboard

# Run setup (or just start directly)
setup.bat

# With Lillian's gateway:
start-lillian.bat
```

## Current Status (2026-03-28)

- Dashboard: Works in WSL2, network isolation issue with Windows
- Alternative: Run directly on Windows with Node.js
- Lillian's gateway: 192.168.1.194:18789

## Authentication

If the `/health` endpoint requires authentication, set the token:

```bash
# Via environment variable
export OPENCLAW_TOKEN=your_token_here

# Or inline in GATEWAYS
GATEWAYS="Lillian:192.168.1.194:18789:YOUR_TOKEN" node index.js
```

**Windows PowerShell:**
```powershell
$env:OPENCLAW_TOKEN="your_token_here"
node index.js
```
