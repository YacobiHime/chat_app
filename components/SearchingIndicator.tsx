"use client";

import { useEffect, useRef, useState } from "react";

export interface SearchUrlEntry {
  url: string;
  status: "fetching" | "done";
  title?: string;       // ページタイトル（取得できた場合）
  fetchedAt: number;    // Date.now()
}

interface Props {
  entries: SearchUrlEntry[];
  isSearching: boolean; // まだ検索中かどうか
}

/** URLからドメインだけ取り出す */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 32);
  }
}

/** Googleのfavicon取得URL */
function faviconUrl(url: string): string {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${origin}&sz=32`;
  } catch {
    return "";
  }
}

// ----------------------------------------------------------------
// 個別URLチップ
// ----------------------------------------------------------------
function UrlChip({
  entry,
  isCurrent,
}: {
  entry: SearchUrlEntry;
  isCurrent: boolean;
}) {
  const domain = getDomain(entry.url);
  const favicon = faviconUrl(entry.url);

  return (
    <a
      href={entry.url}
      target="_blank"
      rel="noopener noreferrer"
      title={entry.url}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs
        border transition-all duration-300 select-none
        ${
          isCurrent
            ? "border-[#7c3aed]/60 bg-[#7c3aed]/10 text-purple-300 shadow-[0_0_8px_rgba(124,58,237,0.2)]"
            : "border-gray-700/50 bg-[#1e1e1e] text-gray-400 hover:text-gray-300 hover:border-gray-600"
        }
      `}
    >
      {favicon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={favicon}
          alt=""
          width={12}
          height={12}
          className="rounded-sm shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <span className="truncate max-w-[120px]">
        {entry.title ?? domain}
      </span>
      {isCurrent && (
        <span className="flex gap-[2px] shrink-0 ml-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-[3px] h-[3px] rounded-full bg-purple-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      )}
    </a>
  );
}

// ----------------------------------------------------------------
// メインコンポーネント
// ----------------------------------------------------------------
export function SearchingIndicator({ entries, isSearching }: Props) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // entries が来たら表示、全て done になったら少し待ってフェードアウト
  useEffect(() => {
    if (entries.length > 0) {
      setVisible(true);
    }
  }, [entries.length]);

  useEffect(() => {
    if (!isSearching && entries.length > 0 && entries.every((e) => e.status === "done")) {
      const timer = setTimeout(() => setVisible(false), 1800);
      return () => clearTimeout(timer);
    }
  }, [isSearching, entries]);

  // 新しいチップが追加されたら自動スクロール
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [entries.length]);

  if (!visible) return null;

  const currentEntry = entries.find((e) => e.status === "fetching");
  const doneEntries = entries.filter((e) => e.status === "done");

  return (
    <div
      className={`
        transition-all duration-500
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"}
      `}
    >
      <div className="flex items-center gap-2 py-1.5">
        {/* "検索中" ラベル */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isSearching ? (
            <svg
              className="w-3.5 h-3.5 text-purple-400 animate-spin shrink-0"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="3"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5 text-green-400 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
          <span className="text-xs text-gray-400 shrink-0">
            {isSearching ? "検索中" : "検索完了"}
          </span>
        </div>

        {/* 区切り */}
        <span className="text-gray-700 shrink-0">·</span>

        {/* URLチップ一覧（横スクロール） */}
        <div
          ref={containerRef}
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {/* 完了済み */}
          {doneEntries.map((entry) => (
            <UrlChip key={entry.url} entry={entry} isCurrent={false} />
          ))}

          {/* 現在フェッチ中 */}
          {currentEntry && (
            <UrlChip entry={currentEntry} isCurrent={true} />
          )}
        </div>
      </div>
    </div>
  );
}