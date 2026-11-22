# smaran-cartesia

Memory-enhanced voice agents with [Smaran](https://github.com/Ayushpani/smaran) and [Cartesia Line](https://cartesia.ai/agents).

## Installation

```bash
pip install smaran-cartesia
```

## Quick Start

```python
import os
from line.llm_agent import LlmAgent, LlmConfig
from line.voice_agent_app import VoiceAgentApp
from smaran_cartesia import SmaranCartesiaAgent

async def get_agent(env, call_request):
    user_id = call_request.metadata.get("user_id", "default-user")

    base_agent = LlmAgent(
        model="gemini/gemini-2.5-flash-preview-09-2025",
        config=LlmConfig(
            system_prompt="You are a helpful voice assistant with memory.",
            introduction="Hello! Great to talk with you again!"
        )
    )

    memory_agent = SmaranCartesiaAgent(
        agent=base_agent,
        api_key=os.getenv("SMARAN_API_KEY"),
        base_url=os.getenv("SMARAN_URL"),
        user_id=user_id,
        session_id=call_request.call_id,
    )

    return memory_agent

app = VoiceAgentApp(get_agent=get_agent)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
```

## Configuration

### Parameters

| Parameter    | Type         | Required | Description                                        |
| ------------ | ------------ | -------- | -------------------------------------------------- |
| `agent`      | LlmAgent     | **Yes**  | The Cartesia Line agent to wrap                    |
| `user_id`    | str          | **Yes**  | User identifier memories are scoped to             |
| `session_id` | str          | **Yes**  | Conversation/call ID, used to group saved messages |
| `api_key`    | str          | No       | Smaran API key (or set `SMARAN_API_KEY` env var)   |
| `base_url`   | str          | No       | Smaran API base URL (or set `SMARAN_URL` env var)  |
| `config`     | MemoryConfig | No       | Advanced configuration                             |

### Advanced Configuration

```python
from smaran_cartesia import SmaranCartesiaAgent

memory_agent = SmaranCartesiaAgent(
    agent=base_agent,
    user_id="user-123",
    session_id="conversation-456",
    config=SmaranCartesiaAgent.MemoryConfig(
        search_limit=5,           # Max memories to recall per turn
        system_prompt="Based on previous conversations:\n\n",
        save_memory=True,         # Save new memories after each turn
    ),
)
```

## How It Works

1. **Intercepts events** — listens for `UserTurnEnded` events from Cartesia Line
2. **Recalls memories** — queries Smaran's `/v1/recall` API with the user's message
3. **Enriches context** — injects recalled facts into the agent's system prompt
4. **Saves messages** — sends conversation turns to Smaran's `/v1/memories` API in the background, non-blocking
5. **Passes to agent** — forwards the enriched event to the wrapped `LlmAgent`

## Architecture

Cartesia Line uses an event-driven architecture:

```
User Speaks (Audio)
    ↓
[Ink STT] → Automatic speech recognition
    ↓
UserTurnEnded Event {content: "user message", history: [...]}
    ↓
┌──────────────────────────────────────────────┐
│   SMARAN CARTESIA AGENT (Wrapper)             │
│                                                │
│  process(env, event):                         │
│    1. Intercept UserTurnEnded                 │
│    2. Extract user message                    │
│    3. Recall from Smaran                      │
│    4. Inject recalled memories into prompt    │
│    5. Pass to wrapped LlmAgent                │
│    6. Save conversation (async background)    │
└──────────────────────────────────────────────┘
    ↓
AgentSendText Event {text: "response"}
    ↓
[Sonic TTS] → Ultra-fast speech synthesis
    ↓
Audio Output
```

## Comparison with the Pipecat SDK

| Aspect                  | Pipecat                     | Cartesia Line                  |
| ----------------------- | --------------------------- | ------------------------------ |
| **Integration pattern** | Extends `FrameProcessor`    | Wrapper around `LlmAgent`      |
| **Event handling**      | `process_frame()` method    | `process()` method             |
| **Events**              | `LLMContextFrame`           | `UserTurnEnded`, `CallStarted` |
| **Context object**      | `LLMContext.get_messages()` | `event.history`                |

## Development

```bash
git clone https://github.com/Ayushpani/smaran
cd smaran/packages/cartesia-sdk-python
pip install -e ".[dev]"
pytest
```

## License

MIT
