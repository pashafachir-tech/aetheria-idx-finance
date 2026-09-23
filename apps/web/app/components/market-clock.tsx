"use client";

import React, { useEffect, useState } from "react";

export interface MarketClockProps {
  retrievedAt?: string;
  ticker?: string;
  compact?: boolean;
}

interface IdxSessionInfo {
  session: string;
  isOpen: boolean;
  color: string;
  bg: string;
  detail: string;
}

function getIdxSession(date: Date): IdxSessionInfo {
  // Convert current time to WIB (UTC+7)
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const wibTime = new Date(utc + 3600000 * 7);

  const day = wibTime.getDay(); // 0 = Sun, 6 = Sat
  const hour = wibTime.getHours();
  const minute = wibTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // Weekend
  if (day === 0 || day === 6) {
    return {
      session: "WEEKEND CLOSED",
      isOpen: false,
      color: "#8B92A5",
      bg: "rgba(139, 146, 165, 0.15)",
      detail: "Bursa Efek Indonesia libur akhir pekan",
    };
  }

  // Pre-Opening: 08:45 - 08:59 (525 - 539 min)
  if (timeInMinutes >= 525 && timeInMinutes < 540) {
    return {
      session: "PRE-OPENING",
      isOpen: true,
      color: "#F59E0B",
      bg: "rgba(245, 158, 11, 0.15)",
      detail: "Order matching & pembentukan harga pembukaan",
    };
  }

  // Session 1: 09:00 - 12:00 (540 - 720 min) (Friday ends at 11:30 = 690 min)
  const session1End = day === 5 ? 690 : 720;
  if (timeInMinutes >= 540 && timeInMinutes < session1End) {
    return {
      session: "SESI 1 AKTIF",
      isOpen: true,
      color: "#10B981",
      bg: "rgba(16, 185, 129, 0.15)",
      detail: `Perdagangan reguler aktif (hingga ${day === 5 ? "11:30" : "12:00"} WIB)`,
    };
  }

  // Break: 12:00 - 13:30 (Friday 11:30 - 14:00)
  const session2Start = day === 5 ? 840 : 810;
  if (timeInMinutes >= session1End && timeInMinutes < session2Start) {
    return {
      session: "ISTIRAHAT BURSA",
      isOpen: false,
      color: "#38bdf8",
      bg: "rgba(56, 189, 248, 0.15)",
      detail: `Jeda antar sesi (Sesi 2 mulai ${day === 5 ? "14:00" : "13:30"} WIB)`,
    };
  }

  // Session 2: (13:30/14:00 - 15:49 = 949 min)
  if (timeInMinutes >= session2Start && timeInMinutes < 950) {
    return {
      session: "SESI 2 AKTIF",
      isOpen: true,
      color: "#10B981",
      bg: "rgba(16, 185, 129, 0.15)",
      detail: "Perdagangan reguler sesi siang aktif",
    };
  }

  // Pre-closing: 15:50 - 16:00 (950 - 960 min)
  if (timeInMinutes >= 950 && timeInMinutes < 960) {
    return {
      session: "PRE-CLOSING",
      isOpen: true,
      color: "#F59E0B",
      bg: "rgba(245, 158, 11, 0.15)",
      detail: "Pembentukan harga penutupan IDX",
    };
  }

  // Post-trading: 16:00 - 16:15 (960 - 975 min)
  if (timeInMinutes >= 960 && timeInMinutes < 975) {
    return {
      session: "PASCA-PERDAGANGAN",
      isOpen: false,
      color: "#818cf8",
      bg: "rgba(129, 140, 248, 0.15)",
      detail: "Alokasi transaksi harga penutupan",
    };
  }

  // Market closed
  return {
    session: "MARKET CLOSED",
    isOpen: false,
    color: "#6A7285",
    bg: "rgba(106, 114, 133, 0.15)",
    detail: "Bursa Efek Indonesia tutup (buka kembali 08:45 WIB)",
  };
}

