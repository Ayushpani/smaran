# `@repo/language`

Phase-4 language intelligence — Hindi/English code-switching, filler
removal, heuristic entity extraction, and session-scoped coreference
resolution. Zero runtime dependencies; pure functions and one small
stateful class. Phase 5 replaces the heuristics with a distilled LM
trained on real call data.

## What's inside

- **`detectLanguage(text)`** — one of `en`, `hi`, `mr`, `bn`, `pa`, `ta`, `te`, `kn`, `ml`, `gu`, `mixed`, `unknown`, plus a `codeSwitched` flag. Uses Unicode script ranges; no external tables.
- **`normalizeCodeSwitched(text)`** — strips Hindi/English fillers (`matlab`, `yaani`, `arre`, `hmm`, `basically`, `actually`, `मतलब`, `अरे`, …) without touching content-carrying words. Bails safely when the text is short or would be over-stripped.
- **`extractEntities(text)`** — heuristic NER: money, time, date, phone, English proper nouns (person/place/org), Devanagari names. Regex-driven and deterministic.
- **`SessionCoreference`** — track recently mentioned entities across turns; resolve English + Hinglish pronouns (`she`, `he`, `they`, `voh`, `uski`, …) by appending the referent in parentheses. Conservative — never rewrites the original text destructively.

## Sketch

```ts
import {
	detectLanguage,
	normalizeCodeSwitched,
	extractEntities,
	SessionCoreference,
} from "@repo/language"

const turn1 = "Meri beti Aanya ko elephants bahut pasand hain"
detectLanguage(turn1)
// → { primary: "mixed", codeSwitched: true, scripts: {...} }

normalizeCodeSwitched(turn1).text
// → "Meri beti Aanya elephants pasand hain" (fillers gone, content kept)

extractEntities(turn1)
// → [{ name: "Aanya", kind: "person", span: [11, 16] }]

const coref = new SessionCoreference()
coref.ingest(turn1)
coref.resolve("Uski school mein bhi elephants hain").resolved
// → "Uski (Aanya) school mein bhi elephants hain"
```
