# 🚴 FueledUp

Calculate the perfect fuelling strategy for your ride.

Upload a GPX route (or just describe your ride) and get a personalized fueling
plan — how many carbs, calories, and how much fluid you need, and exactly when
to eat and drink along the route.

Entirely client-side: no build step, no server, no dependencies. Open it and ride.

## Features

- **GPX upload** — parses tracks/routes from Strava, Komoot, RideWithGPS, etc.,
  with elevation smoothing so noisy GPS doesn't inflate climbing totals.
- **Physics-based ride model** — solves steady-state speed per segment from a
  target power (rolling resistance + aero drag + gravity), including coasting
  on descents, to estimate ride time and energy burn (kJ/kcal).
- **Personalized power** — enter your FTP, or let the app estimate it from your
  weight and how often you ride.
- **Fueling plan** — carb targets from mainstream sports-nutrition guidance
  (30–90 g/h by duration and intensity, capped at gut absorption), temperature-
  adjusted hydration and sodium, and a concrete timeline: *at 1:40, 42 km, eat
  a gel / finish a bottle*.
- **Fuel brands: Maurten or Tailwind** — pick your fuel and get brand-specific
  bottle recipes. Maurten plans split carbs between Drink Mix 160/320 sachets
  and Gel 100s; Tailwind plans put all fuel in the bottle as Endurance Fuel
  scoops (packed to ~2 scoops per bottle — the osmolality ceiling — with any
  surplus bottles as plain water) and its built-in electrolytes.
- **Osmolality-aware mixing** — each bottle's osmolality is estimated from its
  carb species (long-chain maltodextrin counts far fewer particles per gram
  than dextrose/sucrose) plus sodium, then classified hypotonic → hypertonic.
  Hypertonic Tailwind mixes get a plain-water top-up recommendation; Maurten's
  hypertonic DM320 is flagged with its hydrogel context.
- **Elevation chart** — SVG profile with eat/drink markers and a hover
  crosshair; the timeline table doubles as the accessible data view.
- **Shopping list** — how many sachets, gels, scoops, and bottles to pack.
- **Pre/post-ride meals** — weight-based carb and protein guidance.
- Light and dark theme, responsive layout.

## Run it

```sh
npm start        # serves on http://localhost:8080 (any static server works)
```

Then click **“or load the sample ride”** to try it without a GPX file.

## Test

```sh
npm test         # node --test — no dependencies needed (Node 18+)
```

## Project layout

```
index.html          UI
css/style.css       theme tokens (light/dark) + layout
js/gpx.js           GPX parsing, haversine distance, elevation smoothing
js/physics.js       power/speed model, ride simulation, FTP estimation
js/nutrition.js     carb/fluid/sodium targets, fueling schedule, meals
js/chart.js         SVG elevation profile + fueling markers
js/app.js           form wiring and rendering
data/sample-ride.gpx  demo route (~67 km, one big climb)
tests/              node:test unit tests for the model
```

## Disclaimer

Estimates, not medical advice. Trial your fueling in training — never try a new
plan on race day.
