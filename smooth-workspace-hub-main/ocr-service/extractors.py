from __future__ import annotations

import re
from typing import Any, Optional

from utils import (
    clean_name,
    detect_currency,
    deterministic_id,
    extract_first_label_value,
    extract_following_line_value,
    find_date_in_text,
    maybe_extract_money_after_label,
    normalize_money,
    split_lines,
)


INVOICE_LABELS = {
    "invoice_number": [
        re.compile(r"(?:invoice\s*(?:no\.?|number|#)|inv\s*(?:no\.?|number|#)|bill\s*(?:no\.?|number|#)|tax\s*invoice\s*(?:no\.?|number|#))\s*[:#\-]?\s*(?P<value>[A-Z0-9/\-_.]+)", re.I),
        re.compile(r"\binvoice\s*[:\-]?\s*(?P<value>[A-Z0-9/\-_.]+)\b", re.I),
    ],
    "payment_reference": [
        re.compile(r"(?:payment\s*reference|reference\s*no\.?|ref\s*no\.?|utr|txn\s*id|transaction\s*id)\s*[:#\-]?\s*(?P<value>[A-Z0-9/\-_.]+)", re.I),
    ],
}


DATE_LABELS = {
    "invoice_date": [
        re.compile(r"(?:invoice\s*date|dated)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
    "due_date": [
        re.compile(r"(?:due\s*date|payment\s*due)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
}


BANK_TXN_ROW_PATTERNS = [
    re.compile(
        r"^(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|\w+\s+\d{1,2},?\s+\d{2,4})\s+(?P<body>.+)$"
    ),
]


def extract_invoice_from_text(raw_text: str) -> dict[str, Any]:
    lines = split_lines(raw_text)
    invoice_number = extract_first_label_value(lines, INVOICE_LABELS["invoice_number"])
    payment_reference = extract_first_label_value(lines, INVOICE_LABELS["payment_reference"])

    invoice_date = None
    due_date = None
    for line in lines:
        for pattern in DATE_LABELS["invoice_date"]:
            match = pattern.search(line)
            if match:
                invoice_date = find_date_in_text(match.group("value"))
                if invoice_date:
                    break
        if invoice_date:
            break

    for line in lines:
        for pattern in DATE_LABELS["due_date"]:
            match = pattern.search(line)
            if match:
                due_date = find_date_in_text(match.group("value"))
                if due_date:
                    break
        if due_date:
            break

    subtotal = maybe_extract_money_after_label(
        lines, ["subtotal", "sub total", "amount before tax"]
    )
    tax_amount = maybe_extract_money_after_label(lines, ["gst", "tax", "vat", "igst", "cgst", "sgst"])
    total_amount = maybe_extract_money_after_label(
        lines, ["grand total", "total amount", "invoice total", "amount due", "amount payable", "total"]
    )

    if not total_amount:
        for line in reversed(lines[:12]):
            amount = normalize_money(line)
            if amount:
                total_amount = amount
                break

    currency = detect_currency(raw_text)

    customer_name = extract_first_label_value(
        lines,
        [
            re.compile(r"(?:bill(?:ed)?\s*to|customer|buyer|sold\s*to|ship\s*to)\s*[:\-]?\s*(?P<value>.+)$", re.I)
        ],
    ) or extract_following_line_value(lines, ["bill to", "billed to", "customer", "buyer"])

    seller_name = extract_first_label_value(
        lines,
        [
            re.compile(r"(?:sold\s*by|vendor|supplier|from|bill(?:ed)?\s*from)\s*[:\-]?\s*(?P<value>.+)$", re.I)
        ],
    ) or extract_following_line_value(lines, ["sold by", "vendor", "supplier", "bill from", "billed from"])

    if not invoice_number:
        # Fallback: scan top lines for codes like INV-1001.
        for line in lines[:12]:
            match = re.search(r"\b(?:inv|invoice|bill)[\s#:\-]*([A-Z0-9/\-_.]+)\b", line, re.I)
            if match:
                invoice_number = match.group(1)
                break

    if not payment_reference:
        for line in lines:
            match = re.search(r"\b(?:utr|ref|txn|reference)[\s#:\-]*([A-Z0-9/\-_.]+)\b", line, re.I)
            if match:
                payment_reference = match.group(1)
                break

    warnings = []
    if not invoice_number:
        warnings.append("Invoice number not confidently detected.")
    if not total_amount:
        warnings.append("Invoice total amount not confidently detected.")

    return {
        "schema_version": "1.0",
        "document_type": "INVOICE",
        "ocr": {},
        "invoice": {
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "due_date": due_date,
            "customer_name": clean_name(customer_name) if customer_name else None,
            "seller_name": clean_name(seller_name) if seller_name else None,
            "currency": currency,
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "payment_reference": payment_reference,
        },
        "warnings": warnings,
    }


def _parse_transaction_line(line: str, document_id: str, index: int) -> Optional[dict[str, Any]]:
    match = BANK_TXN_ROW_PATTERNS[0].match(line)
    if not match:
        return None

    date_value = find_date_in_text(match.group("date"))
    if not date_value:
        return None

    body = match.group("body")
    amount_matches = list(re.finditer(r"(?<!\d)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(?!\d)", body))
    if len(amount_matches) < 1:
        return None

    balance = normalize_money(amount_matches[-1].group(0))
    pre_balance = amount_matches[-2].group(0) if len(amount_matches) >= 2 else None
    primary_amount = normalize_money(pre_balance or amount_matches[-1].group(0))

    tail_text = body[: amount_matches[-2].start()] if len(amount_matches) >= 2 else body[: amount_matches[-1].start()]
    description = clean_name(re.sub(r"\s{2,}", " ", tail_text)) if tail_text else None

    reference_match = re.search(
        r"\b(?:(?:utr|ref|txn|transaction|neft|imps|rtgs|upi)\s*[:#\-]?\s*[A-Z0-9/\-_.]+)\b",
        body,
        re.I,
    )
    reference = None
    if reference_match:
        reference = clean_name(reference_match.group(0))
    elif description:
        ref_candidate = re.search(r"\b([A-Z0-9]{6,})\b", description)
        if ref_candidate and any(tag in description.upper() for tag in ["UTR", "REF", "TXN", "NEFT", "IMPS", "RTGS", "UPI"]):
            reference = ref_candidate.group(1)

    direction = None
    debit = None
    credit = None

    lower = body.lower()
    if any(keyword in lower for keyword in ["debit", "withdrawal", "withdrawn", "dr"]):
        direction = "DEBIT"
        debit = primary_amount
    elif any(keyword in lower for keyword in ["credit", "deposit", "cr"]):
        direction = "CREDIT"
        credit = primary_amount
    else:
        # Heuristic: if a second amount exists before balance, treat it as the transaction amount.
        if len(amount_matches) >= 2:
            direction = "DEBIT" if "debit" in lower or "withdrawal" in lower else "CREDIT"
            if direction == "DEBIT":
                debit = primary_amount
            else:
                credit = primary_amount
        else:
            direction = "CREDIT" if "cr" in lower else "DEBIT"
            if direction == "CREDIT":
                credit = primary_amount
            else:
                debit = primary_amount

    amount = credit or debit or primary_amount
    transaction_id = deterministic_id(
        "BTX",
        document_id,
        str(index),
        date_value or "",
        description or "",
        reference or "",
        amount or "",
    )

    return {
        "transaction_id": transaction_id,
        "transaction_date": date_value,
        "description": description,
        "reference": reference,
        "direction": direction,
        "amount": amount,
        "debit": debit,
        "credit": credit,
        "balance": balance,
    }


def extract_bank_statement_from_text(raw_text: str, document_id: str) -> dict[str, Any]:
    lines = split_lines(raw_text)

    bank_name = extract_first_label_value(
        lines,
        [re.compile(r"(?:bank\s*name|branch)\s*[:\-]?\s*(?P<value>.+)$", re.I)],
    )
    if not bank_name:
        for line in lines[:8]:
            if "bank" in line.lower() and len(line) > 5:
                bank_name = clean_name(line)
                break

    account_holder = extract_first_label_value(
        lines,
        [re.compile(r"(?:account\s*holder|account\s*name|a/c\s*name|name\s*of\s*account\s*holder)\s*[:\-]?\s*(?P<value>.+)$", re.I)],
    ) or extract_following_line_value(
        lines, ["account holder", "account name", "a/c name", "name of account holder"]
    )

    masked_account_number = extract_first_label_value(
        lines,
        [re.compile(r"(?:account\s*(?:no\.?|number)|a/c\s*(?:no\.?|number))\s*[:\-]?\s*(?P<value>[\dXx\- ]{6,})", re.I)],
    )

    statement_period = None
    for line in lines:
        match = re.search(r"(?:statement\s*period|period\s*from|from)\s*[:\-]?\s*(.+?\bto\b.+)", line, re.I)
        if match:
            statement_period = clean_name(match.group(1))
            break

    opening_balance = maybe_extract_money_after_label(lines, ["opening balance", "opening bal"])
    closing_balance = maybe_extract_money_after_label(lines, ["closing balance", "closing bal", "ending balance"])
    currency = detect_currency(raw_text)

    transaction_lines = []
    for index, line in enumerate(lines):
        parsed = _parse_transaction_line(line, document_id=document_id, index=index)
        if parsed:
            transaction_lines.append(parsed)

    warnings = []
    if not transaction_lines:
        warnings.append("No bank statement transactions were confidently detected.")

    return {
        "schema_version": "1.0",
        "document_type": "BANK_STATEMENT",
        "ocr": {},
        "bank_statement": {
            "bank_name": clean_name(bank_name) if bank_name else None,
            "account_holder": clean_name(account_holder) if account_holder else None,
            "masked_account_number": masked_account_number,
            "statement_period": statement_period,
            "currency": currency,
            "opening_balance": opening_balance,
            "closing_balance": closing_balance,
            "transactions": transaction_lines,
        },
        "warnings": warnings,
    }
