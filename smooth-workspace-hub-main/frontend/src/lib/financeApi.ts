const API_BASE_URL = (import.meta.env["VITE_BACKEND_URL"] || "http://127.0.0.1:5000").replace(
  /\/$/,
  "",
);
const USER_ID = import.meta.env["VITE_USER_ID"] || "demo-user";

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string; code?: string; details?: unknown };
  [key: string]: unknown;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-user-id", USER_ID);
  if (init.body && !(init.body instanceof FormData))
    headers.set("content-type", "application/json");

  const url = `${API_BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("Finance Controller request failed", { url, reason });
    throw new Error(`Network request failed for ${path}: ${reason}`);
  }

  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || payload.success === false) {
    const message = payload.error?.message || `Request failed with status ${response.status}.`;
    const code = payload.error?.code ? ` [${payload.error.code}]` : "";
    const details =
      typeof payload.error?.details === "string" ? ` Details: ${payload.error.details}` : "";
    console.error("Finance Controller API returned an error", {
      url,
      status: response.status,
      code: payload.error?.code,
      message,
      details: payload.error?.details,
    });
    throw new Error(`${message}${code}${details}`);
  }
  return payload as T;
}

export type SessionDocument = {
  documentId: string;
  documentType: "INVOICE" | "BANK_STATEMENT";
  filename?: string;
  originalFilename?: string;
  uploadStatus: string;
  processingStatus: string;
};

export type ReconciliationResult = {
  invoiceId: string;
  customerName?: string;
  amount?: string | number;
  invoiceDate?: string;
  transactionId?: string;
  transaction?: {
    transactionId: string;
    description?: string;
    amount?: string | number;
    transactionDate?: string;
    bankAccount?: string | null;
  };
  bestCandidate?: {
    transactionId: string;
    description?: string;
    amount?: string | number;
    transactionDate?: string;
    confidence: number;
    scores: Record<string, number>;
  };
  reason?: { summary: string; signals: string[] };
  matchType: string;
  confidence?: number;
  scores?: {
    amount: number;
    reference: number;
    name: number;
    semantic: number;
    date: number;
    confidence: number;
  };
  amountDifference?: string;
  warnings?: Array<{ type: string; severity?: string; [key: string]: unknown }>;
};

export type ReportOverview = {
  reconciliation: Record<string, number | string>;
  financial: Record<string, number | string>;
  exceptions: Record<string, { count: number; amount?: string }>;
};

export type InvoiceReport = {
  invoiceId?: string;
  invoiceNumber?: string;
  customerName?: string;
  [key: string]: unknown;
};

export type SourceCitation = {
  url?: string;
  title?: string;
  publisher?: string;
  [key: string]: unknown;
};

export async function createSession() {
  return request<{ success: true; session: { sessionId: string; status: string } }>(
    "/api/reconciliation/sessions",
    { method: "POST" },
  );
}

export async function uploadDocuments(sessionId: string, invoice: File, bankStatement: File) {
  const body = new FormData();
  body.append("invoice", invoice);
  body.append("bankStatement", bankStatement);
  return request<{
    success: true;
    data: { sessionId: string; status: string; documents: SessionDocument[] };
  }>(`/api/reconciliation/${encodeURIComponent(sessionId)}/documents`, { method: "POST", body });
}

export async function processSession(sessionId: string) {
  return request<{
    success: true;
    data: {
      sessionId: string;
      results: Array<{ documentId: string; success: boolean; error?: { message: string } }>;
    };
  }>(`/api/v1/process-session/${encodeURIComponent(sessionId)}`, { method: "POST" });
}

export async function runReconciliation(sessionId: string) {
  const response = await request<{
    success: true;
    data: {
      totalInvoices: number;
      summary: {
        autoMatched: number;
        manualReview: number;
        unmatched: number;
        partialPayments: number;
        multiTransactionMatches: number;
        exceptions: number;
      };
      runId: string | null;
      sessionId: string;
      results: ReconciliationResult[];
      weights?: Record<string, number>;
    };
  }>(`/api/reconciliation/${encodeURIComponent(sessionId)}/run`, { method: "POST" });

  if (!response.data || !Array.isArray(response.data.results)) {
    throw new Error("INVALID_RECONCILIATION_RESULT: Reconciliation response is malformed.");
  }

  return response;
}

export async function getInvoiceReconciliation(invoiceId: string) {
  return request<{
    success: true;
    data: {
      invoice: Record<string, unknown>;
      match: (ReconciliationResult & { matchId: number; status: string }) | null;
      transaction: ReconciliationResult["transaction"] | null;
      weights: Record<string, number>;
      exceptions: Array<{ id: number; type: string; severity: string; description: string; transactionId?: number; createdAt: string; resolvedAt?: string }>;
      document: { documentId: string; filename: string } | null;
    };
  }>(`/api/reconciliation/invoice/${encodeURIComponent(invoiceId)}`, { method: "GET" });
}

export async function getDocumentView(documentId: string) {
  return request<{ success: true; data: { documentId: string; filename: string; mimeType: string; url: string } }>(
    `/api/documents/${encodeURIComponent(documentId)}/view`,
    { method: "GET" },
  );
}

export async function getReports() {
  return request<{
    success: true;
    data: { overview: ReportOverview; invoices: { items: InvoiceReport[] } };
  }>("/api/reports");
}

export async function getExceptions(sessionId: string) {
  return request<{
    success: true;
    data: { items: Array<{ id: number; exception_type: string; severity: string; description: string; created_at: string; invoice_id?: number; transaction_id?: number }> };
  }>(`/api/reconciliation/${encodeURIComponent(sessionId)}/exceptions`, { method: "GET" });
}

export async function askInvoice(invoiceId: string, question: string, conversationId?: string) {
  return request<{
    success: true;
    answer: string;
    answerType?: "DETERMINISTIC" | "AI_EXPLANATION" | "RAG_GROUNDED";
    grounded?: boolean;
    facts?: Record<string, unknown>;
    reconciliation?: Record<string, unknown> | null;
    limitations?: string[];
    sources?: SourceCitation[];
    conversationId?: string;
  }>(`/api/ai/invoice/${encodeURIComponent(invoiceId)}/question`, {
    method: "POST",
    body: JSON.stringify({ question, conversationId }),
  });
}

export async function uploadQaInvoice(invoice: File) {
  const body = new FormData();
  body.append("invoice", invoice);
  return request<{ success: true; data: { sessionId: string; document_id: string; invoice_id: string; processing_status: string } }>("/api/ai/invoices/upload", { method: "POST", body });
}

export async function getInvoices() {
  return request<{ success: true; data: { items: InvoiceReport[] } }>("/api/reports/invoices");
}

export type HistoryRun = {
  run_id: string;
  session_id: string;
  version: number;
  created_at: string;
  total_invoices: number;
  auto_matched: number;
  manual_review: number;
  unmatched: number;
  exceptions: number;
  match_rate: number;
  average_confidence: number;
  processing_time_ms?: number | null;
};

export type HistoricalRun = {
  run: { runId: string; sessionId: string | number; version: number; status: string; createdAt: string; completedAt?: string; processingTimeMs?: number; averageProcessingTimeMs?: number; averageConfidence: number; matchRate: number };
  summary: { totalInvoices: number; autoMatched: number; manualReview: number; unmatched: number; exceptions: number };
  weights: Record<string, number>;
  thresholds: Record<string, number>;
  results: Array<ReconciliationResult & { matchId: number; invoice: Record<string, unknown>; status: string; amountDifferencePercent?: string; } >;
  exceptions: Array<{ exceptionId: number; type: string; severity: string; description: string; invoiceId?: string; transactionId?: string; createdAt: string; resolvedAt?: string }>;
};

export async function getReconciliationHistory(params: { page?: number; limit?: number; from?: string; to?: string; status?: string } = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value != null && value !== "") query.set(key, String(value)); });
  const response = await request<{ success: true; data: { runs: HistoryRun[]; page: number; limit: number } }>(`/api/reconciliation/history${query.toString() ? `?${query}` : ""}`);
  if (!response.data || !Array.isArray(response.data.runs)) {
    throw new Error("History response is malformed: runs were not returned by the backend.");
  }
  return response;
}

export async function getHistoricalRun(runId: string) {
  return request<{ success: true; data: HistoricalRun }>(`/api/reconciliation/history/${encodeURIComponent(runId)}`);
}

export async function recheckHistoricalRun(runId: string) {
  return request<{ success: true; data: { runId: string; sessionId: string; summary: HistoricalRun["summary"] } }>(`/api/reconciliation/history/${encodeURIComponent(runId)}/recheck`, { method: "POST" });
}

export async function getSessionHistory(sessionId: string) {
  return request<{ success: true; data: { sessionId: string; runs: Array<{ runId: string; version: number; createdAt: string; matchRate: number; averageConfidence: number } & HistoricalRun["summary"]> } }>(`/api/reconciliation/${encodeURIComponent(sessionId)}/history`);
}

export async function compareHistoricalRuns(from: string, to: string) {
  return request<{ success: true; data: { from: HistoricalRun["run"]; to: HistoricalRun["run"]; summary: { from: HistoricalRun["summary"]; to: HistoricalRun["summary"] }; changed: Array<{ invoiceId: string; from: string | null; to: string }> } }>(`/api/reconciliation/history/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}
