import { Link, Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { WorkspaceBackground } from "@/components/site/BackgroundLayer";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { LoadingScreen } from "@/components/site/LoadingScreen";
import { EASE_PREMIUM } from "@/lib/site";
import {
  createSession,
  createBatchSession,
  getBatchStatus,
  getDocumentView,
  getExceptions,
  getInvoiceReconciliation,
  getReports,
  processSession,
  runReconciliation,
  uploadDocuments,
  uploadBatchDocuments,
  type BatchStatus,
  type ReconciliationResult,
  type ReportOverview,
} from "@/lib/financeApi";

export const Route = createFileRoute("/reconciliation")({ component: ReconciliationPage });

function Dropzone({
  title,
  file,
  onFile,
}: {
  title: string;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  return (
    <label className="glass-panel-solid rounded-card p-8 md:p-12 flex flex-col items-center justify-center text-center transition-all hover:border-secondary cursor-pointer">
      <span className="material-symbols-outlined filled text-4xl text-secondary mb-5">
        upload_file
      </span>
      <h2 className="font-headline-md text-headline-md text-primary mb-2">{title}</h2>
      <p className="font-body-md text-on-surface-variant mb-6">PDF, PNG or JPEG</p>
      <span className="px-6 py-3 rounded-full border border-outline-variant text-label-sm text-on-surface-variant">
        {file?.name || "Select file"}
      </span>
      <input
        className="hidden"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        onChange={(event) => onFile(event.target.files?.[0] || null)}
      />
    </label>
  );
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

const acceptedFileTypes = ["application/pdf", "image/png", "image/jpeg"];
const acceptedExtensions = [".pdf", ".png", ".jpg", ".jpeg"];

function isAcceptedFile(file: File) {
  const name = file.name.toLowerCase();
  return acceptedFileTypes.includes(file.type) || acceptedExtensions.some((extension) => name.endsWith(extension));
}

function fileKey(file: File) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function BatchProgressPanel({ progress, total }: { progress: BatchStatus | null; total: number }) {
  const completed = progress?.processing_completed || 0;
  const failed = progress?.processing_failed || 0;
  const processed = completed + failed;
  const percent = total ? Math.round((processed / total) * 100) : 0;
  return (
    <div className="glass-panel-solid rounded-2xl p-8 max-w-2xl mx-auto" aria-live="polite">
      <div className="flex justify-between gap-4 mb-3">
        <h2 className="font-headline-md text-primary">Batch reconciliation in progress</h2>
        <span className="text-sm text-secondary">{percent}%</span>
      </div>
      <div className="h-3 rounded-full bg-surface-container-high overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-secondary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm text-on-surface-variant mt-4">
        {completed} of {total} invoices processed{failed ? `, ${failed} failed` : ""}.
      </p>
      <p className="text-sm text-on-surface-variant mt-2">{progress ? statusLabel(progress.current_stage) : "Uploading documents"}...</p>
      {failed ? <p className="text-sm text-error mt-4">Some invoices failed processing and were excluded from matching.</p> : null}
    </div>
  );
}

function ReconciliationPage() {
  const location = useLocation();
  if (location.pathname === "/reconciliation/history" || location.pathname.startsWith("/reconciliation/history/")) {
    return <Outlet />;
  }
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<File | null>(null);
  const [bankStatement, setBankStatement] = useState<File | null>(null);
  const [phase, setPhase] = useState<"upload" | "running" | "results">("upload");
  const [results, setResults] = useState<ReconciliationResult[]>([]);
  const [summary, setSummary] = useState<{
    totalInvoices: number;
    autoMatched: number;
    manualReview: number;
    unmatched: number;
  } | null>(null);
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "AUTO_MATCH" | "MANUAL_REVIEW" | "UNMATCHED" | "EXCEPTIONS">("ALL");
  const [runWeights, setRunWeights] = useState<Record<string, number>>({});
  const [exceptions, setExceptions] = useState<Array<{ id: number; exception_type: string; severity: string; description: string; created_at: string; resolved_at?: string | null; invoice_id?: string; transaction_id?: string }>>([]);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getInvoiceReconciliation>>["data"] | null>(null);
  const [mode, setMode] = useState<"SINGLE" | "BATCH">("SINGLE");
  const [batchInvoices, setBatchInvoices] = useState<File[]>([]);
  const [batchBankStatement, setBatchBankStatement] = useState<File | null>(null);
  const [batchWarnings, setBatchWarnings] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchStatus | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [showBatchFiles, setShowBatchFiles] = useState(false);
  const poller = useRef<number | null>(null);

  useEffect(() => () => {
    if (poller.current) window.clearInterval(poller.current);
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "batch") setMode("BATCH");
  }, []);

  const addBatchInvoices = (files: File[]) => {
    const warnings: string[] = [];
    const seen = new Set(batchInvoices.map(fileKey));
    const additions: File[] = [];
    for (const file of files) {
      if (!isAcceptedFile(file)) {
        warnings.push(`Skipped invalid file: ${file.name}`);
      } else if (seen.has(fileKey(file))) {
        warnings.push(`Duplicate file skipped: ${file.name}`);
      } else if (batchInvoices.length + additions.length >= 100) {
        warnings.push(`Omitted file because the 100-invoice limit was reached: ${file.name}`);
      } else {
        seen.add(fileKey(file));
        additions.push(file);
      }
    }
    setBatchInvoices((current) => [...current, ...additions]);
    setBatchWarnings(warnings);
  };

  const removeBatchInvoice = (key: string) => setBatchInvoices((files) => files.filter((file) => fileKey(file) !== key));

  const start = async () => {
    if (mode === "BATCH") {
      if (!batchInvoices.length || !batchBankStatement) {
        setError("Select at least one invoice and one bank statement before starting.");
        return;
      }
      setError("");
      setBatchRunning(true);
      let stage = "creating the batch session";
      let sessionId = "";
      try {
        const created = await createBatchSession();
        sessionId = created.session.sessionId;
        window.history.replaceState({}, "", `/reconciliation?mode=batch&sessionId=${encodeURIComponent(sessionId)}`);
        stage = "uploading the batch documents";
        await uploadBatchDocuments(sessionId, batchInvoices, batchBankStatement);
        const refresh = async () => {
          const response = await getBatchStatus(sessionId);
          setBatchProgress(response.data);
        };
        await refresh();
        poller.current = window.setInterval(() => void refresh(), 2500);
        stage = "processing the batch documents";
        const processed = await processSession(sessionId);
        const bankFailure = processed.data.results.find((item) => !item.success && item.documentType === "BANK_STATEMENT");
        if (bankFailure) throw new Error(bankFailure.error?.message || "Bank statement processing failed.");
        stage = "running reconciliation";
        const reconciled = await runReconciliation(sessionId);
        if (poller.current) window.clearInterval(poller.current);
        if (reconciled.data.runId) {
          await navigate({ to: "/reconciliation/history/$runId", params: { runId: reconciled.data.runId } });
        } else {
          setError("The batch completed without a persisted reconciliation run.");
        }
      } catch (requestError) {
        if (poller.current) window.clearInterval(poller.current);
        setError(`Batch reconciliation failed while ${stage}: ${requestError instanceof Error ? requestError.message : String(requestError)}`);
      } finally {
        setBatchRunning(false);
      }
      return;
    }
    if (!invoice || !bankStatement) {
      setError("Select both an invoice and a bank statement before starting.");
      return;
    }
    setError("");
    setPhase("running");
    let stage = "creating the reconciliation session";
    try {
      const created = await createSession();
      const sessionId = created.session.sessionId;
      stage = "uploading the invoice and bank statement";
      await uploadDocuments(sessionId, invoice, bankStatement);
      stage = "processing the uploaded documents";
      const processed = await processSession(sessionId);
      const failed = processed.data.results.find((item) => !item.success);
      if (failed) throw new Error(failed.error?.message || "Document processing failed.");
      stage = "running reconciliation";
      const reconciled = await runReconciliation(sessionId);
      setResults(reconciled.data.results);
      setRunWeights(reconciled.data.weights || {});
      setSummary({ totalInvoices: reconciled.data.totalInvoices, ...reconciled.data.summary });
      stage = "loading reports";
      const reports = await getReports();
      setOverview(reports.data.overview);
      const exceptionResponse = await getExceptions(sessionId);
      setExceptions(exceptionResponse.data.items);
      setPhase("results");
    } catch (requestError) {
      setError(
        `Reconciliation failed while ${stage}: ${
          requestError instanceof Error ? requestError.message : String(requestError)
        }`,
      );
      setPhase("upload");
    }
  };

  const visibleResults = results.filter((result) => activeFilter === "ALL" || activeFilter === "EXCEPTIONS" || result.matchType === activeFilter);
  const openDetail = async (invoiceId: string) => {
    try {
      const response = await getInvoiceReconciliation(invoiceId);
      setDetail(response.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load invoice details.");
    }
  };
  const openDocument = async (documentId: string) => {
    try {
      const response = await getDocumentView(documentId);
      window.open(response.data.url, "_blank", "noopener,noreferrer");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to open the invoice document.");
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden bg-background text-on-surface">
      <WorkspaceBackground opacity={0.28} />
      <Header sections={false} active="reconciliation" />
      {phase === "running" ? (
        <LoadingScreen
          title="Reconciling Ledger Discrepancies..."
          description="Uploading, extracting, matching and compiling exceptions."
          statuses={[
            "Uploading documents securely",
            "Running OCR and extraction",
            "Scoring reconciliation candidates",
          ]}
        />
      ) : null}
      <main className="relative z-10 flex-grow flex flex-col items-center py-32 px-margin-mobile md:px-margin-desktop">
        <div className="w-full max-w-5xl mx-auto">
          {phase === "results" && summary ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_PREMIUM }}
            >
              <div className="text-center mb-12">
                <div className="flex justify-center mb-5">
                  <Link to="/reconciliation/history" className="px-4 py-2 rounded-full border border-outline-variant text-sm text-secondary hover:bg-secondary/10">
                    View saved history
                  </Link>
                </div>
                <h1 className="font-display-lg-mobile md:font-display-lg text-primary tracking-tighter mb-4">
                  Reconciliation Complete
                </h1>
                <p className="text-body-lg text-on-surface-variant">
                  {summary.totalInvoices} invoice(s) processed from the uploaded documents.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {[
                  ["Auto matched", summary.autoMatched, "AUTO_MATCH"],
                  ["Manual review", summary.manualReview, "MANUAL_REVIEW"],
                  ["Unmatched", summary.unmatched, "UNMATCHED"],
                  [
                    "Exceptions",
                    exceptions.length,
                    "EXCEPTIONS",
                  ],
                ].map(([label, value, filter]) => (
                  <button key={String(label)} type="button" onClick={() => setActiveFilter(filter as typeof activeFilter)} className={`glass-panel-solid rounded-2xl p-6 text-left ${activeFilter === filter ? "border-secondary" : ""}`}>
                    <span className="text-label-sm text-on-surface-variant uppercase">{label}</span>
                    <div className="font-display-lg-mobile text-primary mt-2">{String(value)}</div>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mb-8">
                {["ALL", "AUTO_MATCH", "MANUAL_REVIEW", "UNMATCHED", "EXCEPTIONS"].map((filter) => (
                  <button key={filter} type="button" onClick={() => setActiveFilter(filter as typeof activeFilter)} className={`px-3 py-2 rounded-full border text-xs ${activeFilter === filter ? "bg-secondary text-on-secondary" : "border-outline-variant text-on-surface-variant"}`}>
                    {filter === "ALL" ? "All" : statusLabel(filter)}
                  </button>
                ))}
              </div>
              {activeFilter === "EXCEPTIONS" ? (
                <div className="glass-panel-solid rounded-2xl p-6 mb-8">
                  <h2 className="font-headline-md text-primary mb-4">Exceptions</h2>
                  {exceptions.length ? exceptions.map((item) => (
                    <div key={item.id} className="border-b border-outline-variant/20 py-3 last:border-0">
                      <div className="flex justify-between gap-4"><strong>{item.exception_type}</strong><span className="text-xs uppercase text-on-surface-variant">{item.severity}</span></div>
                      <p className="text-sm text-on-surface-variant mt-1">{item.description}</p>
                      <p className="text-xs text-on-surface-variant mt-1">Invoice: {item.invoice_id || "-"} · Transaction: {item.transaction_id || "-"} · {item.resolved_at ? `Resolved ${item.resolved_at}` : "Open"}</p>
                    </div>
                  )) : <p className="text-on-surface-variant">No exceptions in this run.</p>}
                </div>
              ) : null}
              <div className="glass-panel-solid rounded-2xl p-6 overflow-x-auto">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-headline-md text-primary">Match Results</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setPhase("upload");
                      setResults([]);
                      setSummary(null);
                    }}
                    className="text-sm text-secondary hover:underline"
                  >
                    New run
                  </button>
                </div>
                <table className="w-full min-w-[700px] text-left">
                  <thead>
                    <tr className="border-b border-outline-variant/50 text-sm text-on-surface-variant">
                      <th className="pb-3">Invoice</th>
                      <th className="pb-3">Transaction</th>
                      <th className="pb-3">Confidence</th>
                      <th className="pb-3">Scores</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleResults.map((result, index) => (
                      <tr
                        key={`${result.invoiceId}-${index}`}
                        className="border-b border-outline-variant/20"
                      >
                        <td className="py-4 font-semibold"><button type="button" onClick={() => void openDetail(result.invoiceId)} className="text-secondary hover:underline">{result.invoiceId} →</button></td>
                        <td className="py-4 text-on-surface-variant">
                          {(result.transactionId || result.bestCandidate?.transactionId) ? <button type="button" onClick={() => void openDetail(result.invoiceId)} className="text-secondary hover:underline">{result.transactionId || result.bestCandidate?.transactionId}</button> : "No candidate"}
                        </td>
                        <td className="py-4">
                          {result.confidence == null ? "-" : `${result.confidence}%`}
                        </td>
                        <td className="py-4 text-xs text-on-surface-variant">
                          {result.scores
                            ? `Amount ${result.scores.amount} | Ref ${result.scores.reference} | Name ${result.scores.name} | Semantic ${result.scores.semantic} | Date ${result.scores.date}`
                            : result.reason?.summary || "No candidate transaction found"}
                        </td>
                        <td className="py-4">
                          <span className="px-2.5 py-1 rounded-full bg-surface-container-high text-xs">
                            {statusLabel(result.matchType)}
                          </span>
                          {result.amountDifference && result.amountDifference !== "0.00" ? (
                            <div className="text-xs text-error mt-1">
                              Difference: {result.amountDifference}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visibleResults.length && activeFilter !== "EXCEPTIONS" ? <p className="text-sm text-on-surface-variant py-8 text-center">No {activeFilter === "ALL" ? "reconciliation" : statusLabel(activeFilter).toLowerCase()} records in this run.</p> : null}
              </div>
              {detail ? (
                <div className="glass-panel-solid rounded-2xl p-6 mt-8">
                  <div className="flex justify-between items-center mb-5"><h2 className="font-headline-md text-primary">Invoice Details: {String(detail.invoice.invoiceId)}</h2><button type="button" onClick={() => setDetail(null)} className="text-sm text-secondary">Close</button></div>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div><p>Invoice Number: {String(detail.invoice.invoiceNumber || detail.invoice.invoiceId || "-")}</p><p>Customer / Vendor: {String(detail.invoice.customerName || detail.invoice.vendorName || "-")}</p><p>Subtotal: {String(detail.invoice.subtotal ?? "-")}</p><p>Tax: {String(detail.invoice.tax ?? "-")}</p><p>Total: {String(detail.invoice.amount ?? "-")} {String(detail.invoice.currency || "")}</p><p>Payment Reference: {String(detail.invoice.paymentReference || "-")}</p><p>Invoice Date: {String(detail.invoice.invoiceDate || "-")}</p><p>Due Date: {String(detail.invoice.dueDate || "-")}</p></div>
                    <div><p>Status: {String(detail.match?.matchType || "UNMATCHED")}</p><p>Transaction: {detail.transaction?.transactionId || "None"}</p><p>Confidence: {detail.match?.confidence == null ? "-" : `${detail.match.confidence}%`}</p>{detail.document ? <button type="button" onClick={() => void openDocument(detail.document!.documentId)} className="text-secondary hover:underline mt-2">View invoice document →</button> : null}</div>
                  </div>
                  {detail.match?.scores ? <div className="mt-6"><h3 className="font-semibold mb-3">Score Breakdown</h3>{Object.entries(detail.match.scores).filter(([key]) => key !== "confidence").map(([key, value]) => <div key={key} className="mb-2"><div className="flex justify-between text-xs"><span className="capitalize">{key}</span><span>{value}%</span></div><div className="h-2 bg-surface-container-high rounded-full mt-1"><div className="h-2 bg-secondary rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>)}<p className="text-sm text-on-surface-variant mt-4">Weights: {Object.entries(detail.weights || runWeights).map(([key, value]) => `${key} ${value}%`).join(" · ")}</p></div> : null}
                  {detail.match?.reason ? <div className="mt-5"><h3 className="font-semibold">Why?</h3><p className="text-sm text-on-surface-variant mt-1">{String((detail.match.reason as { summary?: string }).summary || "Deterministic reconciliation evidence")}</p></div> : null}
                  {detail.exceptions.length ? <div className="mt-5"><h3 className="font-semibold">Exceptions</h3>{detail.exceptions.map((item) => <p key={item.id} className="text-sm text-on-surface-variant mt-1">{item.type} ({item.severity}): {item.description} · {item.resolvedAt ? `Resolved ${item.resolvedAt}` : "Open"}</p>)}</div> : null}
                </div>
              ) : null}
            </motion.div>
          ) : batchRunning ? (
            <BatchProgressPanel progress={batchProgress} total={batchInvoices.length} />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_PREMIUM }}
            >
              <div className="text-center mb-16">
                <div className="flex justify-center mb-5">
                  <Link to="/reconciliation/history" className="px-4 py-2 rounded-full border border-outline-variant text-sm text-secondary hover:bg-secondary/10">
                    View saved history
                  </Link>
                </div>
                <h1 className="font-display-lg-mobile md:font-display-lg text-primary tracking-tighter mb-4">
                  Initialize Reconciliation
                </h1>
                <p className="text-body-lg text-on-surface-variant max-w-2xl mx-auto">
                  Choose a workflow, then upload your source documents to run OCR, extraction, reconciliation and reporting.
                </p>
              </div>
              <div className="flex justify-center gap-2 mb-10" role="tablist" aria-label="Reconciliation mode">
                {(["SINGLE", "BATCH"] as const).map((option) => (
                  <button key={option} type="button" role="tab" aria-selected={mode === option} onClick={() => { setMode(option); setError(""); }} className={`px-5 py-3 rounded-full border text-sm ${mode === option ? "bg-secondary text-on-secondary border-secondary" : "border-outline-variant text-on-surface-variant"}`}>
                    {option === "SINGLE" ? "Single Reconciliation" : "Batch Reconciliation"}
                  </button>
                ))}
              </div>
              {mode === "SINGLE" ? <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter mb-10">
                <Dropzone title="Upload Invoice" file={invoice} onFile={setInvoice} />
                <Dropzone title="Upload Bank Statement" file={bankStatement} onFile={setBankStatement} />
              </div> : <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter mb-10">
                <label className="glass-panel-solid rounded-card p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-secondary">
                  <span className="material-symbols-outlined filled text-4xl text-secondary mb-5">upload_file</span>
                  <h2 className="font-headline-md text-primary mb-2">Upload Invoices</h2>
                  <p className="font-body-md text-on-surface-variant mb-4">PDF, PNG or JPEG, up to 100 files</p>
                  <span className="px-5 py-3 rounded-full border border-outline-variant text-sm text-on-surface-variant">Select invoice files</span>
                  <input className="hidden" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => { addBatchInvoices(Array.from(event.target.files || [])); event.currentTarget.value = ""; }} />
                  <span className="text-sm text-secondary mt-5">{batchInvoices.length} / 100 selected</span>
                </label>
                <Dropzone title="Upload Bank Statement" file={batchBankStatement} onFile={(file) => setBatchBankStatement(file && isAcceptedFile(file) ? file : null)} />
                <div className="md:col-span-2 glass-panel-solid rounded-2xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button type="button" className="text-sm text-secondary hover:underline" onClick={() => setShowBatchFiles((visible) => !visible)} aria-expanded={showBatchFiles}>
                      {showBatchFiles ? "Hide selected files" : `View selected files (${batchInvoices.length})`}
                    </button>
                    {batchInvoices.length ? <button type="button" className="text-sm text-error hover:underline" onClick={() => setBatchInvoices([])}>Clear all</button> : null}
                  </div>
                  <div className="mt-4 space-y-2">{(showBatchFiles ? batchInvoices : batchInvoices.slice(0, 5)).map((file) => <div key={fileKey(file)} className="flex justify-between gap-3 text-sm"><span className="truncate">{file.name}</span><button type="button" className="text-error shrink-0" onClick={() => removeBatchInvoice(fileKey(file))} aria-label={`Remove ${file.name}`}>Remove</button></div>)}{!showBatchFiles && batchInvoices.length > 5 ? <p className="text-sm text-on-surface-variant">+{batchInvoices.length - 5} more</p> : null}</div>
                  {batchWarnings.length ? <div role="status" className="mt-4 text-sm text-error">{batchWarnings.join(" ")}</div> : null}
                </div>
              </div>}
              {error ? (
                <p role="alert" className="text-error text-center mb-5">
                  {error}
                </p>
              ) : null}
              <div className="text-center">
                <button
                  type="button"
                  onClick={start}
                  disabled={phase === "running"}
                  className="bg-secondary text-on-secondary px-12 py-4 rounded-button disabled:opacity-50"
                >
                  Start Reconciliation{" "}
                  <span className="material-symbols-outlined align-middle ml-2">arrow_forward</span>
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
