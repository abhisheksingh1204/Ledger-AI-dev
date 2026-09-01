import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";

import { WorkspaceBackground } from "@/components/site/BackgroundLayer";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { LoadingScreen } from "@/components/site/LoadingScreen";
import { EASE_PREMIUM } from "@/lib/site";

const TITLE = "Reconciliation Agent — LedgerAI";
const DESCRIPTION =
  "Upload invoices and bank statements, then let the LedgerAI reconciliation agent match records, score confidence and surface exceptions.";

export const Route = createFileRoute("/reconciliation")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: ReconciliationPage,
});

type Match = {
  invoice: string;
  transaction: string;
  amount: string;
  confidence: number;
  status: "Matched" | "Partial Match" | "Needs Review";
};

const RESULTS: Match[] = [
  { invoice: "INV-198", transaction: "TRX-8901", amount: "$12,450.00", confidence: 99, status: "Matched" },
  { invoice: "INV-201", transaction: "TRX-8904", amount: "$8,900.00", confidence: 97, status: "Matched" },
  { invoice: "INV-202", transaction: "TRX-8902", amount: "$3,200.50", confidence: 82, status: "Partial Match" },
  { invoice: "INV-204", transaction: "WIR-992", amount: "₹45,500.00", confidence: 61, status: "Needs Review" },
  { invoice: "INV-207", transaction: "—", amount: "$1,120.00", confidence: 34, status: "Needs Review" },
];

const STATUS_STYLES: Record<Match["status"], string> = {
  Matched: "bg-[#e6f4ea] text-[#137333]",
  "Partial Match": "bg-[#fef7e0] text-[#b06000]",
  "Needs Review": "bg-[#fce8e6] text-[#c5221f]",
};

type Zone = "invoices" | "statements";

