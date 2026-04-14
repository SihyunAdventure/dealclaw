import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dealclaw — 쿠팡 핫딜 최저가",
  description: "쿠팡 최저가를 100g당 가격순으로 비교하세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-dm-sans)] bg-muted/30">
        <div className="mx-auto w-full max-w-[480px] min-h-full bg-background shadow-sm">
          {children}
        </div>
      </body>
    </html>
  );
}
