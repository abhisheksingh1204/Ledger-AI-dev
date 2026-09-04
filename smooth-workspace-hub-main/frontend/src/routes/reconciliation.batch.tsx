import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/reconciliation/batch")({ component: BatchReconciliationPage });

function BatchReconciliationPage() {
  return (
    <main className="min-h-screen bg-background text-on-surface flex items-center justify-center p-6">
      <div className="glass-panel-solid rounded-2xl p-8 text-center max-w-lg">
        <h1 className="font-headline-md text-primary mb-3">Batch Reconciliation moved</h1>
        <p className="text-on-surface-variant mb-6">Single and batch workflows now share the same reconciliation screen.</p>
        <a href="/reconciliation?mode=batch" className="bg-secondary text-on-secondary rounded-button px-6 py-3 inline-block">
          Open Batch Reconciliation
        </a>
      </div>
    </main>
  );
}
