import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { WorkspaceBackground } from "@/components/site/BackgroundLayer";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { EASE_PREMIUM } from "@/lib/site";

const TITLE = "Finance Q&A Agent — LedgerAI";
const DESCRIPTION =
  "Interrogate invoices, bank feeds and reconciliation context in natural language with LedgerAI's document intelligence workspace.";

export const Route = createFileRoute("/qa")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: QAPage,
});

type Message =
  | { role: "user"; text: string; time: string }
  | { role: "ai"; time: string; body: AiBody };

type AiBody = {
  lead: string;
  detail: string;
  warning?: string;
  chips?: string[];
};

const CANNED: [AiBody, AiBody, AiBody] = [
  {
    lead: "Analyzing INV-204...",
    detail:
      "The 12% GST applied aligns with the standard deduction for service-based transactions in your region.",
    warning: "However, I noticed the TDS calculation is missing a 1% surcharge applicable for this volume.",
    chips: ["Flagged", "Tax Code: Reg-4B"],
  },
  {
    lead: "Cross-checking ledger references...",
    detail:
      "INV-204 was issued for $181,050.00 while deposit TX-881 cleared at $180,800.00 on Oct 15, 2024.",
    warning: "The $250.00 delta matches an intermediary wire fee — reconcile it as 'Bank Fees'.",
    chips: ["Suggested action", "Confidence 94%"],
  },
  {
    lead: "Scanning open items...",
    detail:
      "Three invoices remain unresolved: INV-204, INV-207 and INV-212, totalling $48,120.00 in exposure.",
    chips: ["3 exceptions", "Q3 Financials"],
  },
];

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const INITIAL: Message[] = [
  {
    role: "user",
    text: "Is the tax deduction on this invoice correct based on the current regional rates?",
    time: "10:42 AM",
  },
  { role: "ai", time: "10:42 AM", body: CANNED[0] },
];

