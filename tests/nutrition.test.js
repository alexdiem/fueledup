import { test } from "node:test";
import assert from "node:assert/strict";
import {
  carbTargetPerHour,
  carbFraction,
  fluidPerHour,
  buildPlan,
  mealAdvice,
  estimateOsmolality,
  classifyTonicity,
  maxScoopsPerBottle,
  BRANDS,
  GUT_CAP_G_PER_H,
} from "../js/nutrition.js";

test("carb target rises with duration and never exceeds the gut cap", () => {
  const short = carbTargetPerHour(0.9 * 3600, 0.68);
  const medium = carbTargetPerHour(2.5 * 3600, 0.68);
  const long = carbTargetPerHour(4.5 * 3600, 0.68);
  assert.ok(short < medium && medium < long);
  assert.ok(long <= GUT_CAP_G_PER_H);
  assert.ok(carbTargetPerHour(6 * 3600, 0.9) <= GUT_CAP_G_PER_H);
});

test("carb fraction of energy rises with intensity, bounded 0.35–0.95", () => {
  assert.ok(carbFraction(0.55) < carbFraction(0.85));
  assert.ok(carbFraction(0.1) >= 0.35);
  assert.ok(carbFraction(1.2) <= 0.95);
});

test("hot days need more fluid", () => {
  assert.ok(fluidPerHour(30) > fluidPerHour(15));
  assert.ok(fluidPerHour(-5) >= 400);
  assert.ok(fluidPerHour(45) <= 1000);
});

// --- Osmolality ------------------------------------------------------------

test("osmolality rises with concentration and falls with chain length", () => {
  const tw = BRANDS.tailwind.species;
  assert.ok(estimateOsmolality(120, tw) > estimateOsmolality(60, tw));
  // Same concentration: maltodextrin-based reads far lower than monomers.
  assert.ok(
    estimateOsmolality(160, BRANDS.maurten.species) <
    estimateOsmolality(160, BRANDS.tailwind.species) * 0.75
  );
});

test("tonicity bands classify sensibly", () => {
  assert.equal(classifyTonicity(150), "hypotonic");
  assert.equal(classifyTonicity(290), "isotonic");
  assert.equal(classifyTonicity(420), "mildly hypertonic");
  assert.equal(classifyTonicity(600), "hypertonic");
});

test("Maurten DM160 is ~isotonic, DM320 is hypertonic (hydrogel-noted)", () => {
  const sim = { durationS: 2.5 * 3600, kcal: 1500, intensityFactor: 0.68, cumTime: [0] };
  const iso = buildPlan(sim, 18, "maurten");
  const dm160 = iso.drinks.find((d) => d.recipe.includes("160"));
  assert.ok(dm160, "2.5 h endurance ride should use Drink Mix 160");
  assert.equal(dm160.tonicity, "isotonic");

  const race = { durationS: 4.5 * 3600, kcal: 4000, intensityFactor: 0.88, cumTime: [0] };
  const hyper = buildPlan(race, 18, "maurten");
  const dm320 = hyper.drinks.find((d) => d.recipe.includes("320"));
  assert.ok(dm320, "long race-pace ride should use Drink Mix 320");
  assert.ok(dm320.mOsm > 340, `got ${dm320.mOsm}`);
  assert.ok(dm320.note?.includes("Hydrogel"), "hypertonic Maurten mix carries the hydrogel note");
});

// --- Brand plans -------------------------------------------------------------

const sim3h = { durationS: 3 * 3600, kcal: 1800, intensityFactor: 0.68, cumTime: [0] };

test("Maurten plan splits carbs between mix bottles and gels", () => {
  const plan = buildPlan(sim3h, 18, "maurten");
  assert.ok(plan.events.some((e) => e.type === "eat" && e.label.includes("Gel")));
  assert.ok(plan.shopping.some((s) => s.label.includes("Drink Mix")));
  assert.ok(plan.shopping.some((s) => s.label.includes("Gel")));
  assert.ok(Math.abs(plan.plannedCarbsG - plan.totalCarbsG) < plan.totalCarbsG * 0.35);
  // Maurten is low sodium — expect a salt note.
  assert.ok(plan.notes.some((n) => n.toLowerCase().includes("sodium") || n.includes("salt")));
});

