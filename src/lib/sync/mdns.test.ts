import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { announcement, decodeMessage, encodeMessage, SERVICE, startDiscovery } from '../../../electron/discovery.mjs';
import { startSyncRelay } from '../../../electron/sync-relay.mjs';

describe('T27 mDNS（dgramのモックソケット）', () => {
  afterEach(() => vi.restoreAllMocks());
  const self = { deviceId: 'device-a', deviceName: '日本語PC', schemaVersion: 9 };
  it('PTR/SRV/TXT/Aを往復し秘密を含まない', () => {
    const packet = announcement(self, '192.168.1.2', 38400);
    const decoded = decodeMessage(packet);
    expect(decoded.response).toBe(true); expect(decoded.records.map((r) => r.type)).toEqual([12, 33, 16, 1]);
    expect(decoded.records[2].data).toEqual({ deviceId: 'device-a', deviceName: '日本語PC', schemaVersion: '9' });
    expect(decodeMessage(encodeMessage({ questions: [{ name: SERVICE, type: 12 }] })).questions[0].name).toBe(SERVICE);
  });
  it('圧縮名を読み、不正なポインタ・切断パケットを拒否する', () => {
    const query = encodeMessage({ questions: [{ name: SERVICE, type: 12 }] });
    const header = Buffer.from(query); header.writeUInt16BE(1, 6);
    const record = Buffer.from([0xc0, 0x0c, 0, 12, 0, 1, 0, 0, 0, 120, 0, 2, 0xc0, 0x0c]);
    expect(decodeMessage(Buffer.concat([header, record])).records[0].data).toBe(SERVICE);
    const loop = Buffer.alloc(18); loop.writeUInt16BE(1, 4); loop[12] = 0xc0; loop[13] = 12;
    expect(() => decodeMessage(loop)).toThrow();
    const packet = announcement(self, '192.168.1.2', 38400);
    for (let end = 0; end < packet.length; end++) expect(() => decodeMessage(packet.subarray(0, end))).toThrow();
  });
  it('2つのソケットで広告と探索を接続し、自分自身を除外する', async () => {
    const sockets: MockSocket[] = [];
    class MockSocket extends EventEmitter {
      packets: Buffer[] = [];
      closed = false;
      bind(_port: number, _host: string, callback: () => void) { callback(); }
      addMembership() {} setMulticastInterface() {} setMulticastTTL() {}
      close() { this.closed = true; }
      send(packet: Buffer, _port: number, _group: string, callback: () => void) {
        this.packets.push(packet);
        for (const socket of sockets) queueMicrotask(() => { if (!socket.closed) socket.emit('message', packet, { port: 5353 }); });
        callback();
      }
    }
    const socketFactory = (() => { const socket = new MockSocket(); sockets.push(socket); return socket; }) as unknown as typeof createSocket;
    const foundA = vi.fn(); const foundB = vi.fn();
    const a = await startDiscovery({ self, port: 38400, onPeer: foundA, socketFactory, addresses: ['192.168.1.2'] });
    const b = await startDiscovery({ self: { ...self, deviceId: 'device-b' }, port: 38401, onPeer: foundB, socketFactory, addresses: ['192.168.1.3'] });
    try {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(foundA).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'device-b', address: '192.168.1.3', port: 38401 }));
      expect(foundB).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'device-a', address: '192.168.1.2', port: 38400 }));
      expect(foundA.mock.calls.some(([peer]) => peer.deviceId === self.deviceId)).toBe(false);
      expect(sockets.every((socket) => socket.packets.some((packet) => !decodeMessage(packet).response))).toBe(true);
      const separate = decodeMessage(announcement({ ...self, deviceId: 'device-c' }, '192.168.1.4', 38402)).records;
      for (const record of separate) sockets[0].emit('message', encodeMessage({ response: true, records: [record] }), { port: 5353 });
      expect(foundA).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'device-c', address: '192.168.1.4', port: 38402 }));
      sockets[0].emit('message', Buffer.from([1, 2, 3]), { port: 5353 });
    } finally { a.close(); b.close(); }
  });
  it('外部同期リレーから内部経路へ転送できない（実HTTP、空きポート）', async () => {
    const received = vi.fn();
    const target = createServer((_req, res) => { received(); res.end('ok'); });
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
    const address = target.address() as { port: number };
    const relay = await startSyncRelay({ listenPort: 0, targetOrigin: `http://127.0.0.1:${address.port}` });
    try {
      for (const path of ['/api/sync/discovery', '/api/sync/auto', '/api/sync/peer/../discovery', '/api/sync/peer/%2e%2e%2fdiscovery']) {
        expect((await fetch(`http://127.0.0.1:${relay.port}${path}`)).status).toBe(404);
      }
      expect(received).not.toHaveBeenCalled();
      expect((await fetch(`http://127.0.0.1:${relay.port}/api/sync/peer/ping`)).status).toBe(200);
    } finally { await relay.close(); await new Promise<void>((resolve) => target.close(() => resolve())); }
  });
});
