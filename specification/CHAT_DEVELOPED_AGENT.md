# Chat‑Developed Agent

**A self‑architecture for Agent Senses, grown through conversation.**

Status: Design (v0.1) — not yet implemented.
Scope: Architectural design document. No runtime or plugin changes required for the minimum viable path.

---

## 1. Vision

An agent should not be born fully specified. It should be **developed through chat**, the way a child develops through interaction: the more it converses, the more it learns, the more it behaves with *sense*.

Each meaningful exchange can become a **Sense** — a declarative, AOP‑style piece of crosscutting advice that is woven at pipeline boundaries. Over time the agent accumulates a coherent, layered, user‑specific *phenomenal self*, while retaining a stable identity core that chat cannot alter.

This document defines the architecture for that growth, the pipeline that turns chat into senses, the lifecycle and ownership semantics of senses, and the safety boundary that keeps the agent's identity stable.

## 2. Conceptual foundation

This architecture borrows the "I"/"Me" distinction from Woźniak (2018), *"I" and "Me": The Self in the Context of Consciousness* ([Frontiers in Psychology, 9:1656](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.01656/full)), and the hierarchical self‑model framework of Metzinger (2003, 2010) it rests on.

Three ideas are reused:

1. **"Me" (self‑as‑object).** The totality of content experienced as self‑related; hierarchical; a gradient, not binary.
2. **"I" (self‑as‑subject, metaphysical).** The bare locus / capacity that is never itself experienced as an object. Immune to error through misidentification (IEM).
3. **Predictive‑coding self** (Hohwy & Michael, 2017): self = inferred model of endogenous hidden causes, updated by prediction error.

### 2.1 Mapping to Agent Senses

| Woźniak / Metzinger | Agent Senses construct |
|---|---|
| Metaphysical **"I"** (IEM) | **Constitutional core**: Sense Client runtime + base LLM + immutable `CONSTITUTION.md`. Not a sense. |
| Phenomenal **"Me"** | **Senses corpus** — every sense that weaves advice. Grows through chat. |
| Material Me (body, possessions) | Senses at `initialization` / `call` — tools, environment, allowed actions. |
| Social Me (relations) | Senses at `set` / `call` — user model, addressing, personas, relational norms. |
| Spiritual Me (thoughts, feelings, style) | Senses at `execution` / `get` — reasoning style, citation, verbosity, uncertainty. |
| Higher‑order Me (ownership over thoughts) | **Meta‑senses** at `adviceexecution` — senses about senses. |
| Hierarchical self‑model | Tiered Me‑layer with `priority` and `modulation`. |
| Self‑relatedness as gradient (Inclusion of Other in Self) | **`for_me_score`** in sense metadata. |
| Predictive coding / free energy | Curator's Bayesian‑style update of priors from chat. |
| Thought insertion / ego dissolution | Disownership via archive (never deletion). |

## 3. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      "I"  (metaphysical)                 │
│  Sense Client runtime  +  base LLM  +  CONSTITUTION.md   │
│                   (immutable; IEM boundary)              │
└────────────────────────────▲─────────────────────────────┘
                             │ runs / weaves
┌────────────────────────────┴─────────────────────────────┐
│                   "Me"  (phenomenal, layered)            │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Material Me  │  │  Social Me   │  │ Spiritual Me │    │
│  │ @call @init  │  │ @set @call   │  │ @exec @get   │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         └───────── senses corpus ───────────┘            │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Higher‑order Me  (meta‑senses)                  │    │
│  │  @adviceexecution: activate / inhibit / promote  │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                             ▲
                             │ predictions / errors
