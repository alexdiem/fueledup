// Fueling science: carbohydrate targets, hydration, osmolality-aware drink
// mixing, and an in-ride schedule for a chosen fuel brand.
// Carb targets follow mainstream sports-nutrition guidance (Jeukendrup):
//   < 75 min: fuel optional; 1–2 h: ~30 g/h; 2–3 h: ~60 g/h; 3 h+: 80–90 g/h,
// capped by realistic gut absorption for glucose+fructose mixes.

export const GUT_CAP_G_PER_H = 90;

// --- Fuel brands -----------------------------------------------------------
// Product data is approximate, from public nutrition labels.
// `species` is the carb composition used for the osmolality estimate.

export const BRANDS = {
  maurten: {
    key: "maurten",
    label: "Maurten",
    // ~1:0.8 maltodextrin:fructose, hydrogel-encapsulated
    species: { maltodextrin: 0.56, fructose: 0.44 },
    hydrogel: true,
    bottleMl: 500, // one sachet is designed for exactly 500 ml
    drinkMixes: [
      { key: "dm160", label: "Drink Mix 160", carbsG: 40, sodiumMg: 200 },
      { key: "dm320", label: "Drink Mix 320", carbsG: 80, sodiumMg: 250 },
    ],
    gel: { label: "Gel 100", carbsG: 25 },
  },
  tailwind: {
    key: "tailwind",
    label: "Tailwind",
    // dextrose + sucrose, roughly even split
    species: { glucose: 0.5, sucrose: 0.5 },
    hydrogel: false,
    bottleMl: 600,
    scoop: { label: "scoop Endurance Fuel", carbsG: 25, sodiumMg: 303 },
  },
};

// --- Osmolality ------------------------------------------------------------
// Osmolality drives gastric emptying and GI comfort: hypertonic drinks empty
// slowly and can cause distress. It scales with particle COUNT, so long-chain
// maltodextrin contributes far less per gram than glucose/fructose monomers —
// that's why Maurten can bottle 16% carbs while dextrose-based mixes must
// stay dilute.

// Effective molar masses (g/mol) of carbs in solution. Maltodextrin is a
// chain-length average for sports-drink grades.
const SPECIES_MW = { maltodextrin: 1000, glucose: 180, fructose: 180, sucrose: 342 };

export function estimateOsmolality(carbsGPerL, species, sodiumMgPerL = 0) {
  let mOsm = 0;
  for (const [name, frac] of Object.entries(species)) {
    mOsm += ((carbsGPerL * frac) / SPECIES_MW[name]) * 1000;
  }
  // Na+ arrives with an anion: ~2 osmotically active particles per Na.
  mOsm += (sodiumMgPerL / 23) * 2;
  return Math.round(mOsm);
}

// Blood plasma sits near 290 mOsm/kg; commercial "isotonic" drinks span
// roughly 260–340.
export function classifyTonicity(mOsm) {
  if (mOsm < 260) return "hypotonic";
  if (mOsm <= 340) return "isotonic";
  if (mOsm <= 500) return "mildly hypertonic";
  return "hypertonic";
}

// Concentration (g/L) above which a monomer-based drink stops being
// comfortably isotonic — the classic ~8% sports-drink ceiling.
export const ISOTONIC_MAX_G_PER_L = 80;

// --- Physiology ------------------------------------------------------------

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

// --- Plan building ---------------------------------------------------------

function drinkEvents(events, durationS, bottleIntervalS, labels) {
  let n = 0;
  for (let t = bottleIntervalS; t < durationS - 5 * 60 && n < labels.length; t += bottleIntervalS) {
    events.push({ type: "drink", timeS: t, ...labels[n] });
    n++;
  }
}

