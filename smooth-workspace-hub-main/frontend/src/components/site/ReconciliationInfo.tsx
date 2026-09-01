import { useState } from "react";

import { Reveal } from "@/components/Reveal";

import { useLaunchAgent } from "./LaunchProvider";

const WORKFLOW = [
  { icon: "cloud_upload", label: "Upload", copy: "Ingest raw bank feeds." },
  { icon: "model_training", label: "Normalize", copy: "Structure unstructured data." },
  { icon: "join_inner", label: "Match", copy: "Identify corresponding entries." },
  { icon: "score", label: "Score", copy: "Assign confidence levels." },
  { icon: "summarize", label: "Report", copy: "Generate exception lists." },
];

const ROWS = [
  {
    id: "TRX-8901",
    date: "Oct 24, 2024",
    amount: "$12,450.00",
    status: "Matched",
    className: "bg-[#e6f4ea] text-[#137333]",
    exception: false,
  },
  {
    id: "TRX-8902",
    date: "Oct 24, 2024",
    amount: "$3,200.50",
    status: "Partial Match",
    className: "bg-[#fef7e0] text-[#b06000]",
    exception: false,
  },
  {
    id: "INV-204",
    date: "Oct 23, 2024",
    amount: "₹45,500.00",
    status: "Needs Review",
    className: "bg-[#fce8e6] text-[#c5221f]",
    exception: true,
  },
];

