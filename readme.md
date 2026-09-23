# Aetheria IDX Finance

> **Autonomous Equity Research & Auditable Valuation Agent for Indonesia Stock Exchange (IDX)**  
> Built for **Sectors Hackathon 2026** — Track 01: AI Agents & Assistants (Fallback: Track 03: Market Intelligence)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Monorepo](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/)
[![Next.js](https://img.shields.io/badge/Next.js-14_App_Router-black.svg)](https://nextjs.org/)
[![Tests](https://img.shields.io/badge/Tests-51%2F51_Passing-emerald.svg)]()
[![ExcelJS](https://img.shields.io/badge/Workbook-Living_Formulas-green.svg)]()

---

## 📌 Executive Summary & Problem Statement

Sebagian besar implementasi AI pada analisis ekuitas menderita dua kelemahan fatal: **halusinasi kalkulasi numerik** dan **ketiadaan jejak audit data**. Pada emiten non-finansial Bursa Efek Indonesia (IDX), anomali kualitas laba—seperti penumpukan piutang yang melampaui pertumbuhan pendapatan—sering kali luput dari model valuasi standar.

**Aetheria IDX Finance** adalah autonomous research agent yang mengubah ticker IDX menjadi financial model interaktif yang dapat diaudit secara independen:
1. Mengambil data resmi terstruktur dari **Sectors API v2** dengan bukti audit (`EvidenceRef`).
2. Menjalankan audit forensik akrual (CFO/Net Income & divergensi piutang).
3. Melibatkan analis via **Human-in-the-Loop** untuk mengevaluasi red flag (diskon kas/haircut).
4. Menghasilkan proyeksi DCF 5-tahun, Reverse DCF (Market Implied Growth), matriks sensitivitas 2D, serta mengekspor **5-Sheet Living Excel Workbook** berformula aktif (`=NPV`, `=SUM`, `=Assumptions!$B$5`).

---

## 🏛️ Core Architectural Invariants

- **Zero LLM Math (Non-Negotiable):** Model bahasa besar (LLM) dilarang keras menghitung metrik valuasi. Seluruh formula (FCFF, WACC, Terminal Value, DCF, Reverse DCF Solver) dieksekusi 100% deterministik di `packages/finance-engine`.
- **AI as Cognitive Copilot:** Integrasi Gemini API difokuskan secara eksklusif pada dua tugas kognitif non-aritmatika:
  - *Executive Synthesis:* Meringkas output kuantitatif menjadi memo riset 1 paragraf.
  - *What-If Intent Parser:* Menerjemahkan kalimat bahasa alami analis menjadi parameter JSON terstruktur.
- **Strict Workbook Formula Parity:** File `.xlsx` yang diunduh bukan salinan nilai statis (hardcoded values), melainkan model finansial hidup di mana sel asumsi (seperti Cash Haircut di sel `B5`) mengalir dinamis ke lembar DCF dan Sensitivitas.
- **Single Source of Truth & Local Caching:** Seluruh payload Sectors API dipetakan dengan stempel waktu dan ID bukti melalui `packages/evidence-store` (`.cache/`).

---

## 📦 Monorepo Workspace Structure

```text
aetheria-idx-finance/
├── apps/
│   └── web/                   # Next.js 14 (App Router) 3-Tab Research Workspace & UI Copilot
├── packages/
│   ├── domain/                # Entity schemas, error taxonomy, EvidenceRef contracts
│   ├── sectors-adapter/       # Sectors REST API v2 client, symbol checker, periodEnd sorter
│   ├── evidence-store/        # Atomic disk-backed evidence cache (.cache/)
│   ├── finance-engine/        # Pure deterministic mathematical & forensic valuation engine
│   ├── agent-orchestrator/    # Finite State Machine (planning -> collecting -> auditing -> valuing)
│   └── xlsx-export/           # Multi-sheet living formula workbook generator (ExcelJS)
├── fixtures/                  # Audited offline dataset (AKRA reference models)
└── tests/                     # 51 unit, integration, and E2E parity tests