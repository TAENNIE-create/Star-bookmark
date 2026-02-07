"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAppStorage } from "../../lib/app-storage";

const LONG_PRESS_MS = 500;

type JournalEntry = {
  content: string;
  createdAt: string;
  photoUrl?: string;
  isVoice?: boolean;
};

type JournalByDate = Record<string, JournalEntry[]>;

function JournalEntryItem({ entry }: { entry: JournalEntry }) {
  const [copyFeedback, setCopyFeedback] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyContent = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(entry.content).then(() => {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      });
    }
  }, [entry.content]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      copyContent();
    },
    [copyContent]
  );

  const handleTouchStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(copyContent, LONG_PRESS_MS);
  }, [copyContent]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  return (
    <article
      className="rounded-3xl bg-[#F0F5EB] px-4 py-3 shadow-sm overflow-hidden select-text"
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {entry.photoUrl && (
        <div className="rounded-2xl overflow-hidden border border-[#E2E8F0] bg-white/80 mb-3 -mx-1">
          <img
            src={entry.photoUrl}
            alt="일기 사진"
            className="w-full max-h-[200px] object-contain"
          />
        </div>
      )}
      <p className="text-xs text-[#64748B] mb-1 flex items-center gap-2">
        {new Date(entry.createdAt).toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        })}
        {entry.isVoice && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#8B5CF6]/15 text-[#6D28D9]">
            음성
          </span>
        )}
      </p>
      <p className="text-sm whitespace-pre-wrap text-[#0F172A] arisum-diary-content">
        {entry.content}
      </p>
      {copyFeedback && (
        <p className="text-xs font-medium text-emerald-600 mt-2 animate-pulse">복사되었습니다</p>
      )}
    </article>
  );
}

export function JournalList() {
  const [journals, setJournals] = useState<JournalByDate>({});

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = getAppStorage().getItem("arisum-journals");
      const parsed: JournalByDate = raw ? JSON.parse(raw) : {};
      setJournals(parsed);
    } catch {
      setJournals({});
    }
  }, []);

  const dates = Object.keys(journals).sort().reverse();

  if (dates.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-sm text-[#64748B] px-6">
        <p>아직 저장된 일기가 없어요.</p>
        <p className="text-xs mt-1">
          메인 화면에서 숨 고르기 버튼을 눌러 오늘의 일기를 남겨 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
      {dates.map((date) => {
        const list = journals[date] ?? [];

        return (
          <section key={date} className="space-y-2">
            <p className="text-[11px] text-[#64748B] font-medium tracking-[0.16em] uppercase">
              {date}
            </p>
            <div className="space-y-2">
              {list
                .slice()
                .reverse()
                .map((entry, index) => (
                  <JournalEntryItem key={`${entry.createdAt}-${index}`} entry={entry} />
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

