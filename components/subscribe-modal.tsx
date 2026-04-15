"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Link from "next/link";

interface ModalContext {
  collection: string;
  collectionDisplay: string;
  productUrl: string;
}

type ModalStatus =
  | { kind: "closed" }
  | { kind: "open"; ctx: ModalContext }
  | { kind: "submitting"; ctx: ModalContext }
  | { kind: "sent"; ctx: ModalContext }
  | { kind: "error"; ctx: ModalContext; message: string };

const Context = createContext<{
  open: (ctx: ModalContext) => void;
} | null>(null);

export function SubscribeModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<ModalStatus>({ kind: "closed" });
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);

  const open = useCallback((ctx: ModalContext) => {
    setStatus({ kind: "open", ctx });
    setEmail("");
    setConsent(false);
  }, []);

  const close = useCallback(() => setStatus({ kind: "closed" }), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status.kind !== "open") return;
    setStatus({ kind: "submitting", ctx: status.ctx });
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          collection: status.ctx.collection,
          consent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msgMap: Record<string, string> = {
          invalid_email: "이메일 형식을 확인해 주세요.",
          consent_required: "수신 동의에 체크해 주세요.",
          rate_limited: "잠시 후 다시 시도해 주세요.",
          email_rate_limited: "이 이메일은 이미 최근에 요청되었어요.",
          email_send_failed: "이메일 발송에 실패했어요. 잠시 후 다시 시도.",
        };
        setStatus({
          kind: "error",
          ctx: status.ctx,
          message: msgMap[data.error] || "요청 실패",
        });
        return;
      }
      setStatus({ kind: "sent", ctx: status.ctx });
    } catch {
      setStatus({
        kind: "error",
        ctx: status.ctx,
        message: "네트워크 오류",
      });
    }
  }

  return (
    <Context.Provider value={{ open }}>
      {children}
      {status.kind !== "closed" && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl p-6 shadow-xl"
          >
            {(status.kind === "open" ||
              status.kind === "submitting" ||
              status.kind === "error") && (
              <>
                <h3 className="font-heading text-lg font-semibold mb-1">
                  {status.ctx.collectionDisplay} 최저가 알림
                </h3>
                <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
                  14일 내 최저가 대비 3% 이상 하락 시 이메일로 알려드려요.
                  언제든 해지할 수 있어요.
                </p>
                <form onSubmit={submit} className="flex flex-col gap-3">
                  <input
                    type="email"
                    required
                    placeholder="이메일 주소"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    disabled={status.kind === "submitting"}
                  />
                  <label className="flex items-start gap-2 text-[12px] text-muted-foreground leading-relaxed">
                    <input
                      type="checkbox"
                      required
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5"
                      disabled={status.kind === "submitting"}
                    />
                    <span>
                      정보통신망법 제50조에 따라 광고성 정보 수신에 동의합니다.{" "}
                      <Link
                        href="/privacy"
                        className="underline"
                        target="_blank"
                      >
                        개인정보처리방침
                      </Link>
                    </span>
                  </label>
                  {status.kind === "error" && (
                    <p className="text-xs text-destructive">{status.message}</p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        if (typeof window !== "undefined") {
                          window.open(status.ctx.productUrl, "_blank", "noopener");
                        }
                      }}
                      className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm text-foreground hover:bg-muted"
                      disabled={status.kind === "submitting"}
                    >
                      쿠팡에서 보기
                    </button>
                    <button
                      type="submit"
                      className="flex-1 rounded-lg bg-primary py-2.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      disabled={status.kind === "submitting"}
                    >
                      {status.kind === "submitting" ? "전송 중..." : "알림 받기"}
                    </button>
                  </div>
                </form>
              </>
            )}
            {status.kind === "sent" && (
              <div className="text-center py-2">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-xl">
                  ✉
                </div>
                <h3 className="font-heading text-lg font-semibold mb-1">
                  인증 메일을 보냈어요
                </h3>
                <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
                  메일함에서 확인 링크를 클릭해 구독을 완료해 주세요.
                  <br />
                  (광고) 표기된 hotinbeauty 메일을 찾아주세요.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg bg-primary px-5 py-2 text-sm text-primary-foreground hover:opacity-90"
                >
                  확인
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Context.Provider>
  );
}

export function useSubscribeModal() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSubscribeModal은 SubscribeModalProvider 안에서만");
  }
  return ctx;
}
