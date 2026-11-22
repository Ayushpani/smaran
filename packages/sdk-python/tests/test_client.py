from unittest.mock import AsyncMock, patch

import pytest

from smaran import Smaran, SmaranAPIError, SmaranConfigurationError


def test_requires_api_key(monkeypatch):
    monkeypatch.delenv("SMARAN_API_KEY", raising=False)
    with pytest.raises(SmaranConfigurationError):
        Smaran(base_url="https://example.com")


def test_requires_base_url(monkeypatch):
    monkeypatch.delenv("SMARAN_URL", raising=False)
    with pytest.raises(SmaranConfigurationError):
        Smaran(api_key="sk_test")


def _fake_response(status_code: int, json_body: dict):
    resp = AsyncMock()
    resp.status_code = status_code
    resp.json = lambda: json_body
    resp.text = str(json_body)
    return resp


@pytest.mark.asyncio
async def test_recall_parses_hits_from_nested_memory_field():
    """Regression test: hits nest text at hit['memory']['text'], not hit['text']."""
    client = Smaran(api_key="sk_test", base_url="https://example.com")
    fake = _fake_response(
        200,
        {"hits": [{"memory": {"text": "lives in Powai"}, "score": 0.9, "tier": "cross"}]},
    )
    with patch("httpx.AsyncClient.post", AsyncMock(return_value=fake)):
        hits = await client.recall(query="where do I live?", user_id="u1")

    assert len(hits) == 1
    assert hits[0].text == "lives in Powai"
    assert hits[0].score == 0.9


@pytest.mark.asyncio
async def test_recall_empty_query_short_circuits_without_a_request():
    client = Smaran(api_key="sk_test", base_url="https://example.com")
    with patch("httpx.AsyncClient.post", AsyncMock()) as mock_post:
        hits = await client.recall(query="   ", user_id="u1")
    assert hits == []
    mock_post.assert_not_called()


@pytest.mark.asyncio
async def test_recall_raises_on_api_error():
    client = Smaran(api_key="sk_test", base_url="https://example.com")
    fake = _fake_response(500, {"error": "internal"})
    with patch("httpx.AsyncClient.post", AsyncMock(return_value=fake)):
        with pytest.raises(SmaranAPIError):
            await client.recall(query="hello", user_id="u1")


@pytest.mark.asyncio
async def test_save_returns_false_when_skipped():
    client = Smaran(api_key="sk_test", base_url="https://example.com")
    fake = _fake_response(200, {"memories": [], "skipped": "question-or-tooshort"})
    with patch("httpx.AsyncClient.post", AsyncMock(return_value=fake)):
        saved = await client.save(text="what?", user_id="u1")
    assert saved is False


@pytest.mark.asyncio
async def test_save_returns_true_when_stored():
    client = Smaran(api_key="sk_test", base_url="https://example.com")
    fake = _fake_response(200, {"memories": [{"id": "mem_1"}]})
    with patch("httpx.AsyncClient.post", AsyncMock(return_value=fake)):
        saved = await client.save(text="my birthday is March 14", user_id="u1")
    assert saved is True


@pytest.mark.asyncio
async def test_retries_transient_errors_then_succeeds():
    responses = [_fake_response(503, {}), _fake_response(200, {"hits": []})]
    smaran = Smaran(api_key="sk_test", base_url="https://example.com", max_retries=2)
    with patch("httpx.AsyncClient.post", AsyncMock(side_effect=responses)) as mock_post:
        assert await smaran.recall("q", user_id="u") == []
    assert mock_post.call_count == 2
    await smaran.aclose()


@pytest.mark.asyncio
async def test_does_not_retry_client_errors():
    smaran = Smaran(api_key="sk_test", base_url="https://example.com", max_retries=2)
    with patch("httpx.AsyncClient.post", AsyncMock(return_value=_fake_response(400, {}))) as mock_post:
        with pytest.raises(SmaranAPIError):
            await smaran.recall("q", user_id="u")
    assert mock_post.call_count == 1
    await smaran.aclose()
