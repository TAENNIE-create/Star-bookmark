import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { CosmicLayoutWrapper } from "../components/arisum/cosmic-layout-wrapper";
import { SupabaseStorageProvider } from "../components/arisum/supabase-storage-provider";
import { StoreModalProvider } from "../components/arisum/store-modal-provider";

/** 기본 본문용: 에이투지체 Light */
const a2zLight = localFont({
  src: "../public/fonts/에이투지체-3Light.woff2",
  variable: "--font-a2z-r",
  display: "swap",
});

/** 퀘스트/프로필 문구/달력 숫자용: 에이투지체 Regular */
const a2zRegular = localFont({
  src: "../public/fonts/에이투지체-4Regular.woff2",
  variable: "--font-a2z-regular",
  display: "swap",
});

/** 강조용: 에이투지체 Medium (제목, 강조 등) */
const a2zMedium = localFont({
  src: "../public/fonts/에이투지체-5Medium.woff2",
  variable: "--font-a2z-m",
  display: "swap",
});

/** 밤하늘 별자리 이름용: 나눔스퀘어라운드 Bold */
const nanumSquareRoundB = localFont({
  src: "../public/fonts/NanumSquareRoundB.woff2",
  variable: "--font-nanum-square-round-b",
  display: "swap",
});

export const metadata: Metadata = {
  title: "별의 갈피",
  description: "소중한 별의 기록을 지키는 일기와 별자리",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${a2zLight.variable} ${a2zRegular.variable} ${a2zMedium.variable} ${nanumSquareRoundB.variable}`}>
      <body className={`${a2zLight.className} antialiased pt-10`}>
        <SupabaseStorageProvider>
          <CosmicLayoutWrapper>
            <StoreModalProvider>{children}</StoreModalProvider>
          </CosmicLayoutWrapper>
        </SupabaseStorageProvider>
      </body>
    </html>
  );
}
