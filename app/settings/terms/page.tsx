"use client";

import { useRouter } from "next/navigation";

const SKY_WHITE = "#F4F7FB";
const MIDNIGHT_BLUE = "#0F172A";

export default function TermsPage() {
  const router = useRouter();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: SKY_WHITE, color: MIDNIGHT_BLUE }}
    >
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b"
        style={{ backgroundColor: SKY_WHITE, borderColor: "#E2E8F0" }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(15,23,42,0.08)", color: MIDNIGHT_BLUE }}
          aria-label="뒤로 가기"
        >
          ←
        </button>
        <h1
          className="text-lg font-semibold"
          style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
        >
          서비스 이용약관
        </h1>
      </header>

      <main className="flex-1 px-5 py-6 pb-12 max-w-xl mx-auto w-full">
        <div
          className="space-y-6 text-sm leading-relaxed"
          style={{ fontFamily: "var(--font-a2z-regular), sans-serif" }}
        >
          <section>
            <h2
              className="text-base font-semibold mb-2"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
            >
              제1조 (목적)
            </h2>
            <p style={{ color: MIDNIGHT_BLUE }}>
              본 약관은 &#39;별의 갈피&#39;가 제공하는 서비스의 이용과 관련하여 이용자와
              서비스 제공자 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2
              className="text-base font-semibold mb-2"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
            >
              제2조 (유료 서비스)
            </h2>
            <p className="mb-2" style={{ color: MIDNIGHT_BLUE }}>
              <strong style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}>별조각</strong>
              <br />
              앱 내 유료 재화입니다. 구매 후 환불은 스토어(Apple App Store / Google Play)의
              정책을 따릅니다.
            </p>
            <p style={{ color: MIDNIGHT_BLUE }}>
              <strong style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}>멤버십</strong>
              <br />
              정기 구독 서비스입니다. 구독 해지는 사용자가 스토어 설정에서 직접 관리합니다.
            </p>
          </section>

          <section>
            <h2
              className="text-base font-semibold mb-2"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
            >
              제2조의2 (기록 보존 및 열람)
            </h2>
            <p style={{ color: MIDNIGHT_BLUE }}>
              이용자의 모든 기록은 서버에 안전하게 보존됩니다. 멤버십 등급에 따라 과거 기록에
              대한 &#39;열람 및 AI 분석&#39; 권한만 제한되며, 기록 자체는 삭제되지 않습니다.
              기억의 열쇠(별조각 소모) 또는 멤버십 업그레이드로 열람 범위를 확장할 수 있습니다.
            </p>
          </section>

          <section>
            <h2
              className="text-base font-semibold mb-2"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
            >
              제3조 (면책 조항)
            </h2>
            <p style={{ color: MIDNIGHT_BLUE }}>
              본 서비스는 AI 분석을 기반으로 한 자기성찰 보조 도구이며, 의학적 진단이나
              전문적인 심리 치료를 대체할 수 없습니다.
            </p>
          </section>

          <section>
            <h2
              className="text-base font-semibold mb-2"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
            >
              제4조 (이용 제한)
            </h2>
            <p style={{ color: MIDNIGHT_BLUE }}>
              타인의 저작권을 침해하거나 서비스 운영을 방해하는 행위, 법령 또는 약관에
              위배되는 행위는 금지됩니다.
            </p>
          </section>

          <section>
            <h2
              className="text-base font-semibold mb-2"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
            >
              제5조 (준거법)
            </h2>
            <p style={{ color: MIDNIGHT_BLUE }}>
              본 약관 및 서비스 이용과 관련된 분쟁에는 대한민국 법령이 적용됩니다.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
