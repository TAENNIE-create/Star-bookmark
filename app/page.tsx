"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HomeHeader } from "../components/arisum/home-header";
import { MyRoom } from "../components/arisum/my-room";
import { BreathingButton } from "../components/arisum/breathing-button";
import { QuestCard } from "../components/arisum/quest-card";
import { TabBar, type TabKey } from "../components/arisum/tab-bar";
import { MIDNIGHT_BLUE } from "../lib/theme";
import { getAppStorage } from "../lib/app-storage";

const ONBOARDING_KEY = "arisum-onboarding";

type LatestAnalysis = {
  keywords: [string, string, string];
  counselorLetter: string;
};

export default function HomePage() {
  const router = useRouter();
  const [latestAnalysis, setLatestAnalysis] = useState<LatestAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function checkOnboarding() {
      try {
        const raw = getAppStorage().getItem(ONBOARDING_KEY);
        const data = raw ? (JSON.parse(raw) as { userName?: string; hasVisited?: boolean }) : null;
        const userName = data?.userName?.trim();
        if (userName) {
          setOnboardingChecked(true);
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    }
    if (checkOnboarding()) return;
    // 로그인 시 Supabase 어댑터가 비동기로 로드되므로, 한 번 지연 후 재시도 (반복 노출 방지)
    const t = window.setTimeout(() => {
      if (checkOnboarding()) return;
      router.replace("/onboarding");
    }, 800);
    return () => clearTimeout(t);
  }, [router]);

  useEffect(() => {
    if (!onboardingChecked) return;
    try {
      const raw = getAppStorage().getItem("arisum-latest-analysis");
      if (!raw) return;
      const data = JSON.parse(raw) as { keywords?: unknown[]; counselorLetter?: string };
      const k = data?.keywords;
      if (Array.isArray(k) && k.length >= 3) {
        setLatestAnalysis({
          keywords: [String(k[0]), String(k[1]), String(k[2])],
          counselorLetter: typeof data.counselorLetter === "string" ? data.counselorLetter : "",
        });
      }
    } catch {
      // ignore
    }
  }, [onboardingChecked]);

  const handleTabChange = (key: TabKey) => {
    if (key === "journal") {
      router.push("/diary");
    } else if (key === "bookshelf") {
      router.push("/archive");
    } else if (key === "constellation") {
      router.push("/constellation");
    } else {
      setActiveTab(key);
    }
  };

  if (!onboardingChecked) {
    return null;
  }

  return (
    <motion.div
      className="min-h-[100dvh] flex justify-center bg-transparent"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{ willChange: "opacity" }}
    >
      <div
        className="w-full max-w-md min-h-[100dvh] relative flex flex-col bg-transparent arisum-pb-tab-safe"
        style={{ color: MIDNIGHT_BLUE }}
      >
        <div className="h-6 flex-shrink-0" aria-hidden />

        {/* 헤더 */}
        {activeTab === "home" && (
          <div className="flex-shrink-0 mb-4">
            <HomeHeader />
          </div>
        )}

        {/* 1·2구역: 공전 박스 + 일기쓰기. 일기쓰기 빛은 공전 박스 뒤로만 퍼지도록 glow 레이어를 뒤에 둠 */}
        {activeTab === "home" ? (
          <div className="relative flex flex-col flex-[4] min-h-0 basis-0">
            {/* 일기쓰기 빛: 버튼 위로 퍼지는 그라데이션, z-0으로 공전 박스 뒤에만 보이게 */}
            <div
              className="absolute left-0 right-0 pointer-events-none rounded-t-2xl"
              style={{
                bottom: 72,
                height: 140,
                zIndex: 0,
                background:
                  "linear-gradient(to top, rgba(253,230,138,0.4) 0%, rgba(253,230,138,0.18) 40%, rgba(253,230,138,0.06) 65%, transparent 100%)",
              }}
              aria-hidden
            />
            <motion.section
              initial={false}
              animate={{ opacity: 1 }}
              className="relative z-10 flex-1 min-h-0 max-h-[36vh] flex flex-col px-4 pb-2 overflow-hidden"
            >
              <MyRoom keywords={latestAnalysis?.keywords ?? null} />
            </motion.section>
            <main className="relative z-10 flex-shrink-0 min-h-[72px] flex items-center justify-center px-4 py-3">
              <BreathingButton
                onAnalysisComplete={(data) =>
                  setLatestAnalysis({
                    keywords: data.keywords,
                    counselorLetter: data.counselorLetter,
                  })
                }
              />
            </main>
          </div>
        ) : (
          <>
            <motion.section
              initial={false}
              animate={{ opacity: 1 }}
              className="flex-[4] min-h-0 max-h-[36vh] flex flex-col px-4 pb-2 overflow-hidden"
            />
            <main className="flex-shrink-0 min-h-[72px] flex items-center justify-center px-4 py-3" />
          </>
        )}

        {/* 3구역: 퀘스트 – 비율 4, 남은 공간 채움 */}
        <section className="flex-[4] min-h-[24vh] px-4 pt-6 pb-6 flex flex-col overflow-auto">
          {activeTab === "home" && <QuestCard />}
        </section>

        <TabBar activeKey={activeTab} onChange={handleTabChange} />
      </div>
    </motion.div>
  );
}
