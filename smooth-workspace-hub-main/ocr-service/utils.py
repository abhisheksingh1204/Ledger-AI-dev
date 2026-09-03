from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from hashlib import sha256
import re
from typing import Iterable, Optional

from dateutil import parser as date_parser


DATE_PATTERNS = [
    re.compile(
        r"\b(?P<date>\d{4}-\d{2}-\d{2})\b"
    ),
    re.compile(
        r"\b(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b"
    ),
    re.compile(
        r"\b(?P<date>\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b"
    ),
    re.compile(
        r"\b(?P<date>[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4})\b"
    ),
]

MONEY_TOKEN_PATTERN = re.compile(
    r"(?P<currency>INR|USD|EUR|GBP|Rs\.?|₹|\$)?\s*(?P<value>\(?-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\(?-?\d+(?:\.\d{1,2})?\)?)"
)

LABEL_PATTERNS = {
    "invoice_number": [
        re.compile(r"(?:invoice\s*(?:no\.?|number|#)|inv\s*(?:no\.?|number|#)|bill\s*(?:no\.?|number|#)|tax\s*invoice\s*(?:no\.?|number|#))\s*[:#\-]?\s*(?P<value>[A-Z0-9/\-_.]+)", re.I),
    ],
    "invoice_date": [
        re.compile(r"(?:invoice\s*date|date)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
    "due_date": [
        re.compile(r"(?:due\s*date|payment\s*due)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
    "payment_reference": [
        re.compile(r"(?:payment\s*reference|reference\s*no\.?|ref\s*no\.?|utr|txn\s*id|transaction\s*id)\s*[:#\-]?\s*(?P<value>[A-Z0-9/\-_.]+)", re.I),
    ],
    "subtotal": [
        re.compile(r"(?:sub\s*total|subtotal|amount\s*before\s*tax)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
    "tax_amount": [
        re.compile(r"(?:tax|gst|vat|igst|cgst|sgst)\s*(?:amount)?\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
    "total_amount": [
        re.compile(r"(?:grand\s*total|total\s*amount|invoice\s*total|amount\s*due|amount\s*payable|total)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
    "statement_period": [
        re.compile(r"(?:statement\s*period|period\s*from|from)\s*[:\-]?\s*(?P<value>.+?\bto\b.+)$", re.I),
    ],
    "opening_balance": [
        re.compile(r"(?:opening\s*balance|opening\s*bal)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
    "closing_balance": [
        re.compile(r"(?:closing\s*balance|closing\s*bal|ending\s*balance)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
}

NAME_PATTERNS = {
    "customer_name": [
        re.compile(r"(?:bill(?:ed)?\s*to|customer|buyer|sold\s*to|ship\s*to)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
    "seller_name": [
        re.compile(r"(?:sold\s*by|vendor|supplier|from|bill(?:ed)?\s*from)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
    "account_holder": [
        re.compile(r"(?:account\s*holder|account\s*name|a/c\s*name|name\s*of\s*account\s*holder)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
    "bank_name": [
        re.compile(r"(?:bank\s*name|branch)\s*[:\-]?\s*(?P<value>.+)$", re.I),
    ],
    "masked_account_number": [
        re.compile(r"(?:account\s*(?:no\.?|number)|a/c\s*(?:no\.?|number))\s*[:\-]?\s*(?P<value>[\dXx\- ]{6,})", re.I),
    ],
}


def normalize_whitespace(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\x0c", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_lines(text: str) -> list[str]:
    return [line.strip() for line in normalize_whitespace(text).splitlines() if line.strip()]


def clean_name(value: str) -> Optional[str]:
    if not value:
        return None
    cleaned = re.sub(r"\s{2,}", " ", value).strip(" :-")
    return cleaned or None


def parse_date_value(value: str) -> Optional[str]:
    if not value:
        return None

    candidate = value.strip()
    try:
        parsed = date_parser.parse(candidate, dayfirst=True, fuzzy=True)
        return parsed.date().isoformat()
    except (ValueError, OverflowError):
        return None


def find_date_in_text(value: str) -> Optional[str]:
    if not value:
        return None

    for pattern in DATE_PATTERNS:
        match = pattern.search(value)
        if match:
            parsed = parse_date_value(match.group("date"))
            if parsed:
                return parsed
    return parse_date_value(value)


def normalize_money(value: str | None) -> Optional[str]:
    if value is None:
        return None
    candidate = str(value).strip()
    if not candidate:
        return None

    negative = candidate.startswith("(") and candidate.endswith(")")
    candidate = candidate.strip("()")
    candidate = re.sub(r"(INR|USD|EUR|GBP|Rs\.?|₹|\$)", "", candidate, flags=re.I)
    candidate = candidate.replace(",", "").replace(" ", "")
    candidate = re.sub(r"[^\d.-]", "", candidate)
    if not candidate:
        return None

    try:
        amount = Decimal(candidate)
        if negative:
            amount = -amount
        amount = amount.quantize(Decimal("0.01"))
        return format(amount, "f")
    except InvalidOperation:
        return None


def detect_currency(text: str) -> Optional[str]:
    if not text:
        return None
    upper = text.upper()
    if "₹" in text or " INR " in upper or upper.startswith("INR"):
        return "INR"
    if "$" in text or " USD " in upper or upper.startswith("USD"):
        return "USD"
    if "EUR" in upper:
        return "EUR"
    if "GBP" in upper or "£" in text:
        return "GBP"
    if "RS." in upper or "RS " in upper:
        return "INR"
    return None


def extract_first_label_value(lines: Iterable[str], patterns: list[re.Pattern[str]]) -> Optional[str]:
    for line in lines:
        for pattern in patterns:
            match = pattern.search(line)
            if match:
                value = clean_name(match.group("value"))
                if value:
                    return value
    return None


def extract_following_line_value(lines: list[str], label_candidates: list[str]) -> Optional[str]:
    lowered = [line.lower() for line in lines]
    for index, line in enumerate(lowered):
        if any(label in line for label in label_candidates):
            for offset in range(1, 4):
                if index + offset < len(lines):
                    candidate = clean_name(lines[index + offset])
                    if candidate and not any(ch.isdigit() for ch in candidate[:8]):
                        return candidate
    return None


def parse_amount_from_line(line: str) -> Optional[str]:
    if not line:
        return None
    matches = list(MONEY_TOKEN_PATTERN.finditer(line))
    if not matches:
        return None
    return normalize_money(matches[-1].group(0))


def maybe_extract_money_after_label(lines: list[str], keywords: list[str]) -> Optional[str]:
    for line in lines:
        lowered = line.lower()
        if any(re.search(r"(?<![a-z0-9])" + re.escape(keyword.lower()) + r"(?![a-z0-9])", lowered) for keyword in keywords):
            amount = parse_amount_from_line(line)
            if amount:
                return amount
    return None


def deterministic_id(prefix: str, *parts: str) -> str:
    seed = "|".join(part or "" for part in parts)
    digest = sha256(seed.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"
