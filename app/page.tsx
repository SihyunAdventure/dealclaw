import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { asc } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { CollectionSection } from "@/components/collection-section";
import { CollectionTabs } from "@/components/collection-tabs";
import { collections } from "@/src/data/collections";

export const revalidate = 300;

async function getAllProducts() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  return db
    .select()
    .from(schema.products)
    .orderBy(asc(schema.products.unitPriceValue));
}

export default async function Home() {
  const allProducts = await getAllProducts();

  return (
    <main className="flex-1 bg-background">
      {/* 헤더 */}
      <header className="border-b border-border px-4 py-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          hotinbeauty
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          매일 쿠팡 뷰티 카테고리 최저가
        </p>
      </header>

      {/* 컬렉션 탭 (sticky) */}
      <CollectionTabs
        collections={collections.map((c) => ({
          slug: c.slug,
          displayName: c.displayName,
        }))}
      />

      {/* 컬렉션별 핫딜 리스트 */}
      <div>
        {collections.map((col) => {
          const products = allProducts.filter(
            (p) => p.collection === col.slug,
          );
          return (
            <CollectionSection
              key={col.slug}
              slug={col.slug}
              title={col.displayName}
              description={col.description}
              products={products}
            />
          );
        })}
      </div>

      {/* 푸터 */}
      <footer className="px-4 py-6 text-center text-[11px] text-muted-foreground border-t border-border mt-4">
        <p>쿠팡 파트너스 활동의 일환으로 수수료를 지급받을 수 있습니다.</p>
        <p className="mt-1">© 2026 hotinbeauty</p>
      </footer>
    </main>
  );
}
