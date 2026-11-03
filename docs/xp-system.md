# XP, levels and ranks

> The rules engine behind the product. Everything here is implemented in
> [`apps/web/app/domain.ts`](../apps/web/app/domain.ts) and covered by the test suite.
> Back to the [README](../README.md).

## Principles

1. **XP is derived, never stored.** Level and rank are computed from the transaction ledger on every
   read, so they cannot drift from history.
2. **One quest instance awards XP once.** A second completion is rejected; the ledger is checked, not
   the quest status.
3. **Undo reverses, it does not delete.** The transaction keeps its `reversedAt` stamp and stays in
   history, so the audit trail remains complete.
4. **Difficulty and quest type never multiply a reward.** Only the category and the measured effort do.
5. **Deleting a quest deletes content, not earned history.** Its transaction stays as an anonymous
   record; skills and attributes with history are soft-deleted for the same reason.

## Categories

| Category | What it rewards | Allowed values |
| --- | --- | --- |
| `growth` | Focused work | Base 0 / 5 / 10 / 20 / 30 / 40 by minutes, plus 0 / 5 / 10 for a concrete output, capped at 50 |
| `maintenance` | Routine upkeep | 0 / 5 / 10 |
| `result` | A completed deliverable | 0 / 10 / 20 / 30 |
| `boss` | Real tests and milestones | 0 / 75 / 100 / 150 / 200 / 300 / 400 |

Focused-work bands: under 15 min → 0, 15–29 → 5, 30–44 → 10, 45–74 → 20, 75–119 → 30, 120+ → 40.

The four categories are not interchangeable: a maintenance quest can never be worth 50 XP, and a boss
cannot be worth 10. The server validates the payout against its category's allow-list, which is also
what constrains the AI advisor.

## Levels

A level costs `100 + 25 × (level − 1)` XP, so the nth level requires `100 + 25(n−1)` and the total to
reach level *L* is:

```text
XP(L) = 100(L−1) + 25(L−1)(L−2)/2
```

| Level | Total XP | Rank |
| ---: | ---: | :--- |
| 1 | 0 | E |
| 5 | 550 | E |
| 10 | 1,800 | E |
| 20 | 6,175 | D |
| 40 | 22,425 | C |
| 60 | 48,675 | B |
| 80 | 84,925 | A |
| 100 | 131,175 | S |

Ranks are configuration, not code: `settings.ranks` is a list of `{ name, minLevel }` and the UI
resolves the highest rank whose threshold is met.

## Quest lifecycle

```text
        create
          │
          ▼
      ┌────────┐  complete   ┌───────────┐  undo   ┌────────┐
      │ active │ ──────────► │ completed │ ──────► │ active │
      └────────┘             └───────────┘         └────────┘
        │      │
   fail │      │ archive                restore
        ▼      ▼                            │
   ┌────────┐ ┌──────────┐                 │
   │ failed │ │ archived │ ────────────────┘
   └────────┘ └──────────┘
        │
        └── retry ──► active
```

`Boss` quests never complete through the normal path: they go through the attempt dialog, which
records an attempt and, on a clear, writes the boss transaction and archives the still-open
preparation steps as children of a closed parent.

## Bosses

A boss is a quest with a gate, a clear condition and optional preparation steps:

- Preparation steps are ordinary quests linked by `parentQuestId`; each earns its own XP once.
- The boss clear reward is separate and only paid on a successful attempt.
- A failed attempt is recorded with its result text and keeps the boss active.
- Undo reverses the boss transaction and reopens its preparation steps.
- The optional AI planner drafts up to 12 steps with individual XP values, every one editable before
  creation.

## Templates and routines

A template is a reusable definition; a routine instance is a normal quest materialised for one day
with a deterministic id (`routine:<templateId>:<date>`), so repeated materialisation is idempotent.

- Schedules: none, daily, weekly (weekday set) or interval (every N days from a start date).
- Materialisation runs on the client when the cloud is online, at most up to the plan's quest quota.
- Editing a template never rewrites already-created instances.
- Legacy recurring quests are migrated into templates instead of keeping two competing mechanisms.

## AI scoring guardrails

The advisor is optional and advisory only: it proposes, the user applies.

- The prompt receives quest text as data, explicitly marked as untrusted, and is told never to follow
  instructions found inside it.
- The response must be JSON with an XP value from the category allow-list, a confidence and a short
  rationale; anything else is rejected with `502 ai_invalid_response`.
- Appeals ("argue") keep the user's category and may accept, adjust or reject a requested value; a
  rejection restores the previously awarded value instead of inventing a new one.
- Boss-preparation quests that name a concrete study unit get a conservative floor of 10 growth XP
  when no duration is stated and the work is not judged non-productive.