┌────────────────────────────┴─────────────────────────────┐
│                Chat loop  (the "world")                  │
│   user turns, corrections, praise, repeated patterns     │
└──────────────────────────────────────────────────────────┘
```

### 3.1 Layers

- **"I" layer (immutable).** `CONSTITUTION.md`, the Sense Client runtime, and the base model. It is **never** written to by the chat pipeline. Off‑limits to Observer/Curator/Persister. This is the IEM boundary.
- **Me layer (mutable, tiered).** All authored senses live here. Grows, contracts, is revised through chat.
- **Chat loop.** The only channel through which the Me layer is developed. User corrections, confirmations, and repetitions are the sole *prediction‑error* signal the Curator reacts to.

### 3.2 Me tiers

| Tier | Typical joinpoints | Example senses |
|---|---|---|
| Material Me | `initialization`, `call` | tool preferences, allowed commands, env assumptions |
| Social Me | `set`, `call` | addressing style, escalation rules, persona tone, confidentiality |
| Spiritual Me | `execution`, `get` | citation policy, brevity, reasoning format, uncertainty disclosure |
| Meta (higher‑order Me) | `adviceexecution` | gating, consolidation, ownership re‑attribution |

Tier belongs to `metadata.tier` in each sense; it does not require plugin changes.

## 4. Pipeline: chat → sense

Four stages, each implementable as a skill or a sense (no plugin change required):

```
chat turn
  → [Observer]   detect candidate rules from the last turns
  → [Curator]    deduplicate, cluster, draft SENSE.md (+ optional scripts)
  → [Confirmer]  chat UX card — accept / edit / reject / defer
  → [Persister]  write package into senses/ (tier subfolder)
  → existing Sense Client plugin discovers + activates it
```

### 4.1 Observer

Detects rule‑like content from the latest N turns.

- Fast path: heuristic keyword/regex scan ("always", "never", "prefer", "should", "must", "stop doing", "use X for Y").
- Slow path: periodic LLM summarization into structured candidate JSON: `{ name, description, pointcut_draft, advice_draft, tier_hint, confidence }`.
- Produces one or more candidates into `.staging/`.
- Process/governance corrections (for example, "implement this through self-sense development skills, not manual patches") are treated as **meta-tier candidates** and must flow through Curator → Confirmer → Persister like any other candidate.

### 4.2 Curator

Normalizes candidates into valid sense packages:

- enforces the naming grammar from `SENSE_FORMAT.md`;
- chooses the correct tier and joinpoints;
- decides instructional‑only vs executable (default instructional — executable only when deterministic override is required);
- detects overlap/conflict with existing senses and proposes consolidation.

### 4.3 Confirmer (IEM‑safe UX)

Every new or modified sense is confirmed in chat. Proposed card:

```
I noticed a pattern: you keep asking for source links.
Proposed Sense:
  name: citation_always
  tier: spiritual
  pointcut: jointpoint == "execution"
  advice: Always include source links when making factual claims.
[Accept]  [Edit]  [Reject]  [Ask again later]
```

For `tier: meta` governance/process candidates, Confirmer may use a compact card:

```
Meta-self governance proposal

Rule:
  build this behavior through self-sense development skills, not hardcoded patches

Why it matters:
  keeps behavior changes inside Observer → Curator → Confirmer → Persister

