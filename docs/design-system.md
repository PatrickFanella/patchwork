# Patchwork Design System

## Style Selection: 28 Organic (earthy overhaul)

Selected strategy: **Preset replacement (Option 2)**

- Primary preset: **28 Organic**
- Supporting influence: **22 Botanical** (tone restraint), **8 Swiss** (information hierarchy)

Design intent: **earthy, warm, trustworthy mutual-aid interface** that feels humane and grounded while staying crisp for operational workflows.

## UI/UX lookup synthesis (Feb 2026)

- Typography direction: calm serif + readable sans pairings for natural trust.
- Palette direction: moss + sage + clay + parchment neutrals.
- Accessibility constraints: $4.5{:}1$ minimum text contrast, machine-readable errors, visible focus.
- Motion constraints: short `150–250ms` easing, no decorative infinite animations, respect `prefers-reduced-motion`.

---

## 1) Core principles

1. **Grounded warmth**: surfaces should feel tactile, natural, and low-glare.
2. **Calm hierarchy**: typography leads with gentle scale contrast (not shouting).
3. **Soft structure**: rounded geometry and layered depth over hard borders.
4. **Operational clarity**: actionable elements remain unmistakable and fast to scan.
5. **Token discipline**: no one-off hex/pixel style drift at page level.

---

## 2) Token system (source of truth)

### Color tokens

```txt
--mh-bg:               #F3EEE2;
--mh-surface:          #FBF7EE;
--mh-surface-elev:     #EFE5D3;
--mh-panel:            #E7D8C1;

--mh-text:             #2F2A22;
--mh-text-muted:       #5D5446;
--mh-text-soft:        #7B705E;

--mh-accent:           #5D7A47;   // moss
--mh-accent-2:         #7F9B65;   // sage
--mh-accent-3:         #B99361;   // clay-gold
--mh-cta:              #C96B3E;   // terracotta
--mh-organic-moss:     #4C663B;

--mh-success:          #3F7A48;
--mh-danger:           #9E4A3D;

--mh-border:           #8A765B;
--mh-border-subtle:    #D8C9B1;
--mh-border-soft:      #BEAB8F;

--mh-link:             #4F6B3F;
--mh-link-visited:     #6F5C45;

--mh-focus:            #3E6A34;
--mh-focus-offset:     #FFFCF6;
```

### Typography tokens

- **Heading**: `Fraunces`, `Inter Tight`, serif fallback
- **Body**: `Public Sans`, `Inter`, sans fallback
- **Mono**: `JetBrains Mono`

Rules:

- Headings: `600–800`, moderate tracking (`-0.01em` to `-0.02em`)
- Labels/actions: sentence case preferred, avoid forced all-caps
- Body text: `16px+`, line-height `1.55+`

### Spacing/radius/shadow

- Base spacing: `4px`
- Touch targets: `44px+`
- Radius scale: `12px / 16px / 24px`
- Shadow style: soft diffuse depth (`rgba(83, 62, 40, 0.18)`), no hard-offset brutal shadows

---

## 3) Texture + layout

- Use soft grain and low-contrast mesh backgrounds (`3%–8%` opacity).
- Prefer warm section contrast over thick frame borders.
- Keep responsive rhythm stable: `px-4 sm:px-6 lg:px-8`.

---

## 4) Component contracts

Keep primitive contracts stable:

- `mh-button`
- `mh-card`
- `mh-panel`
- `mh-input`
- `mh-link`

### Buttons

- Rounded pill/soft rectangle (`9999px` or `14px` depending context)
- Primary: moss background + light foreground
- Secondary: sage background + dark foreground
- Neutral: elevated surface + soft border
- Hover/active: subtle brightness + shadow shift only (no layout shift)

### Cards / Panels

- Soft rounded corners and layered depth
- Thin warm borders (`--mh-border-soft`)
- Optional organic background gradients for hero/decorative zones only

### Inputs

- High legibility on warm light backgrounds
- Soft corners and visible focus ring
- Error copy must remain `role="alert"`

### Links

- Underline-first affordance remains mandatory
- Hover increases underline thickness and color emphasis

---

## 5) Motion and accessibility guardrails

1. Keep transitions `150–250ms`.
2. Respect `prefers-reduced-motion: reduce` globally.
3. Avoid decorative infinite motion loops.
4. Maintain minimum text contrast of $4.5{:}1$.
5. Never rely on color alone for statuses or errors.

---

## 6) UI transformation plan (executed)

### Scope

1. Replace dark convergence tokens with earthy-organic tokens in `tokens.css`.
2. Retune primitive component visuals (`Button`, `Card`, `Panel`) to organic geometry.
3. Preserve information architecture and route behavior while updating visual language.

### Acceptance criteria

- [x] Theme reads earthy/organic across all major routes (`/`, `/map`, `/feed`, `/resources`, `/posting`).
- [x] No hard-coded feature-level colors introduced.
- [x] Focus visibility and reduced-motion handling remain intact.
- [x] Existing test/build/e2e suites remain green.

### Rollback plan

- Revert `design-system.md`, `tokens.css`, and primitive component files in one commit.

---

## 7) Anti-patterns

- Reintroducing stark neo-brutalist hard-shadow framing globally.
- Mixing cold neon accents with earthy palette tokens.
- Returning to widespread forced-uppercase labels.
- Adding page-local style overrides that bypass shared tokens.
