
const express = require('express');
const { ExpressPeerServer } = require('peer');

const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Arena Recoil Signaling Server is Live!');
});

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});

app.use('/peerjs', peerServer);

