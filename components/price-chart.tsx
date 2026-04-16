"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface PricePoint {
  t: number; // epoch ms
  salePrice: number;
  rank?: number | null;
}

interface PriceChartProps {
  data: PricePoint[];
  showRank?: boolean;
  height?: number;
}

function fmtPrice(v: number) {
  return `${v.toLocaleString("ko-KR")}원`;
}

function fmtDate(t: number) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDateTime(t: number) {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PriceChart({
  data,
  showRank = false,
  height = 240,
}: PriceChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/50 px-4 py-10 text-center">
        <p className="text-[13px] font-medium text-foreground">
          아직 시계열 데이터가 없어요
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          크롤러 다음 사이클부터 가격 변화가 기록됩니다.
        </p>
      </div>
    );
  }

  const singlePoint = data.length === 1;
  const priceValues = data.map((d) => d.salePrice);
  const minPrice = Math.min(...priceValues);
  const maxPrice = Math.max(...priceValues);
  const padding = Math.max(Math.round((maxPrice - minPrice) * 0.15), 100);
  const rankValues = data
    .map((d) => d.rank)
    .filter((rank): rank is number => typeof rank === "number");
  const rankDomain =
    rankValues.length > 0
      ? [Math.max(1, Math.min(...rankValues) - 5), Math.max(...rankValues) + 5]
      : [1, 100];

  return (
    <div className="w-full min-w-0 text-foreground">
      <div style={{ width: "100%", height, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={data}
            margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              opacity={0.1}
            />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={fmtDate}
              fontSize={11}
              stroke="currentColor"
              opacity={0.6}
              tick={{ fill: "currentColor" }}
            />
            <YAxis
              yAxisId="price"
              domain={[Math.max(0, minPrice - padding), maxPrice + padding]}
              tickFormatter={fmtPrice}
              fontSize={11}
              stroke="currentColor"
              opacity={0.6}
              width={72}
              tick={{ fill: "currentColor" }}
            />
            {showRank && (
              <YAxis
                yAxisId="rank"
                orientation="right"
                reversed
                domain={rankDomain as [number, number]}
                tickFormatter={(v: number) => `${v}위`}
                fontSize={11}
                stroke="currentColor"
                opacity={0.4}
                width={40}
                tick={{ fill: "currentColor" }}
              />
            )}
            <Tooltip
              labelFormatter={(label) => fmtDateTime(Number(label))}
              formatter={(value, name) => {
                if (name === "가격") return [fmtPrice(value as number), name];
                if (name === "랭킹") return [`${value}위`, name];
                return [value, name];
              }}
              contentStyle={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--color-muted-foreground)" }}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="salePrice"
              name="가격"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={{ r: singlePoint ? 6 : 3, fill: "var(--color-primary)" }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            {showRank && (
              <Line
                yAxisId="rank"
                type="monotone"
                dataKey="rank"
                name="랭킹"
                stroke="var(--color-accent-foreground)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={{ r: 2, fill: "var(--color-accent-foreground)" }}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {singlePoint && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          데이터가 1회만 있어요. 변동이 쌓이면 추세선이 그려집니다.
        </p>
      )}
    </div>
  );
}
