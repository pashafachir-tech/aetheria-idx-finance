import EngineRun from "../engine-run";

export default async function RunPage({ searchParams }: { searchParams: Promise<{ ticker?: string }> }) {
  const { ticker } = await searchParams;
  const normalized = typeof ticker === "string" && /^[A-Za-z]{1,10}$/.test(ticker.trim()) ? ticker.trim().toUpperCase() : "AKRA";
  return <EngineRun initialTicker={normalized} />;
}