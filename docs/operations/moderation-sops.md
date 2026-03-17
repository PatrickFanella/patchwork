# Moderation Standard Operating Procedures

## Overview

This document describes the standard operating procedures (SOPs) for content
moderation on the Patchwork mutual aid platform. These procedures cover the
full lifecycle from initial triage through escalation and appeal handling.

For verification-specific appeals, see [verification-appeals.md](./verification-appeals.md).

## Moderator Roles

| Role         | Permissions                                           |
| ------------ | ----------------------------------------------------- |
| junior_mod   | View queue, triage (assign priority/category)         |
| senior_mod   | + Apply policy actions (delist, suspend, restore)     |
| lead_mod     | + Escalation review, bulk actions, appeal handling    |
| admin        | + Moderator management, system configuration          |

## 1. Content Triage SOP

### Purpose

Ensure all reported content is reviewed promptly and categorized for
appropriate action.

### Procedure

1. **Review queue** -- Open the moderation console at `/moderation`. The queue
   is sorted by most recent update. Use filters to focus on pending items.

2. **Assess content** -- For each queued item:
   - Read the report reason and any attached summary.
   - Review the subject content (aid post, conversation, or directory resource).
   - Check report count and whether the subject has prior moderation history.

3. **Categorize and prioritize** -- Mark items as:
   - **High priority**: 3+ reports, active appeal, suspended content, or
     content involving safety concerns.
   - **Normal priority**: Routine reports requiring standard review.

4. **Apply action** -- Based on assessment (senior_mod or above):
   - `delist` -- Remove from public discovery while preserving for audit.
   - `suspend-visibility` -- Fully hide content for policy violations.
   - `restore-visibility` -- Reinstate content after review clears it.

5. **Document** -- Every action requires a written reason. The audit trail
   records the actor, timestamp, previous state, and new state automatically.

### Timeline Target

| Stage            | Target SLA      |
| ---------------- | --------------- |
| Initial triage   | 4 hours         |
| Action decision  | 24 hours        |
| Documentation    | Immediate       |

## 2. Escalation SOP

### When to Escalate

A moderator should escalate when:

- The content involves potential legal issues or real-world safety threats.
- The report involves a verified organisation or trusted volunteer.
- The moderator is uncertain about the appropriate action.
- The subject has been previously moderated and re-reported.
- A junior moderator encounters content requiring policy action.

### Escalation Path

1. **Level 1 -- Senior moderator review** (junior_mod escalates to senior_mod)
   - Use the escalation function in the console.
   - The item moves to `pending` appeal state and is flagged for senior review.
   - Target resolution: **8 hours**.

2. **Level 2 -- Lead moderator review** (senior_mod escalates to lead_mod)
   - The item moves to `under-review` state.
   - Lead moderator reviews full audit trail and prior context.
   - Target resolution: **24 hours**.

3. **Level 3 -- Platform Governance Board**
   - For unresolved or contested decisions after Level 2.
   - Governed by the escalation process in
     [verification-appeals.md](./verification-appeals.md).
   - Target resolution: **5 business days**.

### SLA Targets

| Escalation Level | Target Resolution |
| ---------------- | ----------------- |
| Level 1          | 8 hours           |
| Level 2          | 24 hours          |
| Level 3          | 5 business days   |

## 3. Appeal Handling SOP

This process follows the same pattern as verification appeals (see
[verification-appeals.md](./verification-appeals.md)) adapted for content
moderation decisions.

### Procedure

1. **Receive appeal** -- When a user disputes a moderation action, the system
   creates an appeal record. The item moves to `pending` appeal state and
   re-enters the queue.

2. **Acknowledge** -- The system sends an immediate acknowledgement to the
   user with the appeal ID. No moderator action required for this step.

3. **Review** -- A lead_mod or admin reviews the appeal:
   - Examine the original moderation action and its reason.
   - Review the full audit timeline for the subject.
   - Assess whether the original decision was consistent with policy.
   - Move the appeal to `under-review` state.

4. **Decision** -- The reviewer either:
   - **Upholds** the original action (`resolve-appeal-upheld`): the moderation
     action stands and the user is notified with the reason.
   - **Reverses** the original action (`resolve-appeal-rejected`): the content
     is restored and the user is notified.

5. **Notify** -- The user receives a notification with the appeal outcome,
   the reviewer's reasoning, and any next steps.

### Timeline Expectations

| Stage              | Target SLA      |
| ------------------ | --------------- |
| Acknowledgement    | Immediate       |
| Initial review     | 3 business days |
| Decision           | 5 business days |

## 4. Emergency Content Removal SOP

### Immediate Action Criteria

Content must be removed immediately (within 1 hour) without standard triage
when it:

- Contains credible threats of violence or self-harm.
- Exposes personally identifiable information (doxxing).
- Contains child safety concerns.
- Involves active fraud targeting vulnerable individuals.

### Procedure

1. **Immediate suspend** -- Any moderator (including junior_mod via
   escalation) applies `suspend-visibility` with reason `[EMERGENCY]`.

2. **Notify lead** -- Escalate to lead_mod or admin immediately via the
   escalation workflow.

3. **Post-action review** -- Within 24 hours, a lead_mod or admin reviews
   the emergency removal:
   - Confirm the action was warranted.
   - Document the full context in the audit trail.
   - If the action was unwarranted, restore visibility and notify the user.

4. **External reporting** -- If required by law or platform policy, file
   reports with relevant authorities or trust and safety partners.

### Timeline Target

| Stage              | Target SLA      |
| ------------------ | --------------- |
| Emergency removal  | 1 hour          |
| Lead notification  | 2 hours         |
| Post-action review | 24 hours        |

## 5. Moderator Rotation and Fatigue Management

### Guidelines

- **Shift length**: Moderators should not review content for more than 4
  consecutive hours without a break.

- **Queue assignment**: The moderation console distributes items across active
  moderators. No single moderator should handle more than 50 items per shift.

- **Content exposure limits**: Moderators reviewing graphic or disturbing
  content should be rotated to lower-severity queues after 2 hours.

- **Wellness check-ins**: Lead moderators conduct weekly check-ins with their
  team to assess workload and mental health impact.

- **Escalation without penalty**: Moderators may escalate any item they feel
  uncomfortable reviewing without negative consequences.

### Rotation Schedule

| Day       | Primary Coverage | Backup Coverage |
| --------- | ---------------- | --------------- |
| Weekdays  | 2 senior_mods    | 1 lead_mod      |
| Weekends  | 1 senior_mod     | 1 lead_mod (on-call) |

## Audit Trail

Every moderation action creates an immutable audit record containing:

- Action type (delist, suspend, restore, appeal transitions)
- Actor DID (who performed the action)
- Timestamp
- Reason / notes
- Previous state snapshot (queue status, visibility, appeal state)
- Next state snapshot

The full audit trail for any subject is available via the moderation console
audit timeline view or the `GET /moderation/audit?subjectUri=...` endpoint.
