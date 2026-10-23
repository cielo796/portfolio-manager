import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';

export const SERVICE = '_pm-sync._tcp.local';
const GROUP = '224.0.0.251';
const PORT = 5353;
const TYPES = { A: 1, PTR: 12, TXT: 16, SRV: 33, ANY: 255 };
const word = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const integer = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
export const discoveryAddresses = () => Object.values(networkInterfaces()).flat()
  .filter((item) => item?.family === 'IPv4' && !item.internal).map((item) => item.address).sort();

function name(value) {
  const labels = value.replace(/\.$/, '').split('.').map((label) => {
    const bytes = Buffer.from(label);
    if (!bytes.length || bytes.length > 63) throw new Error('Invalid DNS label');
    return Buffer.concat([Buffer.from([bytes.length]), bytes]);
  });
  const encoded = Buffer.concat([...labels, Buffer.from([0])]);
  if (encoded.length > 255) throw new Error('DNS name too long');
  return encoded;
}

/** @param {{questions?: Array<{name: string, type: number}>, records?: Array<{name: string, type: number, ttl?: number, data: unknown}>, response?: boolean}} message */
export function encodeMessage({ questions = [], records = [], response = false }) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(response ? 0x8400 : 0, 2);
  header.writeUInt16BE(questions.length, 4);
  header.writeUInt16BE(records.length, 6);
  return Buffer.concat([header, ...questions.map((q) => Buffer.concat([name(q.name), word(q.type), word(1)])), ...records.map((r) => {
    let data;
    if (r.type === TYPES.PTR) data = name(r.data);
    else if (r.type === TYPES.SRV) data = Buffer.concat([word(0), word(0), word(r.data.port), name(r.data.target)]);
    else if (r.type === TYPES.TXT) data = Buffer.concat(Object.entries(r.data).map(([key, value]) => {
      const bytes = Buffer.from(`${key}=${value}`);
      if (bytes.length > 255) throw new Error('TXT field too long');
      return Buffer.concat([Buffer.from([bytes.length]), bytes]);
    }));
    else if (r.type === TYPES.A) data = Buffer.from(r.data.split('.').map(Number));
    else throw new Error('Unsupported DNS record');
    return Buffer.concat([name(r.name), word(r.type), word(r.type === TYPES.PTR ? 1 : 0x8001), integer(r.ttl ?? 120), word(data.length), data]);
  })]);
}

