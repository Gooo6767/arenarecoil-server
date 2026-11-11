const express = require('express');
const http = require('http');
const { ExpressPeerServer } = require('peer');

const app = express();
const port = process.env.PORT || 10000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());

const lobbies = new Map();
const connectedPeers = new Set();

app.get('/', (req, res) => res.send({ status: 'live', online: connectedPeers.size, lobbies: lobbies.size }));
app.get('/ping', (req, res) => res.send('ok')); // Used by client to detect when server wakes up

app.get('/api/lobbies', (req, res) => {
  const now = Date.now();
  const list = [];
  for (const [code, l] of lobbies.entries()) {
    if (now - l.ts > 15000) lobbies.delete(code);
    else list.push(l);
  }
  res.json({ online: Math.max(1, connectedPeers.size), lobbies: list });
});

app.post('/api/register-lobby', (req, res) => {
  const { code, host, num, phase, priv } = req.body || {};
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Missing code' });
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (priv) lobbies.delete(c);
  else lobbies.set(c, {
    c,
    h: String(host || 'Host').replace(/[^\w .\-]/g, '').slice(0, 14) || 'Host',
    n: Math.min(20, Math.max(1, +num || 1)),
    ph: ['lobby', 'play', 'end'].includes(phase) ? phase : 'lobby',
    ts: Date.now()
  });
  res.json({ ok: true });
});

const server = http.createServer(app);

// Keep-alive settings to prevent Render proxy from dropping idle connections
const peerServer = ExpressPeerServer(server, { 
  debug: false, 
  proxied: true, 
  allow_discovery: false,
  alive_timeout: 60000,
  key: 'peerjs'
});

app.use('/peerjs', peerServer);

peerServer.on('connection', (client) => {
  connectedPeers.add(client.getId());
});

peerServer.on('disconnect', (client) => {
  const id = client.getId();
  connectedPeers.delete(id);
  for (const code of [...lobbies.keys()]) {
    if (id === 'arenarecoil-' + code) lobbies.delete(code);
  }
});

server.listen(port, () => console.log('Arena Recoil signaling server running on port ' + port));
