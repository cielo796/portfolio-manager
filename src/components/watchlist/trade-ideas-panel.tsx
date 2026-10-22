'use client';

import type { WatchlistState } from '@/hooks/use-watchlist';
import { Lightbulb, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { getMarketLabel } from './format';

type TradeIdeasPanelProps = Pick<WatchlistState,
  | 'showIdeas'
  | 'handleSubmitIdea'
  | 'ideaSymbol'
  | 'setIdeaSymbol'
  | 'symbolOptions'
  | 'isSubmittingIdea'
  | 'ideaNote'
  | 'setIdeaNote'
  | 'tradeIdeas'
  | 'expandedIdeaIds'
  | 'editingIdeaId'
  | 'editIdeaSymbol'
  | 'setEditIdeaSymbol'
  | 'isSavingIdeaEdit'
  | 'editIdeaNote'
  | 'setEditIdeaNote'
  | 'handleSaveIdeaEdit'
  | 'cancelEditIdea'
  | 'toggleIdeaExpanded'
  | 'startEditIdea'
  | 'handleDeleteIdea'
>;

export const TradeIdeasPanel = ({
  showIdeas,
  handleSubmitIdea,
  ideaSymbol,
  setIdeaSymbol,
  symbolOptions,
  isSubmittingIdea,
  ideaNote,
  setIdeaNote,
  tradeIdeas,
  expandedIdeaIds,
  editingIdeaId,
  editIdeaSymbol,
  setEditIdeaSymbol,
  isSavingIdeaEdit,
  editIdeaNote,
  setEditIdeaNote,
  handleSaveIdeaEdit,
  cancelEditIdea,
  toggleIdeaExpanded,
  startEditIdea,
  handleDeleteIdea,
}: TradeIdeasPanelProps) => {
  return (
    <div id="trade-ideas-panel" className={showIdeas ? 'order-first grid items-start gap-6 lg:grid-cols-2' : 'hidden'}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-300" />
            <CardTitle>トレードアイデア</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitIdea} className="space-y-4">
            <Select
              label="対象銘柄"
              value={ideaSymbol}
              onChange={(event) => setIdeaSymbol(event.target.value)}
              options={symbolOptions.length > 0 ? symbolOptions : [{ value: '', label: '銘柄がありません' }]}
              disabled={symbolOptions.length === 0 || isSubmittingIdea}
            />
            <div className="space-y-1.5">
              <label htmlFor="new-idea-note" className="block text-sm font-medium text-slate-300">メモ</label>
              <textarea
                id="new-idea-note"
                value={ideaNote}
                onChange={(event) => setIdeaNote(event.target.value)}
                rows={5}
                placeholder="例: 決算前は様子見。出来高が増えたらエントリー候補。"
                className="w-full rounded-lg border border-slate-600/50 bg-slate-800/50 px-4 py-2.5 text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSubmittingIdea}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmittingIdea || symbolOptions.length === 0}>
                <Plus className="w-4 h-4" />
                保存
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>保存済みアイデア</CardTitle>
          <span className="text-xs text-slate-500">{tradeIdeas.length}件</span>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tradeIdeas.map((idea) => {
              const isExpanded = expandedIdeaIds.has(idea.id);
              const isEditingIdea = editingIdeaId === idea.id;

              return (
                <div key={idea.id} className="rounded-lg border border-slate-700/60 bg-slate-800/35 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-sm font-medium text-slate-200">
                      {idea.symbol}
                      <span className="ml-2 text-xs text-slate-500">{getMarketLabel(idea.market)}</span>
                    </div>
                    <div className="shrink-0 text-xs text-slate-500">{formatDate(idea.created_at, 'short')}</div>
                  </div>

                  {isEditingIdea ? (
                    <div className="mt-3 space-y-3">
                      <Select
                        id="edit-idea-symbol"
                        label="対象銘柄"
                        value={editIdeaSymbol}
                        onChange={(event) => setEditIdeaSymbol(event.target.value)}
                        options={symbolOptions.length > 0 ? symbolOptions : [{ value: '', label: '銘柄がありません' }]}
                        disabled={symbolOptions.length === 0 || isSavingIdeaEdit}
                      />
                      <div className="space-y-1.5">
                        <label htmlFor="edit-idea-note" className="block text-sm font-medium text-slate-300">メモ</label>
                        <textarea
                          id="edit-idea-note"
                          value={editIdeaNote}
                          onChange={(event) => setEditIdeaNote(event.target.value)}
                          rows={5}
                          className="w-full rounded-lg border border-slate-600/50 bg-slate-900/70 px-4 py-2.5 text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isSavingIdeaEdit}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" onClick={handleSaveIdeaEdit} disabled={isSavingIdeaEdit}>
                          <Save className="w-4 h-4" />
                          保存
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={cancelEditIdea} disabled={isSavingIdeaEdit}>
                          <X className="w-4 h-4" />
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p
                        className={`mt-2 text-sm leading-relaxed text-slate-300 ${
                          isExpanded ? 'whitespace-pre-wrap' : 'overflow-hidden text-ellipsis whitespace-nowrap'
                        }`}
                      >
                        {idea.note}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleIdeaExpanded(idea.id)}
                          className="text-xs font-medium text-blue-400 transition-colors hover:text-blue-300"
                        >
                          {isExpanded ? '閉じる' : '全文表示'}
                        </button>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="secondary" onClick={() => startEditIdea(idea)}>
                            <Pencil className="w-4 h-4" />
                            編集
                          </Button>
                          <Button type="button" size="sm" variant="danger" onClick={() => handleDeleteIdea(idea.id)}>
                            <Trash2 className="w-4 h-4" />
                            削除
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {tradeIdeas.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-700 py-10 text-center text-slate-500">
                まだトレードアイデアがありません。
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
