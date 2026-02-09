import ArchiveMonthClient from "./archive-month-client";

/** 정적 내보내기(output: export) 시 빌드할 연월 경로 목록: 2023-01 ~ 2028-12 */
export function generateStaticParams() {
  const params: { yearMonth: string }[] = [];
  for (let year = 2023; year <= 2028; year++) {
    for (let month = 1; month <= 12; month++) {
      params.push({
        yearMonth: `${year}-${String(month).padStart(2, "0")}`,
      });
    }
  }
  return params;
}

export default function ArchiveYearMonthPage() {
  return <ArchiveMonthClient />;
}
