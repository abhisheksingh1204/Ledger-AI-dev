import { Link, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Header } from "@/components/site/Header";
import { WorkspaceBackground } from "@/components/site/BackgroundLayer";
import { compareHistoricalRuns, getReconciliationHistory, type HistoryRun } from "@/lib/financeApi";

export const Route = createFileRoute("/reconciliation/history")({ component: HistoryPage });

function HistoryPage() {
  const location = useLocation();
  if (location.pathname.startsWith("/reconciliation/history/") && location.pathname !== "/reconciliation/history") {
    return <Outlet />;
  }

  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Awaited<ReturnType<typeof compareHistoricalRuns>>["data"] | null>(null);
  const loadHistory = () => {
    setLoading(true);
    setError("");
    void getReconciliationHistory().then((response) => setRuns(response.data.runs)).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setLoading(false));
  };
  useEffect(() => { loadHistory(); }, []);
  const totalInvoices = runs.reduce((sum, run) => sum + run.total_invoices, 0);
  const averageMatchRate = runs.length ? runs.reduce((sum, run) => sum + run.match_rate, 0) / runs.length : 0;
  const totalExceptions = runs.reduce((sum, run) => sum + run.exceptions, 0);
  const toggleRun = (runId: string) => setSelectedRuns((current) => current.includes(runId) ? current.filter((id) => id !== runId) : current.length < 2 ? [...current, runId] : [current[1], runId]);
  const compare = async () => {
    if (selectedRuns.length !== 2) return;
    try { setComparison((await compareHistoricalRuns(selectedRuns[0], selectedRuns[1])).data); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  return <div className="relative min-h-screen bg-background text-on-surface"><WorkspaceBackground opacity={0.28} /><Header sections={false} active="reconciliation" /><main className="relative z-10 max-w-6xl mx-auto px-margin-mobile md:px-margin-desktop py-32">
    <div className="flex flex-wrap items-end justify-between gap-4 mb-10"><div><p className="text-label-sm uppercase text-secondary">Audit trail</p><h1 className="font-display-lg-mobile md:font-display-lg text-primary">Reconciliation History</h1><p className="text-on-surface-variant mt-3">Review previous reconciliation runs and inspect saved results.</p></div><div className="flex gap-4"><button type="button" onClick={loadHistory} disabled={loading} className="text-secondary hover:underline disabled:opacity-50">{loading ? "Refreshing..." : "Refresh"}</button><Link to="/reconciliation" className="text-secondary hover:underline">New run</Link></div></div>
    {error ? <div role="alert" className="glass-panel-solid rounded-xl p-5 text-error mb-5"><p>Unable to load reconciliation history.</p><p className="text-sm mt-1">{error}</p><button type="button" onClick={loadHistory} className="text-secondary hover:underline mt-3">Retry</button></div> : null}
    {loading ? <div className="glass-panel-solid rounded-2xl p-10 text-center text-on-surface-variant">Loading reconciliation history...</div> : <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{[["Total runs", runs.length], ["Invoices processed", totalInvoices], ["Average match rate", `${averageMatchRate.toFixed(1)}%`], ["Total exceptions", totalExceptions]].map(([label, value]) => <div key={String(label)} className="glass-panel-solid rounded-xl p-5"><p className="text-xs uppercase text-on-surface-variant">{label}</p><p className="text-2xl text-primary mt-2">{String(value)}</p></div>)}</div>
    <div className="glass-panel-solid rounded-2xl p-6 overflow-x-auto"><div className="flex flex-wrap items-center justify-between gap-3 mb-5"><p className="text-sm text-on-surface-variant">Select two runs from the same session to compare saved results.</p><button type="button" disabled={selectedRuns.length !== 2} onClick={() => void compare()} className="bg-secondary text-on-secondary px-4 py-2 rounded-button disabled:opacity-50">Compare Runs</button></div><table className="w-full min-w-[1050px] text-left"><thead><tr className="border-b border-outline-variant/50 text-sm text-on-surface-variant">{["Select", "Date", "Session", "Version", "Mode", "Invoices", "Auto matched", "Review", "Unmatched", "Exceptions", "Match rate", "Avg confidence", "Processing", "Action"].map((label) => <th key={label} className="pb-3 pr-4">{label}</th>)}</tr></thead><tbody>{runs.map((run) => <tr key={run.run_id} className="border-b border-outline-variant/20"><td className="py-4 pr-4"><input type="checkbox" checked={selectedRuns.includes(run.run_id)} onChange={() => toggleRun(run.run_id)} aria-label={`Select ${run.run_id}`} /></td><td className="py-4 pr-4">{new Date(run.created_at).toLocaleString()}</td><td className="py-4 pr-4">{run.session_id}</td><td className="py-4 pr-4">v{run.version}</td><td className="py-4 pr-4"><span className="rounded-full border border-outline-variant px-2 py-1 text-xs">{run.mode || "SINGLE"}</span></td><td className="py-4 pr-4">{run.total_invoices}</td><td className="py-4 pr-4">{run.auto_matched}</td><td className="py-4 pr-4">{run.manual_review}</td><td className="py-4 pr-4">{run.unmatched}</td><td className="py-4 pr-4">{run.exceptions}</td><td className="py-4 pr-4">{run.match_rate.toFixed(1)}%</td><td className="py-4 pr-4">{run.average_confidence.toFixed(1)}%</td><td className="py-4 pr-4">{run.processing_time_ms == null ? "-" : `${(run.processing_time_ms / 1000).toFixed(2)}s`}</td><td className="py-4"><Link className="text-secondary hover:underline" to="/reconciliation/history/$runId" params={{ runId: run.run_id }}>View</Link></td></tr>)}</tbody></table>{!runs.length && !error ? <div className="py-10 text-center"><p className="text-on-surface-variant">No reconciliation history yet.</p><p className="text-sm text-on-surface-variant mt-2">Run your first reconciliation to see saved results here.</p><Link to="/reconciliation" className="inline-block mt-3 text-secondary hover:underline">Start Reconciliation</Link></div> : null}</div>
      {comparison ? <div className="glass-panel-solid rounded-2xl p-6 mt-5"><h2 className="font-headline-md text-primary mb-4">Run Comparison</h2><p className="text-sm text-on-surface-variant mb-4">v{comparison.from.version} → v{comparison.to.version}</p><div className="grid md:grid-cols-4 gap-3">{[["Auto matched", comparison.summary.from.autoMatched, comparison.summary.to.autoMatched], ["Manual review", comparison.summary.from.manualReview, comparison.summary.to.manualReview], ["Unmatched", comparison.summary.from.unmatched, comparison.summary.to.unmatched], ["Match rate", `${comparison.from.matchRate.toFixed(1)}%`, `${comparison.to.matchRate.toFixed(1)}%`]].map(([label, from, to]) => <div key={String(label)} className="border border-outline-variant/30 rounded-xl p-4"><p className="text-xs uppercase text-on-surface-variant">{label}</p><p className="text-lg text-primary mt-2">{String(from)} → {String(to)}</p></div>)}</div>{comparison.changed.length ? <div className="mt-5">{comparison.changed.map((item) => <p key={item.invoiceId} className="text-sm text-on-surface-variant">{item.invoiceId}: {item.from || "-"} → {item.to}</p>)}</div> : <p className="text-sm text-on-surface-variant mt-5">No invoice classifications changed.</p>}</div> : null}
    </>}
  </main></div>;
}
