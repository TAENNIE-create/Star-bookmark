"use client";

import { useRouter } from "next/navigation";

const SKY_WHITE = "#F4F7FB";
const MIDNIGHT_BLUE = "#0F172A";

export default function PrivacyPage() {
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
          개인정보 처리방침
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
              제1조 (수집하는 개인정보)
            </h2>
            <p style={{ color: MIDNIGHT_BLUE }}>
              서비스 이용 과정에서 아래와 같은 개인정보를 수집할 수 있습니다.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1" style={{ color: MIDNIGHT_BLUE }}>
              <li>닉네임</li>
              <li>이메일 주소 (계정 연동 시)</li>
              <li>일기 텍스트</li>
              <li>음성 데이터</li>
              <li>사진 데이터</li>
              <li>기기 정보</li>
            </ul>
          </section>

          <section>
            <h2
              className="text-base font-semibold mb-2"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
            >
              제2조 (정보의 이용 목적)
            </h2>
            <p style={{ color: MIDNIGHT_BLUE }}>
              수집된 정보는 다음 목적으로 이용됩니다.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1" style={{ color: MIDNIGHT_BLUE }}>
              <li>AI 기반 성격 분석 서비스 제공</li>
              <li>자아 아카이빙 리포트 생성</li>
              <li>유료 결제 및 고객 지원</li>
            </ul>
          </section>

          <section>
            <h2
              className="text-base font-semibold mb-2"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
            >
              제3조 (AI 데이터 처리)
            </h2>
            <p style={{ color: MIDNIGHT_BLUE }}>
              사용자의 일기 데이터는 분석을 위해 OpenAI API를 사용합니다. 전송되는 데이터는
              비식별화되어 있으며, OpenAI의 AI 학습용으로 사용되지 않습니다.
            </p>
          </section>

          <section>
            <h2
              className="text-base font-semibold mb-2"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
            >
              제4조 (개인정보의 보유 및 파기)
            </h2>
            <p style={{ color: MIDNIGHT_BLUE }}>
              계정 탈퇴 시 서버에 저장된 모든 데이터는 즉시 영구 삭제됩니다.
            </p>
          </section>

          <section>
            <h2
              className="text-base font-semibold mb-2"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
            >
              제5조 (사용자의 권리)
            </h2>
            <p style={{ color: MIDNIGHT_BLUE }}>
              사용자는 언제든지 자신의 데이터를 열람·수정·삭제 요청할 권리가 있습니다. 설정
              메뉴에서 계정 탈퇴를 통해 모든 데이터 삭제를 요청할 수 있습니다.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
