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
  transactionId?: string;
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
    };
  }>(`/api/reconciliation/${encodeURIComponent(sessionId)}/run`, { method: "POST" });

  if (!response.data || !Array.isArray(response.data.results)) {
    throw new Error("INVALID_RECONCILIATION_RESULT: Reconciliation response is malformed.");
  }

  return response;
}

export async function getReports() {
  return request<{
    success: true;
    data: { overview: ReportOverview; invoices: { items: InvoiceReport[] } };
  }>("/api/reports");
}

export async function askInvoice(invoiceId: string, question: string, conversationId?: string) {
  return request<{
    success: true;
    answer: string;
    sources?: SourceCitation[];
    conversationId?: string;
  }>(`/api/ai/invoice/${encodeURIComponent(invoiceId)}/question`, {
    method: "POST",
    body: JSON.stringify({ question, conversationId }),
  });
}

export async function getInvoices() {
  return request<{ success: true; data: { items: InvoiceReport[] } }>("/api/reports/invoices");
}
