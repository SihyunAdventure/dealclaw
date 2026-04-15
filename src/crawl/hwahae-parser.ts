// 화해(Hwahae) Phase 2 파서.
// 입력: (a) gateway.hwahae.co.kr/v14/rankings/.../details 응답 JSON
//       (b) www.hwahae.co.kr/rankings?... SSR HTML 의 __NEXT_DATA__ 에서 꺼낸 pageProps
// 출력: src/crawl/hwahae-types.ts 의 runtime 타입 (HwahaeRankedProduct / HwahaeRankingCategoryNode / ...)
//
// 규칙:
// - 순수 함수. 네트워크/DB 접근 없음. Phase 3 크롤러가 이 파서로 매핑만 수행.
// - goods 가 null 일 수 있음(is_commerce=false) → 가격 3종·용량 모두 nullable 로 내려감.
// - rank 는 응답 body 에 없고 `(page-1) * page_size + i + 1` 로 계산.
// - 카테고리 트리는 root.children[] / root.categories[] 양쪽을 재귀 walk.
//   (category 테마: children; skin/age: 양쪽 다 존재하는 케이스 관찰됨)

import type {
  HwahaeAwardRecord,
  HwahaeBrand,
  HwahaeBrandRanked,
  HwahaeRankedProduct,
  HwahaeRankingCategoryNode,
  HwahaeRankingType,
  HwahaeReviewTopic,
  HwahaeThemeMeta,
  HwahaeThemeSlug,
} from "./hwahae-types";

// ─────────── 원본(raw) 응답 타입 ───────────
// SSR __NEXT_DATA__ / gateway 응답 모두에서 동일 shape 으로 내려옴.

interface RawBrand {
  id: number;
  name: string;
  alias?: string | null;
  full_name?: string | null;
  image_url?: string | null;
}

interface RawGoods {
  id: number;
  product_id: number;
  capacity?: string | null;
  price: number;
  discount_rate: number;
  discount_price: number | null;
  image_url?: string | null;
  name: string;
}

interface RawReviewTopic {
  review_topic: { id: number; name: string; sentence?: string | null };
  is_positive: boolean;
  score: number;
  review_count: number;
}

interface RawProduct {
  id: number;
  uid: string;
  name: string;
  image_url?: string | null;
  review_count?: number;
  review_rating?: number | null;
  is_commerce?: boolean;
  package_info?: string | null;
  price?: number;
  product_topics?: RawReviewTopic[];
}

export interface RawRankingDetail {
  brand: RawBrand;
  goods: RawGoods | null;
  product: RawProduct;
  is_rank_new: boolean;
  rank_delta: number | null;
}

export interface RawGatewayResponse {
  meta?: {
    code?: number;
    message?: string;
    pagination?: {
      total_count?: number;
      count?: number;
      page: number;
      page_size: number;
    };
  };
  data?: { details?: RawRankingDetail[] };
}

interface RawBrandRanking {
  brand: RawBrand;
  rank_delta: number | null;
  is_rank_new: boolean;
}

interface RawRankingMeta {
  id: number;
  shortcut_name: string;
  english_name: HwahaeThemeSlug;
  ranking_type: HwahaeRankingType;
  theme_icon_url?: string;
  default_ranking_detail_id: number | null;
}

interface RawCategoryNode {
  id: number;
  name: string;
  english_name?: string | null;
  depth: number;
  ranking_type?: string;
  max_rank?: number | null;
  is_advertised?: boolean;
  last_updated_at?: string | null;
  last_updated_at_description?: string | null;
  children?: RawCategoryNode[];
  categories?: RawCategoryNode[];
}

// ─────────── 매핑 헬퍼 ───────────

function mapBrand(b: RawBrand): HwahaeBrand {
  return {
    brandId: b.id,
    name: b.name,
    alias: b.alias ?? null,
    fullName: b.full_name ?? null,
    imageUrl: b.image_url ?? null,
  };
}

function mapTopics(list: RawReviewTopic[] | undefined): HwahaeReviewTopic[] {
  return (list ?? []).map((t, i) => ({
    topicId: t.review_topic.id,
    topicName: t.review_topic.name,
    topicSentence: t.review_topic.sentence ?? null,
    isPositive: t.is_positive,
    score: t.score,
    reviewCount: t.review_count,
    topicRank: i,
  }));
}

function mapDetail(
  raw: RawRankingDetail,
  theme: HwahaeThemeSlug,
  themeId: number,
  rank: number,
  themeLabel: string | null,
): HwahaeRankedProduct {
  const p = raw.product;
  const g = raw.goods;
  return {
    productId: p.id,
    uid: p.uid,
    goodsId: g?.id ?? null,
    brand: mapBrand(raw.brand),
    name: p.name,
    goodsName: g?.name ?? null,
    imageUrl: p.image_url ?? "",
    goodsImageUrl: g?.image_url ?? null,
    packageInfo: p.package_info ?? "",
    capacity: g?.capacity ?? null,
    salePrice: g?.price ?? null,
    originalPrice: p.price ?? null,
    discountRate: g?.discount_rate ?? null,
    discountPrice: g?.discount_price ?? null,
    rating: p.review_rating ?? null,
    reviewCount: p.review_count ?? 0,
    isCommerce: p.is_commerce ?? false,
    theme,
    themeId,
    themeLabel,
    rank,
    rankDelta: raw.rank_delta,
    isRankNew: raw.is_rank_new,
    topics: mapTopics(p.product_topics),
  };
}

