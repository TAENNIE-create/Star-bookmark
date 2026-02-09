import DiaryDateClient from "./diary-date-client";

/** 정적 내보내기(output: export) 시 빌드할 날짜 경로 목록: 최근 2년 + 앞으로 1개월 */
export function generateStaticParams() {
  const params: { date: string }[] = [];
  const today = new Date();
  for (let d = 0; d < 365 * 2; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    params.push({ date: `${y}-${m}-${day}` });
  }
  for (let d = 1; d <= 31; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() + d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    params.push({ date: `${y}-${m}-${day}` });
  }
  return params;
}

export default function DiaryDatePage() {
  return <DiaryDateClient />;
}