function Dropzone({
  id,
  icon,
  title,
  copy,
  accept,
  files,
  onFiles,
}: {
  id: Zone;
  icon: string;
  title: string;
  copy: string;
  accept: string;
  files: string[];
  onFiles: (names: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const take = (list: FileList | null) => {
    if (!list) return;
    onFiles(Array.from(list).map((f) => f.name));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setHover(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        take(e.dataTransfer.files);
      }}
      className={`glass-panel-solid rounded-card p-8 md:p-12 flex flex-col items-center justify-center text-center transition-all duration-300 hover:border-secondary cursor-pointer group ${
        hover ? "border-secondary bg-secondary/5" : ""
      }`}
    >
      <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 group-hover:bg-secondary/10">
        <span className="material-symbols-outlined filled text-3xl text-secondary">{icon}</span>
      </div>
      <h2 className="font-headline-md text-headline-md text-primary mb-2">{title}</h2>
      <p className="font-body-md text-body-md text-on-surface-variant mb-6">{copy}</p>
      <div className="px-6 py-3 rounded-full border border-outline-variant text-label-sm font-label-sm text-on-surface-variant group-hover:bg-secondary group-hover:text-on-secondary group-hover:border-secondary transition-colors duration-300">
        Select Files
      </div>
      <input
        ref={inputRef}
        id={`file-${id}`}
        accept={accept}
        className="hidden"
        multiple
        type="file"
        onChange={(e) => take(e.target.files)}
      />
      {files.length > 0 ? (
        <ul className="mt-6 w-full space-y-2 text-left">
          {files.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2 bg-surface-container/70 rounded-lg px-3 py-2 font-label-sm text-label-sm text-on-surface"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">
                check_circle
              </span>
              <span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ReconciliationPage() {
  const [invoices, setInvoices] = useState<string[]>([]);
  const [statements, setStatements] = useState<string[]>([]);
  const [phase, setPhase] = useState<"upload" | "running" | "results">("upload");
  const [selected, setSelected] = useState<Match | null>(null);

  const start = () => {
    setPhase("running");
    window.setTimeout(() => setPhase("results"), 1400);
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden bg-background text-on-surface selection:bg-secondary/20">
      <WorkspaceBackground opacity={0.28} />
      <Header sections={false} active="reconciliation" />

      <AnimatePresence>
        {phase === "running" ? (
          <LoadingScreen
            title="Reconciling Ledger Discrepancies..."
            description="Matching 128 invoice records against institutional bank feeds using semantic scoring."
            statuses={[
              "Analyzing tax deductions and customer IDs",
              "Scoring semantic confidence",
              "Compiling exception list",
            ]}
          />
        ) : null}
      </AnimatePresence>

      <main className="relative z-10 flex-grow flex flex-col items-center justify-center py-32 px-margin-mobile md:px-margin-desktop">
        <div className="w-full max-w-container-max mx-auto flex flex-col items-center">
          <AnimatePresence mode="wait">
            {phase === "results" ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.45, ease: EASE_PREMIUM }}
                className="w-full max-w-5xl"
              >
                <div className="text-center mb-12">
                  <h1 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-primary tracking-tighter mb-4">
                    Reconciliation Complete
                  </h1>
                  <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
                    128 records analyzed. Review ambiguous matches and resolve exceptions below.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-gutter mb-gutter">
                  {[
                    { label: "Matched", value: "121", tone: "text-secondary" },
                    { label: "Ambiguous", value: "5", tone: "text-primary" },
                    { label: "Exceptions", value: "2", tone: "text-error" },
                  ].map((m) => (
                    <div key={m.label} className="glass-panel-solid rounded-2xl p-6">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                        {m.label}
                      </span>
                      <div className={`font-display-lg-mobile text-display-lg-mobile mt-2 ${m.tone}`}>
                        {m.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="glass-panel-solid rounded-2xl p-6 ambient-shadow">
                  <div className="flex justify-between items-center mb-6 gap-4">
                    <h2 className="font-headline-md text-headline-md text-primary">Match Results</h2>
                    <button
                      type="button"
                      onClick={() => setPhase("upload")}
                      className="text-sm text-secondary hover:underline flex items-center gap-1"
                    >
                      New run <span className="material-symbols-outlined text-sm">refresh</span>
                    </button>
                  </div>
                  <div className="overflow-x-auto -mx-2 px-2">
                    <table className="w-full min-w-[560px] text-left border-collapse">
                      <thead>
                        <tr className="border-b border-outline-variant/50 text-sm text-on-surface-variant font-semibold">
                          <th className="pb-3 font-body-md">Invoice</th>
                          <th className="pb-3 font-body-md">Transaction</th>
                          <th className="pb-3 font-body-md">Amount</th>
                          <th className="pb-3 font-body-md">Confidence</th>
                          <th className="pb-3 font-body-md">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm font-body-md">
                        {RESULTS.map((r) => (
                          <tr
                            key={r.invoice}
                            onClick={() => setSelected(r)}
                            className="border-b border-outline-variant/20 hover:bg-surface-container/50 transition-colors cursor-pointer"
                          >
                            <td className="py-4 font-semibold">{r.invoice}</td>
                            <td className="py-4 text-on-surface-variant">{r.transaction}</td>
                            <td className="py-4 font-mono">{r.amount}</td>
                            <td className="py-4">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-20 rounded-full bg-surface-container overflow-hidden">
                                  <div
                                    className="h-full bg-secondary rounded-full"
                                    style={{ width: `${r.confidence}%` }}
                                  />
                                </div>
                                <span className="font-mono text-xs">{r.confidence}%</span>
                              </div>
                            </td>
                            <td className="py-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status]}`}
                              >
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <AnimatePresence>
                  {selected ? (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 12 }}
                      transition={{ duration: 0.4, ease: EASE_PREMIUM }}
                      className="glass-panel-solid rounded-2xl p-8 ambient-shadow border-l-4 border-l-error mt-gutter"
                    >
                      <div className="flex justify-between items-start mb-4 gap-4">
                        <div>
                          <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
                            <span className="material-symbols-outlined text-error">warning</span>
                            Review: {selected.invoice}
                          </h3>
                          <p className="text-sm text-on-surface-variant mt-1">
                            Confidence {selected.confidence}% — matched against{" "}
                            {selected.transaction}.
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Close review"
                          className="text-on-surface-variant hover:text-primary"
                          onClick={() => setSelected(null)}
                        >
                          <span className="material-symbols-outlined">close</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 bg-surface-container-low p-4 rounded-xl">
                        <div>
                          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block mb-2">
                            Ledger Entry (ERP)
                          </span>
                          <div className="font-mono text-lg text-primary">{selected.amount}</div>
                          <div className="text-xs text-on-surface-variant mt-1">
                            Ref: {selected.invoice}-A | Note: Standard billing
                          </div>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block mb-2">
                            Bank Feed Entry
                          </span>
                          <div className="font-mono text-lg text-primary">{selected.amount}</div>
                          <div className="text-xs text-on-surface-variant mt-1">
                            Ref: {selected.transaction} | Note: Wire transfer
                          </div>
                        </div>
                      </div>
                      <div className="mt-6 flex flex-wrap gap-4">
                        <button
                          type="button"
                          onClick={() => setSelected(null)}
                          className="bg-primary text-on-primary px-4 py-3 rounded-lg text-sm font-medium hover:opacity-80 transition-opacity"
                        >
                          Accept match
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelected(null)}
                          className="border border-outline px-4 py-3 rounded-lg text-sm font-medium hover:bg-surface-container transition-colors"
                        >
                          Flag for Manual Review
                        </button>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE_PREMIUM }}
                className="w-full flex flex-col items-center"
              >
                <div className="text-center mb-16">
                  <h1 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-primary tracking-tighter mb-4">
                    Initialize Reconciliation
                  </h1>
                  <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
                    Prepare your data for automated matching. Ensure your documents are clear and up
                    to date for precise analysis.
                  </p>
                </div>

                <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-gutter mb-12">
                  <Dropzone
                    id="invoices"
                    icon="description"
                    title="Upload Invoices"
                    copy="Drag and drop or click to upload invoice records"
                    accept=".pdf,.csv,.xlsx"
                    files={invoices}
                    onFiles={setInvoices}
                  />
                  <Dropzone
                    id="statements"
                    icon="account_balance"
                    title="Upload Bank Statements"
                    copy="Drag and drop or click to upload bank feeds"
                    accept=".csv,.xlsx,.qbo"
                    files={statements}
                    onFiles={setStatements}
                  />
                </div>

                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={start}
                    className="bg-secondary text-on-secondary font-body-md text-body-md px-12 py-4 rounded-button hover:bg-on-secondary-fixed-variant transition-colors duration-300 shadow-lg hover:shadow-xl flex items-center gap-2"
                  >
                    <span>Start Reconciliation</span>
                    <span className="material-symbols-outlined text-xl">arrow_forward</span>
                  </button>
                  <p className="mt-4 font-label-sm text-label-sm text-on-surface-variant/60 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">lock</span>
                    Secure, end-to-end encrypted upload
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <Footer />
    </div>
  );
}
