# AI layer and the deterministic boundary

APEX has two intelligence layers. They are never blended.

| | Deterministic engine and Coach | AI layer (optional) |
|---|---|---|
| Role | Authoritative: prescriptions, progression, loads, equipment, dates, history, safety gates | Explains what the Coach already decided, in plain language |
| Output | Decisions and state | Text for the screen, nothing else |
| Reproducible | Yes | No, and treated as untrusted |
| Required | Yes | No. APEX is complete with AI off |

```
app state -> evidence -> safety -> context -> objective -> signals -> candidates -> selection -> confidence -> COACH ANSWER
                                                                                                   |
                                                                       buildGroundedContext (read only, minimal)
                                                                                                   |
                                                         gateway -> provider -> parseAIOutput -> vetAIOutput -> text
                                                                                                   |
                                                                        on any failure: the Coach answer, unchanged
```

## Files

* `src/aiGateway.ts`: provider selection, availability, timeout, fallback. The only module that calls a provider.
* `src/aiProviders/*`: adapters (`ruleBased`, `localOllama`, `openAICompatible`). Wire formats live only here.
* `src/aiGrounding.ts`: builds the grounded context and the provider-neutral prompt.
* `src/aiContract.ts`: the closed response schema, the parser and the vetting rules.

## Grounded context (KNOWN / INFERRED / UNKNOWN)

One Coach answer becomes a context holding: the date, the question, KNOWN deterministic facts, INFERRED Coach
interpretations, UNKNOWN missing information, the deterministic answer, its confidence, and the CANDIDATE exercises the
deterministic layer already validated (current exercise, graph variations, equivalent alternatives, equipment respected).
It holds no name, no journal, no measurements, no unrelated history. Identical state gives an identical context.

## What AI output may be

A closed JSON object: `response`, `groundedClaims`, `uncertainties`, `requestedClarification`. Any other field (a load, an
action, a prescription, a workout) rejects the whole output and the Coach answer is shown. Sentences are then removed if they
state a number the context does not contain, instruct a change, cite history that was not supplied, make a medical or
safety claim, name a condition the context did not, or name an exercise that is not a candidate or that needs equipment the
person does not have. A claim needs a real fact id. If nothing survives, the Coach answer is shown.

## Providers

* **Off** (default). No provider, no network.
* **Rule-based summary.** A deterministic local fallback. It is not a language model and is labelled that way. Offline.
* **Local model.** A real model when an Ollama-compatible server runs on `127.0.0.1`. Unreachable means the Coach answer.
* **Cloud.** An adapter exists and is configuration-ready, but it is not selectable in the app: it needs explicit consent,
  an https (or loopback) endpoint and a key held in memory only. A key inside a browser app is visible to anyone using that
  browser, so there is deliberately no UI that stores one. Nothing is sent without that configuration.

## Enforcement

`tests/ai-phase6.test.cjs` checks the boundary at source level (the AI layer imports only read-only modules and contains
nothing that writes state; the engine, Coach, data and knowledge layers do not import the AI layer; vendor formats stay in
adapters) and by behaviour (malicious, malformed, contradictory, invented and unsafe output leaves the engine result
byte-identical for every provider, and for none).
