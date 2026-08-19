# WHOOP HUB — Performance Editorial UI implementation

Selected art direction: **Performance Editorial** from the approved concept board.

## What is implemented
- Rebuilt Today / Daily Form screen around one dominant score, explanation ledger, recommendation and AI insight.
- Added an original animated Daily Form particle field (pure SVG/CSS, no raster dependency).
- Added a custom primary glyph system for Today / Log / Train / Fuel / Coach and health signals.
- Replaced the generic floating/pill bottom navigation with a flat editorial dock and a fine active signal line.
- Reworked global visual language: near-black canvas, restrained lime signal color, flatter surfaces, thinner separators, tighter radii, less glow/shadow/card nesting.
- Updated workout rest timer palette and live workout accent to fit the selected system while preserving timer behavior.
- Updated AI Coach chrome to feel like a product intelligence layer rather than a generic gradient AI chat.
- Existing meal, journal, workout, settings and AI behaviors remain in place and inherit the new flatter visual system.

## Product behavior intentionally untouched
- API routes and contracts
- SQLite / server code
- Whoop OAuth / sync logic
- offline queue semantics
- meal analysis
- workout data model
- rest timer and EMOM logic
- journal persistence
- AI coach API behavior

## Files changed
- src/App.jsx
- src/index.css
- src/components/BrandGlyphs.jsx (new)
- src/components/Navigation.jsx
- src/components/WhoopDashboard.jsx
- src/components/WorkoutLogger.jsx
- src/components/MealScanner.jsx
- src/components/DailyJournal.jsx
- src/components/AiCoachChat.jsx

## Validation performed
All JS/JSX files were parsed successfully with `@babel/parser`.

A full Vite build could not be run in the Linux working environment because the supplied archive contains Windows-native Rollup optional binaries and does not include `@rollup/rollup-linux-x64-gnu`. This is an environment/platform issue, not a discovered source error.

On the original Windows machine run:

```bash
npm run build
npm run dev
```

Then visually verify at 360, 390 and 430 px widths, especially active workout + rest timer and virtual keyboard states.

## Important implementation rule for the next agent
Do **not** reinterpret/redesign this patch. Apply it first as-is, run the app, and capture screenshots. Only fix actual layout/runtime regressions before requesting further art-direction changes.
