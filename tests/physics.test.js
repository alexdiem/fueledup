import { test } from "node:test";
import assert from "node:assert/strict";
import {
  speedAtPower,
  powerAtSpeed,
  appliedPower,
  simulateRide,
  syntheticSegments,
  estimateFtp,
} from "../js/physics.js";

const opts = { massKg: 79, crr: 0.005, cda: 0.32, rho: 1.225 };

test("power and speed are inverse of each other", () => {
  const v = speedAtPower(200, 0, opts);
  assert.ok(Math.abs(powerAtSpeed(v, 0, opts) - 200) < 1);
});

test("200 W on the flat is a realistic road speed (30–38 km/h)", () => {
  const kmh = speedAtPower(200 * 0.975, 0, opts) * 3.6;
  assert.ok(kmh > 30 && kmh < 38, `got ${kmh}`);
});

test("more power means more speed; climbing means less", () => {
  assert.ok(speedAtPower(250, 0, opts) > speedAtPower(150, 0, opts));
  assert.ok(speedAtPower(200, 0.08, opts) < speedAtPower(200, 0, opts));
});

test("descent speed is capped", () => {
  assert.ok(speedAtPower(100, -0.1, opts) * 3.6 <= 60.2);
});

test("riders coast on steep descents", () => {
  assert.equal(appliedPower(200, -0.08), 0);
  assert.equal(appliedPower(200, 0.05), 200);
  const mid = appliedPower(200, -0.035);
  assert.ok(mid > 0 && mid < 200);
});

test("simulateRide: flat 40 km at endurance pace takes 1–1.6 h", () => {
  const segments = Array.from({ length: 100 }, () => ({ dist: 400, grade: 0 }));
  const sim = simulateRide(segments, { weightKg: 70, ftp: 250, intensity: "endurance" });
  const h = sim.durationS / 3600;
  assert.ok(h > 1 && h < 1.6, `got ${h}h`);
  assert.equal(sim.cumTime.length, segments.length + 1);
  assert.ok(sim.kj > 400 && sim.kcal >= sim.kj);
});

test("hillier ride burns more and takes longer than flat, same distance", () => {
  const rider = { weightKg: 70, ftp: 250, intensity: "endurance" };
  const flat = simulateRide(syntheticSegments(60, 0).segments, rider);
  const hilly = simulateRide(syntheticSegments(60, 1200).segments, rider);
  assert.ok(hilly.durationS > flat.durationS);
  assert.ok(hilly.kj >= flat.kj * 0.98); // coasting descents give back a bit
});

test("syntheticSegments climbs roughly the requested elevation", () => {
  const { segments } = syntheticSegments(80, 900);
  let gain = 0;
  for (const s of segments) if (s.grade > 0) gain += s.grade * s.dist;
  assert.ok(Math.abs(gain - 900) < 50, `got ${gain}`);
});

test("estimateFtp scales with weight and level", () => {
  assert.ok(estimateFtp(80, "regular") > estimateFtp(60, "regular"));
  assert.ok(estimateFtp(70, "competitive") > estimateFtp(70, "new"));
});
