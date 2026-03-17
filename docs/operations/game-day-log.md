# Game Day Exercise Log

Tracks: #105 (Incident response runbook and game day), #75 (Epic D -- Reliability & Observability)

This document serves as both a template and a log for game day exercises.
Each exercise should be recorded below using the template format.

---

## Exercise Template

Copy the block below for each new game day exercise.

```markdown
### Exercise: <title>

**Date**: YYYY-MM-DD
**Scenario**: <reference to scenario in incident-response.md>
**Facilitator**: <name>
**Participants**: <list>
**Environment**: staging | production-like sandbox

#### Scenario Description

<What was simulated and how the fault was injected.>

#### Expected Behavior

<What the runbook says should happen.>

#### Actual Behavior

<What actually happened, step by step.>

#### Timeline

| Time (UTC) | Event |
|------------|-------|
| HH:MM | Fault injected |
| HH:MM | Alert fired |
| HH:MM | On-call acknowledged |
| HH:MM | IC activated |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |

#### RTO / RPO Measurements

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Recovery Time Objective (RTO) | < 1 hour | <measured> | -- |
| Recovery Point Objective (RPO) | < 15 minutes | <measured> | -- |
| Alert-to-acknowledgment | < 5 min (P1) / < 15 min (P2) | <measured> | -- |
| Alert-to-resolution | varies by scenario | <measured> | -- |

#### Runbook Accuracy

| Step | Accurate? | Notes |
|------|-----------|-------|
| <step from runbook> | Yes/No | <deviation or gap> |

#### Lessons Learned

- <finding>
- <finding>

#### Action Items

| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| <description> | <name> | YYYY-MM-DD | Open |
```

---

## Completed Exercises

_No exercises have been completed yet. Record each exercise below as it
is conducted._

<!-- Paste completed exercise records here, most recent first. -->

---

## Scheduling

Game day exercises should be conducted:

- **Quarterly** at minimum for P1 scenarios (service outage, data corruption).
- **Before each milestone** for any new DR or incident response procedures.
- **After any significant infrastructure change** (database migration, new
  service deployment, network topology change).

The INFRA team owns the game day schedule. The IC rotation ensures at least
one IC candidate participates in each exercise.

---

*Created as part of Wave 3 reliability lane. Tracked by #105, #75, #68.*
