import requests
import pytest
from unittest.mock import Mock, patch

from services.ocr_service import (
    OcrServiceError,
    _call_ocr_space,
    _call_paddle_ocr,
    _download_cloudinary_document,
    score_semantic_similarity,
)


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