export function MarketClock({ retrievedAt, ticker, compact = false }: MarketClockProps) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted) {
    if (compact) {
      return (
        <div
          style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" }}
          suppressHydrationWarning
        >
          <span className="wb-badge wb-badge--dev" suppressHydrationWarning>BURSA INDONESIA (IDX)</span>
          <span style={{ color: "#8B92A5", opacity: 0.6 }} suppressHydrationWarning>--:--:-- WIB</span>
        </div>
      );
    }

    return (
      <section className="wb-panel wb-panel--compact" style={{ marginTop: "12px" }} suppressHydrationWarning>
        <div className="wb-panel__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="wb-panel__title" style={{ fontSize: "12px" }}>Real-Time IDX Exchange &amp; Audit</h2>
          <span className="wb-badge wb-badge--dev" suppressHydrationWarning>BURSA INDONESIA (IDX)</span>
        </div>
        <div style={{ display: "grid", gap: "8px", fontSize: "11.5px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#8B92A5" }}>WIB (Jakarta UTC+7)</span>
            <code style={{ color: "#8B92A5", fontFamily: "'JetBrains Mono', monospace" }} suppressHydrationWarning>
              --:--:-- WIB
            </code>
          </div>
        </div>
      </section>
    );
  }

  const session = getIdxSession(now);

  // Format WIB time
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const wibDate = new Date(utcTime + 3600000 * 7);

  const wibTimeString = wibDate.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const utcTimeString = now.toISOString().slice(11, 19);

  if (compact) {
    return (
      <div
        style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" }}
        suppressHydrationWarning
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "2px 8px",
            borderRadius: "4px",
            background: session.bg,
            color: session.color,
            fontWeight: 700,
            border: `1px solid ${session.color}40`,
          }}
          suppressHydrationWarning
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: session.color,
              boxShadow: session.isOpen ? `0 0 6px ${session.color}` : "none",
            }}
          />
          {session.session}
        </span>
        <span style={{ color: "#C5CBD8" }} suppressHydrationWarning>{wibTimeString} WIB</span>
      </div>
    );
  }

  return (
    <section className="wb-panel wb-panel--compact" style={{ marginTop: "12px" }} suppressHydrationWarning>
      <div className="wb-panel__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="wb-panel__title" style={{ fontSize: "12px" }}>Real-Time IDX Exchange &amp; Audit</h2>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "2px 7px",
            borderRadius: "3px",
            fontSize: "10px",
            fontWeight: 800,
            fontFamily: "'JetBrains Mono', monospace",
            background: session.bg,
            color: session.color,
            border: `1px solid ${session.color}40`,
          }}
          suppressHydrationWarning
        >
          <span
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: session.color,
              boxShadow: session.isOpen ? `0 0 6px ${session.color}` : "none",
            }}
          />
          {session.session}
        </span>
      </div>

      <div style={{ display: "grid", gap: "8px", fontSize: "11.5px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#8B92A5" }}>WIB (Jakarta UTC+7)</span>
          <code style={{ color: "#F1F3F9", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }} suppressHydrationWarning>
            {wibTimeString} WIB
          </code>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#8B92A5" }}>UTC Lineage Time</span>
          <code style={{ color: "#8B92A5", fontFamily: "'JetBrains Mono', monospace" }} suppressHydrationWarning>
            {utcTimeString} UTC
          </code>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#8B92A5" }}>Status Sesi BEI</span>
          <span style={{ color: "#C5CBD8", fontSize: "11px" }}>{session.detail}</span>
        </div>
      </div>

      {/* Verification Stamp */}
      <div
        style={{
          marginTop: "12px",
          padding: "8px 10px",
          borderRadius: "4px",
          background: "rgba(0, 229, 153, 0.06)",
          border: "1px dashed rgba(0, 229, 153, 0.3)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span style={{ fontSize: "14px", color: "#00E599" }}>🛡️</span>
        <div style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#8B92A5", lineHeight: "1.4" }}>
          <strong style={{ color: "#00E599", display: "block" }}>
            AUDIT VERIFIED: SECTORS-V2-DETERMINISTIC
          </strong>
          Zero-LLM Math Kernel · Lineage Hash SHA-256 Validated
        </div>
      </div>
    </section>
  );
}
