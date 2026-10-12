import assert from 'node:assert/strict';

const base = process.env.QUADRIDGE_URL || 'http://127.0.0.1:8787';

async function post(path, data) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return { status: response.status, body: await response.json() };
}

function connect(path, token) {
  const url = new URL(path, base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url, ['quadridge', `auth.${token}`]);
  const queue = [];
  const listeners = [];
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    const next = listeners.shift();
    if (next) next(data); else queue.push(data);
  });
  return {
    socket,
    next() {
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WebSocket の応答がありません。')), 5000);
        listeners.push(value => { clearTimeout(timer); resolve(value); });
      });
    },
    async nextMatching(predicate) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const value = await this.next();
        if (predicate(value)) return value;
      }
      throw new Error('期待する WebSocket 応答がありません。');
    },
  };
}

const bad = await post('/api/rooms', { displayName: '<script>' });
assert.equal(bad.status, 400);

const first = await post('/api/rooms', { displayName: 'Alice' });
assert.equal(first.status, 201);
assert.match(first.body.code, /^[A-Z0-9]{6}$/);
assert.ok(first.body.playerId !== first.body.displayName);
const second = await post(`/api/rooms/${first.body.code.toLowerCase()}/join`, { displayName: 'Alice' });
assert.equal(second.status, 200);
assert.notEqual(first.body.playerId, second.body.playerId);
const full = await post(`/api/rooms/${first.body.code}/join`, { displayName: 'Third' });
assert.equal(full.status, 409);

const a = connect(`/api/rooms/${first.body.code}/ws`, first.body.token);
const b = connect(`/api/rooms/${first.body.code}/ws`, second.body.token);
const aState = await a.next();
const bState = await b.next();
assert.equal(aState.type, 'state');
assert.equal(bState.type, 'state');
assert.equal(aState.started, true);
assert.equal(aState.hand.length, 3);
assert.equal(bState.hand.length, 3);
assert.equal(aState.players[0].displayName, 'Alice');
assert.equal(aState.players[1].displayName, 'Alice');
assert.equal(JSON.stringify(aState).includes(first.body.token), false);
assert.equal(JSON.stringify(aState).includes('bag'), false);

b.socket.send(JSON.stringify({ type: 'place', slot: 0, rotation: 0, x: 5, y: 5 }));
const wrongTurn = await b.nextMatching(value => value.type === 'error');
assert.equal(wrongTurn.type, 'error');

a.socket.send(JSON.stringify({ type: 'place', slot: 0, rotation: 0, x: 5, y: 5 }));
const nextA = await a.nextMatching(value => value.type === 'state' && value.moves === 1);
assert.equal(nextA.moves, 1);
assert.equal(nextA.turn, 1);
assert.equal(nextA.board.filter(value => value === 0).length, 4);
a.socket.close(); b.socket.close();

const queued = await post('/api/matchmaking', { displayName: '一人目' });
assert.equal(queued.status, 201);
const queuedSocket = connect('/api/matchmaking/ws', queued.body.ticket);
assert.equal((await queuedSocket.next()).type, 'waiting');
const matched = await post('/api/matchmaking', { displayName: '二人目' });
assert.equal(matched.status, 201);
const matchedSocket = connect('/api/matchmaking/ws', matched.body.ticket);
const firstMatch = await queuedSocket.next();
assert.equal(firstMatch.type, 'matched');
const secondMatch = await matchedSocket.next();
assert.equal(secondMatch.type, 'matched');
assert.equal(firstMatch.code, secondMatch.code);
assert.notEqual(firstMatch.playerId, secondMatch.playerId);
queuedSocket.socket.close(); matchedSocket.socket.close();

const invite = await fetch(`${base}/room/${first.body.code}`);
assert.equal(invite.status, 200);
assert.match(await invite.text(), /QUADRIDGE/);
console.log('オンライン対戦の結合確認に成功しました。');
