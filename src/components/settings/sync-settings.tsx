'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Network, RefreshCw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';
import type { SyncResult } from '@/types';

type SelfInfo = {
  deviceId: string;
  deviceName: string;
  schemaVersion?: number;
};

type PeerView = {
  id: string;
  device_id: string;
  name: string;
  base_url: string;
  last_synced_at: string | null;
  reachable: boolean;
};

type PeersResponse = {
  peers?: PeerView[];
  self?: SelfInfo;
};

type PairingInfo = {
  code: string;
  expiresAt: string;
  expiresAtMs: number;
  addresses: string[];
};

type PairingResponse = {
  code?: string;
  expiresAt?: string;
  addresses?: string[];
};

type SyncLogEntry = {
  id: string;
  peer_device_id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed';
  received: number;
  sent: number;
  conflicts: number;
  detail: string | null;
};

type LogsResponse = {
  logs?: SyncLogEntry[];
};

type RunState = {
  running: boolean;
  result?: SyncResult;
  error?: string;
};

const readError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
};

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const formatPairingCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

const formatRemaining = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

const formatDuration = (durationMs: number) => `${(durationMs / 1000).toFixed(1)}秒`;

const resultText = (result: SyncResult) =>
  `受信 ${result.received}件・送信 ${result.sent}件・競合 ${result.conflicts}件（${formatDuration(result.durationMs)}）`;

const logStatus = (status: SyncLogEntry['status']) => {
  if (status === 'success') return { label: '成功', className: 'text-emerald-400' };
  if (status === 'failed') return { label: '失敗', className: 'text-red-400' };
  return { label: '実行中', className: 'text-slate-400' };
};

