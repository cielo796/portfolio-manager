import type { MarketSnapshot } from '@/types';
import { timeText } from './market-clock';
import type { ShellSyncState } from './use-shell-data';

export function StatusBar({ sync, market, marketError }: { sync: ShellSyncState; market: MarketSnapshot | null; marketError: boolean }) {
  const peer = sync.peers.find((item) => item.device_id === sync.latest?.peer_device_id);
  const latest = sync.latest;
  return <footer className="pm-statusbar">
    <span>DB：{market?.dbFile ?? '確認中…'}</span>
    <span title={sync.error || undefined}>最終同期：{latest ? `${peer?.name ?? '解除済みPC'} ${timeText(latest.finished_at ?? latest.started_at, true)} ${latest.status === 'failed' ? '失敗 ' : ''}受信${latest.received}・送信${latest.sent}・競合${latest.conflicts}` : '未同期'}</span>
    <span>価格取得：{timeText(market?.fetchedAt)}　{marketError ? '指数通信失敗' : `失敗${market?.failed.length ?? 0}件`}</span>
  </footer>;
}