function planMaurten(plan, brand, totalCarbsG, durationS) {
  const hours = durationS / 3600;
  const bottles = Math.max(1, Math.round(plan.totalFluidMl / brand.bottleMl));
  const [dm160, dm320] = brand.drinkMixes;

  // Pick a mix strength from the carb rate; aim for ~60% of carbs from the
  // bottle and the rest from gels.
  let mix = null;
  if (plan.carbsPerHour >= 65) mix = dm320;
  else if (plan.carbsPerHour >= 30) mix = dm160;

  let mixBottles = 0;
  if (mix && totalCarbsG >= mix.carbsG) {
    mixBottles = Math.min(bottles, Math.max(1, Math.round((totalCarbsG * 0.6) / mix.carbsG)));
    if (mixBottles * mix.carbsG > totalCarbsG) {
      mixBottles = Math.max(1, Math.floor(totalCarbsG / mix.carbsG));
    }
  } else {
    mix = null;
  }
  const drinkCarbsG = mixBottles * (mix?.carbsG ?? 0);
  const gelCount = durationS > 3600
    ? Math.max(0, Math.ceil((totalCarbsG - drinkCarbsG) / brand.gel.carbsG))
    : 0;

  // Drink recipes with osmolality per bottle type.
  if (mix) {
    const gPerL = mix.carbsG / (brand.bottleMl / 1000);
    const naPerL = mix.sodiumMg / (brand.bottleMl / 1000);
    const mOsm = estimateOsmolality(gPerL, brand.species, naPerL);
    const tone = classifyTonicity(mOsm);
    plan.drinks.push({
      count: mixBottles,
      recipe: `1 sachet ${mix.label} in ${brand.bottleMl} ml`,
      carbsG: mix.carbsG,
      concentrationPct: gPerL / 10,
      mOsm,
      tonicity: tone,
      note: brand.hydrogel && tone !== "isotonic" && tone !== "hypotonic"
        ? "Hydrogel-buffered — the pectin/alginate gel forms in the stomach, so it empties better than its osmolality suggests. Still chase it with plain water in the heat."
        : null,
    });
  }
  if (bottles - mixBottles > 0) {
    plan.drinks.push({
      count: bottles - mixBottles,
      recipe: "plain water",
      carbsG: 0,
      concentrationPct: 0,
      mOsm: 0,
      tonicity: "hypotonic",
      note: null,
    });
  }

  // Timeline: gels spread across the ride, bottle finishes by fluid rate.
  if (gelCount > 0) {
    const eatWindowS = durationS - 20 * 60 - 15 * 60;
    const gap = gelCount > 1 ? eatWindowS / (gelCount - 1) : 0;
    for (let i = 0; i < gelCount; i++) {
      plan.events.push({
        type: "eat",
        timeS: 20 * 60 + i * gap,
        label: `${brand.label} ${brand.gel.label}`,
        carbsG: brand.gel.carbsG,
      });
    }
  }
  const bottleLabels = [];
  for (let b = 0; b < bottles; b++) {
    const isMix = mix && b < mixBottles;
    bottleLabels.push({
      label: isMix ? `Finish bottle — ${mix.label}` : "Finish bottle — water",
      fluidMl: brand.bottleMl,
      carbsG: isMix ? mix.carbsG : 0,
    });
  }
  drinkEvents(plan.events, durationS, (brand.bottleMl / plan.fluidPerHour) * 3600, bottleLabels);

  if (mixBottles > 0) plan.shopping.push({ label: `sachet ${mix.label}`, count: mixBottles });
  if (gelCount > 0) plan.shopping.push({ label: `${brand.label} ${brand.gel.label}`, count: gelCount });
  plan.shopping.push({ label: `${brand.bottleMl} ml bottle`, count: bottles });

  plan.sodiumProvidedPerHour = Math.round((mixBottles * (mix?.sodiumMg ?? 0)) / hours);
  if (totalCarbsG > 0 && plan.sodiumProvidedPerHour < plan.sodiumPerHour) {
    plan.notes.push(
      `Maurten mixes are low-sodium: you'll get ~${plan.sodiumProvidedPerHour} mg/h from the bottles ` +
      `but need ~${plan.sodiumPerHour} mg/h — add salt tabs or an electrolyte capsule per hour.`
    );
  }
}

// Largest half-scoop dose per bottle whose estimated osmolality stays out of
// the truly hypertonic zone (> 500 mOsm/kg). For a 600 ml bottle this lands
// on 2 scoops (~8.3%, ~440 mOsm/kg) — the classic strong-but-tolerable mix.
export function maxScoopsPerBottle(brand) {
  let k = 0.5;
  for (;;) {
    const next = k + 0.5;
    const gPerL = (next * brand.scoop.carbsG) / (brand.bottleMl / 1000);
    const naPerL = (next * brand.scoop.sodiumMg) / (brand.bottleMl / 1000);
    if (estimateOsmolality(gPerL, brand.species, naPerL) > 500) return k;
    k = next;
  }
}

