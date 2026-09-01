import { motion, useScroll, useTransform } from "framer-motion";

import { BG_IMAGE } from "@/lib/site";

/**
 * Shared cinematic background: sharp at the hero, progressively blurred and
 * veiled as the visitor scrolls into the dense information sections.
 */
export function BackgroundLayer() {
  const { scrollYProgress } = useScroll();

  const blur = useTransform(scrollYProgress, [0, 0.3, 0.6, 1], [0, 3, 6, 9]);
  const filter = useTransform(blur, (b) => `blur(${b}px)`);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.35, 1], [0.78, 0.9, 0.97]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center will-change-transform"
        style={{
          backgroundImage: `url('${BG_IMAGE}')`,
          filter,
          scale,
        }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          opacity: overlayOpacity,
          background:
            "linear-gradient(to bottom, rgba(250,250,243,0.85) 0%, rgba(250,250,243,0.97) 100%)",
        }}
      />
    </div>
  );
}

/** Static, softly blurred variant used inside the agent workspaces. */
export function WorkspaceBackground({ opacity = 0.3 }: { opacity?: number }) {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center blur-md"
        style={{ backgroundImage: `url('${BG_IMAGE}')`, opacity }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-background/40 to-background"
      />
    </div>
  );
}
