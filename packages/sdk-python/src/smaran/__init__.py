"""Smaran — voice-native memory infrastructure for AI agents.

Minimal Python client for the Smaran memory API. See
https://github.com/Ayushpani/smaran for the self-hosted API server and
the full list of framework/platform integrations built on this client.
"""

from .client import MemoryHit, Smaran
from .exceptions import (
    SmaranAPIError,
    SmaranConfigurationError,
    SmaranError,
    SmaranNetworkError,
)

__version__ = "0.2.0"

__all__ = [
    "Smaran",
    "MemoryHit",
    "SmaranError",
    "SmaranConfigurationError",
    "SmaranAPIError",
    "SmaranNetworkError",
]
