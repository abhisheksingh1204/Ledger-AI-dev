import { motion } from "framer-motion";

import { EASE_PREMIUM } from "@/lib/site";

import { useLaunchAgent } from "./LaunchProvider";

export function HeroSection() {
  const { launch } = useLaunchAgent();

  return (
    <section
      id="overview"
      className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop min-h-[819px] flex flex-col justify-center items-center text-center py-24"
    >
      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE_PREMIUM }}
        className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-primary mb-6 max-w-4xl"
      >
        Your AI Finance Controller
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: EASE_PREMIUM }}
        className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mb-16"
      >
        Reconcile records. Investigate anomalies. Ask your financial data anything.
      </motion.p>

      <div className="grid md:grid-cols-2 gap-gutter w-full max-w-5xl">
        {/* Agent Card 1 */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: EASE_PREMIUM }}
          className="bg-surface-container-low rounded-[24px] p-8 border border-outline-variant/50 ambient-shadow flex flex-col items-start text-left"
        >
          <span className="material-symbols-outlined text-4xl mb-4 text-secondary">
            account_balance_wallet
          </span>
          <h2 className="font-headline-md text-headline-md text-primary mb-3">
            Reconciliation Agent
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6 flex-grow">
            Match invoices against bank transactions automatically with high-confidence semantic
            scoring.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mb-8 w-full">
            <div className="bg-surface-variant px-4 py-2 rounded-lg flex-1">
              <div className="font-label-sm text-label-sm text-on-surface-variant mb-1">
                RECORDS PROCESSED
              </div>
              <div className="font-headline-md text-headline-md text-primary">128</div>
            </div>
            <div className="bg-surface-variant px-4 py-2 rounded-lg flex-1">
              <div className="font-label-sm text-label-sm text-on-surface-variant mb-1">
                PRECISION SCORE
              </div>
              <div className="font-headline-md text-headline-md text-primary">98.1%</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => launch("reconciliation")}
            className="w-full bg-primary-container text-on-primary py-4 rounded-lg font-label-sm text-label-sm hover:bg-primary/90 transition-colors"
          >
            Open Reconciliation Agent
          </button>
        </motion.div>

        {/* Agent Card 2 */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.32, ease: EASE_PREMIUM }}
          className="bg-surface-container-low rounded-[24px] p-8 border border-outline-variant/50 ambient-shadow flex flex-col items-start text-left"
        >
          <span className="material-symbols-outlined text-4xl mb-4 text-secondary">forum</span>
          <h2 className="font-headline-md text-headline-md text-primary mb-3">Finance Q&amp;A Agent</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6 flex-grow">
            Ask complex questions about your invoices, anomalies, and reconciliation status in
            natural language.
          </p>
          <div className="flex flex-col gap-2 mb-8 w-full">
            <div className="bg-surface-variant px-4 py-3 rounded-lg font-body-md text-body-md text-on-surface">
              "Why is INV-204 unresolved?"
            </div>
            <div className="bg-surface-variant px-4 py-3 rounded-lg font-body-md text-body-md text-on-surface">
              "Find partial payments from Acme"
            </div>
          </div>
          <button
            type="button"
            onClick={() => launch("qa")}
            className="w-full bg-primary-container text-on-primary py-4 rounded-lg font-label-sm text-label-sm hover:bg-primary/90 transition-colors mt-auto"
          >
            Open Finance Q&amp;A
          </button>
        </motion.div>
      </div>

      <div className="mt-24 flex flex-col items-center animate-bounce opacity-50">
        <span className="font-label-sm text-label-sm text-on-surface-variant mb-2">
          SCROLL TO EXPLORE
        </span>
        <div className="w-px h-16 bg-on-surface-variant" />
      </div>
    </section>
  );
}
