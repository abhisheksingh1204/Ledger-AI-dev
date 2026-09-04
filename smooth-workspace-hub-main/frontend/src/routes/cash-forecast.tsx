import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { WorkspaceBackground } from "@/components/site/BackgroundLayer";
import { Header } from "@/components/site/Header";
import { getCashForecast, type CashForecast } from "@/lib/financeApi";

function formatMoney(value: unknown) {
  const amount = Number(value || 0);
  return `Rs ${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const Route = createFileRoute("/cash-forecast")({ component: CashForecastPage });

function CashForecastPage() {
  const [forecast, setForecast] = useState<CashForecast>();
  const [selected, setSelected] = useState<CashForecast["invoices"][number]>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const currency = forecast?.currency || "";

  const loadForecast = () => {
    setLoading(true);
    setError("");
    getCashForecast().then((response) => setForecast(response.data)).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not load cash forecast.")).finally(() => setLoading(false));
  };
  useEffect(() => { loadForecast(); }, []);

  const demoGroup = forecast?.currency === "MULTI" ? forecast.currencies.INR : forecast;
  const summary = demoGroup?.summary || { outstanding_total: "0", expected: "0", at_risk: "0", overdue: "0" };
  const cumulative = demoGroup?.cumulative || { within_7_days: "0", within_30_days: "0", within_60_days: "0" };
  const buckets = demoGroup?.buckets || { days_0_7: "0", days_8_30: "0", days_31_60: "0", beyond_60_days: "0" };
  const visibleInvoices = forecast?.currency === "MULTI" ? forecast.invoices.filter((row) => row.currency === "INR") : forecast?.invoices || [];
  const atRisk = visibleInvoices.filter((row) => row.classification === "AT_RISK");
  const overdue = [...visibleInvoices.filter((row) => row.classification === "OVERDUE")].sort((a, b) => Number(b.outstanding_amount || 0) - Number(a.outstanding_amount || 0));
  const maxBucket = Math.max(1, ...Object.values(buckets).map(Number));

  return <div className="relative min-h-screen overflow-x-hidden bg-background text-on-background"><WorkspaceBackground opacity={0.3} /><Header sections={false} active="forecast" /><main className="relative z-10 max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop pt-[140px] pb-20">
    <div className="mb-10"><p className="text-xs uppercase tracking-[0.2em] text-secondary mb-3">Cash position</p><h1 className="font-display-lg-mobile md:font-display-lg text-primary mb-4">Forward Cash Forecast</h1><p className="text-body-lg text-on-surface-variant max-w-2xl">Understand expected cash inflows, payment risk, and overdue receivables.</p></div>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6"><p className="text-sm text-on-surface-variant">Source: invoices, confirmed reconciliation payments, exceptions, and customer payment history. Q&amp;A/Groq are not used.</p><button type="button" onClick={loadForecast} disabled={loading} className="border border-outline-variant rounded-lg px-4 py-2 text-sm disabled:opacity-50">{loading ? "Refreshing..." : "Refresh forecast"}</button></div>
    {error ? <p role="alert" className="text-error mb-6">{error}</p> : null}
    {forecast?.currency === "MULTI" ? <p className="text-sm text-on-surface-variant mb-5">Multiple currency totals are kept separate. KPI cards show the first group.</p> : null}
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">{[["EXPECTED CASH", summary.expected], ["AT RISK", summary.at_risk], ["OVERDUE", summary.overdue], ["TOTAL OUTSTANDING", summary.outstanding_total]].map(([label, value]) => <div key={label} className="glass-panel-solid rounded-2xl p-5"><p className="text-xs tracking-[0.14em] text-on-surface-variant">{label}</p><p className="text-2xl text-primary mt-3">{formatMoney(value, currency)}</p></div>)}</section>
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">{[["NEXT 7 DAYS", cumulative.within_7_days], ["NEXT 30 DAYS", cumulative.within_30_days], ["NEXT 60 DAYS", cumulative.within_60_days]].map(([label, value]) => <div key={label} className="glass-panel-solid rounded-2xl p-5"><p className="text-xs tracking-[0.14em] text-on-surface-variant">{label} (CUMULATIVE)</p><p className="text-xl text-primary mt-3">{formatMoney(value, currency)}</p></div>)}</section>
    <section className="glass-panel-solid rounded-2xl p-6 mb-8"><h2 className="text-xl text-primary mb-5">Expected cash inflow by horizon</h2><div className="space-y-4">{[["Days 0-7", buckets.days_0_7], ["Days 8-30", buckets.days_8_30], ["Days 31-60", buckets.days_31_60], ["Beyond 60", buckets.beyond_60_days]].map(([label, value]) => <div key={label}><div className="flex justify-between text-sm mb-1"><span>{label}</span><span>{formatMoney(value, currency)}</span></div><div className="h-3 rounded-full bg-surface-container-high"><div className="h-3 rounded-full bg-secondary" style={{ width: `${Math.min(100, Number(value) / maxBucket * 100)}%` }} /></div></div>)}</div></section>
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8"><ForecastTable title="AT RISK RECEIVABLES" rows={atRisk} onSelect={setSelected} /><ForecastTable title="OVERDUE RECEIVABLES" rows={overdue} onSelect={setSelected} /></section>
    {selected ? <section className="glass-panel-solid rounded-2xl p-6 mb-8"><p className="text-xs uppercase tracking-[0.14em] text-secondary">Forecast details</p><h2 className="text-xl text-primary mt-2">{String(selected.invoice_number)}</h2><p className="text-on-surface-variant mt-1">{String(selected.customer_name || "Unknown customer")}</p><div className="grid grid-cols-2 gap-4 mt-5 text-sm">{[["Outstanding", formatMoney(selected.outstanding_amount)], ["Due date", selected.due_date], ["Expected date", selected.expected_payment_date], ["Bucket", selected.bucket], ["Risk", `${selected.risk_level} (${selected.risk_score})`], ["Forecast confidence", selected.forecast_confidence], ["Reconciliation", selected.reconciliation_status]].map(([label, value]) => <div key={label}><p className="text-on-surface-variant">{label}</p><p className="font-medium mt-1">{String(value)}</p></div>)}</div><p className="text-sm text-on-surface-variant mt-5">Why: {Array.isArray(selected.reason) ? selected.reason.join("; ") : "No explanation available."}</p>{selected.forecast_debug ? <details className="mt-5 rounded-xl border border-outline-variant/30 p-4"><summary className="cursor-pointer text-sm font-medium">Forecast debug</summary><pre className="mt-3 overflow-x-auto text-xs text-on-surface-variant whitespace-pre-wrap">{JSON.stringify(selected.forecast_debug, null, 2)}</pre></details> : null}</section> : null}
    <section className="glass-panel-solid rounded-2xl p-6"><h2 className="text-xl text-primary mb-5">Customer Payment Behavior</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-on-surface-variant"><tr><th className="pb-3">Customer</th><th className="pb-3">Paid Invoices</th><th className="pb-3">Avg Delay</th><th className="pb-3">Median Delay</th><th className="pb-3">Late Rate</th><th className="pb-3">Outstanding</th></tr></thead><tbody>{(forecast?.customer_behavior || []).map((item) => <tr key={`${item.customer}-${item.currency || currency}`} className="border-t border-outline-variant/20"><td className="py-3">{item.customer}</td><td className="py-3">{item.paid_invoice_count}</td><td className="py-3">{item.avg_delay_days > 0 ? "+" : ""}{item.avg_delay_days} days</td><td className="py-3">{item.median_delay_days > 0 ? "+" : ""}{item.median_delay_days} days</td><td className="py-3">{item.late_payment_rate}%</td><td className="py-3">{formatMoney(item.outstanding, item.currency || currency)}</td></tr>)}</tbody></table>{forecast && !forecast.customer_behavior.length ? <p className="text-sm text-on-surface-variant">No paid invoice history is available yet.</p> : null}</div></section>
  </main></div>;
}

function ForecastTable({ title, rows, onSelect }: { title: string; rows: CashForecast["invoices"]; onSelect: (row: CashForecast["invoices"][number]) => void }) {
  return <section className="glass-panel-solid rounded-2xl p-6"><h2 className="text-xl text-primary mb-5">{title}</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-on-surface-variant"><tr><th className="pb-3">Invoice</th><th className="pb-3">Customer</th><th className="pb-3">Outstanding</th><th className="pb-3">Due</th><th className="pb-3">Expected</th><th className="pb-3">Risk</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.invoice_id)} className="border-t border-outline-variant/20"><td className="py-3"><button type="button" onClick={() => onSelect(row)} className="text-secondary hover:underline">{String(row.invoice_number)}</button></td><td className="py-3">{String(row.customer_name || "-")}</td><td className="py-3">{formatMoney(row.outstanding_amount, String(row.currency || "INR"))}</td><td className="py-3">{String(row.due_date)}</td><td className="py-3">{String(row.expected_payment_date)}</td><td className="py-3">{String(row.risk_level)}</td></tr>)}</tbody></table>{rows.length === 0 ? <p className="text-sm text-on-surface-variant">No receivables in this category.</p> : null}</div></section>;
}
