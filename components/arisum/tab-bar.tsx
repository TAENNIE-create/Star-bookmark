"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { MIDNIGHT_BLUE } from "../../lib/theme";

const ICON_SIZE = 24;
/** 같은 파일명으로 아이콘을 교체했을 때 캐시 무효화용. 이미지 바꿀 때마다 숫자 올리기 */
const ICON_CACHE_VERSION = 2;
const icon = (path: string) => `${path}?v=${ICON_CACHE_VERSION}`;

// 밤하늘 탭 다크 테마
const TAB_BG_LIGHT = "#FFFFFF";
const TAB_BG_DARK = "#0A0E1A";
const TAB_SHADOW_LIGHT = "0 -4px 10px rgba(0,0,0,0.05)";
const TAB_SHADOW_DARK = "0 -6px 20px rgba(0,0,0,0.4)";
const TEXT_LIGHT_ACTIVE = "text-white";
const TEXT_LIGHT_INACTIVE = "text-[#64748B]";
const TEXT_DARK_ACTIVE = "#E2E8F0";
const TEXT_DARK_INACTIVE_OPACITY = 0.6;
const CAPSULE_DARK_BG = "rgba(30, 41, 59, 0.9)";
const CAPSULE_DARK_BORDER = "rgba(253, 230, 138, 0.4)";

const tabs = [
  { key: "home", label: "홈", iconSrc: icon("/icons/icon-home.png") },
  { key: "journal", label: "일기", iconSrc: icon("/icons/icon-diary.png") },
  { key: "bookshelf", label: "기록함", iconSrc: icon("/icons/icon-archive.png") },
  { key: "constellation", label: "밤하늘", iconSrc: icon("/icons/icon-map.png") },
] as const;

export type TabKey = (typeof tabs)[number]["key"];

type TabBarProps = {
  activeKey: TabKey;
  onChange: (key: TabKey) => void;
};

export { tabs as ARISUM_TABS };

const TAB_BAR_HEIGHT = 72;

function TabIcon({ src, isActive, isDark }: { src: string; isActive: boolean; isDark: boolean }) {
  const inactiveOpacity = isDark ? TEXT_DARK_INACTIVE_OPACITY : 0.6;

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: ICON_SIZE + 4, height: ICON_SIZE + 4 }}
      animate={{
        scale: isActive ? 1.2 : 0.95,
        opacity: isActive ? 1 : inactiveOpacity,
      }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      whileTap={{ scale: 1.3, transition: { type: "spring", stiffness: 500, damping: 18 } }}
    >
      <Image
        src={src}
        alt=""
        width={ICON_SIZE}
        height={ICON_SIZE}
        className="object-contain"
      />
    </motion.div>
  );
}

export function TabBar({ activeKey, onChange }: TabBarProps) {
  const pathname = usePathname();
  const isConstellationPage = pathname.startsWith("/constellation");

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <motion.nav
        className="mx-auto w-full max-w-md flex items-center"
        style={{ minHeight: TAB_BAR_HEIGHT, height: TAB_BAR_HEIGHT }}
        animate={{
          backgroundColor: isConstellationPage ? TAB_BG_DARK : TAB_BG_LIGHT,
          boxShadow: isConstellationPage ? TAB_SHADOW_DARK : TAB_SHADOW_LIGHT,
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        <div
          className="w-full px-4 flex items-center justify-between gap-1.5"
          style={{ minHeight: TAB_BAR_HEIGHT, height: TAB_BAR_HEIGHT }}
        >
          {tabs.map((tab) => {
            const isActive = tab.key === activeKey;
            const textClass = isConstellationPage
              ? ""
              : isActive
                ? TEXT_LIGHT_ACTIVE
                : `${TEXT_LIGHT_INACTIVE} hover:text-[#0F172A]`;
            const textStyle = isConstellationPage
              ? { color: isActive ? TEXT_DARK_ACTIVE : `rgba(226, 232, 240, ${TEXT_DARK_INACTIVE_OPACITY})` }
              : undefined;

            return (
              <button
                key={tab.key}
                type="button"
                className={`relative flex-1 flex flex-col items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] transition-colors h-[52px] min-h-[52px] ${textClass}`}
                style={textStyle}
                onClick={() => onChange(tab.key)}
              >
                {isActive && (
                  <motion.div
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-full"
                    style={
                      isConstellationPage
                        ? {
                            backgroundColor: CAPSULE_DARK_BG,
                            boxShadow: `inset 0 0 0 1px ${CAPSULE_DARK_BORDER}`,
                          }
                        : { backgroundColor: MIDNIGHT_BLUE }
                    }
                    transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  />
                )}
                <span className="relative z-10 flex flex-col items-center justify-center gap-1">
                  <TabIcon
                    src={tab.iconSrc}
                    isActive={isActive}
                    isDark={isConstellationPage}
                  />
                  <span className="relative z-10 leading-tight">{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </motion.nav>
    </div>
  );
}
