import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";

import { WorkspaceBackground } from "@/components/site/BackgroundLayer";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { LoadingScreen } from "@/components/site/LoadingScreen";
import { EASE_PREMIUM } from "@/lib/site";
import {
  createSession,
  getReports,
  processSession,
  runReconciliation,
  uploadDocuments,
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

function ReconciliationPage() {
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

  const start = async () => {
    if (!invoice || !bankStatement) {
      setError("Select both an invoice and a bank statement before starting.");
      return;
    }
    setError("");
    setPhase("running");
    try {
      const created = await createSession();
      const sessionId = created.session.sessionId;
      await uploadDocuments(sessionId, invoice, bankStatement);
      const processed = await processSession(sessionId);
      const failed = processed.data.results.find((item) => !item.success);
      if (failed) throw new Error(failed.error?.message || "Document processing failed.");
      const reconciled = await runReconciliation(sessionId);
      setResults(reconciled.data.results);
      setSummary(reconciled.data);
      const reports = await getReports();
      setOverview(reports.data.overview);
      setPhase("results");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The reconciliation request failed.",
      );
      setPhase("upload");
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
                <h1 className="font-display-lg-mobile md:font-display-lg text-primary tracking-tighter mb-4">
                  Reconciliation Complete
                </h1>
                <p className="text-body-lg text-on-surface-variant">
                  {summary.totalInvoices} invoice(s) processed from the uploaded documents.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  ["Auto matched", summary.autoMatched],
                  ["Manual review", summary.manualReview],
                  ["Unmatched", summary.unmatched],
                  [
                    "Exceptions",
                    Object.values(overview?.exceptions || {}).reduce(
                      (total, item) => total + item.count,
                      0,
                    ),
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)} className="glass-panel-solid rounded-2xl p-6">
                    <span className="text-label-sm text-on-surface-variant uppercase">{label}</span>
                    <div className="font-display-lg-mobile text-primary mt-2">{String(value)}</div>
                  </div>
                ))}
              </div>
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
                    {results.map((result, index) => (
                      <tr
                        key={`${result.invoiceId}-${index}`}
                        className="border-b border-outline-variant/20"
                      >
                        <td className="py-4 font-semibold">{result.invoiceId}</td>
                        <td className="py-4 text-on-surface-variant">
                          {result.transactionId || "None"}
                        </td>
                        <td className="py-4">
                          {result.confidence == null ? "-" : `${result.confidence}%`}
                        </td>
                        <td className="py-4 text-xs text-on-surface-variant">
                          {result.scores
                            ? `Amount ${result.scores.amount} | Ref ${result.scores.reference} | Name ${result.scores.name} | Semantic ${result.scores.semantic} | Date ${result.scores.date}`
                            : "-"}
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
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_PREMIUM }}
            >
              <div className="text-center mb-16">
                <h1 className="font-display-lg-mobile md:font-display-lg text-primary tracking-tighter mb-4">
                  Initialize Reconciliation
                </h1>
                <p className="text-body-lg text-on-surface-variant max-w-2xl mx-auto">
                  Upload an invoice and bank statement to run OCR, extraction, reconciliation and
                  reporting.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter mb-10">
                <Dropzone title="Upload Invoice" file={invoice} onFile={setInvoice} />
                <Dropzone
                  title="Upload Bank Statement"
                  file={bankStatement}
                  onFile={setBankStatement}
                />
              </div>
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
