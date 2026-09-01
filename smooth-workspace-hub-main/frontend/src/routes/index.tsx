import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { BackgroundLayer } from "@/components/site/BackgroundLayer";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { HeroSection } from "@/components/site/HeroSection";
import { QAInfo } from "@/components/site/QAInfo";
import { ReconciliationInfo } from "@/components/site/ReconciliationInfo";

const TITLE = "LedgerAI — Your AI Finance Controller";
const DESCRIPTION =
  "Reconcile records, investigate anomalies and ask your financial data anything with LedgerAI's reconciliation and Q&A agents.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: LandingPage,
});

const SCROLL_KEY = "ledgerai:landing-scroll";

function LandingPage() {
  // Restore the visitor's place in the narrative when returning from a workspace.
  useEffect(() => {
    const stored = sessionStorage.getItem(SCROLL_KEY);
    if (stored) {
      const y = Number(stored);
      if (!Number.isNaN(y) && y > 0) {
        window.requestAnimationFrame(() => window.scrollTo({ top: y }));
      }
    }

    const save = () => sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      save();
      window.removeEventListener("scroll", save);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden selection:bg-secondary-container selection:text-on-secondary-container">
      <BackgroundLayer />
      <Header sections />
      <main className="relative z-10 pt-32">
        <HeroSection />
        <ReconciliationInfo />
        <QAInfo />
      </main>
      <Footer />
    </div>
  );
}
