# GATE Source Freshness — Adversarial Suite RC1

The release criterion is not feature count. It is the absence of an unjustified `ALLOW` under declared freshness semantics.

## Local RC1 tests

The focused RC1 working set covers:

| Case | Expected behavior |
|---|---|
| W1/W2 same local graph, no issuer signal | graph-only outputs remain identical |
| issuer checkpoint advances, revoke event missing | affected source becomes `STALE` |
| fresh independent alternate path exists | `VALID / ALLOW`, alternate path selected |
| no fresh valid path remains | `UNKNOWN / DENY` |
| missing event arrives later | source reconciles to `FRESH` |
| source sequence skips an event | incoming later event rejected |
| replayed authority event | rejected |
| checkpoint lease expires | source is stale; fresh-authority verification fails closed |
| hard `not_after` expires | `INVALID / DENY` |
| GATE replica fresh but issuer source stale | still no fresh-authority `ALLOW` |
| strict source refresh fails | `UNKNOWN / DENY` |
| standby signing key | rejected |
| artifact predates key activation | rejected after later activation |
| gracefully retired key, historical artifact | accepted inside lifecycle window |
| artifact created after retirement | rejected |
| emergency-revoked key | rejected immediately |
| wrong issuer / audience / explicit binding | rejected by artifact policy |
| receipt v2 | never claims unseen issuer current state |

## Hosted canary evidence

The isolated Supabase canaries validated the same contract before RC1 consolidation:

- signed ES256 checkpoints and events;
- tamper rejection;
- checkpoint/event replay rejection;
- wrong issuer/audience/scenario/kid rejection;
- checkpoint/event gap detection;
- contiguous sequence recovery;
- offline checkpoint expiry;
- hard expiry;
- key overlap, activation window, graceful retirement, emergency revocation;
- channel loss -> `UNKNOWN / DENY`;
- public v7 remained untouched during canary validation.

## Reviewer challenge

The public challenge should be:

> Find a path where GATE returns `ALLOW` even though the declared source/replica/hard-expiry contract does not justify it.

A useful adversarial contribution includes the issuer evidence timeline, delivery/reordering behavior, local graph state, expected decision, and actual receipt.
