import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { EASE_PREMIUM } from "@/lib/site";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  id?: string;
  as?: "div" | "section";
};

export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  id,
  as = "div",
}: RevealProps) {
  const Comp = as === "section" ? motion.section : motion.div;

  return (
    <Comp
      id={id}
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.65, delay, ease: EASE_PREMIUM }}
    >
      {children}
    </Comp>
  );
}
