# Smaran Pipecat SDK

Memory-enhanced conversational AI pipelines with [Smaran](https://github.com/Ayushpani/smaran) and [Pipecat](https://github.com/pipecat-ai/pipecat).

## Installation

```bash
pip install smaran-pipecat
```

## Quick Start

```python
import os
from pipecat.pipeline.pipeline import Pipeline
from smaran_pipecat import SmaranPipecatService

# Create memory service
memory = SmaranPipecatService(
    api_key=os.getenv("SMARAN_API_KEY"),
    base_url=os.getenv("SMARAN_URL"),
    user_id="user-123",
    session_id="conversation-456",  # Optional: groups saved memories by session
)

# Add to Pipecat pipeline
pipeline = Pipeline([
    transport.input(),
    stt,
    context_aggregator.user(),
    memory,  # Automatically recalls and injects relevant memories
    llm,
    transport.output(),
    context_aggregator.assistant(),
])
```

## Configuration

### Parameters

| Parameter    | Type        | Required | Description                                         |
| ------------ | ----------- | -------- | --------------------------------------------------- |
| `user_id`    | str         | **Yes**  | User identifier memories are scoped to              |
| `session_id` | str         | No       | Session/conversation ID for grouping saved memories |
| `api_key`    | str         | No       | Smaran API key (or set `SMARAN_API_KEY` env var)    |
| `base_url`   | str         | No       | Smaran API base URL (or set `SMARAN_URL` env var)   |
| `params`     | InputParams | No       | Advanced configuration                              |

### Advanced Configuration

```python
from smaran_pipecat import SmaranPipecatService

memory = SmaranPipecatService(
    user_id="user-123",
    session_id="conv-456",
    params=SmaranPipecatService.InputParams(
        search_limit=5,             # Max memories to recall per turn
        system_prompt="Based on previous conversations, I recall:\n\n",
        inject_mode="auto",         # "auto", "system", or "user"
        save_memory=True,           # Save new memories after each turn
    ),
)
```

## How It Works

1. **Intercepts context frames** — listens for `LLMContextFrame` in the pipeline
2. **Recalls memories** — queries Smaran's `/v1/recall` API with the user's latest message
3. **Injects memories** — formats recalled facts and adds them to the LLM context
4. **Saves messages** — sends new user/assistant turns to Smaran's `/v1/memories` API in the background, non-blocking

## Full Example

```python
import asyncio
import os
from fastapi import FastAPI, WebSocket
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.pipeline.runner import PipelineRunner
from pipecat.processors.aggregators.llm_context import LLMContext, LLMContextAggregatorPair
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketTransport,
    FastAPIWebsocketParams,
)
from smaran_pipecat import SmaranPipecatService

app = FastAPI()

@app.websocket("/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(audio_in_enabled=True, audio_out_enabled=True),
    )

    context = LLMContext([{"role": "system", "content": "You are a helpful assistant."}])
    context_aggregator = LLMContextAggregatorPair(context)

    memory = SmaranPipecatService(
        user_id="alice",
        session_id="session-123",
    )

    pipeline = Pipeline([
        transport.input(),
        context_aggregator.user(),
        memory,
        llm,
        transport.output(),
        context_aggregator.assistant(),
    ])

    runner = PipelineRunner()
    task = PipelineTask(pipeline)
    await runner.run(task)
```

Check [Pipecat's own docs](https://docs.pipecat.ai/) for the current LLM
service and context-aggregator setup for your provider — that surface moves
fast between Pipecat versions.

## License

MIT
