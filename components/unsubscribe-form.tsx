"use client";

import { useState } from "react";

interface UnsubscribeFormProps {
  token: string;
  collectionDisplay: string;
}

type FormState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function UnsubscribeForm({ token, collectionDisplay }: UnsubscribeFormProps) {
  const [state, setState] = useState<FormState>({ kind: "idle" });

  if (state.kind === "done") {
    return (
      <div>
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-muted flex items-center justify-center text-2xl">
          ✓
        </div>
        <h3 className="font-heading text-lg font-semibold mb-2">해지 완료</h3>
        <p className="text-sm text-muted-foreground">
          {collectionDisplay} 카테고리 알림을 더 이상 보내지 않습니다.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ kind: "pending" });
        try {
          const res = await fetch("/api/unsubscribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token }),
          });
          if (!res.ok && res.status !== 200) {
            const data = await res.json().catch(() => ({}));
            setState({ kind: "error", message: data.error || "해지 실패" });
            return;
          }
          setState({ kind: "done" });
        } catch {
          setState({ kind: "error", message: "네트워크 오류" });
        }
      }}
      className="flex flex-col items-center gap-3"
    >
      <button
        type="submit"
        disabled={state.kind === "pending"}
        className="rounded-lg bg-destructive px-6 py-2.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
      >
        {state.kind === "pending" ? "해지 중..." : "구독 해지"}
      </button>
      {state.kind === "error" && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
    </form>
  );
}
