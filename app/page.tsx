import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { asc, desc, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { HeroBanner } from "@/components/hero-banner";
import { ProductGrid } from "@/components/product-grid";
import { CollectionTabs } from "@/components/collection-tabs";
import { collections } from "@/src/data/collections";

export const revalidate = 300;

async function getProducts(collection: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  return db
    .select()
    .from(schema.products)
    .where(eq(schema.products.collection, collection))
    .orderBy(asc(schema.products.unitPriceValue));
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

interface PageProps {
  searchParams: Promise<{ collection?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeSlug = params.collection || collections[0].slug;
  const col = collections.find((c) => c.slug === activeSlug) || collections[0];

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
      <CollectionTabs collections={collections} activeSlug={col.slug} />
      <div className="mx-auto max-w-5xl px-4 py-6">
        {products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <div className="py-20 text-center text-muted-foreground">
            <p className="text-lg">아직 상품이 없습니다</p>
            <p className="mt-2 text-sm">
              크롤링 데이터가 곧 업데이트됩니다.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
