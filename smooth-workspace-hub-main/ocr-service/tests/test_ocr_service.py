import requests
import pytest
import services.ocr_service as ocr_service
from types import SimpleNamespace
from unittest.mock import Mock, patch

from services.ocr_service import (
    OcrServiceError,
    _call_ocr_space,
    _call_paddle_ocr,
    _download_cloudinary_document,
    _model_cache_status,
    _paddle_init_error,
    _get_paddle_ocr,
    warm_service_models,
    score_semantic_similarity,
)
from extractors import extract_bank_statement_from_text, extract_invoice_from_text


def response(payload, status=200):
    result = Mock(status_code=status, text=str(payload))
    result.json.return_value = payload
    return result


def download_response(content=b"document", status=200, content_type="application/pdf"):
    result = Mock(status_code=status, content=content)
    result.headers = {"content-type": content_type, "content-length": str(len(content))}
    return result


def test_cloudinary_download_uses_signed_url_and_returns_bytes():
    document = {"document_id": "DOC-1", "mime_type": "application/pdf"}
    with patch("services.ocr_service.requests.get", return_value=download_response()) as get:
        assert _download_cloudinary_document(document, "https://signed.internal/url") == b"document"
    get.assert_called_once_with("https://signed.internal/url", timeout=90)


@pytest.mark.parametrize(
    "status,code",
    [(401, "CLOUDINARY_AUTH_ERROR"), (403, "CLOUDINARY_AUTH_ERROR"), (404, "CLOUDINARY_ASSET_NOT_FOUND")],
)
def test_cloudinary_download_classifies_private_asset_errors(status, code):
    document = {"document_id": "DOC-1", "mime_type": "application/pdf"}
    with patch("services.ocr_service.requests.get", return_value=download_response(status=status)):
        with pytest.raises(OcrServiceError) as caught:
            _download_cloudinary_document(document, "https://signed.internal/url")
    assert caught.value.code == code


def test_success():
    with patch('services.ocr_service.requests.post', return_value=response({'ParsedResults': [{'ParsedText': 'Invoice 1'}]})):
        assert _call_ocr_space(b'bytes', 'invoice.png', 'image/png')[0] == 'Invoice 1'


@pytest.mark.parametrize('payload', [
    {'OCRExitCode': 99, 'IsErroredOnProcessing': True, 'ErrorMessage': ['provider failed']},
    {'OCRExitCode': 99, 'IsErroredOnProcessing': True, 'ErrorMessage': 'provider failed', 'ErrorDetails': 'details'},
])
def test_provider_error_preserves_fields(payload):
    with patch('services.ocr_service.requests.post', return_value=response(payload)):
        with pytest.raises(OcrServiceError) as caught:
            _call_ocr_space(b'bytes', 'invoice.png', 'image/png')
    assert caught.value.code == 'OCR_PROVIDER_ERROR'
    assert caught.value.ocr_exit_code == 99
    assert caught.value.message == 'provider failed'


def test_engine_two_falls_back_to_engine_one():
    calls = []
    replies = [
        response({'OCRExitCode': 99, 'IsErroredOnProcessing': True, 'ErrorMessage': ['Image size is too small for OCR Engine 2. Please use Engine 1.']}),
        response({'ParsedResults': [{'ParsedText': 'ok'}]}),
    ]
    def post(*args, **kwargs):
        calls.append(kwargs['data']['OCREngine'])
        return replies.pop(0)
    with patch('services.ocr_service.requests.post', side_effect=post):
        assert _call_ocr_space(b'bytes', 'invoice.png', 'image/png')[0] == 'ok'
    assert calls == ['2', '1']


@pytest.mark.parametrize('exception, code', [
    (requests.Timeout(), 'OCR_API_TIMEOUT'),
])
def test_timeout(exception, code):
    with patch('services.ocr_service.requests.post', side_effect=exception):
        with pytest.raises(OcrServiceError) as caught:
            _call_ocr_space(b'bytes', 'invoice.png', 'image/png')
    assert caught.value.code == code


def test_http_error_and_no_fallback_for_key_or_rate_limit():
    for payload, status, code in [
        ({'ErrorMessage': ['invalid api key']}, 401, 'OCR_API_FAILED'),
        ({'ErrorMessage': ['rate limit exceeded']}, 429, 'OCR_RATE_LIMITED'),
    ]:
        with patch('services.ocr_service.requests.post', return_value=response(payload, status)):
            with pytest.raises(OcrServiceError) as caught:
                _call_ocr_space(b'bytes', 'invoice.png', 'image/png')
        assert caught.value.code == code


def test_paddle_ocr_preserves_page_order_and_raw_text():
    paddle = Mock()
    paddle.predict.return_value = [
        [
            [[[0, 0], [10, 0], [10, 10], [0, 10]], ('Header', 0.99)],
            [[[0, 20], [10, 20], [10, 30], [0, 30]], ('Total 100', 0.98)],
        ]
    ]

    with patch('services.ocr_service._get_paddle_ocr', return_value=paddle), \
        patch('services.ocr_service._render_document_pages', return_value=[(1, b'page-bytes', 'image/png')]), \
        patch('services.ocr_service._image_bytes_to_array', return_value=Mock()):
        raw_text, pages = _call_paddle_ocr(b'bytes', 'invoice.png', 'image/png', document_id='DOC-1')

    assert raw_text == 'Header\nTotal 100'
    assert pages == [{'page_number': 1, 'parsed_text': 'Header\nTotal 100'}]


