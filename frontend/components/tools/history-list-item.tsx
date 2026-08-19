"use client";

import { type ReactNode, useState } from "react";

type HistoryListItemProps = {
  title: string;
  subtitle?: string;
  preview?: string;
  badge?: ReactNode;
  onOpen: () => void;
  onRename?: (nextTitle: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
};

export function HistoryListItem({
  title,
  subtitle,
  preview,
  badge,
  onOpen,
  onRename,
  onDelete,
}: HistoryListItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);

  const saveRename = async () => {
    const next = draft.trim();
    if (!next || next === title || !onRename) {
      setEditing(false);
      setDraft(title);
      return;
    }
    setBusy(true);
    try {
      await onRename(next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm(`确定删除「${title}」？删除后不可恢复。`)) return;
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-2 rounded-[8px] border border-transparent bg-white px-4 py-3 shadow-[0_1px_8px_rgba(0,0,0,0.06)] transition-colors hover:border-brand/30">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen} disabled={busy || editing}>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveRename();
                if (e.key === "Escape") {
                  setEditing(false);
                  setDraft(title);
                }
              }}
              className="w-full max-w-full rounded-[4px] border border-brand/40 px-2 py-1 text-sm text-text-primary outline-none"
            />
          ) : (
            <span className="text-sm font-medium text-text-primary">{title}</span>
          )}
          {badge}
        </div>
        {preview && !editing && <div className="mt-1 line-clamp-2 text-xs text-text-secondary">{preview}</div>}
        {subtitle && <div className="mt-1 text-[11px] text-text-secondary/80">{subtitle}</div>}
      </button>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {editing ? (
          <>
            <button
              type="button"
              disabled={busy}
              className="rounded-[4px] px-2 py-1 text-[11px] text-brand hover:bg-brand/5 disabled:opacity-50"
              onClick={() => void saveRename()}
            >
              保存
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-[4px] px-2 py-1 text-[11px] text-text-secondary hover:bg-page-bg"
              onClick={() => {
                setEditing(false);
                setDraft(title);
              }}
            >
              取消
            </button>
          </>
        ) : (
          <>
            {onRename && (
              <button
                type="button"
                disabled={busy}
                className="rounded-[4px] px-2 py-1 text-[11px] text-text-secondary hover:bg-page-bg hover:text-brand disabled:opacity-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setDraft(title);
                  setEditing(true);
                }}
              >
                重命名
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                disabled={busy}
                className="rounded-[4px] px-2 py-1 text-[11px] text-text-secondary hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete();
                }}
              >
                删除
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
