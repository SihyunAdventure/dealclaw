import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { collections } from "@/src/data/collections";
import { UnsubscribeForm } from "@/components/unsubscribe-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "구독 해지 - hotinbeauty",
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token || token.length < 32) {
    return <Shell><InvalidLink /></Shell>;
  }

  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
  const rows = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.verifyToken, token))
    .limit(1);

  if (rows.length === 0) return <Shell><InvalidLink /></Shell>;
  const row = rows[0];

  const col = collections.find((c) => c.slug === row.collection);
  const collectionDisplay = col?.displayName ?? row.collection;

  if (row.status === "unsubscribed") {
    return (
      <Shell>
        <h2 className="font-heading text-xl font-semibold mb-2">이미 해지됨</h2>
        <p className="text-sm text-muted-foreground">
          {collectionDisplay} 구독은 이미 해지되었습니다.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="font-heading text-xl font-semibold mb-2">구독 해지</h2>
      <p className="text-sm text-muted-foreground mb-6">
        <strong className="text-foreground">{collectionDisplay}</strong> 카테고리
        최저가 알림 구독을 해지합니다.
      </p>
      <UnsubscribeForm token={token} collectionDisplay={collectionDisplay} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 bg-background">
      <header className="border-b border-border px-4 py-5">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
          ← 홈으로
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight mt-2">
          구독 해지
        </h1>
      </header>
      <section className="px-4 py-10 text-center">{children}</section>
    </main>
  );
}

function InvalidLink() {
  return (
    <>
      <h2 className="font-heading text-xl font-semibold mb-2">유효하지 않은 링크</h2>
      <p className="text-sm text-muted-foreground">
        링크가 만료되었거나 잘못된 토큰입니다.
      </p>
      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90"
        >
          홈으로 가기
        </Link>
      </div>
    </>
  );
}
