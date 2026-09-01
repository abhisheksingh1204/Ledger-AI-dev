import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { LoadingScreen } from "./LoadingScreen";

type Agent = "reconciliation" | "qa";

type LaunchState = {
  launch: (agent: Agent) => void;
  isLaunching: boolean;
};

const LaunchContext = createContext<LaunchState | null>(null);

const COPY: Record<Agent, { title: string; description: string; statuses: string[] }> = {
  reconciliation: {
    title: "Reconciling Ledger Discrepancies...",
    description:
      "Matching 128 invoice records against institutional bank feeds using semantic scoring.",
    statuses: [
      "Analyzing tax deductions and customer IDs",
      "Aligning ledger references",
      "Preparing workspace",
    ],
  },
  qa: {
    title: "Preparing your Q&A workspace...",
    description:
      "Indexing invoices, bank feeds and reconciliation context for grounded conversational answers.",
    statuses: [
      "Embedding document context",
      "Loading evidence panel",
      "Preparing workspace",
    ],
  },
};

export function LaunchProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const busy = useRef(false);

  const launch = useCallback(
    (next: Agent) => {
      if (busy.current) return;
      busy.current = true;
      setAgent(next);

      window.setTimeout(() => {
        void navigate({ to: next === "qa" ? "/qa" : "/reconciliation" }).then(() => {
          window.setTimeout(() => {
            setAgent(null);
            busy.current = false;
          }, 150);
        });
      }, 1100);
    },
    [navigate],
  );

  const value = useMemo(() => ({ launch, isLaunching: agent !== null }), [launch, agent]);

  return (
    <LaunchContext.Provider value={value}>
      {children}
      <AnimatePresence>{agent ? <LoadingScreen {...COPY[agent]} /> : null}</AnimatePresence>
    </LaunchContext.Provider>
  );
}

export function useLaunchAgent() {
  const ctx = useContext(LaunchContext);
  if (!ctx) throw new Error("useLaunchAgent must be used inside <LaunchProvider>");
  return ctx;
}