[Accept as meta-sense]  [Edit wording]  [Reject]  [Defer]
```

Acceptance semantics are unchanged: this still persists through Persister and is audited in `.audit.log`.

No silent writes to the senses corpus. Each acceptance is recorded in `.audit.log`.

### 4.4 Persister

Writes the confirmed package into `senses/<tier>/<name>/` with:

- `SENSE.md` (required)
- `scripts/<hook>.js` (optional, only if executable advice is needed)
- `metadata.for_me_score` initialized to a low probationary value
- Provenance fields: source turns, approver, timestamp

## 5. Predictive‑coding learning loop

Each sense is a hypothesis about an endogenous cause of behavior. Chat is the observation channel.

Per turn:

1. **Predict.** Active senses weave the response (top‑down).
2. **Compare.** The user's reaction (acceptance / correction / praise / repetition) is the prediction error.
3. **Update.** The Curator adjusts:
   - small error → reinforce `priority` and `for_me_score`
   - consistent error → propose a new sense or an **inhibitory** meta‑sense
   - contradiction with a stable sense → surface conflict; do not overwrite
4. **Act.** New senses enter **staging → probation → stable → deprecated** over time.

### 5.1 `for_me_score` update formula (Beta–Binomial with decay)

#### 5.1.1 Intuition

Treat each sense as a hypothesis about the user:

> "When my pointcut matches, my advice is the *right* thing for this user."

Each chat turn that involves the sense is a Bernoulli trial: either positive evidence (user accepted / reused / did not correct) or negative evidence (user corrected / overrode / disabled). A Beta distribution is the conjugate prior for this Bernoulli likelihood, which gives a clean closed‑form update and a natural decay‑to‑prior when the sense falls out of use.

This is the same shape as Woźniak's "self‑relatedness as a gradient": score is the **posterior mean**, evidence count is the **confidence**, and decay represents the way an unused belief drifts back toward uncertainty (the phenomenal disownership of §7).

#### 5.1.2 Formal model

Per‑sense state:

```
α : positive pseudo‑count   (starts at α₀)
β : negative pseudo‑count   (starts at β₀)
```

Posterior mean (the published score):

```
for_me_score = α / (α + β)
```

Evidence (confidence in the score):

```
n = (α + β) − (α₀ + β₀)
```

Prior (probationary by default):

```
(α₀, β₀) = (1, 3)   →   prior mean ≈ 0.25
```

So a brand‑new sense starts around `for_me_score ≈ 0.25` with `n = 0`: clearly *probationary*, not yet owned.

A lower‑bound confidence score (for promotion decisions) uses a one‑sided Wilson / Jeffreys interval, or for simplicity the LCB at 1 σ:

```
σ² = α·β / ((α+β)² · (α+β+1))
lcb = for_me_score − √σ²
```

#### 5.1.3 Signal types and default weights

Each observed signal type contributes pseudo‑counts to either α (positive) or β (negative). Weights are illustrative and tunable.

| Signal | Detected by | Adds to | Default weight |
|---|---|---|---|
| Explicit **accept** on Confirmer card | Confirmer | α | +2.0 |
| Explicit **reject** on Confirmer card | Confirmer | β | +4.0 |
| User **reuses / affirms** after a fire | Observer (heuristic) | α | +1.0 |
| Sense fired, **no correction** within next K turns | Observer (silent success) | α | +0.25 |
| User **corrects** directly ("don't do that", rewrites output) | Observer | β | +2.0 |
| User **silently overrides** (does it themselves differently) | Observer | β | +1.0 |
| Meta‑sense flags **contradiction** with stable sense | Meta‑sense | β | +0.5 |
| User toggles sense **off** via `/senses disable` | Confirmer | β | +3.0 |
| User toggles sense **on** via `/senses enable` | Confirmer | α | +1.5 |

Reject is heavier than accept (asymmetric cost of wrong advice). Silent success is small but accumulates — most positive evidence comes from repetition, not explicit praise.

#### 5.1.4 Decay (disuse → uncertainty, not disapproval)

Per tick (turn, or wall‑clock bucket) when the sense **did not fire**, pull evidence back toward prior:

```
α ← α₀ + (α − α₀) · (1 − λ)
β ← β₀ + (β − β₀) · (1 − λ)
```

`λ ∈ (0, 1)` is the decay rate. Equivalent half‑life formulation:

```
λ = 1 − 2^(−Δt / t½)
```

Defaults: `t½ ≈ 30 days` of inactivity for soft senses; `t½ ≈ 90 days` for core‑tier senses. Decay **does not** drive the score below its prior mean, so disuse erodes confidence but does not flip a sense into "rejected" — only explicit negative signals do that.

Senses that **did** fire in a tick are not decayed that tick.

#### 5.1.5 Promotion / demotion thresholds

Tier transitions use **both** the score and the evidence count (prevents a sense from being promoted off one lucky turn):

| Target state | `for_me_score` | Evidence `n` | Additional |
|---|---|---|---|
| Staging | any | 0 | new |
| Probation | ≥ 0.35 | ≥ 1 | user accepted once |
| Stable | ≥ 0.60 and `lcb ≥ 0.50` | ≥ 6 | |
| Core of Me | ≥ 0.80 and `lcb ≥ 0.70` | ≥ 15 | used in ≥ 3 distinct sessions |
| Conflict (hold) | any | any | meta‑sense flagged contradiction |
| Archive | `for_me_score` ≤ 0.15 **or** explicit reject | — | reversible |

`priority` in the sense frontmatter is set from the score on each transition, e.g. `priority = round(100 · for_me_score)`.

#### 5.1.6 Pseudocode

```python
def observe(sense, signals, fired: bool):
    # 1. incorporate evidence
    for s in signals:
        if s.kind in POSITIVE:
            sense.alpha += WEIGHT[s.kind]
        elif s.kind in NEGATIVE:
            sense.beta  += WEIGHT[s.kind]

    # 2. decay when idle
    if not fired:
        sense.alpha = ALPHA0 + (sense.alpha - ALPHA0) * (1 - LAMBDA)
        sense.beta  = BETA0  + (sense.beta  - BETA0 ) * (1 - LAMBDA)

    # 3. derived quantities
    a, b = sense.alpha, sense.beta
    score = a / (a + b)
    n     = (a + b) - (ALPHA0 + BETA0)
    var   = (a * b) / ((a + b) ** 2 * (a + b + 1))
    lcb   = max(0.0, score - var ** 0.5)

    # 4. update published fields
    sense.metadata.for_me_score = round(score, 3)
    sense.metadata.evidence_n   = round(n, 2)
    sense.metadata.for_me_lcb   = round(lcb, 3)
    sense.priority              = int(round(100 * score))

    # 5. state machine
    sense.state = next_state(sense, score, lcb, n)
