// Fueling science: carbohydrate targets, hydration, and an in-ride schedule.
// Targets follow mainstream sports-nutrition guidance (Jeukendrup):
//   < 75 min: fuel optional; 1–2 h: ~30 g/h; 2–3 h: ~60 g/h; 3 h+: 80–90 g/h,
// capped by realistic gut absorption for glucose+fructose mixes.

export const GUT_CAP_G_PER_H = 90;

export const PRODUCTS = {
  gel: { label: "Energy gel", carbsG: 25 },
  bar: { label: "Energy bar", carbsG: 40 },
  chews: { label: "Chews (pack)", carbsG: 30 },
  banana: { label: "Banana", carbsG: 25 },
};

export const BOTTLE_ML = 600;

// Fraction of energy coming from carbohydrate at a given intensity factor.
// ~55% CHO at IF 0.55 rising to ~95% at IF 0.85+.
export function carbFraction(intensityFactor) {
  return Math.min(0.95, Math.max(0.35, 1.4 * intensityFactor - 0.2));
}

// Recommended carb intake rate (g/h) from ride duration and intensity.
export function carbTargetPerHour(durationS, intensityFactor) {
  const h = durationS / 3600;
  let rate;
  if (h < 1.25) rate = intensityFactor >= 0.75 ? 30 : 20;
  else if (h < 2) rate = 40;
  else if (h < 3) rate = 60;
  else if (h < 4) rate = 75;
  else rate = 85;
  if (intensityFactor >= 0.8) rate += 10;
  else if (intensityFactor <= 0.6) rate -= 10;
  return Math.max(0, Math.min(GUT_CAP_G_PER_H, rate));
}

// Fluid needs (ml/h) from air temperature.
export function fluidPerHour(tempC) {
  return Math.round(Math.min(1000, Math.max(400, 400 + 25 * (tempC - 10))));
}

// Sodium (mg/h) — ~500 mg per liter of fluid, more when it's hot.
export function sodiumPerHour(tempC) {
  const mgPerL = tempC >= 25 ? 800 : 500;
  return Math.round((fluidPerHour(tempC) / 1000) * mgPerL);
}

function pickProduct(index) {
  // Alternate gels and bars, lean on gels late in the ride when chewing
  // gets hard; every third solid can be a banana.
  const cycle = ["gel", "bar", "gel", "chews"];
  return cycle[index % cycle.length];
}

/**
 * Build the in-ride fueling plan.
 * @param {object} sim result of simulateRide (durationS, kcal, intensityFactor…)
 * @param {number} tempC
 * @returns plan { carbsPerHour, totalCarbsG, burn, fluid, events, shopping }
 */
export function buildPlan(sim, tempC) {
  const hours = sim.durationS / 3600;
  const carbsPerHour = carbTargetPerHour(sim.durationS, sim.intensityFactor);
  const burnPerHour = Math.round((sim.kcal / hours) * carbFraction(sim.intensityFactor) / 4);
  const fluidPerH = fluidPerHour(tempC);
  const totalFluidMl = Math.round(fluidPerH * hours);
  const bottles = Math.max(1, Math.ceil(totalFluidMl / BOTTLE_ML));

  const events = [];
  const counts = { gel: 0, bar: 0, chews: 0, banana: 0 };

  // Eating events: first at 20 min, then spaced so each carries ~a product's
  // worth of carbs; nothing scheduled in the final 15 min.
  const totalCarbsG = Math.round(carbsPerHour * hours);
  if (carbsPerHour > 0 && sim.durationS > 60 * 60) {
    const eatWindowS = sim.durationS - 20 * 60 - 15 * 60;
    if (eatWindowS > 0) {
      const avgUnit = 30; // g per feeding
      const nEvents = Math.max(1, Math.round(totalCarbsG / avgUnit));
      const gap = nEvents > 1 ? eatWindowS / (nEvents - 1) : 0;
      for (let i = 0; i < nEvents; i++) {
        const key = pickProduct(i);
        counts[key]++;
        events.push({
          type: "eat",
          timeS: 20 * 60 + i * gap,
          label: PRODUCTS[key].label,
          carbsG: PRODUCTS[key].carbsG,
        });
      }
    }
  }

  // Drinking: one event per bottle-finish rather than every-sip noise.
  const drinkIntervalS = (BOTTLE_ML / fluidPerH) * 3600;
  for (let t = drinkIntervalS; t < sim.durationS - 5 * 60; t += drinkIntervalS) {
    events.push({
      type: "drink",
      timeS: t,
      label: "Finish a bottle",
      fluidMl: BOTTLE_ML,
    });
  }

  events.sort((a, b) => a.timeS - b.timeS);

  const plannedCarbsG = events.reduce((s, e) => s + (e.carbsG ?? 0), 0);

  return {
    carbsPerHour,
    totalCarbsG,
    plannedCarbsG,
    burnPerHour,
    totalBurnG: Math.round(burnPerHour * hours),
    fluidPerHour: fluidPerH,
    totalFluidMl,
    sodiumPerHour: sodiumPerHour(tempC),
    bottles,
    events,
    shopping: Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([key, n]) => ({ label: PRODUCTS[key].label, count: n })),
  };
}

// Pre/post-ride guidance (g of carbs), classic 1–2 g/kg pre, 1 g/kg + protein post.
export function mealAdvice(weightKg, durationS) {
  const long = durationS > 2.5 * 3600;
  return {
    pre: {
      carbsG: Math.round(weightKg * (long ? 2 : 1)),
      note: long
        ? "Eat 2–3 h before you roll out — oats, rice, or toast with jam."
        : "A light carb-based snack 1–2 h before is plenty.",
    },
    post: {
      carbsG: Math.round(weightKg * 1),
      proteinG: Math.round(weightKg * 0.3),
      note: "Within ~45 min of finishing, pair carbs with protein to kick-start recovery.",
    },
  };
}
