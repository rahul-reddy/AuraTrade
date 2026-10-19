# AuraTrade workspace design

AuraTrade is a trading review workspace. Its interface should help a trader answer
three questions: How am I performing? Which trades explain it? What should I review
next?

## Visual system

The workspace now connects daily review, chart-side journals, personal playbooks,
edge analysis, weekly experiments and operational health. Journal writing uses
explicit save actions and version conflicts retain the unsaved draft. Screenshots
are authenticated PNG/JPEG/WebP attachments (3 MB each, five per journal, 100 MB
per account). Rebuilds retain journals independently from derived trade IDs.

Personal setup labels and plan adherence describe the trader's process. Inferred
setups and classifier scores describe the rule-based engine. The UI keeps these
distinct; a profitable result does not automatically mean a good decision.

Edge analysis exposes sample size and uncertainty before any inference. Each
group expands to the actual trades. A weekly review ends in one measurable
behavior experiment and provides a field for the subsequent observation.

Saved filter views and chart displays persist in browser storage and synchronize
tabs. Blocked storage leaves preferences usable in the current document. The eye
control masks account amounts for presentation; prices, journals and images remain
visible. The head bootstrap masks server-rendered amounts before hydration.

- **Espresso & Acid** (owner choice, 2026-10-18): warm surfaces, citron branding,
  olive/citron actions and mineral/glacier blue chart accents. Green/rose retain
  their financial meaning in both modes.
- A sun/moon control on the auth screen and workspace toolbar switches modes.
  Dark is the default; the browser stores `auratrade-theme` locally and syncs tabs.
  An inline head script applies the saved mode before hydration. Blocked storage
  falls back to dark on reload; switching still works in the current document.
- `src/app/globals.css` owns all role-based color values, including chart colors.
  Existing zinc utilities alias a mode-aware warm neutral scale. Use semantic
  `primary`, `primary-foreground`, `profit`, `loss`, `warning` and `chart-*` colors
  for new work; never hardcode white text onto theme-dependent surfaces.

| Role | Dark | Light |
| --- | --- | --- |
| Canvas | `#1B1713` | `#F6F2E9` |
| Surface | `#2A231D` | `#FFFCF5` |
| Text | `#F6F0E4` | `#30271C` |
| Muted text | `#BFB09C` | `#726553` |
| Action | `#D8EB7C` | `#586414` |
| Action ink | `#1B1713` | `#FFFFFF` |
| Blue chart accent | `#91C9F7` | `#28658D` |
| Profit / up | `#57D9A3` | `#14734C` |
| Loss / down | `#FF7D91` | `#B72E49` |

Canvas charts resolve CSS tokens and update the mounted chart in place, retaining
zoom, data, selected trades and display settings. SVG charts use CSS variables.
Heatmap intensity uses restrained profit/loss tints, with exact amounts visible.
Citron branding stays constant across modes; light-mode action text uses olive.

- Inter for interface text; JetBrains Mono for money, quantities and dates.
- Shared page headers establish context, title, description and a relevant next action.
- Cards, controls and tables use consistent spacing, rounded corners and focus states.
  Tables keep enough density for desktop review while allowing horizontal scrolling
  within their own container on small screens.
- The application uses the existing components and chart libraries. No external image
  assets or additional UI dependencies are required.

## Main journeys

1. **Return to work:** `/` redirects to `/dashboard`. The existing sign-in callback
   continues to return users to protected deep links. The sign-in screen includes
   password visibility and accessible error feedback.
2. **Start an account:** an empty workspace explains import, preview and analysis,
   with one primary action leading to upload.
3. **Review performance:** four primary metrics lead, followed by secondary context.
   Section links jump to equity and sizing, patterns, calendar and position analysis.
   Metric cards still link to the underlying trades and retain the existing filters.
4. **Explore trades:** all, closed and open views preserve the other filters. Named
   filter inputs and a readable table support further investigation and CSV export.
5. **Import history:** a three-stage progress indicator follows choose, review and
   completion. A persistent guide explains the preferred thinkorswim Account Statement
   and the date-only Schwab Transaction History alternative. Import confirmation and
   safety blockers remain part of the existing preview flow.
6. **Inspect data and charts:** settings use the same hierarchy and surfaces. Chart
   review shares the palette and adapts its trade sidebar to a small viewport.

## Accessibility and responsive behavior

The sidebar becomes an icon rail below 768px; every destination retains an accessible
name. Active destinations expose `aria-current`. A skip link reaches the main content.
Inputs have labels, import progress exposes the current step, selected chart trades
expose their pressed state, and password visibility is announced by its toggle.
Motion respects the user's reduced-motion setting, including page transitions.

Desktop is the primary workspace. Small screens use stacked content and locally
scrollable tables; controls must remain usable without widening the document.

## Verification

`playwright/workspace-design.spec.ts` exercises root sign-in, signed-in root navigation,
protected deep links, password visibility, first-import onboarding, import progress,
dashboard anchors, command navigation, trade views and small-screen layouts. It saves
screenshots with synthetic test data under `test-results/` for visual inspection.
`playwright/theme.spec.ts` covers persistence through sign-in, navigation, reloads
and other tabs; pre-hydration appearance, blocked storage, themed canvas charts,
command dialogs and mobile controls.
The existing browser suite remains the regression check for uploads, chart behavior,
account integrity, lockout and sidebar persistence.

Financial calculations, broker parsing and persistence are outside this presentation
change. No migration is needed. See `docs/DEPLOYMENT.md` for startup and delivery.
