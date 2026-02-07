"use client";

import { useEffect, useState } from "react";
import { StoreModal } from "./store-modal";

const OPEN_STORE_EVENT = "open-store-modal";

export function StoreModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_STORE_EVENT, handler);
    return () => window.removeEventListener(OPEN_STORE_EVENT, handler);
  }, []);

  return (
    <>
      {children}
      <StoreModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** 별조각/상점 모달을 열 때 호출 (홈·기록함 상단 별조각 클릭 등) */
export function openStoreModal() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_STORE_EVENT));
  }
}
