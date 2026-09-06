# LedgerAI — AI Finance Controller

> **Reconcile records. Investigate anomalies. Validate taxes. Forecast cash. Ask your financial data anything.**

LedgerAI is an AI-assisted finance operations platform designed to automate invoice reconciliation, detect payment anomalies, validate invoice taxes, forecast future cash inflows, and answer invoice-related financial questions.

Instead of manually checking invoices against bank transactions one by one, LedgerAI converts uploaded financial documents into structured data, runs an explainable reconciliation engine, identifies exceptions, and gives finance teams a clear view of what matched, what failed, and what needs human review.

---

## Project Overview

Finance teams often spend a large amount of time manually:

- comparing invoices with bank statements
- finding missing transactions
- checking amount mismatches
- tracking partial payments
- validating invoice totals and taxes
- reviewing doubtful matches
- estimating future receivables

LedgerAI brings these workflows together into one finance-control system.

The platform supports both:

- **Single Reconciliation** — one invoice against one bank statement
- **Batch Reconciliation** — up to 100 invoices against a bank statement in a single workflow

The system combines deterministic financial logic with AI only where AI adds value.

> Financial matching and arithmetic are deterministic.  
> AI is mainly used for explanations, semantic understanding, and grounded Q&A.

---

# Screenshots

> Create a folder named `docs/screenshots/` in the repository and place the screenshots there using the filenames below.

## Dashboard

<img width="1891" height="967" alt="image" src="https://github.com/user-attachments/assets/ef1ae6e1-bc30-4b45-a5d3-a8366460e72b" />


The main dashboard provides access to the Reconciliation Agent and Finance Q&A Agent.

---

## Batch Reconciliation

<img width="1897" height="967" alt="image" src="https://github.com/user-attachments/assets/a81504a0-a3a1-4fa0-89f4-6e13c2c555b2" />


Batch mode allows users to upload up to 100 invoices and compare them against a bank statement.

---

## Reconciliation History

<img width="1905" height="963" alt="image" src="https://github.com/user-attachments/assets/f80ea4ae-cc05-4518-a389-b6f18beb7b4e" />


Every reconciliation run is persisted so previous runs can be reopened, rechecked, and compared.

---

## Finance Q&A Agent

<img width="1900" height="968" alt="image" src="https://github.com/user-attachments/assets/467b534f-0bc7-4e00-b02a-daa7c217f5b9" />


The Q&A Agent allows users to ask natural-language questions about a selected invoice.

---

## Forward Cash Forecast

<img width="1897" height="967" alt="image" src="https://github.com/user-attachments/assets/89bfd6b8-a374-4f59-a660-9a5b76c62758" />


The forecast engine estimates future cash inflows using invoice due dates, outstanding amounts, and historical customer payment behavior.

---

# Core Objectives

### 1. Automate Invoice Reconciliation

Automatically compare invoices with bank transactions and identify:

- successful matches
- amount mismatches
- missing transactions
- partial payments
- multi-payment invoices
- possible duplicates
- low-confidence matches

---

### 2. Make Financial Decisions Explainable

Instead of returning only `Matched` or `Unmatched`, LedgerAI provides:

- confidence score
- amount score
- reference score
- customer-name score
- date score
- best candidate
- mismatch reason
- generated exceptions

This makes every reconciliation decision easier to inspect and audit.

---

### 3. Provide Smarter Financial Insights

Beyond reconciliation, LedgerAI provides:

- cash-flow forecasting
- tax validation
- invoice Q&A
- customer payment behavior
- reconciliation history
- benchmark evaluation
- manual review workflows

---
## Major Features

### 1. Single & Batch Reconciliation
- Supports single invoice reconciliation and batch reconciliation with up to 100 invoices.
- Compares invoices with bank transactions automatically.
- Classifies results as `AUTO_MATCH`, `MANUAL_REVIEW`, or `UNMATCHED`.
- Supports progress tracking, duplicate-file filtering, and persisted batch results.

### 2. Intelligent Reconciliation Engine
- Uses amount, reference, customer name, transaction date, and semantic similarity for matching.
- Uses Levenshtein Distance, Jaro-Winkler similarity, text normalization, and Hugging Face `intfloat/e5-small-v2` embeddings.
- Generates confidence scores for each candidate.
- Supports partial payments, multi-payment matching, and transaction-reuse protection.

### 3. Exception Detection & Manual Review
- Detects issues such as `AMOUNT_MISMATCH`, `NO_TRANSACTION_FOUND`, `LOW_CONFIDENCE_MATCH`, `REFERENCE_MISMATCH`, and `POSSIBLE_DUPLICATE_PAYMENT`.
- Shows best candidate, confidence score, score breakdown, and mismatch reason.
- Allows users to approve or reject uncertain matches.
- Supports review notes and audit logging.

### 4. Tax-Line Matcher & GST Validation
- Validates subtotal, taxable amount, shipping, discounts, tax, and grand total using deterministic calculations.
- Detects GST structures such as CGST, SGST, IGST, and CESS when present.
- Identifies tax arithmetic mismatches and invalid GST structures.
- Keeps generic tax separate from GST-specific validation.

### 5. Finance Q&A Agent with RAG
- Allows users to ask natural-language questions about invoices, reconciliation, tax, and payment status.
- Uses PostgreSQL facts and deterministic calculations before AI-generated explanations.
- Uses Retrieval-Augmented Generation for tax and regulatory guidance.
- Grounds responses using trusted sources such as CBIC, GST Portal, and official e-Invoice resources.

### 6. Forward Cash Forecasting
- Predicts expected cash inflows using invoice due dates, outstanding amounts, and historical payment behavior.
- Shows expected cash, at-risk amount, overdue amount, and total outstanding.
- Supports 7-day, 30-day, 60-day, and beyond-60-day forecast horizons.
- Separates INR, USD, and EUR values instead of combining currencies.

### 7. History, Versioning & Run Comparison
- Stores every reconciliation run in PostgreSQL.
- Supports both `SINGLE` and `BATCH` run history.
- Recheck creates a new version instead of overwriting previous results.
- Allows comparison of match status, confidence, exceptions, processing time, and throughput between versions.

### 8. Ground-Truth Benchmark & Performance Evaluation
- Includes a synthetic benchmark with 50 invoices and 68 bank transactions.
- Tests clean matches, mismatches, partial payments, multi-payment cases, duplicates, and missing transactions.
- Evaluates Precision, Recall, F1 Score, Overall Correctness, Match Coverage, and Average Confidence.
- Latest benchmark achieved **91.67% Precision, 91.67% Recall, 91.67% F1 Score, and 51.44 invoices/sec reconciliation throughput**.
