interface HeroBannerProps {
  title: string;
  description: string;
  lastCrawledAt?: string;
}

export function HeroBanner({ title, description, lastCrawledAt }: HeroBannerProps) {
  return (
    <div className="border-b border-border bg-card px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {description}
        </p>
        {lastCrawledAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            마지막 업데이트: {new Date(lastCrawledAt).toLocaleString("ko-KR")}
          </p>
        )}
      </div>
    </div>
  );
}