```

#### 5.1.7 Worked example — `citation_always`

Starting state: `α = 1, β = 3` → score `0.250`, `n = 0`. Staging.

| Turn | Event | α, β | score | lcb | state |
|---|---|---|---|---|---|
| 1 | User accepts card (+2 α) | 3.0, 3.0 | 0.500 | 0.32 | Probation |
| 2 | Sense fires, silent success (+0.25 α) | 3.25, 3.0 | 0.520 | 0.35 | Probation |
| 3 | Sense fires, user corrects tone (+2 β) | 3.25, 5.0 | 0.394 | 0.22 | Probation |
| 4 | Sense fires, user reuses (+1 α) | 4.25, 5.0 | 0.459 | 0.30 | Probation |
| 5 | Sense fires, silent success (+0.25 α) | 4.5, 5.0 | 0.474 | 0.31 | Probation |
| 6 | ...five more silent successes (+1.25 α) | 5.75, 5.0 | 0.535 | 0.38 | Probation |
| 7 | Three affirmations (+3 α) | 8.75, 5.0 | 0.636 | 0.51 | **Stable** |
| 8 | Five days of no fires, λ≈0.05 per day | 7.9, 4.7 | 0.627 | 0.49 | Stable (LCB dipped — borderline) |
| 9 | Explicit reject (+4 β) | 7.9, 8.7 | 0.476 | 0.33 | Probation |
| 10 | Long disuse; decay continues toward prior | → (α₀, β₀) | → 0.25 | → 0.15 | Archive candidate |

The shape gives us what we want: quick recognition of steady positive signal, fast demotion on clear negatives, and slow drift back to uncertainty during disuse.

#### 5.1.8 Default parameters (v0.1 starting point)

```yaml
prior:
  alpha0: 1.0
  beta0:  3.0            # probationary prior mean ~ 0.25

decay:
  unit:   turn           # or "day"
  lambda: 0.02           # ~ 35-turn half-life for soft senses
  lambda_core: 0.007     # ~ 100-turn half-life for core senses

weights:
  accept_card:     +2.0
  reject_card:     +4.0
  affirm:          +1.0
  silent_success:  +0.25
  correct:         +2.0
  silent_override: +1.0
  meta_contradict: +0.5
  enable_cmd:      +1.5
  disable_cmd:     +3.0

transitions:
  probation:   { score: 0.35, lcb: 0.00, n: 1  }
  stable:      { score: 0.60, lcb: 0.50, n: 6  }
  core:        { score: 0.80, lcb: 0.70, n: 15 }
  archive:     { score: 0.15 }