def test_semantic_similarity_returns_e5_scores():
    model = Mock()
    model.encode.return_value = __import__('numpy').array([
        [1.0, 0.0],
        [0.8, 0.6],
        [0.0, 1.0],
    ])

    with patch('services.ocr_service._load_e5_model', return_value=model):
        result = score_semantic_similarity('ABC Technologies Pvt Ltd', [
            'NEFT PAYMENT ABC TECHNOLOGIES INV1001',
            'random narration',
        ])

    assert result['provider'] == 'e5-small-v2'
    assert result['scores'][0]['semantic_score'] > result['scores'][1]['semantic_score']
    assert result['scores'][0]['passage'] == 'NEFT PAYMENT ABC TECHNOLOGIES INV1001'


def test_bank_settlement_becomes_one_transaction_from_settlement_total():
    extraction = extract_bank_statement_from_text(
        """BANK SETTLEMENT INVOICE
Invoice Ref: INV-2024-008743
Processing Date: 2024-09-18
Customer: Global Retail Inc.
Bank Reference: FSB-2024-445821
Total Amount: $20,315.00
Settlement confirmed""",
        "DOC-SETTLEMENT",
    )
    statement = extraction["bank_statement"]
    assert statement["document_subtype"] == "BANK_SETTLEMENT"
    assert len(statement["transactions"]) == 1
    transaction = statement["transactions"][0]
    assert transaction["transaction_id"] == "FSB-2024-445821"
    assert transaction["transaction_date"] == "2024-09-18"
    assert transaction["amount"] == "20315.00"
    assert "INV-2024-008743" in transaction["description"]


def test_invoice_labels_extract_real_values_without_treating_zip_as_money():
    extraction = extract_invoice_from_text(
        """TechCore Solutions
From: TechCore Solutions
To: Global Retail Inc.
Invoice #: INV-2024-008743
Invoice Date: 2024-09-15
Due Date: 2024-10-15
PO Reference: PO-2024-5521
Address: Los Angeles, CA 90001
Phone: 555-010-9001
Subtotal: $18,300.00
Tax: $1,647.00
Shipping: $150.00
Total: $20,097.00
Currency: USD"""
    )
    invoice = extraction["invoice"]
    assert invoice["invoice_number"] == "INV-2024-008743"
    assert invoice["seller_name"] == "TechCore Solutions"
    assert invoice["customer_name"] == "Global Retail Inc."
    assert invoice["subtotal"] == "18300.00"
    assert invoice["tax_amount"] == "1647.00"
    assert invoice["shipping"] == "150.00"
    assert invoice["total_amount"] == "20097.00"
    assert invoice["currency"] == "USD"
    assert invoice["purchase_order_reference"] == "PO-2024-5521"


def test_invoice_fallback_number_only_used_when_label_is_missing():
    missing = extract_invoice_from_text("Total: $20.00")
    assert missing["invoice"]["invoice_number"] is None


def test_model_cache_status_requires_readable_non_empty_files(tmp_path):
    for filename in ("inference.yml", "inference.json", "inference.pdiparams"):
        (tmp_path / filename).write_bytes(b"model")

    assert _model_cache_status(tmp_path) == "readable"

    (tmp_path / "inference.yml").write_bytes(b"")
    assert _model_cache_status(tmp_path) == "invalid:inference.yml"


def test_paddle_initialization_failure_logs_safe_diagnostics(caplog, tmp_path):
    paths = {"det": tmp_path / "det", "rec": tmp_path / "rec"}
    with caplog.at_level("ERROR", logger="services.ocr_service"):
        error = _paddle_init_error(PermissionError("access denied"), paths)

    assert error.code == "PADDLEOCR_UNAVAILABLE"
    assert "PermissionError" in caplog.text
    assert "access denied" in caplog.text
    assert ocr_service.PADDLE_DET_MODEL_NAME in caplog.text
    assert ocr_service.PADDLE_REC_MODEL_NAME in caplog.text
    assert str(tmp_path) in caplog.text


def test_paddle_model_initializes_only_once(monkeypatch):
    calls = []

    class FakePaddleOcr:
        def __init__(self, **kwargs):
            calls.append(kwargs)

    monkeypatch.setattr(ocr_service, "_PADDLE_OCR_MODEL", None)
    monkeypatch.setattr(ocr_service, "_PADDLE_INIT_ERROR", None)
    fake_paddle = SimpleNamespace(set_device=lambda _: None, set_num_threads=lambda _: None)
    with patch.dict("sys.modules", {"paddleocr": SimpleNamespace(PaddleOCR=FakePaddleOcr), "paddle": fake_paddle}):
        assert _get_paddle_ocr() is _get_paddle_ocr()

    assert len(calls) == 1


def test_e5_readiness_is_independent_of_paddle_failure(monkeypatch):
    monkeypatch.setattr(ocr_service, "_MODEL_READINESS", {"paddleocr": "loading", "e5": "loading"})
    monkeypatch.setattr(ocr_service, "_get_paddle_ocr", Mock(side_effect=ocr_service.OcrServiceError("PADDLEOCR_UNAVAILABLE", "failed", 503)))
    monkeypatch.setattr(ocr_service, "_load_e5_model", Mock(return_value=object()))

    warm_service_models()

    assert ocr_service._MODEL_READINESS == {"paddleocr": "unavailable", "e5": "ready"}
