import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGpx, buildRoute, haversineM } from "../js/gpx.js";

const SAMPLE = new URL("../data/sample-ride.gpx", import.meta.url);

test("parses trkpt with attributes in either order", () => {
  const gpx = `<gpx><trk><trkseg>
    <trkpt lat="60.0" lon="5.0"><ele>10</ele></trkpt>
    <trkpt lon="5.01" lat="60.0"><ele>20</ele></trkpt>
  </trkseg></trk></gpx>`;
  const { points } = parseGpx(gpx);
  assert.equal(points.length, 2);
  assert.equal(points[1].lat, 60.0);
  assert.equal(points[1].lon, 5.01);
  assert.equal(points[1].ele, 20);
});

test("throws a helpful error on non-GPX input", () => {
  assert.throws(() => parseGpx("<html>hello</html>"), /No track points/);
});

test("haversine: 1 degree of latitude is ~111 km", () => {
  const d = haversineM({ lat: 60, lon: 5 }, { lat: 61, lon: 5 });
  assert.ok(Math.abs(d - 111195) < 500, `got ${d}`);
});

test("sample ride builds a sane route", () => {
  const { name, points } = parseGpx(readFileSync(SAMPLE, "utf8"));
  assert.equal(name, "Fjord Loop (sample)");
  const route = buildRoute(points);
  assert.ok(route.distM > 50_000 && route.distM < 90_000);
  assert.ok(route.gainM > 300 && route.gainM < 900);
  assert.equal(route.profile.length, route.segments.length + 1);
  for (const s of route.segments) {
    assert.ok(s.dist > 0);
    assert.ok(Math.abs(s.grade) <= 0.25);
  }
});

test("smoothing keeps noisy GPS from inflating climb totals", () => {
  // Flat route with ±3 m elevation noise every ~30 m should read as ~0 gain.
  const points = [];
  for (let i = 0; i < 200; i++) {
    points.push({ lat: 60 + i * 0.0003, lon: 5, ele: 100 + (i % 2 ? 3 : -3) });
  }
  const route = buildRoute(points);
  assert.ok(route.gainM < 15, `got ${route.gainM}`);
});
