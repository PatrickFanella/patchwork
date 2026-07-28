# Post-alpha expansion decision matrix

> Historical launch-scope decision. This matrix records why expansion was
> frozen under the 2026-07-11 operational `NO-GO`. The 2026-07-28
> [`buyer-ready web product charter`](product/buyer-ready-web-charter.md)
> subsequently authorized a bounded responsive-web feature-completion program.
> It did not retroactively convert this matrix into launch evidence or approve
> public-service operation. Use the
> [`buyer-ready completion roadmap`](superpowers/plans/2026-07-28-buyer-ready-web-completion-roadmap.md)
> for current implementation priority.

Decision date: 2026-07-11

Selected next slice: **none**

The alpha decision is `NO-GO`, no pilot evidence exists, and expansion work is
frozen. Scores use 1 (weak/low) through 5 (strong/high). For evidence and
protocol fit, higher is better. For safety risk and operational cost, higher is
worse. Dependency readiness measures the current production path, not the
quantity of fixture code or tests.

| Candidate | User evidence | Safety risk | Protocol fit | Operational cost | Dependency readiness | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Groups | 1 | 5 | 3 | 5 | 1 | Defer; community abuse and membership operations need pilot evidence |
| Reputation | 1 | 5 | 2 | 5 | 1 | Archive from near-term roadmap; high manipulation and appeal risk |
| Organizations | 1 | 4 | 2 | 5 | 1 | Defer; no real organization identity or accountable partner owner |
| Scheduling | 1 | 3 | 2 | 4 | 1 | Defer; requires durable notifications, timezone operations, and support |
| Native mobile | 1 | 3 | 3 | 5 | 1 | Defer; web alpha behavior and support model are not validated |
| Multi-region | 1 | 3 | 2 | 5 | 1 | Archive from alpha follow-up; single-region capacity is not proven |
| External connectors | 1 | 5 | 2 | 5 | 1 | Defer; no partner contract, credentials, delivery outbox, or owner |
| Attachments | 2 | 5 | 4 | 5 | 1 | Defer; needs blob storage, scanning, access control, and deletion proof |
| Automated matching | 1 | 5 | 2 | 5 | 1 | Archive from near-term roadmap; no trustworthy outcomes or fairness data |
| Richer chat | 2 | 5 | 3 | 5 | 1 | Defer; no durable authenticated transport, safety, or retention runtime |

## Decision

Zero slices are selected. “At most one” permits no selection, and choosing a
fixture-rich feature now would violate the alpha freeze. The current source may
remain compile-covered, but no expansion runtime, persistence schema, endpoint,
UI flow, or additional fixture test corpus should be developed.

Reevaluation requires all of the following:

1. the alpha go/no-go decision changes to `GO` or `CONDITIONAL-GO`;
2. a bounded pilot produces concrete user demand and safety observations;
3. product, engineering, and trust-and-safety identify one candidate;
4. that candidate has explicit persistence, authenticated authorization,
   privacy/retention, operations, and real end-to-end acceptance criteria;
5. the candidate does not weaken or bypass the alpha production paths.

Attachments and richer chat have slightly more plausible user value than the
other candidates, but their safety and operational prerequisites still make
selection premature. They receive no implied priority from this observation.
