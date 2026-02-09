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
    <div className="min-h-[100dvh] flex justify-center bg-transparent">
      <div
        className="w-full max-w-md min-h-[100dvh] relative flex flex-col bg-transparent pb-24"
        style={{ color: MIDNIGHT_BLUE }}
      >
        <div className="h-6 flex-shrink-0" aria-hidden />

        {/* 헤더 */}
        {activeTab === "home" && (
          <div className="flex-shrink-0 mb-4">
            <HomeHeader />
          </div>
        )}

        {/* 1구역: 밤하늘(Atlas) – 비율 4 (고정 높이 대신 flex) */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="flex-[4] min-h-[min(28vh,200px)] max-h-[42vh] flex flex-col px-4 pb-4 overflow-hidden"
        >
          {activeTab === "home" && <MyRoom keywords={latestAnalysis?.keywords ?? null} />}
        </motion.section>

        {/* 2구역: 일기 쓰기 버튼 – 비율 2 */}
        <main className="flex-[2] min-h-[min(12vh,80px)] max-h-[20vh] flex items-center justify-center px-4 py-4">
          {activeTab === "home" && (
            <BreathingButton
              onAnalysisComplete={(data) =>
                setLatestAnalysis({
                  keywords: data.keywords,
                  counselorLetter: data.counselorLetter,
                })
              }
            />
          )}
        </main>

        {/* 3구역: 퀘스트 – 비율 4, 남은 공간 채움 */}
        <section className="flex-[4] min-h-[24vh] px-4 pt-6 pb-6 flex flex-col overflow-auto">
          {activeTab === "home" && <QuestCard />}
        </section>

        <TabBar activeKey={activeTab} onChange={handleTabChange} />
      </div>
    </div>
  );
}