export function ReconciliationInfo() {
  const { launch } = useLaunchAgent();
  const [showException, setShowException] = useState(false);

  return (
    <section
      id="reconciliation"
      className="px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto flex flex-col gap-section-gap py-section-gap"
    >
      {/* Hero */}
      <Reveal className="min-h-[70vh] flex flex-col justify-center items-center text-center">
        <div className="mb-6 inline-flex items-center gap-2 bg-surface-container-high px-4 py-2 rounded-full border border-outline-variant ambient-shadow">
          <span className="material-symbols-outlined text-secondary text-sm">auto_awesome</span>
          <span className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">
            Reconciliation Agent
          </span>
        </div>
        <h2 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg text-primary max-w-4xl mb-8">
          Close the books with confidence.
        </h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          Automate the tedious matching of disparate ledgers. Our specialized AI agent identifies
          anomalies, reconciles millions of rows in seconds, and provides human-readable
          explanations for every discrepancy.
        </p>
        <button
          type="button"
          onClick={() => launch("reconciliation")}
          className="mt-10 bg-primary text-on-primary px-8 py-4 rounded-lg font-label-sm text-label-sm hover:opacity-80 transition-opacity duration-300 flex items-center gap-2"
        >
          <span>Open Reconciliation Agent</span>
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </Reveal>

      {/* Visual Workflow */}
      <Reveal className="glass-panel rounded-2xl p-8 md:p-12 ambient-shadow">
        <h3 className="font-headline-md text-headline-md text-primary mb-12 text-center">
          The Autonomous Ledger Workflow
        </h3>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {WORKFLOW.map((step, i) => (
            <div key={step.label} className="contents">
              <div className="flex flex-col items-center flex-1 text-center group">
                <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-4 border border-outline-variant group-hover:border-secondary transition-colors duration-300">
                  <span className="material-symbols-outlined text-on-surface text-2xl">
                    {step.icon}
                  </span>
                </div>
                <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                  {step.label}
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant mt-2 text-sm">
                  {step.copy}
                </p>
              </div>
              {i < WORKFLOW.length - 1 ? (
                <div className="hidden md:block flex-shrink-0 text-outline-variant">
                  <span className="material-symbols-outlined">arrow_forward</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Reveal>

      {/* Dashboard & Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <div className="lg:col-span-1 flex flex-col gap-6">
          <Reveal className="glass-panel rounded-2xl p-6 ambient-shadow">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              Total Reconciled
            </span>
            <div className="font-display-lg-mobile text-display-lg-mobile text-primary mt-2">
              1.2M
            </div>
            <div className="text-sm text-secondary mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">trending_up</span> +14% this month
            </div>
          </Reveal>
          <Reveal delay={0.1} className="glass-panel rounded-2xl p-6 ambient-shadow">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              Exceptions Found
            </span>
            <div className="font-display-lg-mobile text-display-lg-mobile text-primary mt-2">342</div>
            <div className="text-sm text-error mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">error</span> Requires attention
            </div>
          </Reveal>
        </div>

        <Reveal
          delay={0.15}
          className="lg:col-span-2 glass-panel rounded-2xl p-6 ambient-shadow overflow-hidden flex flex-col"
        >
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-headline-md text-headline-md text-primary">Recent Transactions</h3>
            <button
              type="button"
              onClick={() => launch("reconciliation")}
              className="text-sm text-secondary hover:underline flex items-center gap-1"
            >
              View All <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full min-w-[420px] text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/50 text-sm text-on-surface-variant font-semibold">
                  <th className="pb-3 font-body-md">ID</th>
                  <th className="pb-3 font-body-md">Date</th>
                  <th className="pb-3 font-body-md">Amount</th>
                  <th className="pb-3 font-body-md">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm font-body-md">
                {ROWS.map((row) => (
                  <tr
                    key={row.id}
                    onClick={row.exception ? () => setShowException((v) => !v) : undefined}
                    className={`border-b border-outline-variant/20 hover:bg-surface-container/50 transition-colors ${
                      row.exception ? "cursor-pointer" : ""
                    }`}
                  >
                    <td className={`py-4 ${row.exception ? "font-semibold" : ""}`}>{row.id}</td>
                    <td className="py-4 text-on-surface-variant">{row.date}</td>
                    <td className="py-4 font-mono">{row.amount}</td>
                    <td className="py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${row.className}`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>

      {/* Expandable Exception Card */}
      {showException ? (
        <Reveal
          y={12}
          className="glass-panel rounded-2xl p-8 ambient-shadow border-l-4 border-l-error"
        >
          <div className="flex justify-between items-start mb-4 gap-4">
            <div>
              <h4 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-error">warning</span> Discrepancy
                Alert: INV-204
              </h4>
              <p className="text-sm text-on-surface-variant mt-1">
                Identified a ₹50 discrepancy between Ledger A (ERP) and Ledger B (Bank Feed).
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss discrepancy"
              className="text-on-surface-variant hover:text-primary"
              onClick={() => setShowException(false)}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 bg-surface-container-low p-4 rounded-xl">
            <div>
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block mb-2">
                Ledger Entry (ERP)
              </span>
              <div className="font-mono text-lg text-primary">₹45,550.00</div>
              <div className="text-xs text-on-surface-variant mt-1">
                Ref: INV-204-A | Note: Standard billing
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block mb-2">
                Bank Feed Entry
              </span>
              <div className="font-mono text-lg text-primary">₹45,500.00</div>
              <div className="text-xs text-on-surface-variant mt-1">
                Ref: WIR-992 | Note: Wire transfer
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => setShowException(false)}
              className="bg-primary text-on-primary px-4 py-3 rounded-lg text-sm font-medium hover:opacity-80 transition-opacity"
            >
              Write off ₹50
            </button>
            <button
              type="button"
              onClick={() => launch("reconciliation")}
              className="border border-outline px-4 py-3 rounded-lg text-sm font-medium hover:bg-surface-container transition-colors"
            >
              Flag for Manual Review
            </button>
          </div>
        </Reveal>
      ) : null}

      {/* Performance Metrics */}
      <Reveal className="py-12 border-t border-outline-variant/30 text-center">
        <h3 className="font-headline-md text-headline-md text-primary mb-8">Agent Precision</h3>
        <div className="flex justify-center items-end gap-4 flex-wrap">
          <div className="font-display-lg text-display-lg text-secondary">98.1%</div>
          <div className="pb-2 text-on-surface-variant text-left">
            <div className="font-semibold text-primary">Accuracy Rate</div>
            <div className="text-sm">Based on 10M+ analyzed rows</div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
