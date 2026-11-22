# smaran

Python client for [Smaran](https://github.com/Ayushpani/smaran) — self-hosted,
voice-native memory infrastructure for AI agents.

## Installation

```bash
pip install smaran
```

## Quick start

```python
import os
from smaran import Smaran

memory = Smaran(
    api_key=os.getenv("SMARAN_API_KEY"),
    base_url=os.getenv("SMARAN_URL"),  # your self-hosted or managed Smaran API
)

# Recall relevant facts before generating a reply
hits = await memory.recall(query="what's my phone number?", user_id="user-123")
for hit in hits:
    print(hit.text, hit.score)

# Save a new fact after the turn
await memory.save(text="my phone number is 98765 43211", user_id="user-123")
```

This is the low-level client. Most users want one of the framework/platform
integrations built on top of it instead of calling this directly:

| Package                                               | For                                        |
| ----------------------------------------------------- | ------------------------------------------ |
| [`smaran-pipecat`](../pipecat-sdk-python)             | Pipecat voice AI pipelines                 |
| [`smaran-cartesia`](../cartesia-sdk-python)           | Cartesia Line voice agents                 |
| [`smaran-openai-sdk`](../openai-sdk-python)           | OpenAI function calling / chat completions |
| [`smaran-agent-framework`](../agent-framework-python) | Microsoft Agent Framework                  |

## Configuration

Both `api_key` and `base_url` can be passed explicitly or read from the
environment:

```bash
export SMARAN_API_KEY="sk_..."
export SMARAN_URL="https://your-smaran-deployment.example.com"
```

## License

MIT
