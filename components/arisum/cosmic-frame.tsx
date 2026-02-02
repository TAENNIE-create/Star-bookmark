"use client";

type CosmicFrameProps = {
  children: React.ReactNode;
  className?: string;
};

/** 레이아웃 래퍼 – 테두리 없음 */
export function CosmicFrame({ children, className = "" }: CosmicFrameProps) {
  return <div className={`relative ${className}`}>{children}</div>;
}
