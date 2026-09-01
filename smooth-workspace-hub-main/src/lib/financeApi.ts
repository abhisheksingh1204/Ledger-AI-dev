const API_BASE_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:5000").replace(
  /\/$/,
  "",
);
const USER_ID = import.meta.env.VITE_USER_ID || "demo-user";

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string; code?: string };
  [key: string]: unknown;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-user-id", USER_ID);
  if (init.body && !(init.body instanceof FormData))
    headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error("Finance Controller API is unavailable. Start the backend and try again.");
  }

  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error?.message || `Request failed with status ${response.status}.`);
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
  scores?: { amount: number; reference: number; name: number; date: number; confidence: number };
  amountDifference?: string;
  warnings?: Array<{ type: string; severity?: string; [key: string]: unknown }>;
};

export type ReportOverview = {
  reconciliation: Record<string, number | string>;
  financial: Record<string, number | string>;
  exceptions: Record<string, { count: number; amount?: string }>;
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
  return request<{
    success: true;
    data: {
      totalInvoices: number;
      autoMatched: number;
      manualReview: number;
      unmatched: number;
      results: ReconciliationResult[];
    };
  }>(`/api/reconciliation/${encodeURIComponent(sessionId)}/run`, { method: "POST" });
}

export async function getReports() {
  return request<{
    success: true;
    data: { overview: ReportOverview; invoices: { items: Array<Record<string, unknown>> } };
  }>("/api/reports");
}

export async function askInvoice(invoiceId: string, question: string, conversationId?: string) {
  return request<{
    success: true;
    answer: string;
    citations?: Array<Record<string, unknown>>;
    conversationId?: string;
  }>(`/api/ai/invoice/${encodeURIComponent(invoiceId)}/question`, {
    method: "POST",
    body: JSON.stringify({ question, conversationId }),
  });
}

export async function getInvoices() {
  return request<{ success: true; data: { items: Array<Record<string, unknown>> } }>(
    "/api/reports/invoices",
  );
}
