"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LU_BALANCE_UPDATED_EVENT, getLuBalance } from "../../lib/lu-balance";
import { LU_ICON, MIDNIGHT_BLUE } from "../../lib/theme";

const HIDE_LU_PATHS = ["/", "/diary", "/archive", "/bookshelf", "/constellation"];

function pathHidesLu(pathname: string): boolean {
  if (HIDE_LU_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/diary/")) return true;
  if (pathname.startsWith("/archive/")) return true; // 월간 기록집
  return false;
}

export function LuBalanceBar() {
  const pathname = usePathname();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    setBalance(getLuBalance());
    const onUpdate = () => setBalance(getLuBalance());
    window.addEventListener(LU_BALANCE_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(LU_BALANCE_UPDATED_EVENT, onUpdate);
  }, []);

  if (pathname && pathHidesLu(pathname)) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-end items-center px-4 py-2 pointer-events-none"
      style={{ background: "transparent" }}
    >
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm pointer-events-auto"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          color: MIDNIGHT_BLUE,
        }}
      >
        <span className="text-amber-600 text-sm" aria-hidden>
          {LU_ICON}
        </span>
        <span className="text-sm font-semibold tabular-nums">{balance}</span>
      </div>
    </div>
  );
}
