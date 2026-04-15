import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { collections } from "@/src/data/collections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "구독 확인 - hotinbeauty",
};

type VerifyState =
  | { kind: "success"; collectionDisplay: string }
  | { kind: "already_active"; collectionDisplay: string }
  | { kind: "invalid" }
  | { kind: "unsubscribed" };

async function verifyToken(token: string | undefined): Promise<VerifyState> {
  if (!token || token.length < 32) return { kind: "invalid" };

  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
  const rows = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.verifyToken, token))
    .limit(1);

  if (rows.length === 0) return { kind: "invalid" };
  const row = rows[0];

  const col = collections.find((c) => c.slug === row.collection);
  const collectionDisplay = col?.displayName ?? row.collection;

  if (row.status === "unsubscribed") return { kind: "unsubscribed" };
  if (row.status === "active")
    return { kind: "already_active", collectionDisplay };

  // 토큰을 rotate하지 않음 — 웰컴 메일의 해지 링크가 계속 유효해야 함.
  // 해지는 이 같은 토큰을 사용 (per-subscription lifetime).
  await db
    .update(schema.subscriptions)
    .set({
      status: "active",
      verifiedAt: new Date(),
    })
    .where(eq(schema.subscriptions.id, row.id));

  return { kind: "success", collectionDisplay };
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const state = await verifyToken(token);

  return (
    <main className="flex-1 bg-background">
      <header className="border-b border-border px-4 py-5">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
          ← 홈으로
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight mt-2">
          구독 확인
        </h1>
      </header>
      <section className="px-4 py-10 text-center">
        {state.kind === "success" && (
          <>
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-2xl">
              ✓
            </div>
            <h2 className="font-heading text-xl font-semibold mb-2">구독 완료</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong className="text-foreground">{state.collectionDisplay}</strong>{" "}
              카테고리 최저가 갱신 시 이메일로 알려드립니다.
              <br />
              14일 내 최저가 대비 3% 이상 하락했을 때만 발송합니다.
            </p>
          </>
        )}
        {state.kind === "already_active" && (
          <>
            <h2 className="font-heading text-xl font-semibold mb-2">이미 활성화됨</h2>
            <p className="text-sm text-muted-foreground">
              {state.collectionDisplay} 구독이 이미 활성화되어 있습니다.
            </p>
          </>
        )}
        {state.kind === "unsubscribed" && (
          <>
            <h2 className="font-heading text-xl font-semibold mb-2">해지된 구독</h2>
            <p className="text-sm text-muted-foreground">
              해당 링크의 구독은 이미 해지되었습니다. 홈에서 다시 구독할 수 있습니다.
            </p>
          </>
        )}
        {state.kind === "invalid" && (
          <>
            <h2 className="font-heading text-xl font-semibold mb-2">유효하지 않은 링크</h2>
            <p className="text-sm text-muted-foreground">
              링크가 만료되었거나 잘못된 토큰입니다.
              <br />
              홈에서 다시 구독을 요청해 주세요.
            </p>
          </>
        )}
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90"
          >
            홈으로 가기
          </Link>
        </div>
      </section>
    </main>
  );
}