function QAPage() {
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [docAttached, setDocAttached] = useState(true);
  const [zoom, setZoom] = useState(100);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turn = useRef(1);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value || thinking) return;
    setMessages((prev) => [...prev, { role: "user", text: value, time: now() }]);
    setDraft("");
    setThinking(true);
    window.setTimeout(() => {
      const body = CANNED[turn.current % CANNED.length]!;
      turn.current += 1;
      setMessages((prev) => [...prev, { role: "ai", time: now(), body }]);
      setThinking(false);
    }, 1100);
  };

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen flex flex-col relative overflow-x-hidden">
      <WorkspaceBackground opacity={0.3} />
      <Header sections={false} active="qa" />

      <motion.main
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: EASE_PREMIUM }}
        className="relative z-10 flex-grow pt-[140px] pb-section-gap px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto w-full"
      >
        <div className="mb-16">
          <h1 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-primary mb-4">
            Document Intelligence
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
            Upload financial documents for instant analysis, compliance checks, and structural
            interrogation powered by LedgerAI.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
          {/* Left Column: Q&A Interface */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {docAttached ? (
              <div className="glass-panel-solid rounded-[24px] p-6 flex items-center justify-between gap-4 hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 shrink-0 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container">
                    <span className="material-symbols-outlined">description</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-body-lg text-body-lg text-on-surface truncate">
                      INV-204_Q3.pdf
                    </h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      Uploaded just now • 1.2 MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Remove document"
                  onClick={() => setDocAttached(false)}
                  className="text-on-surface-variant hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDocAttached(true)}
                className="glass-panel-solid rounded-[24px] p-6 flex items-center justify-center gap-3 text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined">upload_file</span>
                <span className="font-label-sm text-label-sm uppercase tracking-wider">
                  Attach a document
                </span>
              </button>
            )}

            {/* Chat Interface */}
            <div className="glass-panel-solid rounded-[24px] flex flex-col h-[600px] overflow-hidden">
              <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                  <span className="font-label-sm text-label-sm text-on-surface">
                    AI ANALYST ACTIVE
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMessages(INITIAL)}
                  className="text-on-surface-variant text-sm hover:text-primary transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[18px]">history</span> History
                </button>
              </div>

              <div ref={scrollRef} className="flex-grow p-6 overflow-y-auto flex flex-col gap-8">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <motion.div
                      key={`u-${i}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: EASE_PREMIUM }}
                      className="flex flex-col items-end gap-2"
                    >
                      <div className="bg-surface-container-high text-on-surface p-4 rounded-2xl rounded-tr-sm max-w-[85%]">
                        <p className="font-body-md text-body-md">{m.text}</p>
                      </div>
                      <span className="font-label-sm text-label-sm text-on-surface-variant/50">
                        You • {m.time}
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`a-${i}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: EASE_PREMIUM }}
                      className="flex flex-col items-start gap-2"
                    >
                      <div className="flex items-center gap-3 mb-1">
                        <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center">
                          <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                        </div>
                        <span className="font-label-sm text-label-sm text-on-surface">LEDGER AI</span>
                      </div>
                      <div className="bg-surface text-on-surface p-5 rounded-2xl rounded-tl-sm border border-outline-variant/30 max-w-[90%] ambient-shadow">
                        <p className="font-body-md text-body-md mb-4 leading-relaxed">
                          {m.body.lead}
                        </p>
                        <p className="font-body-md text-body-md leading-relaxed text-on-surface-variant">
                          {m.body.detail}
                        </p>
                        {m.body.warning ? (
                          <>
                            <div className="my-4 h-[1px] w-full bg-outline-variant/20" />
                            <p className="font-body-md text-body-md leading-relaxed text-error">
                              {m.body.warning}
                            </p>
                          </>
                        ) : null}
                        {m.body.chips ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {m.body.chips.map((chip, ci) => (
                              <span
                                key={chip}
                                className={
                                  ci === 0
                                    ? "px-3 py-1 bg-error-container text-on-error-container rounded flex items-center gap-1 font-label-sm text-label-sm"
                                    : "px-3 py-1 bg-surface-container-high text-on-surface rounded font-label-sm text-label-sm"
                                }
                              >
                                {ci === 0 ? (
                                  <span className="material-symbols-outlined text-[14px]">
                                    warning
                                  </span>
                                ) : null}
                                {chip}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </motion.div>
                  ),
                )}

                {thinking ? (
                  <div className="flex items-center gap-3 text-on-surface-variant">
                    <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center">
                      <span className="material-symbols-outlined text-[16px]">memory</span>
                    </div>
                    <span className="flex gap-1">
                      {[0, 1, 2].map((d) => (
                        <motion.span
                          key={d}
                          className="w-1.5 h-1.5 rounded-full bg-on-surface-variant"
                          animate={{ opacity: [0.2, 1, 0.2] }}
                          transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
                        />
                      ))}
                    </span>
                    <span className="font-label-sm text-label-sm uppercase tracking-wider">
                      Analyzing ledger
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="p-6 border-t border-outline-variant/20 bg-surface/50">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(draft);
                  }}
                  className="relative flex items-center bg-surface border border-outline-variant/40 rounded-xl input-glow transition-colors"
                >
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-body-md p-4 pr-16 text-on-surface placeholder:text-on-surface-variant/50"
                    placeholder="Ask another question about this document..."
                    type="text"
                    aria-label="Ask another question about this document"
                  />
                  <button
                    type="submit"
                    aria-label="Send"
                    disabled={thinking}
                    className="absolute right-2 w-10 h-10 flex items-center justify-center bg-primary text-on-primary rounded-lg hover:bg-on-primary-fixed-variant transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </form>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    "Show all unpaid invoices",
                    "Explain unresolved transactions",
                    "Compare Q3 vs Q2 burn rate",
                  ].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="px-3 py-2 rounded-full border border-outline-variant/60 font-label-sm text-label-sm text-on-surface-variant hover:bg-surface-container-high transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Document Preview */}
          <div className="lg:col-span-7 h-[560px] lg:h-[700px] glass-panel-solid rounded-[28px] overflow-hidden flex flex-col relative">
            <div className="absolute top-4 left-4 right-4 flex justify-between z-10">
              <div className="bg-surface/80 backdrop-blur-md px-4 py-2 rounded-full border border-outline-variant/30 flex items-center gap-4 text-on-surface">
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(z + 10, 160))}
                  className="hover:text-primary transition-colors flex items-center"
                >
                  <span className="material-symbols-outlined text-[20px]">zoom_in</span>
                </button>
                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(z - 10, 60))}
                  className="hover:text-primary transition-colors flex items-center"
                >
                  <span className="material-symbols-outlined text-[20px]">zoom_out</span>
                </button>
                <div className="w-[1px] h-4 bg-outline-variant/50" />
                <span className="font-label-sm text-label-sm flex items-center">{zoom}%</span>
              </div>
              <div className="bg-surface/80 backdrop-blur-md px-4 py-2 rounded-full border border-outline-variant/30 flex gap-4 text-on-surface">
                <button
                  type="button"
                  aria-label="Download document"
                  className="hover:text-primary transition-colors flex items-center"
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                </button>
              </div>
            </div>

            <div className="flex-grow bg-[#E4E4DE] p-6 md:p-12 overflow-auto flex justify-center items-start">
              <div
                className="bg-white w-full max-w-[600px] min-h-[800px] shadow-sm p-8 md:p-12 mt-8 relative origin-top"
                style={{ transform: `scale(${zoom / 100})` }}
              >
                <div className="absolute top-[340px] right-[48px] w-[200px] h-[30px] bg-secondary-container/40 border border-secondary/50 rounded-sm pointer-events-none animate-pulse" />
                <div className="absolute top-[400px] right-[48px] w-[200px] h-[30px] bg-error-container/40 border border-error/50 rounded-sm pointer-events-none" />

                <div className="flex justify-between items-start mb-16 border-b pb-8 gap-6">
                  <div>
                    <h2 className="font-display-lg-mobile text-display-lg-mobile text-inverse-surface mb-2">
                      INVOICE
                    </h2>
                    <p className="font-label-sm text-label-sm text-outline">INV-204 | OCT 15, 2024</p>
                  </div>
                  <div className="text-right">
                    <div className="font-body-md text-body-md font-bold text-inverse-surface mb-1">
                      Acme Corp Ltd.
                    </div>
                    <div className="font-label-sm text-label-sm text-outline leading-relaxed">
                      1200 Financial Blvd
                      <br />
                      Suite 400
                      <br />
                      New York, NY 10004
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mb-16">
                  <div className="h-4 bg-surface-container w-3/4 rounded" />
                  <div className="h-4 bg-surface-container w-full rounded" />
                  <div className="h-4 bg-surface-container w-5/6 rounded" />
                </div>

                <table className="w-full text-left mb-16">
                  <thead>
                    <tr className="border-b font-label-sm text-label-sm text-outline">
                      <th className="pb-2 font-normal">DESCRIPTION</th>
                      <th className="pb-2 font-normal text-right">AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-body-md text-inverse-surface">
                    <tr className="border-b">
                      <td className="py-4">Q3 Strategy Consulting Services</td>
                      <td className="py-4 text-right">$145,000.00</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-4">Data Infrastructure Audit</td>
                      <td className="py-4 text-right">$32,500.00</td>
                    </tr>
                  </tbody>
                </table>

                <div className="flex justify-end">
                  <div className="w-[250px]">
                    <div className="flex justify-between py-2 font-body-md text-body-md text-inverse-surface">
                      <span>Subtotal</span>
                      <span>$177,500.00</span>
                    </div>
                    <div className="flex justify-between py-2 font-body-md text-body-md text-inverse-surface">
                      <span>GST (12%)</span>
                      <span>$21,300.00</span>
                    </div>
                    <div className="flex justify-between py-2 font-body-md text-body-md text-inverse-surface">
                      <span>TDS Deduction</span>
                      <span className="text-error">-$17,750.00</span>
                    </div>
                    <div className="flex justify-between py-4 mt-2 border-t-2 font-body-lg text-body-lg font-bold text-inverse-surface">
                      <span>Total Due</span>
                      <span>$181,050.00</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.main>

      <Footer />
    </div>
  );
}