function planTailwind(plan, brand, totalCarbsG, durationS) {
  const hours = durationS / 3600;
  const bottles = Math.max(1, Math.ceil(plan.totalFluidMl / brand.bottleMl));
  const scoops = Math.round(totalCarbsG / brand.scoop.carbsG);

  // Concentrate: pack bottles up to the osmolality ceiling and leave the
  // rest as plain water, rather than spreading scoops thin. Only when the
  // carbs can't fit at the ceiling does the mix go stronger.
  const maxPerBottle = maxScoopsPerBottle(brand);
  const mixBottles = scoops > 0 ? Math.min(bottles, Math.ceil(scoops / maxPerBottle)) : 0;
  const perBottle = mixBottles > 0 ? scoops / mixBottles : 0;
  const carbsPerBottle = perBottle * brand.scoop.carbsG;
  const waterBottles = bottles - mixBottles;

  const gPerL = carbsPerBottle / (brand.bottleMl / 1000);
  const naPerL = (perBottle * brand.scoop.sodiumMg) / (brand.bottleMl / 1000);
  const mOsm = scoops > 0 ? estimateOsmolality(gPerL, brand.species, naPerL) : 0;
  const tonicity = scoops > 0 ? classifyTonicity(mOsm) : "hypotonic";

  if (mixBottles > 0) {
    plan.drinks.push({
      count: mixBottles,
      recipe: `${(Math.round(perBottle * 2) / 2).toFixed(1)} scoops in ${brand.bottleMl} ml`,
      carbsG: Math.round(carbsPerBottle),
      concentrationPct: Math.round(gPerL) / 10,
      mOsm,
      tonicity,
      note: null,
    });
  }
  if (waterBottles > 0) {
    plan.drinks.push({
      count: waterBottles,
      recipe: "plain water",
      carbsG: 0,
      concentrationPct: 0,
      mOsm: 0,
      tonicity: "hypotonic",
      note: null,
    });
  }

  // Every bottle already at the ceiling and the carbs still don't fit:
  // Tailwind's answer is "mix strong, chase with water", so compute the
  // plain-water top-up that brings overall intake back down.
  if (scoops > 0 && tonicity === "hypertonic") {
    const topUpMl = Math.round((carbsPerBottle / (ISOTONIC_MAX_G_PER_L / 1000) - brand.bottleMl) / 10) * 10;
    plan.notes.push(
      `At ${plan.fluidPerHour} ml/h of fluid, hitting ${plan.carbsPerHour} g/h makes the mix ` +
      `~${(gPerL / 10).toFixed(1)}% (${mOsm} mOsm/kg, ${tonicity}). Chase each bottle with ` +
      `~${topUpMl} ml of plain water to keep overall intake isotonic, or drop a scoop per bottle.`
    );
  }

  const bottleLabels = [];
  for (let b = 0; b < bottles; b++) {
    const isMix = b < mixBottles;
    bottleLabels.push({
      label: isMix
        ? `Finish bottle — ${brand.label} (${Math.round(carbsPerBottle)} g carbs)`
        : "Finish bottle — water",
      fluidMl: brand.bottleMl,
      carbsG: isMix ? Math.round(carbsPerBottle) : 0,
    });
  }
  drinkEvents(plan.events, durationS, (brand.bottleMl / plan.fluidPerHour) * 3600, bottleLabels);

  if (scoops > 0) plan.shopping.push({ label: brand.scoop.label, count: scoops });
  plan.shopping.push({ label: `${brand.bottleMl} ml bottle`, count: bottles });

  plan.sodiumProvidedPerHour = Math.round((scoops * brand.scoop.sodiumMg) / hours);
  if (scoops > 0 && plan.sodiumProvidedPerHour >= plan.sodiumPerHour) {
    plan.notes.push("Tailwind's built-in electrolytes cover your sodium needs — no extra salt required.");
  } else if (scoops > 0) {
    plan.notes.push(
      `You'll get ~${plan.sodiumProvidedPerHour} mg/h sodium from the mix but need ` +
      `~${plan.sodiumPerHour} mg/h — add a salt tab per hour.`
    );
  }
}

/**
 * Build the in-ride fueling plan.
 * @param {object} sim result of simulateRide (durationS, kcal, intensityFactor…)
 * @param {number} tempC
 * @param {string} brandKey "maurten" | "tailwind"
 */
export function buildPlan(sim, tempC, brandKey = "maurten") {
  const brand = BRANDS[brandKey] ?? BRANDS.maurten;
  const hours = sim.durationS / 3600;
  const carbsPerHour = carbTargetPerHour(sim.durationS, sim.intensityFactor);
  const totalCarbsG = sim.durationS > 3600 ? Math.round(carbsPerHour * hours) : 0;
  const fluidPerH = fluidPerHour(tempC);

  const plan = {
    brand: brand.label,
    brandKey: brand.key,
    carbsPerHour,
    totalCarbsG,
    burnPerHour: Math.round(((sim.kcal / hours) * carbFraction(sim.intensityFactor)) / 4),
    fluidPerHour: fluidPerH,
    totalFluidMl: Math.round(fluidPerH * hours),
    sodiumPerHour: sodiumPerHour(tempC),
    sodiumProvidedPerHour: 0,
    drinks: [],
    events: [],
    shopping: [],
    notes: [],
  };
  plan.totalBurnG = Math.round(plan.burnPerHour * hours);

  if (brand.key === "tailwind") planTailwind(plan, brand, totalCarbsG, sim.durationS);
  else planMaurten(plan, brand, totalCarbsG, sim.durationS);

  plan.events.sort((a, b) => a.timeS - b.timeS);
  plan.plannedCarbsG = plan.events.reduce((s, e) => s + (e.carbsG ?? 0), 0);
  plan.bottles = plan.shopping.find((s) => s.label.includes("bottle"))?.count ?? 1;
  return plan;
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
