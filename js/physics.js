// Cycling power/speed model.
// Solves steady-state speed per route segment from a target power, then
// integrates time and mechanical work over the route.

export const GRAVITY = 9.81;
export const AIR_DENSITY = 1.225; // kg/m^3 at sea level, 15 °C
export const DRIVETRAIN_EFFICIENCY = 0.975;
export const MAX_SPEED = 16.7; // m/s (~60 km/h), descent safety cap
export const MIN_SPEED = 0.7; // m/s, walking-pace floor on brutal ramps

// Gross metabolic efficiency ~23% and 4.184 kJ/kcal almost cancel:
// kcal burned ≈ kJ of work × 1.04.
export const KJ_TO_KCAL = 1.04;

export const INTENSITIES = {
  casual: { label: "Casual", factor: 0.55 },
  endurance: { label: "Endurance", factor: 0.68 },
  brisk: { label: "Brisk", factor: 0.78 },
  race: { label: "Race pace", factor: 0.88 },
};

// FTP estimate (W/kg) when the rider doesn't know theirs.
export const LEVEL_WKG = {
  new: 1.8,
  occasional: 2.3,
  regular: 2.9,
  competitive: 3.7,
};

export function estimateFtp(weightKg, level) {
  const wkg = LEVEL_WKG[level] ?? LEVEL_WKG.regular;
  return Math.round(weightKg * wkg);
}

// Power needed at the wheel to hold speed v (m/s) on a given grade.
export function powerAtSpeed(v, grade, opts) {
  const { massKg, crr, cda, rho } = opts;
  const theta = Math.atan(grade);
  const rolling = crr * massKg * GRAVITY * Math.cos(theta) * v;
  const climbing = massKg * GRAVITY * Math.sin(theta) * v;
  const aero = 0.5 * rho * cda * v * v * v;
  return rolling + climbing + aero;
}

// Steady-state speed for a given wheel power on a given grade (bisection).
export function speedAtPower(wheelPower, grade, opts) {
  let lo = 0;
  let hi = 30;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (powerAtSpeed(mid, grade, opts) > wheelPower) hi = mid;
    else lo = mid;
  }
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, (lo + hi) / 2));
}

// Riders don't hold target power downhill: back off with the gradient,
// coast entirely when it's steep.
export function appliedPower(targetPower, grade) {
  if (grade <= -0.06) return 0;
  if (grade < -0.01) {
    const t = (grade + 0.01) / -0.05; // 0 at -1%, 1 at -6%
    return targetPower * (1 - t);
  }
  return targetPower;
}

/**
 * Simulate a ride over route segments.
 * @param {Array<{dist:number, grade:number}>} segments dist in meters
 * @param {object} rider { weightKg, bikeKg, ftp, intensity, crr?, cda?, rho? }
 * @returns summary + per-point cumulative time for scheduling
 */
export function simulateRide(segments, rider) {
  const opts = {
    massKg: rider.weightKg + (rider.bikeKg ?? 9),
    crr: rider.crr ?? 0.005,
    cda: rider.cda ?? 0.32,
    rho: rider.rho ?? AIR_DENSITY,
  };
  const factor = INTENSITIES[rider.intensity]?.factor ?? INTENSITIES.endurance.factor;
  const targetPower = rider.ftp * factor;

  let timeS = 0;
  let workJ = 0;
  let distM = 0;
  const cumTime = [0]; // seconds at the END of each segment

  for (const seg of segments) {
    if (seg.dist <= 0) {
      cumTime.push(timeS);
      continue;
    }
    const p = appliedPower(targetPower, seg.grade);
    const v = speedAtPower(p * DRIVETRAIN_EFFICIENCY, seg.grade, opts);
    const t = seg.dist / v;
    timeS += t;
    workJ += p * t;
    distM += seg.dist;
    cumTime.push(timeS);
  }

  const kj = workJ / 1000;
  return {
    durationS: timeS,
    distM,
    kj: Math.round(kj),
    kcal: Math.round(kj * KJ_TO_KCAL),
    avgSpeedKmh: timeS > 0 ? (distM / timeS) * 3.6 : 0,
    targetPower: Math.round(targetPower),
    intensityFactor: factor,
    cumTime,
  };
}

// Build a plausible rolling course when the user has no GPX file:
// `hills` cosine hills sized so total ascent matches elevationGainM.
export function syntheticSegments(distanceKm, elevationGainM, nPoints = 240) {
  const distM = distanceKm * 1000;
  const hills = Math.max(1, Math.round(distanceKm / 15));
  const amp = elevationGainM / hills; // each hill climbs `amp` meters
  const pts = [];
  for (let i = 0; i <= nPoints; i++) {
    const x = i / nPoints;
    const ele = (amp / 2) * (1 - Math.cos(2 * Math.PI * hills * x));
    pts.push({ dist: x * distM, ele });
  }
  const segments = [];
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i].dist - pts[i - 1].dist;
    segments.push({ dist: d, grade: (pts[i].ele - pts[i - 1].ele) / d });
  }
  return { segments, points: pts };
}
