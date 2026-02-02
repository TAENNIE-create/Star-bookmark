/** 7대 심리 지표 (0~100). localStorage 및 API 응답에 사용 */
export type MoodScores = {
  selfAwareness: number;      // 자기인식
  resilience: number;         // 회복탄력성
  empathy: number;            // 타자공감
  selfDirection: number;       // 자기주도성
  meaningOrientation: number; // 의미지향
  openness: number;           // 지적개방성
  selfAcceptance: number;     // 자기수용
};

export const MOOD_SCORE_KEYS: (keyof MoodScores)[] = [
  "selfAwareness",
  "resilience",
  "empathy",
  "selfDirection",
  "meaningOrientation",
  "openness",
  "selfAcceptance",
];

export const MOOD_SCORE_LABELS: Record<keyof MoodScores, string> = {
  selfAwareness: "자기인식",
  resilience: "회복탄력성",
  empathy: "타자공감",
  selfDirection: "자기주도성",
  meaningOrientation: "의미지향",
  openness: "지적개방성",
  selfAcceptance: "자기수용",
};

export const DEFAULT_MOOD_SCORES: MoodScores = {
  selfAwareness: 50,
  resilience: 50,
  empathy: 50,
  selfDirection: 50,
  meaningOrientation: 50,
  openness: 50,
  selfAcceptance: 50,
};

/** 분석 API 응답 (상담가 편지·키워드·정체성 요약·7대 지표) */
export type AnalysisResult = {
  counselorLetter: string;
  keywords: [string, string, string];
  updatedSummary: string;
  metrics: MoodScores;
};
