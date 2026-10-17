# AuraTrade workspace design

AuraTrade is a trading review workspace. Its interface should help a trader answer
three questions: How am I performing? Which trades explain it? What should I review
next?

## Visual system

- Charcoal surfaces with cool neutral borders and restrained depth. Blue identifies
  actions and selection; green and red retain their financial meaning.
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
The existing browser suite remains the regression check for uploads, chart behavior,
account integrity, lockout and sidebar persistence.

Financial calculations, broker parsing and persistence are outside this presentation
change. No migration is needed. See `docs/DEPLOYMENT.md` for startup and delivery.
