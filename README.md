# 🚴 FueledUp

Calculate the perfect fuelling strategy for your ride.

Upload a GPX route (or just describe your ride) and get a personalized fueling
plan — how many carbs, calories, and how much fluid you need, and exactly when
to eat and drink along the route.

The nutrition guidance is tuned for a female endurance athlete along Stacy Sims'
lines ("women are not small men"): higher sodium targets, protein emphasized
before and after the ride, no fasted training, and an optional menstrual-cycle
phase that adjusts carbs, sodium, and protein.

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
- **Your bottles, your rules** — tell it how many bottles of what size you'll
  actually drink and the whole plan (fluid totals, mixing, schedule) follows;
  leave it blank and hydration is estimated from temperature. If you plan far
  below typical sweat losses, you get a gentle note rather than an override.
- **Fuel brands: Maurten or Tailwind** — pick your fuel and get brand-specific
  bottle recipes. Maurten plans split carbs between Drink Mix 160/320 sachets
  and Gel 100s. Tailwind plans keep every bottle **hypotonic** (1 scoop per
  600 ml — Sims' fast-hydrating ~4% zone): if the carb target doesn't fit in
  the bottles, the rate is trimmed ~10% and the remainder rides as chew bars
  (SiS Beta Fuel 60 g / 226ERS 30 g) in ~30 g feedings washed down from the
  bottle.
- **Osmolality-aware mixing** — each bottle's osmolality is estimated from its
  carb species (long-chain maltodextrin counts far fewer particles per gram
  than dextrose/sucrose) plus sodium, then classified hypotonic → hypertonic.
  Hypertonic Tailwind mixes get a plain-water top-up recommendation; Maurten's
  hypertonic DM320 is flagged with its hydrogel context.
- **Elevation chart** — SVG profile with eat/drink markers and a hover
  crosshair; the timeline table doubles as the accessible data view.
- **Shopping list** — how many sachets, gels, scoops, and bottles to pack.
- **Pre/post-ride meals** — a per-ride pre-ride plan: carb target scaled to
  ride length (1–2 g/kg), protein with the meal (never train fasted), eating
  window that shifts earlier for hard efforts, ~6 ml/kg of water, concrete
  example menus that add up to the target, and a banana/gel top-up 20 min
  before rollout on long or hard days. Post-ride: ~1 g/kg carbs plus a higher
  ~0.4 g/kg protein hit inside a ~30 min window.
- **Early-morning starts** — flag a ride as "no time for a full pre-ride
  meal" and the plan adapts: the carb load moves to a carb-rich dinner the
  night before, the morning gets a small quick wake-up snack (~0.5 g/kg carbs
  + protein, ~30 min before rollout, coffee approved), and in-ride fueling
  starts at ~10 min instead of 20 since glycogen isn't fully topped.
- **Female-athlete / Stacy Sims tuning** — higher sodium targets, pre- and
  post-ride protein emphasis, and an optional menstrual-cycle phase. The
  high-hormone (luteal) phase raises carbs, sodium, and protein and adds
  thermoregulation guidance; a hypertonic bottle surfaces Sims' "keep it
  hypotonic, take carbs as food" note without overriding your bottle choice.
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
