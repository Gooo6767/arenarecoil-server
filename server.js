const express = require('express');
const http = require('http');
const { ExpressPeerServer } = require('peer');

const app = express();
const port = process.env.PORT || 10000;

// Enable CORS so GitHub Pages or any client can access it
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(express.json());

// In-memory registry for lobbies and connected peers
const lobbies = new Map();
const connectedPeers = new Set();

app.get('/', (req, res) => {
  res.send({ status: 'live', online: connectedPeers.size, lobbies: lobbies.size });
});

// REST API for Lobby listing and registration
app.get('/api/lobbies', (req, res) => {
  const now = Date.now();
  const list = [];
  for (const [code, l] of lobbies.entries()) {
    if (now - l.ts > 15000) {
      lobbies.delete(code);
    } else {
      list.push(l);
    }
  }
  res.json({ online: Math.max(1, connectedPeers.size), lobbies: list });
});

app.post('/api/register-lobby', (req, res) => {
  const { code, host, num, phase, priv } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing code' });

  if (priv) {
    lobbies.delete(code);
  } else {
    lobbies.set(code, {
      c: code,
      h: host || 'Host',
      n: num || 1,
      ph: phase || 'lobby',
      ts: Date.now()
    });
  }
  res.json({ ok: true });
});

const server = http.createServer(app);

// PeerJS signaling setup
const peerServer = ExpressPeerServer(server, {
  debug: false,
  allow_discovery: true
});

app.use('/peerjs', peerServer);

peerServer.on('connection', (client) => {
  connectedPeers.add(client.getId());
});

peerServer.on('disconnect', (client) => {
  const id = client.getId();
  connectedPeers.delete(id);
  // Remove lobby if this peer was hosting it
  for (const [code, l] of lobbies.entries()) {
    if (id === 'arenarecoil-' + code) {
      lobbies.delete(code);
    }
  }
});

server.listen(port, () => {
  console.log(`Arena Recoil signaling server running on port ${port}`);
});
