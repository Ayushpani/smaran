"""Async client for the Smaran memory API.

Covers the full HTTP API: recall, save, forget, streaming voice ingest,
profiles and DPDP/GDPR operations. One pooled HTTP connection is reused
across calls; 429/5xx responses and network errors are retried with
exponential backoff (honouring Retry-After). Every framework/platform integration package in this
repo (smaran-pipecat, smaran-cartesia, smaran-openai, smaran-agent-framework)
depends on this client rather than talking to HTTP directly, so the request
shape only needs to be gotten right in one place.
"""

from __future__ import annotations

import asyncio
import os
import random
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from .exceptions import SmaranAPIError, SmaranConfigurationError, SmaranNetworkError

DEFAULT_TIMEOUT_S = 10.0
DEFAULT_MAX_RETRIES = 2


@dataclass
class MemoryHit:
    """A single recalled memory."""

    text: str
    score: float = 0.0
    tier: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


class Smaran:
    """Async client for the Smaran memory API.

    Args:
        api_key: Smaran API key. Falls back to the ``SMARAN_API_KEY`` env var.
        base_url: Base URL of the Smaran API (self-hosted or managed). Falls
            back to the ``SMARAN_URL`` env var.
        timeout: Per-request timeout in seconds.
        max_retries: Retries for 429 / 5xx / network errors.

    Use as ``async with Smaran(...) as smaran:`` or call ``await aclose()``
    when done to release the connection pool.

    Raises:
        SmaranConfigurationError: If no API key or base URL is available.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_S,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ) -> None:
        self.api_key = api_key or os.getenv("SMARAN_API_KEY")
        if not self.api_key:
            raise SmaranConfigurationError(
                "Smaran API key is required. Pass api_key or set SMARAN_API_KEY."
            )

        resolved_base_url = base_url or os.getenv("SMARAN_URL")
        if not resolved_base_url:
            raise SmaranConfigurationError(
                "Smaran base URL is required. Pass base_url or set SMARAN_URL "
                "(e.g. your self-hosted deployment's URL)."
            )
        self.base_url = resolved_base_url.rstrip("/")
        self._timeout = timeout
        self._max_retries = max_retries
        self._http: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "Smaran":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Close the pooled HTTP connection."""
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    def _client(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(timeout=self._timeout)
        return self._http

    async def _request(
        self,
        method: str,
        path: str,
        what: str,
        json: Optional[dict[str, Any]] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> httpx.Response:
        """One API call with retries. Raises SmaranNetworkError / SmaranAPIError."""
        url = f"{self.base_url}{path}"
        attempt = 0
        while True:
            try:
                send = getattr(self._client(), method)
                kwargs: dict[str, Any] = {"headers": self._headers()}
                if json is not None:
                    kwargs["json"] = json
                if params is not None:
                    kwargs["params"] = params
                resp = await send(url, **kwargs)
            except httpx.HTTPError as e:
                if attempt < self._max_retries:
                    await asyncio.sleep(_backoff(attempt))
                    attempt += 1
                    continue
                raise SmaranNetworkError(f"Smaran {what} request failed", e) from e

            if (resp.status_code == 429 or resp.status_code >= 500) and attempt < self._max_retries:
                retry_after = _retry_after(resp)
                await asyncio.sleep(retry_after if retry_after is not None else _backoff(attempt))
                attempt += 1
                continue
            if resp.status_code >= 400:
                raise SmaranAPIError(
                    f"Smaran {what} failed",
                    status_code=resp.status_code,
                    response_text=resp.text,
                )
            return resp

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def recall(
        self,
        query: str,
        user_id: str,
        session_id: Optional[str] = None,
        top_k: int = 5,
        include_cross_session: bool = True,
        rerank: Optional[bool] = None,
        rerank_pool: Optional[int] = None,
    ) -> list[MemoryHit]:
        """Recall memories relevant to ``query`` for ``user_id``.

        Returns an empty list (never raises) when ``query`` is blank, so
        callers can unconditionally call this before generating a reply.
        """
        if not query or not query.strip():
            return []

        payload: dict[str, Any] = {
            "query": query,
            "userId": user_id,
            "topK": top_k,
            "includeCrossSession": include_cross_session,
        }
        if session_id:
            payload["sessionId"] = session_id
        if rerank is not None:
            payload["rerank"] = rerank
        if rerank_pool is not None:
            payload["rerankPool"] = rerank_pool

        resp = await self._request("post", "/v1/recall", "recall", json=payload)

        data = resp.json()
        hits: list[MemoryHit] = []
        for h in data.get("hits", []):
            memory = h.get("memory") or {}
            text = memory.get("text")
            if text:
                hits.append(
                    MemoryHit(text=text, score=h.get("score", 0.0), tier=h.get("tier", ""), raw=h)
                )
        return hits

    async def save(
        self,
        text: str,
        user_id: str,
        session_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> bool:
        """Save ``text`` as a new memory for ``user_id``.

        Returns whether a memory was actually created — the API silently
        skips near-empty or pure-question turns, which is not an error.
        Never raises for a skip; raises SmaranAPIError/SmaranNetworkError
        for real failures.
        """
        if not text or not text.strip():
            return False

        payload: dict[str, Any] = {"text": text, "userId": user_id}
        if session_id:
            payload["sessionId"] = session_id
        if metadata:
            payload["metadata"] = metadata

        resp = await self._request("post", "/v1/memories", "save", json=payload)

        data = resp.json()
        return bool(data.get("memories"))

    async def forget(self, memory_id: str) -> None:
        """Delete one memory by id."""
        await self._request("delete", f"/v1/memories/{memory_id}", "forget")

    async def ingest_partial(
        self, session_id: str, text: str, user_id: Optional[str] = None
    ) -> dict[str, Any]:
        """Voice: append a partial (streaming) transcript to the session buffer."""
        payload: dict[str, Any] = {"sessionId": session_id, "text": text}
        if user_id:
            payload["userId"] = user_id
        return (await self._request("post", "/v1/ingest/partial", "ingest", json=payload)).json()

    async def ingest_commit(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        text: Optional[str] = None,
    ) -> dict[str, Any]:
        """Voice: finalize the buffered turn (or ``text``) and save it."""
        payload: dict[str, Any] = {"sessionId": session_id}
        if user_id:
            payload["userId"] = user_id
        if text:
            payload["text"] = text
        return (await self._request("post", "/v1/ingest/commit", "commit", json=payload)).json()

    async def profile(self, user_id: str) -> Optional[dict[str, Any]]:
        """Persistent mode: the user's consolidated profile, or None if none yet."""
        try:
            resp = await self._request("get", "/v1/profile", "profile", params={"userId": user_id})
        except SmaranAPIError as e:
            if e.status_code == 404:
                return None
            raise
        return resp.json()

    async def forget_user(self, user_id: str) -> dict[str, Any]:
        """Persistent mode: erase all of a user's memories, sessions and profile."""
        resp = await self._request(
            "post", "/v1/dpdp/right-to-forget", "forget_user", json={"userId": user_id}
        )
        return resp.json()

    async def export_user(self, user_id: str) -> dict[str, Any]:
        """Persistent mode: export everything stored about a user."""
        resp = await self._request("get", "/v1/dpdp/export", "export", params={"userId": user_id})
        return resp.json()

    async def record_consent(
        self,
        user_id: str,
        kind: str,
        granted: bool,
        scope: Optional[str] = None,
    ) -> dict[str, Any]:
        """Persistent mode: append a consent grant/withdrawal (kind: record|process|retain|share)."""
        payload: dict[str, Any] = {"userId": user_id, "kind": kind, "granted": granted}
        if scope:
            payload["scope"] = scope
        return (await self._request("post", "/v1/dpdp/consent", "consent", json=payload)).json()


    async def usage(self) -> dict[str, Any]:
        """Persistent mode: plan, stored-memory count and limits for this account."""
        return (await self._request("get", "/v1/usage", "usage")).json()

    async def list_keys(self) -> list[dict[str, Any]]:
        """Persistent mode: this account's API keys (never the raw key)."""
        return (await self._request("get", "/v1/keys", "list_keys")).json()["keys"]

    async def create_key(self, label: Optional[str] = None) -> dict[str, Any]:
        """Persistent mode: create an API key. ``apiKey`` in the result is shown once."""
        body: dict[str, Any] = {"label": label} if label else {}
        return (await self._request("post", "/v1/keys", "create_key", json=body)).json()

    async def revoke_key(self, key_id: str) -> None:
        """Persistent mode: revoke a key (the last active key can't be revoked)."""
        await self._request("delete", f"/v1/keys/{key_id}", "revoke_key")

    @staticmethod
    async def signup(
        base_url: str,
        name: str,
        email: Optional[str] = None,
        invite: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_S,
    ) -> dict[str, Any]:
        """Create an account on a server with SIGNUP_MODE=open|invite.

        Returns ``tenantId``, ``keyId``, ``apiKey`` (shown once), ``plan`` and
        ``limits``. Pass the key to ``Smaran(api_key=...)``.
        """
        body: dict[str, Any] = {"name": name}
        if email:
            body["email"] = email
        if invite:
            body["invite"] = invite
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(f"{base_url.rstrip('/')}/v1/signup", json=body)
        except httpx.HTTPError as e:
            raise SmaranNetworkError("Smaran signup request failed", e) from e
        if resp.status_code >= 400:
            raise SmaranAPIError(
                "Smaran signup failed", status_code=resp.status_code, response_text=resp.text
            )
        return resp.json()


def _backoff(attempt: int) -> float:
    return min(0.25 * 2**attempt, 4.0) + random.random() * 0.1


def _retry_after(resp: httpx.Response) -> Optional[float]:
    try:
        value = float(resp.headers.get("retry-after", ""))
    except (TypeError, ValueError):
        return None
    return min(value, 30.0) if value > 0 else None
