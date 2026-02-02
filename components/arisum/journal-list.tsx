"use client";

import { useEffect, useState } from "react";
import { getAppStorage } from "../../lib/app-storage";

type JournalEntry = {
  content: string;
  createdAt: string;
};

type JournalByDate = Record<string, JournalEntry[]>;

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
                  <article
                    key={`${entry.createdAt}-${index}`}
                    className="rounded-3xl bg-[#F0F5EB] px-4 py-3 shadow-sm"
                  >
                    <p className="text-xs text-[#64748B] mb-1">
                      {new Date(entry.createdAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed text-[#0F172A]">
                      {entry.content}
                    </p>
                  </article>
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

