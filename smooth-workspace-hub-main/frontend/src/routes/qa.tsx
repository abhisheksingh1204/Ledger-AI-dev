import { Link, createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { WorkspaceBackground } from "@/components/site/BackgroundLayer";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { EASE_PREMIUM } from "@/lib/site";
import { askInvoice, getInvoices, uploadQaInvoice, type InvoiceReport, type SourceCitation } from "@/lib/financeApi";

export const Route = createFileRoute("/qa")({ component: QAPage });

type Message = { role: "user" | "ai"; text: string; sources?: SourceCitation[]; answerType?: string; limitations?: string[] };

function QAPage() {
  const [invoices, setInvoices] = useState<InvoiceReport[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [source, setSource] = useState<"select" | "upload">("select");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getInvoices()
      .then((response) => {
        const items = response.data.items || [];
        setInvoices(items);
      })
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Could not load invoices."),
      );
  }, []);
  const processInvoice = async () => {
    if (!invoiceFile || processing) return;
    setError("");
    setProcessing(true);
    try {
      const uploaded = await uploadQaInvoice(invoiceFile);
      const response = await getInvoices();
      setInvoices(response.data.items || []);
      setInvoiceId(uploaded.data.invoice_id);
      setMessages([]);
      setConversationId(undefined);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Invoice processing failed.");
    } finally {
      setProcessing(false);
    }
  };
  const visibleInvoices = invoices.filter((invoice) => `${invoice.invoiceNumber || invoice.invoiceId} ${invoice.customerName || ""}`.toLowerCase().includes(search.toLowerCase()));
  const selectedInvoice = invoices.find((invoice) => String(invoice.invoiceId) === invoiceId);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || !invoiceId || thinking) return;
    setError("");
    setDraft("");
    setMessages((current) => [...current, { role: "user", text: question }]);
    setThinking(true);
    try {
      const response = await askInvoice(invoiceId, question, conversationId);
      setConversationId(response.conversationId);
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: response.answer,
          answerType: response.answerType,
          limitations: response.limitations,
          ...(response.sources ? { sources: response.sources } : {}),
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The AI request failed.");
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col relative overflow-x-hidden">
      <WorkspaceBackground opacity={0.3} />
      <Header sections={false} active="qa" />
      <motion.main
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: EASE_PREMIUM }}
        className="relative z-10 flex-grow pt-[140px] pb-section-gap px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto w-full"
      >
        <div className="mb-12">
          <h1 className="font-display-lg-mobile md:font-display-lg text-primary mb-4">
            Invoice Q&A Agent
          </h1>
          <p className="text-body-lg text-on-surface-variant max-w-2xl">
            Upload or select an invoice, then ask questions about its amounts, payment status, reconciliation and tax details.
          </p>
        </div>
        <section className="glass-panel-solid rounded-2xl p-6 mb-8">
          <div className="flex flex-wrap gap-2 mb-5">
            {([["select", "Select Existing Invoice"], ["upload", "Upload Invoice"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setSource(value)} className={`px-4 py-2 rounded-full border text-sm ${source === value ? "bg-secondary text-on-secondary" : "border-outline-variant text-on-surface-variant"}`}>{label}</button>
            ))}
          </div>
          {source === "upload" ? (
            <div className="flex flex-wrap items-center gap-4">
              <label className="px-4 py-3 rounded-lg border border-outline-variant text-sm text-on-surface-variant cursor-pointer">{invoiceFile ? `${invoiceFile.name} (${(invoiceFile.size / 1024 / 1024).toFixed(2)} MB)` : "Select File"}<input className="hidden" type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" onChange={(event) => setInvoiceFile(event.target.files?.[0] || null)} /></label>
              <button type="button" onClick={() => void processInvoice()} disabled={!invoiceFile || processing} className="bg-secondary text-on-secondary px-5 py-3 rounded-button disabled:opacity-50">{processing ? "Processing invoice..." : "Process Invoice"}</button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice number or customer" className="flex-1 min-w-[240px] bg-surface border border-outline-variant rounded-lg p-3" />{visibleInvoices.map((item) => <button key={String(item.invoiceId)} type="button" onClick={() => { setInvoiceId(String(item.invoiceId)); setMessages([]); setConversationId(undefined); }} className={`text-left px-4 py-3 rounded-xl border ${invoiceId === String(item.invoiceId) ? "border-secondary bg-secondary/10" : "border-outline-variant"}`}><strong>{String(item.invoiceNumber || item.invoiceId)}</strong><span className="block text-xs text-on-surface-variant">{item.customerName || "Unknown customer"} · {item.amount || "-"}</span></button>)}</div>
          )}
        </section>
        {selectedInvoice ? <section className="glass-panel-solid rounded-2xl p-5 mb-8 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs uppercase text-on-surface-variant">Selected Invoice</p><h2 className="text-xl text-primary mt-1">{String(selectedInvoice.invoiceNumber || selectedInvoice.invoiceId)}</h2><p className="text-sm text-on-surface-variant">{selectedInvoice.customerName || "-"} · {selectedInvoice.amount || "-"} · {selectedInvoice.invoiceDate || "-"}</p></div><button type="button" onClick={() => { setInvoiceId(""); setMessages([]); setConversationId(undefined); }} className="text-secondary hover:underline">Change Invoice</button></section> : <p className="text-center text-on-surface-variant mb-8">Select or upload an invoice to start asking questions.</p>}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
          <section className="lg:col-span-5 glass-panel-solid rounded-[24px] flex flex-col h-[650px] overflow-hidden">
            <div className="p-6 border-b border-outline-variant/20">
              <label
                className="text-label-sm text-on-surface-variant uppercase block mb-2"
                htmlFor="invoice-select"
              >
                Invoice
              </label>
              <select
                id="invoice-select"
                value={invoiceId}
                onChange={(event) => {
                  setInvoiceId(event.target.value);
                  setMessages([]);
                  setConversationId(undefined);
                }}
                className="w-full bg-surface border border-outline-variant rounded-lg p-3 text-on-surface"
              >
                <option value="">Select an invoice</option>
                {invoices.map((invoice) => (
                  <option key={String(invoice.invoiceId)} value={String(invoice.invoiceId)}>
                    {String(invoice.invoiceNumber || invoice.invoiceId)}{" "}
                    {invoice.customerName ? `- ${invoice.customerName}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div ref={scrollRef} className="flex-grow p-6 overflow-y-auto flex flex-col gap-5">
              {messages.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  Select an invoice and ask a question to begin.
                </p>
              ) : null}
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={
                    message.role === "user" ? "self-end max-w-[90%]" : "self-start max-w-[95%]"
                  }
                >
                  <div
                    className={
                      message.role === "user"
                        ? "bg-surface-container-high p-4 rounded-2xl"
                        : "bg-surface p-4 rounded-2xl border border-outline-variant/30"
                    }
                    >
                    {message.role === "ai" && message.answerType ? <p className="text-[10px] uppercase tracking-wide text-secondary mb-2">{message.answerType.replaceAll("_", " ")}</p> : null}
                    <p className="text-body-md whitespace-pre-wrap">{message.text}</p>
                    {message.limitations?.length ? <p className="mt-3 text-xs text-on-surface-variant">{message.limitations.join(" ")}</p> : null}
                    {message.sources?.length ? (
                      <div className="mt-4 border-t border-outline-variant/30 pt-3">
                        <p className="text-xs font-semibold uppercase text-on-surface-variant mb-2">
                          Trusted sources
                        </p>
                        {message.sources.map((source, sourceIndex) => (
                          <a
                            key={sourceIndex}
                            href={String(source.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs text-secondary hover:underline mb-1"
                          >
                            {String(source.title || source.url)} -{" "}
                            {String(source.publisher || "Official source")}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {thinking ? (
                <p className="text-sm text-on-surface-variant">
                  Analyzing invoice facts and retrieved guidance...
                </p>
              ) : null}
            </div>
            <div className="p-6 border-t border-outline-variant/20">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
                className="flex gap-2"
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={!invoiceId || thinking}
                  className="min-w-0 flex-grow bg-surface border border-outline-variant rounded-lg p-3 text-on-surface"
                  placeholder="Ask about this invoice..."
                />
                <button
                  type="submit"
                  disabled={!invoiceId || thinking}
                  className="bg-primary text-on-primary px-4 rounded-lg disabled:opacity-50"
                >
                  Send
                </button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  "What is the total amount?",
                  "Is the GST calculation mathematically correct?",
                  "Why is this invoice unmatched?",
                ].map((question) => (
                  <button
                    key={question}
                    type="button"
                    disabled={!invoiceId || thinking}
                    onClick={() => void send(question)}
                    className="px-3 py-2 rounded-full border border-outline-variant text-xs text-on-surface-variant disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <section className="lg:col-span-7 glass-panel-solid rounded-[28px] p-8 min-h-[650px]">
            <h2 className="font-headline-md text-primary mb-6">Invoice Facts</h2>
            {error ? (
              <p role="alert" className="text-error mb-5">
                {error}
              </p>
            ) : null}
            {invoices.length === 0 ? (
              <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-low p-6">
                <p className="text-on-surface-variant mb-4">
                  Upload an invoice and bank statement first to enable grounded questions.
                </p>
                <Link
                  to="/reconciliation"
                  className="inline-flex bg-secondary text-on-secondary px-5 py-3 rounded-button"
                >
                  Upload documents
                </Link>
              </div>
            ) : null}
            {invoiceId ? (
              <div className="space-y-4 text-sm">
                {(() => {
                  const invoice = invoices.find((item) => String(item.invoiceId) === invoiceId);
                  return invoice ? (
                    Object.entries(invoice)
                      .filter(([key]) => !["id"].includes(key))
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between gap-6 border-b border-outline-variant/20 pb-3"
                        >
                          <span className="text-on-surface-variant">
                            {key
                              .replace(/[A-Z]/g, (letter) => ` ${letter}`)
                              .replace(/^./, (letter) => letter.toUpperCase())}
                          </span>
                          <span className="text-right font-medium">{String(value ?? "-")}</span>
                        </div>
                      ))
                  ) : (
                    <p className="text-on-surface-variant">Invoice details are unavailable.</p>
                  );
                })()}
              </div>
            ) : (
              <p className="text-on-surface-variant">
                Invoice facts will appear here after selecting an invoice.
              </p>
            )}
          </section>
        </div>
      </motion.main>
      <Footer />
    </div>
  );
}
