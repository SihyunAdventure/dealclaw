import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { asc, desc, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { HeroBanner } from "@/components/hero-banner";
import { ProductGrid } from "@/components/product-grid";
import { collections } from "@/src/data/collections";

export const revalidate = 300; // ISR: 5분마다 재검증

async function getProducts(collection: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  const products = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.collection, collection))
    .orderBy(asc(schema.products.unitPriceValue));

  return products;
}

async function getLastCrawl(collection: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  const [run] = await db
    .select()
    .from(schema.crawlRuns)
    .where(eq(schema.crawlRuns.collection, collection))
    .orderBy(desc(schema.crawlRuns.finishedAt))
    .limit(1);

  return run;
}

export default async function Home() {
  const col = collections[0]; // 차돌박이
  const [products, lastCrawl] = await Promise.all([
    getProducts(col.slug),
    getLastCrawl(col.slug),
  ]);

  return (
    <main className="flex-1">
      <HeroBanner
        title={`🔥 ${col.displayName} 최저가`}
        description={col.description}
        lastCrawledAt={lastCrawl?.finishedAt?.toISOString()}
      />
      <div className="mx-auto max-w-5xl px-4 py-6">
        {products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <div className="py-20 text-center text-muted-foreground">
            <p className="text-lg">아직 상품이 없습니다</p>
            <p className="mt-2 text-sm">
              <code>npm run crawl</code>로 크롤링을 실행하세요.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
