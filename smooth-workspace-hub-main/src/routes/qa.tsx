import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { WorkspaceBackground } from "@/components/site/BackgroundLayer";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { EASE_PREMIUM } from "@/lib/site";
import { askInvoice, getInvoices } from "@/lib/financeApi";

export const Route = createFileRoute("/qa")({ component: QAPage });

type Message = { role: "user" | "ai"; text: string; sources?: Array<Record<string, unknown>> };

function QAPage() {
  const [invoices, setInvoices] = useState<Array<Record<string, unknown>>>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getInvoices()
      .then((response) => {
        const items = response.data.items || [];
        setInvoices(items);
        if (items[0]?.invoiceId) setInvoiceId(String(items[0].invoiceId));
      })
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Could not load invoices."),
      );
  }, []);
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
        { role: "ai", text: response.answer, sources: response.sources },
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
            Document Intelligence
          </h1>
          <p className="text-body-lg text-on-surface-variant max-w-2xl">
            Ask grounded questions about invoices, reconciliation results and Indian tax guidance.
          </p>
        </div>
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
                    <p className="text-body-md whitespace-pre-wrap">{message.text}</p>
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