export const SyncSettings = () => {
  const [self, setSelf] = useState<SelfInfo | null>(null);
  const [peers, setPeers] = useState<PeerView[]>([]);
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [isLoadingPeers, setIsLoadingPeers] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [peersError, setPeersError] = useState('');
  const [logsError, setLogsError] = useState('');

  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegenerateArmed, setIsRegenerateArmed] = useState(false);
  const [deviceError, setDeviceError] = useState('');

  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [isPairingBusy, setIsPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState('');
  const [nowMs, setNowMs] = useState(0);

  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkMessage, setLinkMessage] = useState('');

  const [runStates, setRunStates] = useState<Record<string, RunState>>({});
  const [unlinkArmedId, setUnlinkArmedId] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState('');

  const loadPeers = useCallback(async () => {
    setIsLoadingPeers(true);
    setPeersError('');
    try {
      const response = await fetch('/api/sync/peers', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(await readError(response, 'Link済みのPCを取得できませんでした。'));
      }
      const data = (await response.json()) as PeersResponse;
      setPeers(Array.isArray(data.peers) ? data.peers : []);
      setSelf(
        data.self && typeof data.self.deviceId === 'string' && typeof data.self.deviceName === 'string'
          ? data.self
          : null
      );
    } catch (error) {
      setPeers([]);
      setSelf(null);
      setPeersError(messageOf(error, 'Link済みのPCを取得できませんでした。'));
    } finally {
      setIsLoadingPeers(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    setLogsError('');
    try {
      const response = await fetch('/api/sync/log', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(await readError(response, '同期ログを取得できませんでした。'));
      }
      const data = (await response.json()) as LogsResponse;
      setLogs(Array.isArray(data.logs) ? data.logs.slice(0, 10) : []);
    } catch (error) {
      setLogs([]);
      setLogsError(messageOf(error, '同期ログを取得できませんでした。'));
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    void loadPeers();
    void loadLogs();
  }, [loadPeers, loadLogs]);

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (current >= pairing.expiresAtMs) setPairing(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  const remainingSeconds = pairing
    ? Math.max(0, Math.ceil((pairing.expiresAtMs - nowMs) / 1000))
    : 0;

  const handleRegenerate = async () => {
    if (!isRegenerateArmed) {
      setIsRegenerateArmed(true);
      setDeviceError('');
      return;
    }

    setIsRegenerating(true);
    setDeviceError('');
    try {
      const response = await fetch('/api/sync/device/regenerate', { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readError(response, 'デバイスIDを作り直せませんでした。'));
      }
      setPairing(null);
      await Promise.all([loadPeers(), loadLogs()]);
    } catch (error) {
      setDeviceError(messageOf(error, 'デバイスIDを作り直せませんでした。'));
    } finally {
      setIsRegenerating(false);
      setIsRegenerateArmed(false);
    }
  };

  const handleStartPairing = async () => {
    setIsPairingBusy(true);
    setPairingError('');
    try {
      const response = await fetch('/api/sync/pairing', { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readError(response, 'Linkの受付を開始できませんでした。'));
      }
      const data = (await response.json()) as PairingResponse;
      const expiresAtMs = data.expiresAt ? new Date(data.expiresAt).getTime() : Number.NaN;
      if (!data.code || !Number.isFinite(expiresAtMs)) {
        throw new Error('受付情報の応答が不正です。');
      }
      setNowMs(Date.now());
      setPairing({
        code: data.code,
        expiresAt: data.expiresAt as string,
        expiresAtMs,
        addresses: Array.isArray(data.addresses) ? data.addresses : [],
      });
    } catch (error) {
      setPairingError(messageOf(error, 'Linkの受付を開始できませんでした。'));
    } finally {
      setIsPairingBusy(false);
    }
  };

  const handleStopPairing = async () => {
    setIsPairingBusy(true);
    setPairingError('');
    try {
      const response = await fetch('/api/sync/pairing', { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readError(response, 'Linkの受付を止められませんでした。'));
      }
      setPairing(null);
    } catch (error) {
      setPairingError(messageOf(error, 'Linkの受付を止められませんでした。'));
    } finally {
      setIsPairingBusy(false);
    }
  };

  const handleLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setLinkError('');
    setLinkMessage('');

    const normalizedCode = code.replace(/\s+/g, '');
    if (!address.trim()) {
      setLinkError('相手のアドレスを入力してください。');
      return;
    }
    if (!/^\d{6}$/.test(normalizedCode)) {
      setLinkError('ペアリングコードは6桁の数字で入力してください。');
      return;
    }

    setIsLinking(true);
    try {
      const response = await fetch('/api/sync/peers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim(), code: normalizedCode }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, 'Linkに失敗しました。'));
      }
      setAddress('');
      setCode('');
      setLinkMessage('Linkしました。');
      await Promise.all([loadPeers(), loadLogs()]);
    } catch (error) {
      setLinkError(messageOf(error, 'Linkに失敗しました。'));
    } finally {
      setIsLinking(false);
    }
  };

  const handleRun = async (peerId: string) => {
    setRunStates((prev) => ({ ...prev, [peerId]: { running: true } }));
    try {
      const response = await fetch('/api/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, '同期に失敗しました。'));
      }
      const result = (await response.json()) as SyncResult;
      setRunStates((prev) => ({ ...prev, [peerId]: { running: false, result } }));
      await Promise.all([loadPeers(), loadLogs()]);
    } catch (error) {
      setRunStates((prev) => ({
        ...prev,
        [peerId]: { running: false, error: messageOf(error, '同期に失敗しました。') },
      }));
    }
  };

  const handleUnlink = async (peerId: string) => {
    if (unlinkArmedId !== peerId) {
      setUnlinkArmedId(peerId);
      setUnlinkError('');
      return;
    }

    setUnlinkError('');
    try {
      const response = await fetch(`/api/sync/peers/${peerId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readError(response, 'Linkを解除できませんでした。'));
      }
      setUnlinkArmedId(null);
      await Promise.all([loadPeers(), loadLogs()]);
    } catch (error) {
      setUnlinkError(messageOf(error, 'Linkを解除できませんでした。'));
    }
  };

  const peerName = (deviceId: string) =>
    peers.find((peer) => peer.device_id === deviceId)?.name ?? `${deviceId.slice(0, 8)}…`;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-blue-400" />
          <CardTitle>LAN同期・Link</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {self && (
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-200">このPC</h4>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div className="text-sm text-slate-400 space-y-1">
                <p>
                  デバイス名: <span className="text-slate-200">{self.deviceName}</span>
                </p>
                <p className="break-all">
                  デバイスID: <code className="text-xs text-slate-300">{self.deviceId}</code>
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isRegenerateArmed ? 'danger' : 'secondary'}
                onClick={handleRegenerate}
                disabled={isRegenerating}
              >
                <RefreshCw className="w-4 h-4" />
                {isRegenerateArmed ? 'もう一度押すとLinkがすべて解除されます' : 'デバイスIDを作り直す'}
              </Button>
            </div>
            {deviceError && <p className="text-sm text-red-400">{deviceError}</p>}
          </section>
        )}

        <hr className="border-slate-700" />

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-200">このPCで Link を受け付ける</h4>
          {pairing ? (
            <div className="space-y-3 rounded-lg border border-slate-700/50 bg-slate-900/30 p-4">
              <div>
                <p className="text-xs text-slate-500">ペアリングコード</p>
                <p className="font-mono text-2xl tracking-widest text-slate-100">
                  {formatPairingCode(pairing.code)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">相手に入力してもらうアドレス</p>
                {pairing.addresses.length > 0 ? (
                  <ul className="space-y-1">
                    {pairing.addresses.map((item) => (
                      <li key={item} className="font-mono text-sm text-slate-200">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">アドレスを取得できませんでした。</p>
                )}
              </div>
              <p className="text-sm text-slate-400">
                残り時間: <span className="font-mono text-slate-200">{formatRemaining(remainingSeconds)}</span>
              </p>
              <Button type="button" size="sm" variant="secondary" onClick={handleStopPairing} disabled={isPairingBusy}>
                <Unlink className="w-4 h-4" />
                受付を止める
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={handleStartPairing} disabled={isPairingBusy}>
              {isPairingBusy ? '開始中…' : 'Linkを受け付ける'}
            </Button>
          )}
          {pairingError && <p className="text-sm text-red-400">{pairingError}</p>}
        </section>

        <hr className="border-slate-700" />

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-200">相手のPCに接続する</h4>
          <form onSubmit={handleLink} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                id="sync-peer-address"
                label="相手のアドレス"
                placeholder="192.168.1.41:38400"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                disabled={isLinking}
              />
              <Input
                id="sync-pairing-code"
                label="ペアリングコード"
                placeholder="123456"
                inputMode="numeric"
                autoComplete="off"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={isLinking}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isLinking}>
                {isLinking ? 'Link中…' : 'Linkする'}
              </Button>
              {linkMessage && <p className="text-sm text-emerald-400">{linkMessage}</p>}
            </div>
            {linkError && <p className="text-sm text-red-400">{linkError}</p>}
          </form>
        </section>

        <hr className="border-slate-700" />

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-200">Link済みのPC</h4>
          {peersError && <p className="text-sm text-red-400">{peersError}</p>}
          {isLoadingPeers && <p className="text-sm text-slate-500">読み込み中…</p>}
          {!isLoadingPeers && !peersError && peers.length === 0 && (
            <p className="text-sm text-slate-500">Link済みのPCはありません。</p>
          )}
          {peers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-slate-400 border-b border-slate-700/50">
                    <th className="py-2 font-medium">名前</th>
                    <th className="py-2 font-medium">アドレス</th>
                    <th className="py-2 font-medium">最終同期日時</th>
                    <th className="py-2 font-medium">状態</th>
                    <th className="py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {peers.map((peer) => {
                    const runState = runStates[peer.id];
                    return (
                      <Fragment key={peer.id}>
                        <tr>
                          <td className="py-2 text-slate-200">{peer.name}</td>
                          <td className="py-2 font-mono text-sm text-slate-300">{peer.base_url}</td>
                          <td className="py-2 text-sm text-slate-300">
                            {peer.last_synced_at ? formatDate(peer.last_synced_at, 'full') : '未同期'}
                          </td>
                          <td className={`py-2 text-sm ${peer.reachable ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {peer.reachable ? '接続可' : '応答なし'}
                          </td>
                          <td className="py-2">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => handleRun(peer.id)}
                                disabled={runState?.running}
                              >
                                {runState?.running ? '同期中…' : '今すぐ同期'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={unlinkArmedId === peer.id ? 'danger' : 'ghost'}
                                onClick={() => handleUnlink(peer.id)}
                              >
                                {unlinkArmedId === peer.id ? 'もう一度押すと解除' : 'Link解除'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {(runState?.result || runState?.error) && (
                          <tr>
                            <td colSpan={5} className="pb-2 text-sm">
                              {runState.result && (
                                <p className="text-slate-300">{resultText(runState.result)}</p>
                              )}
                              {runState.result && runState.result.warnings.length > 0 && (
                                <p className="mt-1 text-amber-300">{runState.result.warnings.join(' / ')}</p>
                              )}
                              {runState.error && <p className="text-red-400">{runState.error}</p>}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {unlinkError && <p className="text-sm text-red-400">{unlinkError}</p>}
        </section>

        <hr className="border-slate-700" />

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-200">同期ログ</h4>
          {logsError && <p className="text-sm text-red-400">{logsError}</p>}
          {isLoadingLogs && <p className="text-sm text-slate-500">読み込み中…</p>}
          {!isLoadingLogs && !logsError && logs.length === 0 && (
            <p className="text-sm text-slate-500">同期ログはありません。</p>
          )}
          {logs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-slate-400 border-b border-slate-700/50">
                    <th className="py-2 font-medium">日時</th>
                    <th className="py-2 font-medium">相手</th>
                    <th className="py-2 text-right font-medium">受信</th>
                    <th className="py-2 text-right font-medium">送信</th>
                    <th className="py-2 text-right font-medium">競合</th>
                    <th className="py-2 font-medium">結果</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {logs.map((log) => {
                    const status = logStatus(log.status);
                    return (
                      <tr key={log.id}>
                        <td className="py-2 text-sm text-slate-300">{formatDate(log.started_at, 'full')}</td>
                        <td className="py-2 text-sm text-slate-200">{peerName(log.peer_device_id)}</td>
                        <td className="py-2 text-right text-sm tabular-nums text-slate-300">{log.received}</td>
                        <td className="py-2 text-right text-sm tabular-nums text-slate-300">{log.sent}</td>
                        <td className="py-2 text-right text-sm tabular-nums text-slate-300">{log.conflicts}</td>
                        <td className={`py-2 text-sm ${status.className}`} title={log.detail ?? undefined}>
                          {status.label}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
};
