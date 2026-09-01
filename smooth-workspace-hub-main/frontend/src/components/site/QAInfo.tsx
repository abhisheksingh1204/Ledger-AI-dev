import { useState } from "react";

import { Reveal } from "@/components/Reveal";

import { useLaunchAgent } from "./LaunchProvider";

const PROMPTS = [
  {
    icon: "receipt_long",
    title: "Show all unpaid invoices",
    copy: "Filter by date, client, or amount instantly.",
  },
  {
    icon: "warning",
    title: "Explain unresolved transactions",
    copy: "Identify discrepancies and suggest reconciliation steps.",
  },
  {
    icon: "monitoring",
    title: "Compare Q3 vs Q2 burn rate",
    copy: "Generate comparative analysis and visualize trends.",
  },
];

export function QAInfo() {
  const { launch } = useLaunchAgent();
  const [draft, setDraft] = useState("");

  return (
    <section
      id="qa"
      className="px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto pb-section-gap"
    >
      {/* Hero */}
      <Reveal className="py-section-gap flex flex-col items-center justify-center min-h-[70vh] text-center">
        <div className="inline-flex items-center space-x-2 bg-surface-container-high px-4 py-1.5 rounded-full mb-8">
          <span className="material-symbols-outlined text-sm text-secondary">smart_toy</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
            Finance Q&amp;A Agent
          </span>
        </div>
        <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface mb-6 max-w-4xl">
          Ask your financial data,
          <br />
          <span className="text-secondary opacity-80">not a chatbot.</span>
        </h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto mb-12">
          Experience conversational intelligence grounded entirely in your verified ledgers. Instant
          answers, full context, absolute precision.
        </p>
        <button
          type="button"
          onClick={() => launch("qa")}
          className="bg-primary text-on-primary font-label-sm text-label-sm px-8 py-4 rounded-lg hover:opacity-80 transition-all duration-300 flex items-center space-x-2"
        >
          <span>Start Querying</span>
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </Reveal>

      {/* Conversational Interface (Split View) */}
      <Reveal className="pb-section-gap">
        <div className="glass-panel rounded-3xl overflow-hidden flex flex-col md:flex-row md:h-[700px]">
          {/* Left: Chat View */}
          <div className="w-full md:w-3/5 border-b md:border-b-0 md:border-r border-outline-variant/30 flex flex-col bg-surface-container-lowest/50">
            <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-lowest/80 backdrop-blur-md">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-secondary-container">
                    account_balance
                  </span>
                </div>
                <div>
                  <h3 className="font-label-sm text-label-sm text-on-surface">LedgerAI Analyst</h3>
                  <p className="text-xs text-on-surface-variant">Active Context: Q3 Financials</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="More options"
                className="text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined">more_horiz</span>
              </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto no-scrollbar space-y-6">
              <div className="flex justify-end">
                <div className="bg-surface-container text-on-surface p-4 rounded-2xl rounded-tr-sm max-w-[80%]">
                  <p className="font-body-md text-body-md">
                    Can you explain the discrepancy between INV-204 and the recent deposit TX-881?
                  </p>
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-primary text-on-primary p-4 rounded-2xl rounded-tl-sm max-w-[85%] shadow-sm">
                  <div className="flex items-center space-x-2 mb-2 opacity-80">
                    <span className="material-symbols-outlined text-sm">memory</span>
                    <span className="text-xs font-label-sm">Analyzing ledger...</span>
                  </div>
                  <p className="font-body-md text-body-md mb-3">
                    I have reviewed both records. Invoice <strong>INV-204</strong> was issued for
                    $12,500.00. However, the corresponding bank transaction <strong>TX-881</strong>{" "}
                    shows a deposit of $12,250.00.
                  </p>
                  <p className="font-body-md text-body-md mb-3">
                    The $250.00 difference appears to be a wire transfer fee deducted by the
                    intermediary bank, based on the standard deduction rates for international
                    transfers from that region.
                  </p>
                  <div className="bg-primary-container text-on-primary-container p-3 rounded-lg border border-outline-variant/20 mt-4 flex items-start space-x-3">
                    <span className="material-symbols-outlined text-secondary mt-0.5">info</span>
                    <div>
                      <p className="text-sm font-semibold">Suggested Action</p>
                      <p className="text-sm opacity-80">
                        Reconcile the $250.00 as 'Bank Fees' to balance the ledger entry.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Evidence Context Panel */}
          <div className="hidden md:flex w-full md:w-2/5 flex-col bg-surface-container-low/30">
            <div className="p-6 border-b border-outline-variant/30 flex items-center space-x-2">
              <span className="material-symbols-outlined text-on-surface-variant text-sm">docs</span>
              <span className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider">
                Evidence Context
              </span>
            </div>
            <div className="flex-1 p-6 overflow-y-auto no-scrollbar space-y-6">
              <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/50 ambient-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-xs font-label-sm text-secondary uppercase">Invoice</span>
                    <h4 className="font-semibold text-on-surface">INV-204</h4>
                  </div>
                  <span className="bg-surface-container-high text-on-surface-variant text-xs px-2 py-1 rounded">
                    PDF
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-outline-variant/20 pb-1">
                    <span className="text-on-surface-variant">Client</span>
                    <span className="font-medium">Acme Corp</span>
                  </div>
                  <div className="flex justify-between border-b border-outline-variant/20 pb-1">
                    <span className="text-on-surface-variant">Amount</span>
                    <span className="font-medium text-on-surface">$12,500.00</span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span className="text-on-surface-variant">Date</span>
                    <span className="font-medium">Oct 12, 2023</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => launch("qa")}
                  className="mt-4 w-full py-2 border border-outline-variant rounded-lg text-sm font-label-sm text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  View Full Document
                </button>
              </div>

              <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/50 ambient-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-xs font-label-sm text-secondary uppercase">
                      Transaction
                    </span>
                    <h4 className="font-semibold text-on-surface">TX-881</h4>
                  </div>
                  <span className="bg-surface-container-high text-on-surface-variant text-xs px-2 py-1 rounded">
                    Feed
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-outline-variant/20 pb-1">
                    <span className="text-on-surface-variant">Account</span>
                    <span className="font-medium">Chase ***4421</span>
                  </div>
                  <div className="flex justify-between border-b border-outline-variant/20 pb-1">
                    <span className="text-on-surface-variant">Amount</span>
                    <span className="font-medium text-on-surface">$12,250.00</span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span className="text-on-surface-variant">Date cleared</span>
                    <span className="font-medium">Oct 15, 2023</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Suggested Prompts */}
      <Reveal className="pb-section-gap">
        <div className="mb-8 flex items-center justify-between">
          <h3 className="font-headline-md text-headline-md text-on-surface">Explore Capabilities</h3>
          <div className="h-[1px] flex-1 bg-outline-variant/30 mx-6 hidden md:block" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PROMPTS.map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => launch("qa")}
              className="text-left bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/40 ambient-shadow hover:-translate-y-1 transition-transform duration-300 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-full bg-secondary-container/50 flex items-center justify-center mb-4 group-hover:bg-secondary-container transition-colors">
                <span className="material-symbols-outlined text-on-secondary-container">
                  {p.icon}
                </span>
              </div>
              <h4 className="font-semibold text-on-surface mb-2">{p.title}</h4>
              <p className="text-sm text-on-surface-variant">{p.copy}</p>
            </button>
          ))}
        </div>
      </Reveal>

      {/* Prompt Composer */}
      <Reveal>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            launch("qa");
          }}
          className="glass-panel p-4 md:p-6 rounded-full flex items-center shadow-lg max-w-4xl mx-auto border-2 border-transparent focus-within:border-secondary transition-colors duration-300"
        >
          <span className="material-symbols-outlined text-secondary ml-4 mr-4 hidden md:block">
            arrow_back_ios_new
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-on-surface font-body-lg text-body-lg placeholder:text-on-surface-variant/50 w-full min-w-0 px-2"
            placeholder="Ask anything about your financials..."
            type="text"
            aria-label="Ask anything about your financials"
          />
          <button
            type="submit"
            aria-label="Send question"
            className="bg-primary text-on-primary w-12 h-12 shrink-0 rounded-full flex items-center justify-center ml-4 hover:opacity-80 transition-opacity"
          >
            <span className="material-symbols-outlined">send</span>
          </button>
        </form>
      </Reveal>
    </section>
  );
}
