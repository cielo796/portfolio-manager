'use client';

import type { WatchlistState } from '@/hooks/use-watchlist';
import { Lightbulb, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { getMarketLabel } from './format';

type TradeIdeasPanelProps = Pick<WatchlistState,
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
    <aside id="trade-ideas-panel" aria-labelledby="watchlist-ideas-title" className="flex min-h-0 min-w-0 flex-col overflow-auto rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] text-[12px] [&_button]:text-xs [&_label]:text-xs [&_select]:px-2 [&_select]:py-1 [&_select]:text-xs [&_textarea]:rounded [&_textarea]:px-2 [&_textarea]:py-1 [&_textarea]:text-xs">
      <div className="shrink-0">
        <div className="border-b border-[var(--pm-border)] px-2 py-1.5">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-3.5 w-3.5 text-[var(--pm-accent)]" />
            <h2 id="watchlist-ideas-title" className="font-semibold">トレードアイデア</h2>
          </div>
        </div>
        <div className="p-2">
          <form onSubmit={handleSubmitIdea} className="space-y-2">
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
                rows={3}
                placeholder="例: 決算前は様子見。出来高が増えたらエントリー候補。"
                className="w-full rounded-lg border border-slate-600/50 bg-slate-800/50 px-4 py-2.5 text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSubmittingIdea}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isSubmittingIdea || symbolOptions.length === 0}>
                <Plus className="w-4 h-4" />
                保存
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between border-y border-[var(--pm-border)] px-2 py-1.5">
          <h3 className="font-semibold">保存済みアイデア</h3>
          <span className="text-xs pm-muted">{tradeIdeas.length}件</span>
        </div>
        <div>
          <div>
            {tradeIdeas.map((idea) => {
              const isExpanded = expandedIdeaIds.has(idea.id);
              const isEditingIdea = editingIdeaId === idea.id;

              return (
                <div key={idea.id} className="border-b border-[var(--pm-divider)] p-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 font-medium text-[var(--pm-link)]">
                      {idea.symbol}
                      <span className="ml-2 text-xs pm-muted">{getMarketLabel(idea.market)}</span>
                    </div>
                    <div className="shrink-0 text-xs pm-muted">{formatDate(idea.created_at, 'short')}</div>
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
                        className={`mt-2 leading-relaxed text-slate-300 ${
                          isExpanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2 break-words'
                        }`}
                      >
                        {idea.note}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleIdeaExpanded(idea.id)}
                          aria-expanded={isExpanded}
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
              <div className="px-2 py-6 text-center pm-muted">
                まだトレードアイデアがありません。
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
