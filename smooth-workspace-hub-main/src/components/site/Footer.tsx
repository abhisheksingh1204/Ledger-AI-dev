export function Footer() {
  return (
    <footer
      id="footer"
      className="relative z-10 bg-surface-container-high w-full py-section-gap border-t border-outline-variant"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
        <div className="col-span-2 md:col-span-1">
          <div className="font-headline-md text-headline-md font-bold text-primary mb-4">
            LedgerAI
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            © 2024 LedgerAI. Precision in Finance.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <span className="font-body-md text-body-md text-primary font-semibold">Product</span>
          <a
            className="font-body-md text-body-md text-on-tertiary-container hover:text-primary hover:underline transition-all"
            href="#reconciliation"
          >
            Reconciliation
          </a>
          <a
            className="font-body-md text-body-md text-on-tertiary-container hover:text-primary hover:underline transition-all"
            href="#qa"
          >
            Q&amp;A
          </a>
        </div>
        <div className="flex flex-col gap-3">
          <span className="font-body-md text-body-md text-primary font-semibold">Resources</span>
          <a
            className="font-body-md text-body-md text-on-tertiary-container hover:text-primary hover:underline transition-all"
            href="#qa"
          >
            Documentation
          </a>
          <a
            className="font-body-md text-body-md text-on-tertiary-container hover:text-primary hover:underline transition-all"
            href="#reconciliation"
          >
            Security
          </a>
        </div>
        <div className="flex flex-col gap-3">
          <span className="font-body-md text-body-md text-primary font-semibold">Company</span>
          <a
            className="font-body-md text-body-md text-on-tertiary-container hover:text-primary hover:underline transition-all"
            href="#footer"
          >
            Privacy
          </a>
          <a
            className="font-body-md text-body-md text-on-tertiary-container hover:text-primary hover:underline transition-all"
            href="#footer"
          >
            Contact Support
          </a>
        </div>
      </div>
    </footer>
  );
}
