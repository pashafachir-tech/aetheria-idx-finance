"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AETHERIA SYSTEM_INTERRUPT:500]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#08090C",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        padding: "32px",
        textAlign: "center",
      }}
    >
      {/* Terminal Frame */}
      <div
        style={{
          maxWidth: "640px",
          width: "100%",
          border: "1px solid #1e293b",
          borderRadius: "8px",
          background: "linear-gradient(180deg, #0f1117 0%, #0a0c11 100%)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 60px rgba(99, 102, 241, 0.06)",
          overflow: "hidden",
        }}
      >
        {/* Terminal Title Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 16px",
            borderBottom: "1px solid #1e293b",
            background: "rgba(15, 23, 42, 0.8)",
          }}
        >
          <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ef4444" }} />
          <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#eab308" }} />
          <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ marginLeft: "12px", color: "#64748b", fontSize: "11px" }}>
            aetheria://kernel/error-handler
          </span>
        </div>

        {/* Terminal Content */}
        <div style={{ padding: "32px 28px", textAlign: "left" }}>
          {/* Glitch Header */}
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                display: "inline-block",
                padding: "6px 14px",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "4px",
                color: "#f87171",
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.12em",
                marginBottom: "16px",
              }}
            >
              ● CRITICAL FAULT DETECTED
            </div>
            <h1
              style={{
                margin: "12px 0 0",
                fontSize: "28px",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                color: "#f1f5f9",
                fontFamily: "Inter, -apple-system, sans-serif",
              }}
            >
              [ SYSTEM_INTERRUPT: 500 ]
            </h1>
          </div>

          {/* Error Details */}
          <div
            style={{
              padding: "14px 16px",
              background: "rgba(239, 68, 68, 0.06)",
              border: "1px solid rgba(239, 68, 68, 0.15)",
              borderRadius: "6px",
              marginBottom: "20px",
              fontSize: "12px",
              lineHeight: "1.7",
              color: "#94a3b8",
            }}
          >
            <div style={{ color: "#64748b", marginBottom: "6px" }}>
              <span style={{ color: "#f87171" }}>ERR</span> kernel.runtime.unhandled_exception
            </div>
            <div style={{ color: "#cbd5e1", wordBreak: "break-word" }}>
              {error.message || "An unexpected error occurred in the Aetheria Finance Kernel."}
            </div>
            {error.digest && (
              <div style={{ marginTop: "8px", color: "#475569", fontSize: "10px" }}>
                DIGEST: {error.digest}
              </div>
            )}
          </div>

          {/* System Log */}
          <div
            style={{
              fontSize: "11px",
              color: "#475569",
              lineHeight: "1.8",
              marginBottom: "24px",
              borderLeft: "2px solid #1e293b",
              paddingLeft: "12px",
            }}
          >
            <div><span style={{ color: "#6366f1" }}>→</span> Market data pipeline interrupted</div>
            <div><span style={{ color: "#6366f1" }}>→</span> Sectors API v2 connection may be degraded</div>
            <div><span style={{ color: "#6366f1" }}>→</span> Zero-LLM math kernel suspended</div>
            <div><span style={{ color: "#10b981" }}>✓</span> Evidence cache integrity preserved</div>
          </div>

          {/* Recovery Actions */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button
              onClick={() => reset()}
              style={{
                flex: "1 1 200px",
                padding: "12px 18px",
                background: "rgba(99, 102, 241, 0.12)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                borderRadius: "6px",
                color: "#a5b4fc",
                fontSize: "12px",
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "rgba(99, 102, 241, 0.2)";
                e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.5)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "rgba(99, 102, 241, 0.12)";
                e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.3)";
              }}
            >
              [ ↻ Re-initialize Kernel ]
            </button>
            <a
              href="/"
              style={{
                flex: "1 1 200px",
                padding: "12px 18px",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "6px",
                color: "#6ee7b7",
                fontSize: "12px",
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                textDecoration: "none",
                textAlign: "center",
                transition: "all 0.15s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "rgba(16, 185, 129, 0.15)";
                e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.4)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "rgba(16, 185, 129, 0.08)";
                e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.25)";
              }}
            >
              [ ← Return to Morning Hub ]
            </a>
          </div>
        </div>

        {/* Terminal Footer */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid #1e293b",
            color: "#334155",
            fontSize: "9px",
            letterSpacing: "0.08em",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>AETHERIA KERNEL v2.0</span>
          <span>SECTORS API v2 AUDITED</span>
        </div>
      </div>
    </div>
  );
}
