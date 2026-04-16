import { calculateRankDelta } from "@/lib/signals/price-changes";

interface DetailIntelligenceInput {
  source: "coupang" | "oliveyoung";
  currentPrice: number;
  minPrice: number | null;
  snapshotCount: number;
  currentRank?: number | null;
  historicalRanks?: Array<number | null>;
}

export interface DetailIntelligence {
  confidenceLabel: string;
  reasons: string[];
}

export function buildDetailIntelligence(
  input: DetailIntelligenceInput,
): DetailIntelligence {
  const reasons: string[] = [];

  if (input.minPrice != null && input.currentPrice <= input.minPrice) {
    reasons.push("최근 기록 안에서 가장 낮은 가격이에요.");
  } else if (input.minPrice != null) {
    const gap = input.currentPrice - input.minPrice;
    reasons.push(`${gap.toLocaleString("ko-KR")}원 더 내려가면 최근 최저가를 다시 찍어요.`);
  }

  if (input.source === "oliveyoung") {
    const rankDelta = calculateRankDelta(
      input.currentRank ?? null,
      input.historicalRanks ?? [],
    );

    if ((rankDelta ?? 0) >= 5 && input.currentRank != null) {
      reasons.push(`랭킹이 ${rankDelta}계단 올라 지금 ${input.currentRank}위예요.`);
    } else if (input.currentRank != null) {
      reasons.push(`현재 올리브영 랭킹 ${input.currentRank}위로 유지 중이에요.`);
    }
  }

  if (input.snapshotCount <= 1) {
    reasons.push("데이터가 아직 적어서 다음 수집부터 추세가 더 선명해져요.");
  } else if (input.snapshotCount < 6) {
    reasons.push(`아직 ${input.snapshotCount}회 기록이라 초반 추세를 보는 단계예요.`);
  } else {
    reasons.push(`최근 ${input.snapshotCount}회 수집 데이터를 기준으로 변화를 추적했어요.`);
  }

  const confidenceLabel =
    input.source === "oliveyoung"
      ? "지금 볼 이유가 강한 올영 시그널"
      : "지금 볼 이유가 강한 쿠팡 시그널";

  return {
    confidenceLabel,
    reasons: reasons.slice(0, 3),
  };
}