export function decodeMessage(buffer) {
  if (buffer.length < 12 || buffer.length > 9000) throw new Error('Invalid DNS packet');
  let offset = 12;
  function readName(start) {
    let cursor = start;
    let end;
    const labels = [];
    const visited = new Set();
    let length = 0;
    while (true) {
      if (cursor >= buffer.length || visited.has(cursor)) throw new Error('Invalid DNS pointer');
      visited.add(cursor);
      const size = buffer[cursor++];
      if (!size) return { value: labels.join('.'), end: end ?? cursor };
      if ((size & 0xc0) === 0xc0) {
        if (cursor >= buffer.length) throw new Error('Truncated DNS pointer');
        end ??= cursor + 1;
        cursor = ((size & 0x3f) << 8) | buffer[cursor];
      } else {
        if (size > 63 || cursor + size > buffer.length || (length += size + 1) > 255) throw new Error('Invalid DNS label');
        labels.push(buffer.subarray(cursor, cursor + size).toString('utf8'));
        cursor += size;
      }
    }
  }
  const questions = [];
  const records = [];
  const questionCount = buffer.readUInt16BE(4);
  const recordCount = buffer.readUInt16BE(6) + buffer.readUInt16BE(8) + buffer.readUInt16BE(10);
  if (questionCount + recordCount > 256) throw new Error('Too many DNS records');
  for (let i = 0; i < questionCount; i++) {
    const q = readName(offset); offset = q.end;
    if (offset + 4 > buffer.length) throw new Error('Truncated question');
    questions.push({ name: q.value, type: buffer.readUInt16BE(offset), class: buffer.readUInt16BE(offset + 2) & 0x7fff }); offset += 4;
  }
  for (let i = 0; i < recordCount; i++) {
    const r = readName(offset); offset = r.end;
    if (offset + 10 > buffer.length) throw new Error('Truncated record');
    const type = buffer.readUInt16BE(offset);
    const klass = buffer.readUInt16BE(offset + 2) & 0x7fff;
    const ttl = buffer.readUInt32BE(offset + 4);
    const size = buffer.readUInt16BE(offset + 8); offset += 10;
    const end = offset + size;
    if (end > buffer.length) throw new Error('Truncated record data');
    let data;
    if (type === TYPES.PTR) { const n = readName(offset); if (n.end > end) throw new Error('Invalid PTR'); data = n.value; }
    if (type === TYPES.SRV) {
      if (size < 7) throw new Error('Invalid SRV');
      const n = readName(offset + 6); if (n.end > end) throw new Error('Invalid SRV target');
      data = { port: buffer.readUInt16BE(offset + 4), target: n.value };
    }
    if (type === TYPES.TXT) {
      data = {};
      let p = offset;
      while (p < end) {
        const length = buffer[p++]; if (p + length > end) throw new Error('Invalid TXT');
        const field = buffer.subarray(p, p + length).toString('utf8'); p += length;
        const separator = field.indexOf('=');
        if (separator > 0) Object.defineProperty(data, field.slice(0, separator), { value: field.slice(separator + 1), enumerable: true, configurable: true });
      }
    }
    if (type === TYPES.A && size === 4) data = [...buffer.subarray(offset, end)].join('.');
    if (klass === 1 && data !== undefined) records.push({ name: r.value, type, ttl, data });
    offset = end;
  }
  return { questions, records, response: Boolean(buffer.readUInt16BE(2) & 0x8000) };
}

export function announcement(self, address, port, ttl = 120) {
  const label = `pm-${self.deviceId}`;
  const instance = `${label}.${SERVICE}`;
  const host = `${label}.local`;
  return encodeMessage({ response: true, records: [
    { name: SERVICE, type: TYPES.PTR, ttl, data: instance },
    { name: instance, type: TYPES.SRV, ttl, data: { port, target: host } },
    { name: instance, type: TYPES.TXT, ttl, data: { deviceId: self.deviceId, deviceName: self.deviceName, schemaVersion: self.schemaVersion } },
    { name: host, type: TYPES.A, ttl, data: address },
  ] });
}

