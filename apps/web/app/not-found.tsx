import Link from "next/link";

const BLUECHIP_SUGGESTIONS = [
  { ticker: "BBCA", name: "Bank Central Asia", sector: "Financials" },
  { ticker: "BMRI", name: "Bank Mandiri", sector: "Financials" },
  { ticker: "BBRI", name: "Bank Rakyat Indonesia", sector: "Financials" },
  { ticker: "TLKM", name: "Telkom Indonesia", sector: "Infra & Telco" },
  { ticker: "ASII", name: "Astra International", sector: "Industrials" },
  { ticker: "BUMI", name: "Bumi Resources", sector: "Energy" },
  { ticker: "AKRA", name: "AKR Corporindo", sector: "Energy" },
  { ticker: "ICBP", name: "Indofood CBP", sector: "Consumer" },
];

export default function NotFound() {
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
          maxWidth: "700px",
          width: "100%",
          border: "1px solid #1e293b",
          borderRadius: "8px",
          background: "linear-gradient(180deg, #0f1117 0%, #0a0c11 100%)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 60px rgba(251, 191, 36, 0.04)",
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
            aetheria://kernel/route-resolver
          </span>
        </div>

        {/* Terminal Content */}
        <div style={{ padding: "32px 28px", textAlign: "left" }}>
          {/* Status Badge */}
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                display: "inline-block",
                padding: "6px 14px",
                background: "rgba(251, 191, 36, 0.1)",
                border: "1px solid rgba(251, 191, 36, 0.25)",
                borderRadius: "4px",
                color: "#fbbf24",
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.12em",
                marginBottom: "16px",
              }}
            >
              ● ROUTE NOT RESOLVED
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
              [ SYSTEM_INTERRUPT: 404 ]
            </h1>
          </div>

          {/* Description */}
          <div
            style={{
              padding: "14px 16px",
              background: "rgba(251, 191, 36, 0.04)",
              border: "1px solid rgba(251, 191, 36, 0.12)",
              borderRadius: "6px",
              marginBottom: "20px",
              fontSize: "12px",
              lineHeight: "1.7",
              color: "#94a3b8",
            }}
          >
            <div style={{ color: "#64748b", marginBottom: "6px" }}>
              <span style={{ color: "#fbbf24" }}>WARN</span> kernel.router.no_matching_route
            </div>
            <div style={{ color: "#cbd5e1" }}>
              The requested ticker or page could not be resolved against the IDX Universe (902 emiten).
            </div>
          </div>

          {/* Suggested Active Tickers */}
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                color: "#64748b",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "10px",
              }}
            >
              ▸ Suggested Active Tickers
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: "6px",
              }}
            >
              {BLUECHIP_SUGGESTIONS.map((stock) => (
                <Link
                  key={stock.ticker}
                  href={`/run?ticker=${stock.ticker}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    background: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid #1e293b",
                    borderRadius: "4px",
                    color: "#e2e8f0",
                    textDecoration: "none",
                    fontSize: "11px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ color: "#10b981", fontWeight: 800, fontSize: "12px" }}>
                    {stock.ticker}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {stock.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Recovery Actions */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <Link
              href="/"
              style={{
                flex: "1 1 280px",
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
            >
              [ ← Return to Morning Hub ]
            </Link>
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
          <span>IDX UNIVERSE: 902 EMITEN</span>
        </div>
      </div>
    </div>
  );
}