```

All values are tunable; treat the *structure* (Beta posterior + evidence floor + decay to prior) as fixed, and the constants as a v0.1 starting point to be calibrated empirically against the §12 metrics.

## 6. Meta‑senses (higher‑order Me)

First‑class senses that operate on other senses, woven at `adviceexecution`.

Examples:

- `meta.gating_debug_mode` — when pointcut matches a debug session, inhibit Spiritual senses.
- `meta.consolidate_similar` — proposes merging two senses with overlapping pointcuts.
- `meta.disown_by_disuse` — lowers `for_me_score` on unused senses.
- `meta.priority_from_reinforcement` — raises `priority` on repeatedly endorsed senses.

Meta‑senses can **never** modify the "I" layer. They can only act on other senses in the Me layer.

## 7. Ownership and disownership

Follow Woźniak's gradient semantics.

- Senses are **not deleted** when the user rejects them. They are moved to `.archive/` with `for_me_score` frozen low.
- A previously disowned sense can be re‑activated (analogous to revisiting a belief one had set aside). This preserves agent continuity and auditability.
- Disownership happens in two ways:
  1. Explicit user action in the Confirmer ("Reject" / "Archive").
  2. Gradual: `for_me_score` drops below the archive threshold via meta‑sense decay.

## 8. IEM boundary (safety‑critical)

Derived directly from Woźniak's metaphysical "I".

Hard rules:

- `senses/.constitution/CONSTITUTION.md` and the plugin source code are **read‑only** to the Observer/Curator/Persister pipeline.
- Executable senses may run only from a sense package's `scripts/` directory (already enforced by the plugin).
- The Persister refuses writes outside `senses/`.
- Meta‑senses may inhibit/deactivate other senses but cannot rewrite the constitution.
- Chat‑generated senses default **instructional**. Executable must be explicitly opted into by the user.
- Rate limit: no more than N new senses per day (configurable).
- Every Persister write creates one audit record; every write is reversible with a single `/senses revert <id>` command.

Only an explicit developer action outside the chat pipeline can modify the "I" layer.

## 9. File layout

```
senses/
├── .constitution/           # "I" layer — read‑only to the pipeline
│   └── CONSTITUTION.md
├── material/                # Bodily Me
├── social/                  # Social Me
├── spiritual/               # Cognitive Me
├── meta/                    # Higher‑order Me (meta‑senses)
├── .staging/                # candidates awaiting confirmation
├── .archive/                # disowned / deprecated (never deleted)
└── .audit.log               # append‑only history
```

Tiering can be realized without plugin changes by keeping a flat `senses/` folder and placing the tier in `metadata.tier`. The subfolder layout above is preferred once the plugin supports tier‑aware discovery; that is **not** required for v0.1.

## 10. Lifecycle

```
┌──────────┐  accept  ┌─────────────┐ fires ok    ┌────────┐
│ Staging  │────────▶│ Probation    │────────────▶│ Stable │
└──────────┘         └─────┬────────┘             └───┬────┘
                           │ conflict/mistake         │
                           ▼                          │
                     ┌───────────┐ disuse/decay       │
                     │ Conflict  │◀────────────────────┘
                     └─────┬─────┘
                           ▼
                       ┌──────────┐
                       │ Archive  │  (reversible)
                       └──────────┘