// ─────────── 공개 API ───────────

/**
 * gateway.hwahae.co.kr/v14/rankings/{themeId}/details 응답 → HwahaeRankedProduct[]
 *
 * 응답 body 에는 rank 필드가 없으므로
 *   rank = (page - 1) * page_size + i + 1
 * 로 계산해서 주입한다.
 */
export function parseGatewayRanking(
  json: RawGatewayResponse,
  theme: HwahaeThemeSlug,
  themeId: number,
  themeLabel: string | null = null,
): HwahaeRankedProduct[] {
  const details = json?.data?.details;
  if (!Array.isArray(details)) return [];
  const page = json?.meta?.pagination?.page ?? 1;
  const pageSize = json?.meta?.pagination?.page_size ?? details.length;
  return details.map((d, i) =>
    mapDetail(d, theme, themeId, (page - 1) * pageSize + i + 1, themeLabel),
  );
}

/**
 * SSR pageProps.rankings[] → HwahaeThemeMeta[].
 * 어떤 랭킹 페이지에서도 동일하게 내려오므로 최초 1회 캐시용.
 */
export function parseThemes(rankings: unknown): HwahaeThemeMeta[] {
  if (!Array.isArray(rankings)) return [];
  return (rankings as RawRankingMeta[]).map((r) => ({
    id: r.id,
    englishName: r.english_name,
    shortcutName: r.shortcut_name,
    rankingType: r.ranking_type,
    themeIconUrl: r.theme_icon_url ?? "",
    defaultRankingDetailId: r.default_ranking_detail_id ?? null,
  }));
}

/**
 * SSR pageProps.rankingsCategories (tree) → flat HwahaeRankingCategoryNode[].
 *
 * 루트 노드 포함. `children[]` 와 `categories[]` 양쪽을 재귀 walk.
 * 각 자식에 parentId 를 주입하고 themeSlug 는 호출자가 지정.
 * `ranking_type` 이 내려오지 않는 자식은 루트 ranking_type 을 상속.
 */
export function parseCategoryTree(
  rankingsCategories: unknown,
  themeSlug: HwahaeThemeSlug,
): HwahaeRankingCategoryNode[] {
  if (!rankingsCategories || typeof rankingsCategories !== "object") return [];
  const root = rankingsCategories as RawCategoryNode;
  const defaultRankingType: HwahaeRankingType = (root.ranking_type ??
    themeSlug.toUpperCase()) as HwahaeRankingType;

  const out: HwahaeRankingCategoryNode[] = [];
  const seenIds = new Set<number>();

  // 실측: max_rank 는 루트에만 설정되고 자식엔 undefined. 자식도 같은 theme 의 같은 rank 한도를
  // 공유하므로 조상에서 가장 가까운 max_rank 를 내려받는다. selectLeafCategories 의 minMaxRank 필터가
  // 의미 있게 동작하려면 이 전파가 필요.
  const push = (
    n: RawCategoryNode,
    parentId: number | null,
    inheritedMaxRank: number | null,
  ) => {
    if (seenIds.has(n.id)) return; // children/categories 중복 방어
    seenIds.add(n.id);
    const effectiveMaxRank = n.max_rank ?? inheritedMaxRank;
    out.push({
      id: n.id,
      parentId,
      themeEnglishName: themeSlug,
      name: n.name,
      englishName: n.english_name ?? null,
      depth: n.depth,
      rankingType: (n.ranking_type ??
        defaultRankingType) as HwahaeRankingType,
      maxRank: effectiveMaxRank,
      isAdvertised: n.is_advertised ?? false,
      lastUpdatedAt: n.last_updated_at ? new Date(n.last_updated_at) : null,
      lastUpdatedDescription: n.last_updated_at_description ?? null,
    });
    for (const c of n.children ?? []) push(c, n.id, effectiveMaxRank);
    for (const c of n.categories ?? []) push(c, n.id, effectiveMaxRank);
  };

  push(root, null, null);
  return out;
}

/**
 * 리프(실제 랭킹이 있는 노드) 선정.
 *
 * 기본 정책: max_rank >= minMaxRank (기본 20) 인 노드만 남김.
 * 루트 집합 노드(depth=1, 예: "카테고리별 랭킹") 는 max_rank 100 으로 내려와도
 * 리프가 아니므로 children 가 있으면 제외.
 */
export function selectLeafCategories(
  nodes: HwahaeRankingCategoryNode[],
  opts: { minMaxRank?: number } = {},
): HwahaeRankingCategoryNode[] {
  const minMaxRank = opts.minMaxRank ?? 20;
  const parentIds = new Set(
    nodes.map((n) => n.parentId).filter((id): id is number => id !== null),
  );
  return nodes.filter((n) => {
    if ((n.maxRank ?? 0) < minMaxRank) return false;
    if (parentIds.has(n.id)) return false; // 다른 노드의 부모면 집합 노드
    return true;
  });
}

