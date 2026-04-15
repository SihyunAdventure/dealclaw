import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { SubscribeModalProvider } from "@/components/subscribe-modal";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const SITE_URL = "https://hotinbeauty.com";

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#2a221c" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "hotinbeauty — 올영·쿠팡 뷰티 가격 변화",
  description:
    "올리브영과 쿠팡의 뷰티 가격·랭킹 변화를 비교하고, 지금 살 이유가 생긴 상품만 먼저 보여드립니다.",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "hotinbeauty — 올영·쿠팡 뷰티 가격 변화",
    description: "올영·쿠팡 뷰티 가격 변화를 비교하고 buy-now 신호를 확인하기",
    url: SITE_URL,
    siteName: "hotinbeauty",
    locale: "ko_KR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-muted/40">
        <SubscribeModalProvider>
          <div className="mx-auto w-full max-w-[480px] min-h-full bg-background shadow-sm">
            {children}
          </div>
        </SubscribeModalProvider>
      </body>
    </html>
  );
}