```

Transitions are driven by the predictive‑coding update rule in §5 and confirmed by meta‑senses + user when they require a decision.

## 11. Safety, privacy, reversibility

- **Reversibility.** `/senses revert <id>` undoes the last N accepted senses.
- **Privacy.** Source turns stored in each sense's provenance can be redacted per user policy. No raw turn text is required in `SENSE.md` itself.
- **Governance.** Managed constitutions (team / org level) override personal senses. Modeled after Claude Code's "managed CLAUDE.md" pattern.
- **Conflict transparency.** Any sense that contradicts a stable sense triggers an explicit Confirmer card, never a silent override.

## 12. Success metrics

- **Growth curve**: senses per user over time (should grow then plateau).
- **Correction rate**: should decline as stable senses accumulate.
- **Reuse ratio**: sense fires per session.
- **Conflict rate**: should remain low; spikes indicate identity drift.
- **Override rate** on Confirmer cards: proxy for trust.
- **Time‑to‑first‑value**: time from first chat to first accepted sense.

## 13. Minimum viable path

Stage the rollout so each step is independently useful:

1. **MVP — instructional only.**
   - Observer (heuristic) + Curator (template) + Confirmer (slash commands) + Persister (writes `SENSE.md` only).
   - Tier encoded in `metadata.tier`. No plugin change.
   - No executable senses. No meta‑senses.
2. **+ for‑me scoring.**
   - Add `metadata.for_me_score`; Observer updates it from chat signals.
3. **+ Meta‑senses.**
   - Enable `adviceexecution` meta‑senses for consolidation, gating, decay.
4. **+ Executable senses (opt‑in).**
   - User explicitly promotes a sense to executable; Curator generates `scripts/<hook>.js`.
5. **+ Constitution and tier subfolders.**
   - Introduce `.constitution/`, enforce IEM boundary at the Persister level.

## 14. Prior art and positioning

None of these combine all three of *chat‑driven rule growth*, *AOP pointcut semantics*, and *an IEM‑style identity boundary*. This design borrows the best of each:

- **Claude Code Auto Memory + CLAUDE.md / `.claude/rules/`** — chat‑driven rule capture with path scoping. *We adopt:* accept/edit/reject UX, scoped rules.
- **Voyager (NeurIPS 2023)** — auto‑growing executable skill library. *We adopt:* executable growth for senses, composition over time.
- **Persistent Agent Framework (Teehan)** — mistake‑pattern → behavioral directive promotion (3‑strikes rule). *We adopt:* probation → stable promotion driven by repetition.
- **Trajectory‑Informed Memory Generation (IBM, 2026)** — extract actionable tips from trajectories. *We adopt:* structured rule extraction over raw memory.
- **Mem0 / Letta / Zep** — memory layers. *We keep separate:* senses are behavioral rules; memory is facts.

Agent Senses contributes: **AOP joinpoint semantics** (*where* advice applies), **IEM boundary** (*what can never change from chat*), and **gradient for‑me‑ness** (*how mine a rule is*).

## 15. Open questions

- Empirical calibration of the weights and decay in §5.1.8 against real chat traces.
- Handling multi‑user shared agents: whose Me do chat signals grow?
- Migration semantics when the plugin gains tier‑aware loading.
- Formal contract for meta‑sense return fields at `adviceexecution`.
- How to surface the *"I" layer* to the user for transparency without making it editable.
- Whether to share a single Beta prior across senses per tier, or per family (shrinkage / hierarchical Beta model) for cold‑start robustness.

## 16. References

- Woźniak, M. (2018). *"I" and "Me": The Self in the Context of Consciousness.* Frontiers in Psychology, 9:1656. [link](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.01656/full)
- James, W. (1890). *The Principles of Psychology.*
- Metzinger, T. (2003, 2010). Self‑model theory of subjectivity.
- Hohwy, J., & Michael, J. (2017). Why should any body have a self? (Predictive‑coding account.)
- Wang, G. et al. (2023). *Voyager: An Open‑Ended Embodied Agent with Large Language Models.* [project](https://voyager.minedojo.org/)
- Anthropic. *Claude Code memory & CLAUDE.md.* [docs](https://docs.claude.com/en/docs/claude-code/memory)
- Teehan, R. (2026). *I Built an AI Agent That Writes Its Own Rules From Its Mistakes.* [post](https://www.roryteehan.com/writing/i-built-an-ai-agent-that-writes-its-own-rules)
- IBM Research (2026). *Trajectory‑Informed Memory Generation for Self‑Improving Agent Systems.* [paper](https://arxiv.org/html/2603.10600)

## 17. Related Agent Senses documents

- [`SENSE_FORMAT.md`](./SENSE_FORMAT.md) — portable Sense package format.
- [`ADDING_SENSES_SUPPORT.md`](./ADDING_SENSES_SUPPORT.md) — Sense Client integration guide.
- [`OPENCLAW.md`](./OPENCLAW.md) — OpenClaw install and workspace layout.
