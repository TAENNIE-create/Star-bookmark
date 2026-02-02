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
    try {
      const raw = getAppStorage().getItem(ONBOARDING_KEY);
      const data = raw ? (JSON.parse(raw) as { userName?: string; hasVisited?: boolean }) : null;
      const userName = data?.userName?.trim();
      if (!userName) {
        router.replace("/onboarding");
        return;
      }
      setOnboardingChecked(true);
    } catch {
      router.replace("/onboarding");
      return;
    }
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
    <div className="min-h-screen flex justify-center bg-transparent">
      <div
        className="w-full max-w-md min-h-screen relative flex flex-col bg-transparent pb-24"
        style={{ color: MIDNIGHT_BLUE }}
      >
        <div className="h-6 flex-shrink-0" aria-hidden />

        {/* 헤더 */}
        {activeTab === "home" && (
          <div className="flex-shrink-0 mb-4">
            <HomeHeader />
          </div>
        )}

        {/* 1구역: 밤하늘(Atlas) – 높이 약 42vh */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="flex-shrink-0 px-4 pb-4"
        >
          {activeTab === "home" && <MyRoom keywords={latestAnalysis?.keywords ?? null} />}
        </motion.section>

        {/* 2구역: 일기 쓰기 버튼 – 밤하늘과 퀘스트 사이 정중앙 */}
        <main className="flex-shrink-0 px-4 flex items-center justify-center py-7">
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

        {/* 3구역: 퀘스트 – 탭 바 바로 위까지 */}
        <section className="flex-1 min-h-0 px-4 pt-6 pb-6 flex flex-col">
          {activeTab === "home" && <QuestCard />}
        </section>

        <TabBar activeKey={activeTab} onChange={handleTabChange} />
      </div>
    </div>
  );
}
