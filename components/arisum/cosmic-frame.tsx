"use client";

type CosmicFrameProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

/** 레이아웃 래퍼 – 테두리 없음. style로 세이프 에어리어 등 전달 가능 */
export function CosmicFrame({ children, className = "", style }: CosmicFrameProps) {
  return (
    <div className={`relative ${className}`} style={style}>
      {children}
    </div>
  );
}
