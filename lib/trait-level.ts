/**
 * 성격 키워드 5단계 진화 (The 5 Levels of Light)
 * 누적 횟수에 따른 레벨과 별지기 메시지
 */

export const TRAIT_LEVEL_THRESHOLDS = [7, 15, 30, 60, 100] as const;
export type TraitLevel = 1 | 2 | 3 | 4 | 5;

export const TRAIT_LEVEL_NAMES: Record<TraitLevel, string> = {
  1: "발현",
  2: "안착",
  3: "선명",
  4: "공명",
  5: "정수",
};

export const TRAIT_LEVEL_MESSAGES: Record<TraitLevel, string> = {
  1: "당신의 우주에 새로운 별이 떴어요.",
  2: "이 별이 당신의 궤도에 자리를 잡았네요.",
  3: "이제 멀리서도 보일 만큼 선명한 빛이에요.",
  4: "이 성격은 당신의 삶에 깊이 공명하고 있어요.",
  5: "당신을 가장 잘 나타내는 영혼의 조각입니다.",
};

export function getTraitLevel(count: number): TraitLevel {
  if (count >= 100) return 5;
  if (count >= 60) return 4;
  if (count >= 30) return 3;
  if (count >= 15) return 2;
  if (count >= 7) return 1;
  return 1;
}

/** 최근 N일 기준 카운트용 레벨 (요즘의 나). threshold 더 낮음. */
export const TRAIT_LEVEL_RECENT_THRESHOLDS = [1, 3, 6, 10, 15] as const;
export function getTraitLevelRecent(count: number): TraitLevel {
  if (count >= 15) return 5;
  if (count >= 10) return 4;
  if (count >= 6) return 3;
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 1;
}