test("Tailwind plan is drink-only with electrolytes covered", () => {
  const plan = buildPlan(sim3h, 18, "tailwind");
  assert.equal(plan.events.filter((e) => e.type === "eat").length, 0);
  assert.ok(plan.events.some((e) => e.type === "drink" && e.carbsG > 0));
  const scoops = plan.shopping.find((s) => s.label.includes("scoop"));
  assert.ok(scoops && Math.abs(scoops.count * 25 - plan.totalCarbsG) <= 13);
  assert.ok(plan.sodiumProvidedPerHour > 0);
});

test("Tailwind in the cold at high carb rates goes hypertonic with a water top-up note", () => {
  // 4.5 h race pace at 0 °C: lots of carbs, little fluid.
  const race = { durationS: 4.5 * 3600, kcal: 4000, intensityFactor: 0.88, cumTime: [0] };
  const plan = buildPlan(race, 0, "tailwind");
  const mix = plan.drinks[0];
  assert.equal(mix.tonicity, "hypertonic", `got ${mix.tonicity} at ${mix.mOsm} mOsm/kg`);
  assert.ok(plan.notes.some((n) => n.includes("plain water")));
});

test("the osmolality ceiling puts 2 scoops in a 600 ml Tailwind bottle", () => {
  assert.equal(maxScoopsPerBottle(BRANDS.tailwind), 2);
});

test("Tailwind concentrates bottles to the ceiling and leaves the rest as water", () => {
  // Hot easy 3 h ride: plenty of fluid, modest carbs — bottles should be
  // packed to ~2 scoops with surplus bottles as plain water, not all
  // bottles diluted evenly.
  const easy = { durationS: 3 * 3600, kcal: 1400, intensityFactor: 0.55, cumTime: [0] };
  const plan = buildPlan(easy, 30, "tailwind");
  const mix = plan.drinks.find((d) => d.carbsG > 0);
  const water = plan.drinks.find((d) => d.carbsG === 0);
  assert.ok(mix, "expected mix bottles");
  assert.ok(water, "surplus fluid should be plain water bottles");
  assert.ok(mix.recipe.startsWith("2.0 scoops"), `got ${mix.recipe}`);
  assert.ok(mix.mOsm <= 500, `got ${mix.mOsm}`);
  assert.equal(plan.notes.some((n) => n.includes("plain water to keep")), false,
    "no top-up nag when bottles are within the ceiling");
});

test("Tailwind at the standard 2-scoop mix carries no hypertonic warning", () => {
  // 2.5 h endurance, 22 °C: carbs fit at 2 scoops/bottle exactly.
  const ride = { durationS: 2.5 * 3600, kcal: 1500, intensityFactor: 0.68, cumTime: [0] };
  const plan = buildPlan(ride, 22, "tailwind");
  const mix = plan.drinks.find((d) => d.carbsG > 0);
  assert.ok(mix.mOsm <= 500, `got ${mix.mOsm}`);
  assert.ok(mix.tonicity !== "hypertonic");
  assert.equal(plan.notes.some((n) => n.includes("Chase each bottle")), false);
});

test("events are sorted, inside the ride, with no food in the final 15 min", () => {
  for (const brand of ["maurten", "tailwind"]) {
    const plan = buildPlan(sim3h, 18, brand);
    let prev = -1;
    for (const e of plan.events) {
      assert.ok(e.timeS >= prev);
      prev = e.timeS;
      assert.ok(e.timeS < sim3h.durationS);
      if (e.type === "eat") assert.ok(e.timeS <= sim3h.durationS - 14 * 60);
    }
  }
});

test("a short easy spin schedules no food for either brand", () => {
  const spin = { durationS: 45 * 60, kcal: 400, intensityFactor: 0.55, cumTime: [0] };
  for (const brand of ["maurten", "tailwind"]) {
    const plan = buildPlan(spin, 18, brand);
    assert.equal(plan.events.filter((e) => e.type === "eat").length, 0);
    assert.equal(plan.totalCarbsG, 0);
  }
});

test("meal advice scales with body weight", () => {
  const a = mealAdvice(60, 3 * 3600);
  const b = mealAdvice(90, 3 * 3600);
  assert.ok(b.pre.carbsG > a.pre.carbsG);
  assert.ok(b.post.proteinG > a.post.proteinG);
});
