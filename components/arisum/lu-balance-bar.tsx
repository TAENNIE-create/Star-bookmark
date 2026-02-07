"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LU_BALANCE_UPDATED_EVENT, getLuBalance } from "../../lib/lu-balance";
import { LU_ICON, MIDNIGHT_BLUE } from "../../lib/theme";

/** 별조각 바를 오른쪽 상단에 표시할 경로: 홈탭, 기록함 탭만 */
function pathShowsLu(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/archive") return true;
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

  if (!pathname || !pathShowsLu(pathname)) return null;

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
