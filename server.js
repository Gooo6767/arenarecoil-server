const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

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

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 20000
});

const lobbies = new Map();

// Endpoints
app.get('/', (req, res) => res.send({ status: 'live', online: io.engine.clientsCount, lobbies: lobbies.size }));
app.get('/ping', (req, res) => res.send('ok')); // UptimeRobot pings this

app.get('/api/lobbies', (req, res) => {
  const list = [];
  for (const [code, l] of lobbies.entries()) {
    if (!l.priv) list.push({ c: l.code, h: l.hostName, n: l.num, ph: l.phase });
  }
  res.json({ online: Math.max(1, io.engine.clientsCount), lobbies: list });
});

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('host-lobby', ({ code, name, priv }) => {
    currentRoom = code.toUpperCase();
    socket.join(currentRoom);
    lobbies.set(currentRoom, {
      code: currentRoom,
      hostId: socket.id,
      hostName: name || 'Host',
      num: 1,
      phase: 'lobby',
      priv: !!priv
    });
    socket.emit('hosted', { id: socket.id });
  });

  socket.on('join-lobby', ({ code, name, skin }) => {
    const roomCode = code.toUpperCase();
    const lobby = lobbies.get(roomCode);
    if (!lobby) {
      return socket.emit('join-error', 'Lobby not found. Check the code.');
    }
    if (lobby.num >= 20) {
      return socket.emit('join-error', 'Lobby is full.');
    }

    currentRoom = roomCode;
    socket.join(currentRoom);
    lobby.num = io.sockets.adapter.rooms.get(currentRoom)?.size || (lobby.num + 1);

    socket.emit('joined', { id: socket.id, hostId: lobby.hostId });

    // Send handshake to the host
    io.to(lobby.hostId).emit('from-client', {
      from: socket.id,
      msg: { t: 'hi', name, skin }
    });
  });

  socket.on('to-host', (msg) => {
    if (!currentRoom) return;
    const lobby = lobbies.get(currentRoom);
    if (lobby && lobby.hostId) {
      io.to(lobby.hostId).emit('from-client', { from: socket.id, msg });
    }
  });

  socket.on('broadcast', (msg) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('from-host', msg);
  });

  socket.on('to-client', ({ to, msg }) => {
    io.to(to).emit('from-host', msg);
  });

  socket.on('update-lobby', (data) => {
    if (!currentRoom) return;
    const lobby = lobbies.get(currentRoom);
    if (lobby && lobby.hostId === socket.id) {
      if (data.phase) lobby.phase = data.phase;
      if (data.num !== undefined) lobby.num = data.num;
      if (data.priv !== undefined) lobby.priv = data.priv;
    }
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const lobby = lobbies.get(currentRoom);
    if (lobby) {
      const room = io.sockets.adapter.rooms.get(currentRoom);
      if (!room || room.size === 0) {
        lobbies.delete(currentRoom);
      } else {
        lobby.num = room.size;
        if (lobby.hostId === socket.id) {
          const [nextHostId] = room;
          lobby.hostId = nextHostId;
          io.to(nextHostId).emit('promoted-to-host');
          io.to(currentRoom).emit('from-host', { t: 'host-migrated', newHost: nextHostId });
        }
        io.to(lobby.hostId).emit('client-disconnected', { id: socket.id });
      }
    }
  });
});

server.listen(port, () => console.log('Arena Recoil Socket.io server running on port ' + port));
