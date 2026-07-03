// GPX parsing + route geometry. Regex-based so it runs in the browser and in
// Node tests without a DOM. Handles <trkpt> and <rtept> with attributes in
// either order.

const PT_RE = /<(trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/\1>/g;
const LAT_RE = /\blat\s*=\s*["']([^"']+)["']/;
const LON_RE = /\blon\s*=\s*["']([^"']+)["']/;
const ELE_RE = /<ele>\s*([-\d.eE+]+)\s*<\/ele>/;
const NAME_RE = /<name>([\s\S]*?)<\/name>/;

export function parseGpx(text) {
  const points = [];
  let m;
  PT_RE.lastIndex = 0;
  while ((m = PT_RE.exec(text)) !== null) {
    const lat = LAT_RE.exec(m[2]);
    const lon = LON_RE.exec(m[2]);
    if (!lat || !lon) continue;
    const ele = ELE_RE.exec(m[3]);
    points.push({
      lat: parseFloat(lat[1]),
      lon: parseFloat(lon[1]),
      ele: ele ? parseFloat(ele[1]) : 0,
    });
  }
  if (points.length < 2) {
    throw new Error("No track points found — is this a GPX file with a recorded track or route?");
  }
  const name = NAME_RE.exec(text);
  return { name: name ? name[1].trim() : null, points };
}

const EARTH_R = 6371000;

export function haversineM(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

// Moving-average elevation smoothing over ~windowM meters of route, so GPS
// noise doesn't inflate climbing totals.
export function smoothElevation(points, cumDist, windowM = 120) {
  const out = new Array(points.length);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < points.length; i++) {
    while (cumDist[lo] < cumDist[i] - windowM / 2) lo++;
    while (hi < points.length - 1 && cumDist[hi + 1] <= cumDist[i] + windowM / 2) hi++;
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += points[j].ele;
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

/**
 * Turn raw GPX points into route geometry:
 * profile points {dist(m), ele(m)}, segments {dist, grade}, totals.
 */
export function buildRoute(points) {
  const cumDist = [0];
  for (let i = 1; i < points.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineM(points[i - 1], points[i]));
  }
  const ele = smoothElevation(points, cumDist);

  const profile = [];
  const segments = [];
  profile.push({ dist: 0, ele: ele[0] });
  // Gain with 2 m hysteresis so residual noise doesn't accumulate.
  let gain = 0;
  let anchor = ele[0];
  for (let i = 1; i < points.length; i++) {
    const d = cumDist[i] - cumDist[i - 1];
    if (d < 0.5) continue; // duplicate/paused points
    const prev = profile[profile.length - 1];
    const rise = ele[i] - prev.ele;
    const dist = cumDist[i] - prev.dist;
    // Clamp absurd grades from residual noise.
    const grade = Math.max(-0.25, Math.min(0.25, rise / dist));
    if (ele[i] > anchor + 2) {
      gain += ele[i] - anchor;
      anchor = ele[i];
    } else if (ele[i] < anchor - 2) {
      anchor = ele[i];
    }
    segments.push({ dist, grade });
    profile.push({ dist: cumDist[i], ele: ele[i] });
  }

  return {
    profile,
    segments,
    distM: profile[profile.length - 1].dist,
    gainM: Math.round(gain),
  };
}
