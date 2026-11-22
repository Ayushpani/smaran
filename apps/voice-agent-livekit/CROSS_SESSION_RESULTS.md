# Cross-session voice memory — measured result

**Aggregate: Smaran 25/25 (5 runs) · Plain LLM (no Smaran) 1/15 (3 runs, and that lone "pass" is a false-positive substring match — see below).**

This is a live voice-agent test, not a unit benchmark: a real LiveKit Agents
worker (Gemma 4 31B via LiveKit Inference, AssemblyAI STT, Fish Audio TTS),
driven by scripted text turns over the same TOPIC_CHAT channel a real client
uses. One condition has Smaran wired in via `on_user_turn_completed`; the
other is the exact same agent code with `SMARAN_ENABLED=false` — no other
code path changes between conditions.

## Methodology

1. **Session A** ("telling facts") runs in room `<name>--a`: 6 turns where a
   user states five personal facts (address, phone, pet, preference,
   birthday), then ends the call.
2. The room is fully torn down. A new, unrelated room `<name>--b` is opened —
   this is the part that matters. It is a different LiveKit room / different
   `AgentSession` / different LLM chat context, exactly like a second phone
   call placed an hour later. Nothing about the LLM's own conversation
   history carries over.
3. **Session B** ("recalling facts") asks for the same five facts back, and
   each reply is checked for the expected substring.
4. Each condition was repeated multiple times with fresh room names to avoid
   drawing a conclusion from a single lucky/unlucky run.

Reproduce locally:

```bash
uv run python src/agent.py dev                                     # terminal 1 — leave running
bash src/run_repeated_cross_session.sh <label> <N>                 # terminal 2 — runs N trials, aggregates pass rate
```
Toggle `SMARAN_ENABLED=false` in `.env.local` (or inline) and restart the
worker to reproduce the baseline column. Scripts: `src/session_a.json` /
`src/session_b.json`. Full request/response trace of every recall/save call
is written to `smaran_debug.log` alongside `src/agent.py`. Raw per-run
results land in `repeated_results_<label>/run_N.json`.

---

## Aggregate results

| Condition                     | Runs | Questions | Passed | Pass rate |
| ----------------------------- | ---- | --------- | ------ | --------- |
| **With Smaran**               | 5    | 25        | 25     | **100%**  |
| **Without Smaran (baseline)** | 3    | 15        | 1*     | **~0%***  |

\* The single "pass" in the baseline column was the birthday question, where
the agent said "your birthday is October fourteenth" — the substring checker
matched "fourteen" against the expected `["march", "fourteen"]` list even
though the month is wrong. Every fact in every baseline run was a fabricated,
wrong answer; the loose substring grader just wasn't strict enough to catch
one of them. Treat the real baseline rate as **0/15**.

## Session B — representative run, fresh room, no shared chat history

| Question                                 | Actually told (Session A)        | **With Smaran**                                                             | **Without Smaran**                                                         |
| ---------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| What is my address?                      | Trikutta Towers, Powai, room 913 | ✅ "You live at Trikutta Towers, Powai, room number nine hundred thirteen." | ❌ "Your address is one two three Maple Street."                           |
| What's my phone number?                  | 98765 43211                      | ✅ "Your phone number is nine eight seven six five four three two one one." | ❌ "Your phone number is five five five zero one two three four five six." |
| What's my dog's name and breed?          | Tuffy, Labrador                  | ✅ "Your dog's name is Tuffy, and he's a labrador."                         | ❌ "Your dog's name is Buddy and he's a Golden Retriever."                 |
| What's my favorite programming language? | TypeScript                       | ✅ "Your favorite programming language is TypeScript."                      | ❌ "You've told me that your favorite is Python."                          |
| When's my birthday?                      | March 14th                       | ✅ "Your birthday is March fourteenth."                                     | ❌ "Your birthday is October twelfth."                                     |

**The failure mode without Smaran is the important part.** Across all 3
baseline runs, the agent never once said "I don't know" — it confidently
invented a _different_ wrong fact almost every time (address swung between
"123 Maple Street" and "1242 Maple Street"; phone number was always the same
fabricated "555-012-3456"; the dog became "Buddy the Golden Retriever" in
every run; the language was always "Python"; the birthday guess changed
every time — October 14th, May 12th, October 12th). In a real voice call
this is worse than forgetting: a user has no signal that the agent is
fabricating, and some of the fabrications (like the phone number) were
consistent enough across runs to look deliberate rather than random.

## Session A — establishing the facts (identical prompts, both conditions)

| Turn                                                                         | Agent reply (representative)                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| "hi, my name is Ayush and I live in Trikutta Towers, Powai, room number 913" | "Hi Ayush! It's nice to meet you. Is there something I can help you with today?"                              |
| "my phone number is 98765 43211"                                             | "Got it. I've noted your phone number as nine eight seven six five four three two one one."                   |
| "I have a dog named Tuffy, he's a 4 year old labrador"                       | "Oh, a labrador! Tuffy sounds like a wonderful dog. Does he have a favorite toy or a special treat he loves?" |
| "my favorite programming language is TypeScript"                             | "TypeScript is a great choice. It really helps catch those tricky errors early on."                           |
| "my birthday is March 14th"                                                  | "I've got that down. Your birthday is March fourteenth."                                                      |
| "great, that's all for now, talk soon"                                       | "Sounds good! It was great getting to know you, Ayush. Talk to you soon!"                                     |

## Latency

- **End-to-end per turn (voice pipeline: STT → LLM → TTS), Session B**: ~10–16s with Smaran, ~8–14s without, across all runs. The delta is Smaran's recall+save round trip riding inside the same turn.
- **Smaran's own `/v1/recall` latency, isolated** (`curl` directly against the API, same query/user): **~1.4–2.1s**, dominated by network — this dev environment calls a Supabase Postgres pooler in Tokyo from India. `embed: 0ms` (HashEmbedder, dev-only), `search: ~1.2–1.8s` is almost entirely the cross-ocean round trip, not database compute. Same caveat as documented in the main [`RESULTS.md`](../RESULTS.md) Run C: co-locating the API and the DB region collapses this to double-digit milliseconds.

## Honest caveats

- **Embedder**: this run used `EMBEDDER=hash` (deterministic, no real semantics) — not yet rerun with `EMBEDDER=openai`. The keyword and temporal RRF channels are doing the real relevance work here, since the test's recall queries paraphrase the stored facts rather than repeating them verbatim (e.g. "what's my phone number?" vs. "my phone number is 98765 43211" share only "phone"/"number"). A real embedder would add a genuine semantic-similarity signal on top of this. **This is a documented follow-up, not a claim** — the openai-embedder number does not exist yet and shouldn't be quoted until it's measured.
- **Sample size**: 5 runs (Smaran) / 3 runs (baseline), 5 questions each — enough to establish the qualitative result (Smaran recalls, plain LLM confabulates) with no ambiguity, but not a large statistical sample. Rerun with `run_repeated_cross_session.sh <label> <N>` for a bigger N before quoting a precise percentage in a context where precision matters.
- **Grading**: "passed" is substring matching (`expect_any`) against the transcript — good enough for a demo (and it under-counted the baseline's real failure rate by one, as shown above), not a rigorous grader.
