import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useLaunchAgent } from "./LaunchProvider";

type HeaderProps = {
  /** Landing page hash-section navigation; omitted inside workspaces. */
  sections?: boolean;
  active?: "overview" | "reconciliation" | "qa";
};

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Header({ sections = true, active = "overview" }: HeaderProps) {
  const { launch } = useLaunchAgent();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const linkClass = (key: HeaderProps["active"]) =>
    key === active
      ? "text-primary border-b-2 border-primary pb-1 font-label-sm text-label-sm"
      : "text-on-surface-variant hover:text-primary transition-colors duration-300 font-label-sm text-label-sm";

  return (
    <header
      className={`fixed top-0 left-0 w-full z-50 border-b transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-outline-variant/30 shadow-sm"
          : "bg-transparent border-transparent"
      }`}
    >
      <div className="flex justify-between items-center h-20 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-3xl">
            account_balance_wallet
          </span>
          {sections ? (
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="font-headline-md text-headline-md font-bold tracking-tight text-primary"
            >
              LedgerAI
            </button>
          ) : (
            <Link
              to="/"
              className="font-headline-md text-headline-md font-bold tracking-tight text-primary"
            >
              LedgerAI
            </Link>
          )}
        </div>

        <nav className="hidden md:flex gap-8 items-center">
          {sections ? (
            <>
              <button
                type="button"
                className={linkClass("overview")}
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                Overview
              </button>
              <button
                type="button"
                className={linkClass("reconciliation")}
                onClick={() => scrollToSection("reconciliation")}
              >
                Reconciliation
              </button>
              <button type="button" className={linkClass("qa")} onClick={() => scrollToSection("qa")}>
                Q&amp;A
              </button>
              <button
                type="button"
                className={linkClass(undefined)}
                onClick={() => scrollToSection("footer")}
              >
                Help
              </button>
            </>
          ) : (
            <>
              <Link to="/" className={linkClass(undefined)}>
                Back to Overview
              </Link>
              <Link
                to="/reconciliation"
                className={linkClass(active === "reconciliation" ? "reconciliation" : undefined)}
              >
                Reconciliation
              </Link>
              <Link to="/qa" className={linkClass(active === "qa" ? "qa" : undefined)}>
                Q&amp;A
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => launch("reconciliation")}
            className="bg-primary-container text-on-primary hover:bg-primary-container/90 px-5 md:px-6 py-3 rounded-lg font-label-sm text-label-sm transition-colors active:scale-95 duration-200"
          >
            Launch Workspace
          </button>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="md:hidden text-on-surface"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="material-symbols-outlined">{menuOpen ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="md:hidden bg-background/95 backdrop-blur-xl border-t border-outline-variant/30 px-margin-mobile py-4 flex flex-col gap-4">
          {sections ? (
            <>
              <button
                type="button"
                className="text-left font-label-sm text-label-sm text-on-surface-variant"
                onClick={() => {
                  setMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Overview
              </button>
              <button
                type="button"
                className="text-left font-label-sm text-label-sm text-on-surface-variant"
                onClick={() => {
                  setMenuOpen(false);
                  scrollToSection("reconciliation");
                }}
              >
                Reconciliation
              </button>
              <button
                type="button"
                className="text-left font-label-sm text-label-sm text-on-surface-variant"
                onClick={() => {
                  setMenuOpen(false);
                  scrollToSection("qa");
                }}
              >
                Q&amp;A
              </button>
            </>
          ) : (
            <>
              <Link
                to="/"
                onClick={() => setMenuOpen(false)}
                className="font-label-sm text-label-sm text-on-surface-variant"
              >
                Back to Overview
              </Link>
              <Link
                to="/reconciliation"
                onClick={() => setMenuOpen(false)}
                className="font-label-sm text-label-sm text-on-surface-variant"
              >
                Reconciliation
              </Link>
              <Link
                to="/qa"
                onClick={() => setMenuOpen(false)}
                className="font-label-sm text-label-sm text-on-surface-variant"
              >
                Q&amp;A
              </Link>
            </>
          )}
        </div>
      ) : null}
    </header>
  );
}
