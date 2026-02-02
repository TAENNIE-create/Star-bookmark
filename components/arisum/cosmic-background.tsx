"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SKY_WHITE, MIDNIGHT_BLUE } from "../../lib/theme";

/** 육안으로 간신히 식별되는 미세한 별 입자 위치 (고정, 불투명도 0.05 이하) */
function getStarDustPositions(count: number): { x: number; y: number; size: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    x: ((i * 31 + 7) % 97) + 1,
    y: ((i * 23 + 11) % 94) + 2,
    size: 0.5 + (i % 2) * 0.25,
  }));
}

const STAR_DUST = getStarDustPositions(56);

/** 15~20초마다 무작위 위치에서 대각선으로 지나가는 별똥별 */
function ShootingStar() {
  const [key, setKey] = useState(0);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const schedule = () => {
      const delay = 15000 + Math.random() * 5000;
      timerRef.current = setTimeout(() => {
        setStart({
          x: Math.random() * 100 - 10,
          y: Math.random() * 30 - 5,
        });
        setKey((k) => k + 1);
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <motion.div
      key={key}
      className="absolute pointer-events-none"
      style={{
        left: `${start.x}%`,
        top: `${start.y}%`,
        width: 80,
        height: 2,
        background: `linear-gradient(90deg, transparent 0%, ${MIDNIGHT_BLUE}22 40%, ${MIDNIGHT_BLUE}08 100%)`,
        borderRadius: 1,
        transform: "rotate(-35deg)",
        transformOrigin: "left center",
      }}
      initial={{ opacity: 0, x: 0 }}
      animate={{
        opacity: [0, 0.4, 0.25, 0],
        x: [0, 320],
      }}
      transition={{
        duration: 1.2,
        ease: "easeOut",
      }}
    />
  );
}

export function CosmicBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      style={{ backgroundColor: SKY_WHITE }}
      aria-hidden
    >
      {/* 중앙부 연한 푸른빛 그라데이션 – 은하수 중심 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(148, 163, 184, 0.08) 0%, rgba(100, 116, 139, 0.03) 50%, transparent 75%)",
        }}
      />
      {/* 별가루 (Star Dust) – 고정 배치, 불투명도 0.05 이하 */}
      <div className="absolute inset-0">
        {STAR_DUST.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-[#0F172A]"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              opacity: 0.045,
            }}
          />
        ))}
      </div>
      {/* 별똥별 – 15~20초마다 대각선 스쳐 지나감 */}
      <ShootingStar />
    </div>
  );
}
