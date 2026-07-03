import { test } from "node:test";
import assert from "node:assert/strict";
import {
  carbTargetPerHour,
  carbFraction,
  fluidPerHour,
  buildPlan,
  mealAdvice,
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

const sim3h = {
  durationS: 3 * 3600,
  kcal: 1800,
  intensityFactor: 0.68,
  cumTime: [0],
};

test("buildPlan schedules eat events covering roughly the carb total", () => {
  const plan = buildPlan(sim3h, 18);
  const eats = plan.events.filter((e) => e.type === "eat");
  assert.ok(eats.length >= 4, `got ${eats.length} eat events`);
  assert.ok(Math.abs(plan.plannedCarbsG - plan.totalCarbsG) < plan.totalCarbsG * 0.35);
  // events sorted, inside the ride, none in the final 15 minutes for food
  let prev = -1;
  for (const e of plan.events) {
    assert.ok(e.timeS >= prev);
    prev = e.timeS;
    assert.ok(e.timeS < sim3h.durationS);
    if (e.type === "eat") assert.ok(e.timeS <= sim3h.durationS - 14 * 60);
  }
});

test("buildPlan includes drink events and a shopping list", () => {
  const plan = buildPlan(sim3h, 25);
  assert.ok(plan.events.some((e) => e.type === "drink"));
  assert.ok(plan.bottles >= 2);
  assert.ok(plan.shopping.length > 0);
  assert.ok(plan.sodiumPerHour > 0);
});

test("a short easy spin schedules no food", () => {
  const plan = buildPlan({ durationS: 45 * 60, kcal: 400, intensityFactor: 0.55, cumTime: [0] }, 18);
  assert.equal(plan.events.filter((e) => e.type === "eat").length, 0);
});

test("meal advice scales with body weight", () => {
  const a = mealAdvice(60, 3 * 3600);
  const b = mealAdvice(90, 3 * 3600);
  assert.ok(b.pre.carbsG > a.pre.carbsG);
  assert.ok(b.post.proteinG > a.post.proteinG);
});
