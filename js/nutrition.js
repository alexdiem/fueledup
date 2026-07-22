// Fueling science: carbohydrate targets, hydration, osmolality-aware drink
// mixing, and an in-ride schedule for a chosen fuel brand.
// Carb targets follow mainstream sports-nutrition guidance (Jeukendrup):
//   < 75 min: fuel optional; 1–2 h: ~30 g/h; 2–3 h: ~60 g/h; 3 h+: 80–90 g/h,
// capped by realistic gut absorption for glucose+fructose mixes.
//
// Tuned for a female endurance athlete along Stacy Sims' lines ("women are
// not small men"): sodium targets run higher than unisex guidance, protein
// is emphasized before and after the ride, fasted training is discouraged,
// and an optional menstrual-cycle phase nudges carbs, sodium, and protein in
// the high-hormone luteal phase.

export const GUT_CAP_G_PER_H = 90;

// --- Menstrual-cycle phase (Sims) -------------------------------------------
// In the high-hormone (luteal) phase, carbohydrate access and plasma volume
// drop while protein breakdown rises, so carbs, sodium, and protein are all
// nudged up and core-temperature guidance is added. "Not tracking" and the
// low-hormone follicular phase use baseline (female) targets.
export const CYCLE_PHASES = {
  none: { key: "none", label: "Not tracking", carbMult: 1, sodiumMult: 1, proteinMult: 1, note: null },
  follicular: {
    key: "follicular",
    label: "Follicular / low-hormone (≈ days 1–14)",
    carbMult: 1,
    sodiumMult: 1,
    proteinMult: 1,
    note: "Low-hormone phase — you access carbs well and recover fast, so this is a good window for your hardest efforts.",
  },
  luteal: {
    key: "luteal",
    label: "Luteal / high-hormone (≈ days 15–28)",
    carbMult: 1.1,
    sodiumMult: 1.25,
    proteinMult: 1.15,
    note: "High-hormone phase — carb access and plasma volume drop while protein breakdown rises, so carbs, sodium, and protein are bumped up. Core temp runs ~0.3–0.5 °C higher: pre-cool and drink cold, especially in the heat.",
  },
};

export function cyclePhase(key) {
  return CYCLE_PHASES[key] ?? CYCLE_PHASES.none;
}

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
    // Solid carbs to top up what a hypotonic bottle can't carry, eaten as
    // ~30 g feedings (a SiS bar is two feedings).
    chews: [
      { key: "sis", label: "SiS Beta Fuel chew bar", carbsG: 60 },
      { key: "226ers", label: "226ERS chew bar", carbsG: 30 },
    ],
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

// --- Physiology ------------------------------------------------------------

// Fraction of energy coming from carbohydrate at a given intensity factor.
// ~55% CHO at IF 0.55 rising to ~95% at IF 0.85+.
export function carbFraction(intensityFactor) {
  return Math.min(0.95, Math.max(0.35, 1.4 * intensityFactor - 0.2));
}

// Recommended carb intake rate (g/h) from ride duration and intensity,
// scaled by an optional cycle-phase multiplier (carb access drops in the
// luteal phase, so exogenous carbs matter more).
export function carbTargetPerHour(durationS, intensityFactor, carbMult = 1) {
  const h = durationS / 3600;
  let rate;
  if (h < 1.25) rate = intensityFactor >= 0.75 ? 30 : 20;
  else if (h < 2) rate = 40;
  else if (h < 3) rate = 60;
  else if (h < 4) rate = 75;
  else rate = 85;
  if (intensityFactor >= 0.8) rate += 10;
  else if (intensityFactor <= 0.6) rate -= 10;
  return Math.max(0, Math.min(GUT_CAP_G_PER_H, Math.round(rate * carbMult)));
}

// Fluid needs (ml/h) from air temperature.
export function fluidPerHour(tempC) {
  return Math.round(Math.min(1000, Math.max(400, 400 + 25 * (tempC - 10))));
}

