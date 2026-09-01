import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { BG_IMAGE, EASE_PREMIUM } from "@/lib/site";

type LoadingScreenProps = {
  title?: string;
  description?: string;
  statuses?: string[];
};

const DEFAULT_STATUSES = [
  "Analyzing tax deductions and customer IDs",
  "Aligning semantic confidence scores",
  "Preparing workspace",
];

export function LoadingScreen({
  title = "Reconciling Ledger Discrepancies...",
  description = "Matching 128 invoice records against institutional bank feeds using semantic scoring.",
  statuses = DEFAULT_STATUSES,
}: LoadingScreenProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % statuses.length);
    }, 900);
    return () => window.clearInterval(id);
  }, [statuses.length]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE_PREMIUM }}
      className="fixed inset-0 z-[100] bg-background min-h-screen flex items-center justify-center overflow-hidden font-body-md text-on-background"
      role="status"
      aria-live="polite"
    >
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <div
          className="w-full h-full bg-cover bg-center blur-md opacity-40"
          style={{ backgroundImage: `url('${BG_IMAGE}')` }}
        />
        <div className="absolute inset-0 bg-background/80 backdrop-blur-lg" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/50" />
      </div>

      <main className="relative z-10 flex flex-col items-center justify-center w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-20">
        <div className="absolute top-10 left-5 md:left-margin-desktop">
          <span className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-primary tracking-tighter">
            LedgerAI
          </span>
        </div>

        <div className="flex flex-col items-center justify-center text-center max-w-2xl mt-12 md:mt-24 space-y-12">
          {/* Progress Indicator */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-outline-variant/30 ring-pulse shadow-[0_10px_40px_rgba(27,27,27,0.05)]" />
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                className="text-surface-container-high"
                cx="50"
                cy="50"
                fill="none"
                r="45"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle
                className="text-primary progress-circle"
                cx="50"
                cy="50"
                fill="none"
                r="45"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="4"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined filled text-4xl">memory</span>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="font-headline-md text-headline-md text-on-surface">{title}</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-lg mx-auto">
              {description}
            </p>
          </div>

          <div className="inline-flex items-center space-x-3 px-4 py-2 rounded-full bg-surface-container/50 border border-outline-variant/30 shadow-[0_5px_20px_rgba(27,27,27,0.02)] backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <motion.span
              key={index}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease: EASE_PREMIUM }}
              className="font-label-sm text-label-sm text-on-surface-variant tracking-wider uppercase"
            >
              {statuses[index]}
            </motion.span>
          </div>
        </div>
      </main>

      <div className="absolute bottom-10 right-5 md:right-margin-desktop opacity-50 flex items-center space-x-2">
        <span className="material-symbols-outlined text-sm">lock</span>
        <span className="font-label-sm text-label-sm">End-to-End Encrypted</span>
      </div>
    </motion.div>
  );
}