// IPv4の各LANインターフェイスに参加し、レコードが別パケットでも短期間キャッシュして結合する。
export async function startDiscovery({ self, port, onPeer, log = () => {}, socketFactory = createSocket,
  addresses = discoveryAddresses(),
}) {
  const sockets = [];
  const cache = new Map();
  let closed = false;
  const send = (socket, packet) => { if (!closed) socket.send(packet, PORT, GROUP, (error) => { if (error) log(`[discovery] ${error.message}`); }); };
  const query = (socket, questions = [{ name: SERVICE, type: TYPES.PTR }]) => send(socket, encodeMessage({ questions }));
  const publish = () => {
    const now = Date.now();
    for (const [key, record] of cache) if (record.expiresAt <= now) cache.delete(key);
    const records = [...cache.values()];
    for (const ptr of records.filter((r) => r.type === TYPES.PTR && same(r.name, SERVICE))) {
      const srv = records.find((r) => r.type === TYPES.SRV && same(r.name, ptr.data));
      const txt = records.find((r) => r.type === TYPES.TXT && same(r.name, ptr.data));
      const a = srv && records.find((r) => r.type === TYPES.A && same(r.name, srv.data.target));
      if (!srv || !txt || !a || txt.data.deviceId === self.deviceId) continue;
      onPeer({ deviceId: txt.data.deviceId, deviceName: txt.data.deviceName, schemaVersion: Number(txt.data.schemaVersion), address: a.data, port: srv.data.port,
        expiresAt: Math.min(ptr.expiresAt, srv.expiresAt, txt.expiresAt, a.expiresAt) });
    }
  };
  for (const address of [...new Set(addresses)]) {
    const socket = socketFactory({ type: 'udp4', reuseAddr: true });
    let lastReply = 0;
    let lastResolve = 0;
    socket.on('message', (packet, remote) => {
      if (remote.port !== PORT || closed) return;
      try {
        const message = decodeMessage(packet);
        const instance = `pm-${self.deviceId}.${SERVICE}`;
        const host = `pm-${self.deviceId}.local`;
        if (!message.response && message.questions.some((q) => q.class === 1 && (
          (same(q.name, SERVICE) && [TYPES.PTR, TYPES.ANY].includes(q.type)) ||
          (same(q.name, instance) && [TYPES.SRV, TYPES.TXT, TYPES.ANY].includes(q.type)) ||
          (same(q.name, host) && [TYPES.A, TYPES.ANY].includes(q.type)))) && Date.now() - lastReply >= 1000) {
          lastReply = Date.now(); send(socket, announcement(self, address, port));
        }
        if (!message.response) return;
        const relevant = message.records.filter((r) => same(r.name, SERVICE) || r.name.toLowerCase().endsWith(`.${SERVICE}`) || (r.type === TYPES.A && r.name.toLowerCase().endsWith('.local')));
        for (const r of relevant) {
          const key = `${r.name.toLowerCase()}|${r.type}|${r.type === TYPES.PTR ? r.data.toLowerCase() : ''}`;
          if (!r.ttl) cache.delete(key);
          else if (cache.size < 512 || cache.has(key)) cache.set(key, { ...r, expiresAt: Date.now() + Math.min(r.ttl, 120) * 1000 });
        }
        if (Date.now() - lastResolve >= 1000) {
          const questions = relevant.flatMap((r) => r.type === TYPES.PTR ? [{ name: r.data, type: TYPES.SRV }, { name: r.data, type: TYPES.TXT }]
            : r.type === TYPES.SRV ? [{ name: r.data.target, type: TYPES.A }] : []);
          if (questions.length) { lastResolve = Date.now(); query(socket, questions); }
        }
        publish();
      } catch { /* 不正な広告は無視する */ }
    });
    socket.on('error', (error) => log(`[discovery] ${error.message}`));
    try {
      await new Promise((resolve, reject) => {
        const fail = (error) => reject(error);
        socket.once('error', fail);
        socket.bind(PORT, '0.0.0.0', () => { socket.removeListener('error', fail); resolve(); });
      });
      socket.addMembership(GROUP, address);
      socket.setMulticastInterface(address);
      socket.setMulticastTTL(255);
      sockets.push({ socket, address });
      query(socket);
      send(socket, announcement(self, address, port));
    } catch (error) { log(`[discovery] ${address}: ${error.message}`); try { socket.close(); } catch { /* 未bind */ } }
  }
  const timer = setInterval(() => {
    for (const { socket, address } of sockets) { query(socket); send(socket, announcement(self, address, port)); }
    publish();
  }, 60_000);
  // 同時起動時に最初の応答が抑制されても検出できるよう、広告を1秒後にも送る。
  const repeat = setTimeout(() => {
    for (const { socket, address } of sockets) send(socket, announcement(self, address, port));
  }, 1000);
  repeat.unref();
  timer.unref();
  return { activeInterfaces: sockets.length, close: () => {
    clearInterval(timer);
    clearTimeout(repeat);
    for (const { socket, address } of sockets) {
      socket.send(announcement(self, address, port, 0), PORT, GROUP, () => { try { socket.close(); } catch { /* 終了済み */ } });
    }
    closed = true;
    cache.clear();
  } };
}