/**
 * SSR pageProps.brandRankings[] + brandProductsLists[] → { brands, products }.
 *
 * brandProductsLists[i] 는 배열 또는 `{"0": detail, "1": detail}` object 로 올 수 있음.
 * (Phase 0 b/c 스파이크에서 양쪽 다 관찰)
 */
export function parseBrandRankings(
  brandRankings: unknown,
  brandProductsLists: unknown,
  brandThemeId: number,
): { brands: HwahaeBrandRanked[]; products: HwahaeRankedProduct[] } {
  const brands: HwahaeBrandRanked[] = [];
  if (Array.isArray(brandRankings)) {
    (brandRankings as RawBrandRanking[]).forEach((b, i) => {
      brands.push({
        brand: mapBrand(b.brand),
        rank: i + 1,
        rankDelta: b.rank_delta,
        isRankNew: b.is_rank_new,
      });
    });
  }

  const products: HwahaeRankedProduct[] = [];
  if (Array.isArray(brandProductsLists)) {
    brandProductsLists.forEach((perBrand, bi) => {
      const brandRank = bi + 1;
      const iter = Array.isArray(perBrand)
        ? perBrand
        : Object.entries(perBrand as Record<string, unknown>)
            .filter(([k]) => !Number.isNaN(Number(k)))
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([, v]) => v);
      (iter as RawRankingDetail[]).forEach((raw) => {
        // brand 테마는 rank = 브랜드 순위 (상품 단건 rank 개념이 약함).
        // Phase 1 smoke 와 동일 규칙: 브랜드 랭크를 상품에도 기록.
        products.push(
          mapDetail(raw, "brand", brandThemeId, brandRank, null),
        );
      });
    });
  }
  return { brands, products };
}

/**
 * awards/home SSR → HwahaeAwardRecord[].
 *
 * awardsYears[] 중 is_legacy=false + id 존재하는 연도만 수집.
 * dehydratedState.queries[] 안의 award 상세 payload 에서 products 를 최대한 긁어낸다.
 * 어워드 JSON shape 이 연도별로 달라 best-effort 순회.
 */
export function parseAwards(
  awardsYears: unknown,
  dehydratedState: unknown,
): HwahaeAwardRecord[] {
  const valid: Array<{ id: number; year: number }> = [];
  if (Array.isArray(awardsYears)) {
    for (const y of awardsYears as Array<{
      id: number | null;
      year: number;
      is_legacy: boolean;
    }>) {
      if (!y.is_legacy && y.id !== null) {
        valid.push({ id: y.id, year: y.year });
      }
    }
  }

  const records: HwahaeAwardRecord[] = [];
  const state = dehydratedState as
    | {
        queries?: Array<{
          queryKey?: unknown[];
          state?: { data?: unknown };
        }>;
      }
    | undefined;
  const queries = state?.queries ?? [];
  for (const q of queries) {
    const key = q.queryKey;
    if (!Array.isArray(key) || key[0] !== "award-home") continue;
    const awardId = typeof key[1] === "number" ? (key[1] as number) : null;
    const year = valid.find((v) => v.id === awardId)?.year;
    if (!year) continue;

    // data 구조가 연도별로 다르니 범용 워크: product_id 와 theme(name) 를 가진 객체를 수집.
    const stack: unknown[] = [q.state?.data];
    const seen = new WeakSet<object>();
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (seen.has(node as object)) continue;
      seen.add(node as object);
      if (Array.isArray(node)) {
        for (const v of node) stack.push(v);
        continue;
      }
      const obj = node as Record<string, unknown>;
      // 어워드 상품 노드 후보: product_id 또는 product.id 존재 + theme/category/rank 중 하나 존재
      const productId =
        (typeof obj.product_id === "number" && obj.product_id) ||
        (typeof (obj.product as { id?: unknown } | undefined)?.id ===
          "number" &&
          (obj.product as { id: number }).id) ||
        null;
      if (
        productId &&
        ("theme" in obj ||
          "category" in obj ||
          "rank" in obj ||
          "is_hall_of_fame" in obj)
      ) {
        records.push({
          productId,
          year,
          awardId,
          theme:
            (typeof obj.theme === "string" && obj.theme) ||
            (typeof obj.theme_name === "string" && obj.theme_name) ||
            "",
          category:
            (typeof obj.category === "string" && obj.category) ||
            (typeof obj.category_name === "string" && obj.category_name) ||
            null,
          rank: typeof obj.rank === "number" ? obj.rank : null,
          isHallOfFame: obj.is_hall_of_fame === true,
        });
      }
      for (const v of Object.values(obj)) stack.push(v);
    }
  }
  return records;
}

/**
 * SSR HTML 에서 <script id="__NEXT_DATA__"> JSON 을 꺼낸다.
 * Phase 3 크롤러가 카테고리 트리 초기 수집할 때 사용.
 */
export function extractNextData(html: string): unknown {
  const m = html.match(
    /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}
