const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
app.use(express.static("public"));

// ゲームルーム管理
let rooms = {};  // { roomId: { players: [socket.id, ...], hands: {}, turn: 0, deck: [] } }

io.on("connection", (socket) => {
  console.log("接続:", socket.id);

    socket.on("join", (roomId) => {
  if (!rooms[roomId]) {
    rooms[roomId] = { players: [], hands: {}, turn: 0, deck: [] };
  }

  const room = rooms[roomId];
  if (room.players.length >= 8) {
    socket.emit("full");
    return;
  }

  room.players.push(socket.id);
  socket.join(roomId);

  // ルーム参加者に更新通知
  io.to(roomId).emit("joined", {
    players: room.players,
    roomId,
    yourId: socket.id
  });
});

socket.on("start", (roomId) => {
  const room = rooms[roomId];
  if (!room) return;
  // 開始をプレイヤー1のみに制限
  if (socket.id === room.players[0]) {
    startGame(roomId);
  }
});


  socket.on("play", ({ roomId, card }) => {
    const room = rooms[roomId];
    const currentPlayerId = room.players[room.turn];
    if (socket.id !== currentPlayerId) return;

    // 手札からカードを削除
    const hand = room.hands[socket.id];
    const index = hand.indexOf(card);
    if (index !== -1) hand.splice(index, 1);

    // 勝利チェック
    if (hand.length === 0) {
      io.to(roomId).emit("end", socket.id);
      return;
    }

    // 次のターンへ
    room.turn = (room.turn + 1) % room.players.length;
    io.to(roomId).emit("update", {
      board: card,
      hands: getPublicHands(room),
      turn: room.turn,
    });
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      room.players = room.players.filter((id) => id !== socket.id);
      delete room.hands[socket.id];
      if (room.players.length === 0) delete rooms[roomId];
    }
  });
});

function startGame(roomId) {
  const room = rooms[roomId];
  const deck = shuffle([...Array(10).keys()].map(x => x + 1));
  room.deck = deck;
  room.turn = 0;
  room.hands = {};

  for (const playerId of room.players) {
    room.hands[playerId] = deck.splice(0, 5);
  }

  io.to(roomId).emit("start", {
    hands: getPublicHands(room),
    turn: room.turn,
  });
}

function getPublicHands(room) {
  const result = {};
  for (const id of room.players) {
    result[id] = room.hands[id];
  }
  return result;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

server.listen(PORT, () => {
  console.log(`サーバー起動中: http://localhost:${PORT}`);
});