// Sodium (mg/h). Sims recommends women run higher sodium than generic unisex
// guidance — ~700 mg/L base, up to ~1000 in the heat — scaled by a cycle-phase
// multiplier (plasma volume falls in the luteal phase, raising sodium needs).
export function sodiumPerHour(tempC, sodiumMult = 1) {
  const mgPerL = tempC >= 25 ? 1000 : 700;
  return Math.round((fluidPerHour(tempC) / 1000) * mgPerL * sodiumMult);
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
  const bottleMl = plan.bottleMl;
  const bottles = plan.fixedBottles ?? Math.max(1, Math.round(plan.totalFluidMl / bottleMl));
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

  // Drink recipes with osmolality per bottle type. Sachets are designed for
  // 500 ml, but the math follows the rider's actual bottle size — a sachet
  // in a 750 ml bottle simply mixes (and reads) more dilute.
  if (mix) {
    const gPerL = mix.carbsG / (bottleMl / 1000);
    const naPerL = mix.sodiumMg / (bottleMl / 1000);
    const mOsm = estimateOsmolality(gPerL, brand.species, naPerL);
    const tone = classifyTonicity(mOsm);
    plan.drinks.push({
      count: mixBottles,
      recipe: `1 sachet ${mix.label} in ${bottleMl} ml`,
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
    const eatWindowS = durationS - plan.eatStartS - 15 * 60;
    const gap = gelCount > 1 ? eatWindowS / (gelCount - 1) : 0;
    for (let i = 0; i < gelCount; i++) {
      plan.events.push({
        type: "eat",
        timeS: plan.eatStartS + i * gap,
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
      fluidMl: bottleMl,
      carbsG: isMix ? mix.carbsG : 0,
    });
  }
  drinkEvents(plan.events, durationS, (bottleMl / plan.fluidPerHour) * 3600, bottleLabels);

  if (mixBottles > 0) plan.shopping.push({ label: `sachet ${mix.label}`, count: mixBottles });
  if (gelCount > 0) plan.shopping.push({ label: `${brand.label} ${brand.gel.label}`, count: gelCount });
  plan.shopping.push({ label: `${bottleMl} ml bottle`, count: bottles });

  plan.sodiumProvidedPerHour = Math.round((mixBottles * (mix?.sodiumMg ?? 0)) / hours);
  if (totalCarbsG > 0 && plan.sodiumProvidedPerHour < plan.sodiumPerHour) {
    plan.notes.push(
      `Maurten mixes are low-sodium: you'll get ~${plan.sodiumProvidedPerHour} mg/h from the bottles ` +
      `but need ~${plan.sodiumPerHour} mg/h — add salt tabs or an electrolyte capsule per hour.`
    );
  }
}

// Largest half-scoop dose per bottle that keeps the drink HYPOTONIC
// (< 260 mOsm/kg) — Sims' preferred zone (~3–4% carbs), where the bottle
// hydrates fastest instead of pulling water into the gut. For a 600 ml
// bottle this is 1 scoop (~4.2%, ~220 mOsm/kg); bigger bottles fit more.
export function hypotonicScoopsPerBottle(brand, bottleMl = brand.bottleMl) {
  let k = 0.5;
  for (;;) {
    const next = k + 0.5;
    const gPerL = (next * brand.scoop.carbsG) / (bottleMl / 1000);
    const naPerL = (next * brand.scoop.sodiumMg) / (bottleMl / 1000);
    if (classifyTonicity(estimateOsmolality(gPerL, brand.species, naPerL)) !== "hypotonic") {
      return k;
    }
    k = next;
  }
}

// Sims-style Tailwind plan: bottles stay hypotonic so they do their real job
// (hydration); if the carb target doesn't fit in the bottles, accept a
// slightly lower rate (~10% trim) and deliver the remainder as chew bars in
// ~30 g feedings.
function planTailwind(plan, brand, totalCarbsG, durationS) {
  const hours = durationS / 3600;
  const bottleMl = plan.bottleMl;
  const bottles = plan.fixedBottles ?? Math.max(1, Math.ceil(plan.totalFluidMl / bottleMl));

  const dosePerBottle = hypotonicScoopsPerBottle(brand, bottleMl);
  const bottleCapacityG = Math.round(bottles * dosePerBottle * brand.scoop.carbsG);

  // Overflow → trim the target and move the rest to solids.
  let solidsG = 0;
  if (totalCarbsG > bottleCapacityG) {
    const untrimmed = plan.carbsPerHour;
    plan.carbsPerHour = Math.round(plan.carbsPerHour * 0.9);
    totalCarbsG = Math.round(plan.carbsPerHour * hours);
    plan.totalCarbsG = totalCarbsG;
    solidsG = totalCarbsG - bottleCapacityG;
    if (solidsG < 15) solidsG = 0; // not worth a feeding — close enough
    plan.notes.push(
      `Bottles stay hypotonic (Sims): the carb target is trimmed from ${untrimmed} to ` +
      `${plan.carbsPerHour} g/h and ${solidsG} g moves to chew bars — wash each one down ` +
      `with a good swig from your bottle.`
    );
  }

  // Pack the bottle share greedily at the hypotonic dose.
  const bottleCarbsG = Math.min(totalCarbsG, bottleCapacityG);
  let scoopsLeft = Math.round((bottleCarbsG / brand.scoop.carbsG) * 2) / 2;
  const doses = [];
  while (scoopsLeft > 0 && doses.length < bottles) {
    const dose = Math.min(dosePerBottle, scoopsLeft);
    doses.push(dose);
    scoopsLeft -= dose;
  }
  const waterBottles = bottles - doses.length;
  const scoopsUsed = doses.reduce((s, d) => s + d, 0);

  const groups = new Map();
  for (const dose of doses) groups.set(dose, (groups.get(dose) ?? 0) + 1);
  for (const [dose, count] of [...groups.entries()].sort((a, b) => b[0] - a[0])) {
    const carbsPerBottle = dose * brand.scoop.carbsG;
    const gPerL = carbsPerBottle / (bottleMl / 1000);
    const naPerL = (dose * brand.scoop.sodiumMg) / (bottleMl / 1000);
    const mOsm = estimateOsmolality(gPerL, brand.species, naPerL);
    plan.drinks.push({
      count,
      recipe: `${dose.toFixed(1)} scoop${dose === 1 ? "" : "s"} in ${bottleMl} ml`,
      carbsG: Math.round(carbsPerBottle),
      concentrationPct: Math.round(gPerL) / 10,
      mOsm,
      tonicity: classifyTonicity(mOsm),
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

  // Solid carbs as ~30 g feedings: SiS bars (60 g = two feedings) for bulk,
  // a 226ERS bar (30 g) for an odd feeding, spread across the ride.
  if (solidsG > 0) {
    const [sis, small] = brand.chews;
    const feedings = Math.max(1, Math.round(solidsG / 30));
    const sisBars = Math.floor(feedings / 2);
    const smallBars = feedings % 2;
    if (sisBars > 0) plan.shopping.push({ label: `${sis.label} (${sis.carbsG} g)`, count: sisBars });
    if (smallBars > 0) plan.shopping.push({ label: `${small.label} (${small.carbsG} g)`, count: smallBars });

    const eatWindowS = durationS - plan.eatStartS - 15 * 60;
    const gap = feedings > 1 ? eatWindowS / (feedings - 1) : 0;
    for (let i = 0; i < feedings; i++) {
      plan.events.push({
        type: "eat",
        timeS: plan.eatStartS + i * gap,
        label: i < sisBars * 2 ? `½ ${sis.label}` : small.label,
        carbsG: 30,
      });
    }
  }

  const bottleLabels = [];
  for (let b = 0; b < bottles; b++) {
    const dose = doses[b] ?? 0;
    bottleLabels.push({
      label: dose > 0
        ? `Finish bottle — ${brand.label} (${Math.round(dose * brand.scoop.carbsG)} g carbs)`
        : "Finish bottle — water",
      fluidMl: bottleMl,
      carbsG: Math.round(dose * brand.scoop.carbsG),
    });
  }
  drinkEvents(plan.events, durationS, (bottleMl / plan.fluidPerHour) * 3600, bottleLabels);

  if (scoopsUsed > 0) plan.shopping.push({ label: brand.scoop.label, count: scoopsUsed });
  plan.shopping.push({ label: `${bottleMl} ml bottle`, count: bottles });

  plan.sodiumProvidedPerHour = Math.round((scoopsUsed * brand.scoop.sodiumMg) / hours);
  if (scoopsUsed > 0 && plan.sodiumProvidedPerHour >= plan.sodiumPerHour) {
    plan.notes.push("Tailwind's built-in electrolytes cover your sodium needs — no extra salt required.");
  } else if (scoopsUsed > 0) {
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
 * @param {object} [hydration] { bottles, bottleMl } — what the rider will
 *   actually drink. When set, it drives total fluid, bottle count, and all
 *   mixing math; when omitted, fluid is estimated from temperature.
 * @param {string} [phaseKey] menstrual-cycle phase ("none"|"follicular"|"luteal")
 */
export function buildPlan(sim, tempC, brandKey = "maurten", hydration = null, phaseKey = "none", earlyStart = false) {
  const brand = BRANDS[brandKey] ?? BRANDS.maurten;
  const phase = cyclePhase(phaseKey);
  const hours = sim.durationS / 3600;
  const carbsPerHour = carbTargetPerHour(sim.durationS, sim.intensityFactor, phase.carbMult);
  const totalCarbsG = sim.durationS > 3600 ? Math.round(carbsPerHour * hours) : 0;

  const bottleMl = hydration?.bottleMl > 0 ? hydration.bottleMl : brand.bottleMl;
  const fixedBottles = hydration?.bottles > 0 ? Math.round(hydration.bottles) : null;
  const estimatedPerH = fluidPerHour(tempC);
  const totalFluidMl = fixedBottles
    ? fixedBottles * bottleMl
    : Math.round(estimatedPerH * hours);

  const plan = {
    brand: brand.label,
    brandKey: brand.key,
    carbsPerHour,
    totalCarbsG,
    burnPerHour: Math.round(((sim.kcal / hours) * carbFraction(sim.intensityFactor)) / 4),
    fluidPerHour: Math.round(totalFluidMl / hours),
    totalFluidMl,
    bottleMl,
    fixedBottles,
    sodiumPerHour: sodiumPerHour(tempC, phase.sodiumMult),
    sodiumProvidedPerHour: 0,
    cyclePhase: phase.key,
    earlyStart,
    // After an early start with only a wake-up snack, glycogen isn't fully
    // topped — begin in-ride fueling almost immediately instead of at 20 min.
    eatStartS: earlyStart ? 10 * 60 : 20 * 60,
    drinks: [],
    events: [],
    shopping: [],
    notes: [],
  };
  plan.totalBurnG = Math.round(plan.burnPerHour * hours);

  // Cycle-phase context (luteal bumps, follicular "go hard" cue).
  if (phase.note) plan.notes.push(phase.note);

  if (earlyStart && totalCarbsG > 0) {
    plan.notes.push(
      "Early start: you're rolling out on last night's dinner plus a small snack, so glycogen " +
      "isn't fully topped up — start fueling in the first 10–15 min and keep the feedings regular."
    );
  }

  // Respect the rider's bottle plan, but flag a big gap vs the sweat model.
  if (fixedBottles) {
    const estimatedTotal = Math.round(estimatedPerH * hours);
    if (totalFluidMl < estimatedTotal * 0.75) {
      plan.notes.push(
        `You're planning ${plan.fluidPerHour} ml/h of fluid; at ${tempC} °C typical sweat ` +
        `losses are closer to ~${estimatedPerH} ml/h — fine for a shorter ride, but consider ` +
        `an extra bottle if it's long or hot.`
      );
    }
  }

  if (brand.key === "tailwind") planTailwind(plan, brand, totalCarbsG, sim.durationS);
  else planMaurten(plan, brand, totalCarbsG, sim.durationS);

  // Sims prefers keeping the drink hypotonic and taking carbs as food/gels
  // rather than a strong bottle. Surface that only when a mix is genuinely
  // hypertonic — the concentrated-bottle preference otherwise stands.
  if (plan.drinks.some((d) => d.tonicity === "hypertonic")) {
    plan.notes.push(
      "Sims' take: a hypertonic bottle draws water into the gut and can slow you down. " +
      "If it sits badly, dilute the bottle and move some carbs to gels or food."
    );
  }

  plan.events.sort((a, b) => a.timeS - b.timeS);
  plan.plannedCarbsG = plan.events.reduce((s, e) => s + (e.carbsG ?? 0), 0);
  plan.bottles = plan.shopping.find((s) => s.label.includes("bottle"))?.count ?? 1;
  return plan;
}

// --- Pre/post-ride meals -----------------------------------------------------
// Pre-ride: classic 1–2 g/kg carbs scaled to ride length, eaten early enough
// to digest (earlier for hard efforts), with ~6 ml/kg of water (ACSM's
// 5–7 ml/kg pre-exercise range) AND protein — Sims is emphatic that women
// should not train fasted. Post-ride: 1 g/kg carbs + a higher ~0.4 g/kg
// protein dose inside a ~30 min window (Sims), bumped further in the luteal
// phase where protein breakdown rises.

// Building blocks for example pre-ride menus (approximate carb counts).
const PRE_RIDE_BASES = [
  { label: "a bowl of oatmeal with honey", carbsG: 60 },
  { label: "a bowl of rice or pasta", carbsG: 90 },
];
const PRE_RIDE_EXTRAS = [
  { one: "a banana", many: "bananas", carbsG: 25 },
  { one: "a slice of toast with jam", many: "slices of toast with jam", carbsG: 25 },
  { one: "a glass of fruit juice", many: "glasses of fruit juice", carbsG: 25 },
];

// Compose an example menu around a base food, adding extras until it lands
// within ~15 g of the target.
function composeMenu(base, targetG) {
  const counts = new Map();
  let total = base.carbsG;
  for (let i = 0; total <= targetG - 15 && i < 8; i++) {
    const extra = PRE_RIDE_EXTRAS[i % PRE_RIDE_EXTRAS.length];
    counts.set(extra, (counts.get(extra) ?? 0) + 1);
    total += extra.carbsG;
  }
  const items = [base.label];
  for (const [extra, n] of counts) items.push(n > 1 ? `${n} ${extra.many}` : extra.one);
  return { items, carbsG: total };
}

// Quick, low-fiber wake-up options for early starts (~30 min before rollout).
const WAKE_UP_OPTIONS = [
  { label: "a banana + a small pot of Greek yogurt", carbsG: 35, proteinG: 10 },
  { label: "a slice of toast with jam + a glass of milk", carbsG: 35, proteinG: 8 },
  { label: "a small bowl of instant oats with honey", carbsG: 40, proteinG: 6 },
];

export function mealAdvice(weightKg, durationS, intensityFactor = 0.68, phaseKey = "none", earlyStart = false) {
  const hours = durationS / 3600;
  const hard = intensityFactor >= 0.78;
  const phase = cyclePhase(phaseKey);

  const post = {
    // Sims: ~0.4 g/kg protein, at least 30 g, inside a ~30 min window;
    // the luteal phase asks for a little more.
    carbsG: Math.round(weightKg * 1),
    proteinG: Math.max(30, Math.round(weightKg * 0.4 * phase.proteinMult)),
    windowMin: 30,
    note: "Within ~30 min of finishing, pair carbs with a solid protein hit to kick-start recovery.",
  };

  // Early-morning start: no 2–3 h digestion window exists, so the real carb
  // load moves to the night before and the morning gets a small, fast
  // wake-up snack — Sims' "something beats fasted" rule, which matters more
  // for women (fasted rides spike cortisol harder).
  if (earlyStart) {
    return {
      pre: {
        early: true,
        eveningCarbsG: Math.round(weightKg * (hours > 2.5 ? 2 : 1.5)),
        wakeCarbsG: Math.round(weightKg * 0.5),
        wakeProteinG: Math.max(10, Math.round(weightKg * 0.15)),
        waterMl: Math.round((weightKg * 5) / 50) * 50,
        menus: WAKE_UP_OPTIONS.map((o) => ({ items: [o.label], carbsG: o.carbsG })),
        topUp: null,
        note:
          "Keep the wake-up snack small, familiar, and low in fiber — coffee is fine. " +
          "Riding fully fasted is the one thing to avoid.",
      },
      post,
    };
  }

  // Carb target grows with ride length: 1 g/kg for a spin, up to 2 g/kg
  // before a long day out.
  const gPerKg = hours > 2.5 ? 2 : hours > 1.5 ? 1.5 : 1;
  const carbsG = Math.round(weightKg * gPerKg);

  // Protein with the pre-ride meal — Sims: women shouldn't train fasted.
  const preProteinG = Math.round(weightKg * 0.3);

  // Hard efforts want a longer digestion window; easy rides can eat closer
  // to rollout.
  const hoursBefore = hard ? "2½–3" : gPerKg >= 1.5 ? "2–3" : "1½–2";

  // ~6 ml/kg of water with the meal, rounded to a sensible glassful.
  const waterMl = Math.round((weightKg * 6) / 50) * 50;

  // A last top-up before rolling out, for rides long or hard enough to care.
  const topUp = hours > 1.5 || hard
    ? { minutesBefore: 20, label: "a banana or an energy gel", carbsG: 25, waterMl: 250 }
    : null;

  // Offer each base as an example menu, but drop ones that can't get near
  // the target (a rice bowl alone overshoots a light rider's short spin).
  const allMenus = PRE_RIDE_BASES.map((base) => composeMenu(base, carbsG));
  const nearTarget = allMenus.filter(
    (m) => Math.abs(m.carbsG - carbsG) <= Math.max(30, carbsG * 0.3)
  );

  return {
    pre: {
      carbsG,
      gPerKg,
      proteinG: preProteinG,
      hoursBefore,
      waterMl,
      menus: nearTarget.length ? nearTarget : allMenus.slice(0, 1),
      topUp,
      note:
        (hard
          ? "Keep it low in fat and fiber so it's out of your stomach by the start. "
          : "Anything familiar and carb-based works — don't experiment on ride day. ") +
        "Get the protein from Greek yogurt, eggs, or a scoop of powder — never head out fasted.",
    },
    post,
  };
}
