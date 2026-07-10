import { parseGpx, buildRoute } from "./gpx.js?v=__BUILD__";
import { simulateRide, syntheticSegments, estimateFtp, INTENSITIES } from "./physics.js?v=__BUILD__";
import { buildPlan, mealAdvice } from "./nutrition.js?v=__BUILD__";
import { renderChart } from "./chart.js?v=__BUILD__";

const $ = (id) => document.getElementById(id);

let route = null; // { profile, segments, distM, gainM, name } from GPX

function fmtDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`;
}

function fmtClock(s) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

// --- Route source tabs ---------------------------------------------------

function setMode(mode) {
  $("panel-gpx").hidden = mode !== "gpx";
  $("panel-manual").hidden = mode !== "manual";
  $("tab-gpx").setAttribute("aria-selected", mode === "gpx");
  $("tab-manual").setAttribute("aria-selected", mode === "manual");
}

async function loadGpxText(text, sourceName) {
  const { name, points } = parseGpx(text);
  route = { ...buildRoute(points), name: name || sourceName };
  $("gpx-status").textContent =
    `✓ ${route.name} — ${(route.distM / 1000).toFixed(1)} km, ${route.gainM} m up`;
  $("gpx-status").classList.remove("error");
}

function gpxError(err) {
  route = null;
  $("gpx-status").textContent = `✗ ${err.message}`;
  $("gpx-status").classList.add("error");
}

// --- Plan generation ------------------------------------------------------

function currentRider() {
  const weightKg = parseFloat($("weight").value);
  const ftpInput = parseFloat($("ftp").value);
  const ftp = Number.isFinite(ftpInput) && ftpInput > 0
    ? ftpInput
    : estimateFtp(weightKg, $("level").value);
  return { weightKg, ftp, bikeKg: 9, intensity: $("intensity").value };
}

function generate() {
  const rider = currentRider();
  if (!Number.isFinite(rider.weightKg) || rider.weightKg <= 0) {
    return showFormError("Enter your weight first.");
  }
  const tempInput = parseFloat($("temp").value);
  const tempC = Number.isFinite(tempInput) ? tempInput : 18; // 0 °C is valid!

  let profile;
  let segments;
  let title;
  const isGpx = !$("panel-gpx").hidden;
  if (isGpx) {
    if (!route) return showFormError("Upload a GPX file (or load the sample ride) first.");
    ({ profile, segments } = route);
    title = route.name || "Your ride";
  } else {
    const km = parseFloat($("distance").value);
    const gain = parseFloat($("elevation").value) || 0;
    if (!Number.isFinite(km) || km <= 0) return showFormError("Enter a ride distance.");
    const syn = syntheticSegments(km, gain);
    profile = syn.points;
    segments = syn.segments;
    title = `${km} km ride`;
  }
  showFormError("");

  const brand = document.querySelector('input[name="brand"]:checked')?.value ?? "maurten";
  const hydration = {
    bottles: parseInt($("bottles").value, 10), // NaN/blank → auto-estimate
    bottleMl: parseInt($("bottle-size").value, 10),
  };
  const sim = simulateRide(segments, rider);
  const plan = buildPlan(sim, tempC, brand, hydration);

  // Map event times to route distances via the per-point cumulative time.
  for (const ev of plan.events) {
    let lo = 0;
    let hi = sim.cumTime.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sim.cumTime[mid] < ev.timeS) lo = mid + 1;
      else hi = mid;
    }
    ev.distM = profile[Math.min(lo, profile.length - 1)].dist;
  }

  renderResults(title, rider, sim, plan, tempC, profile);
}

function showFormError(msg) {
  $("form-error").textContent = msg;
  $("form-error").hidden = !msg;
}

function statTile(value, unit, label) {
  return `<div class="tile"><div class="tile-value">${value}<span class="tile-unit">${unit}</span></div><div class="tile-label">${label}</div></div>`;
}

function renderResults(title, rider, sim, plan, tempC, profile) {
  $("results").hidden = false;
  $("ride-title").textContent = title;
  $("ride-sub").textContent =
    `${(sim.distM / 1000).toFixed(1)} km · ${INTENSITIES[$("intensity").value].label} ` +
    `(~${sim.targetPower} W) · ${tempC} °C · fueled by ${plan.brand}`;

  $("tiles").innerHTML = [
    statTile(fmtDuration(sim.durationS), "", "Est. ride time"),
    statTile(sim.avgSpeedKmh.toFixed(1), " km/h", "Avg speed"),
    statTile(sim.kcal.toLocaleString(), " kcal", "Energy burn"),
    statTile(plan.carbsPerHour, " g/h", "Carb target"),
    statTile(plan.totalCarbsG, " g", "Carbs to eat"),
    statTile((plan.totalFluidMl / 1000).toFixed(1), " L", "Fluids"),
  ].join("");

  renderChart($("chart"), profile, plan.events, sim.cumTime);

  // Timeline table (also the chart's accessible table view)
  const rows = plan.events.map((ev) => {
    const what = ev.type === "eat"
      ? `${ev.label} <span class="muted">(${ev.carbsG} g carbs)</span>`
      : `${ev.label} <span class="muted">(${ev.fluidMl} ml)</span>`;
    return `<tr>
      <td><span class="dot ${ev.type === "eat" ? "dot-eat" : "dot-drink"}"></span>${fmtClock(ev.timeS)}</td>
      <td>${(ev.distM / 1000).toFixed(1)} km</td>
      <td>${what}</td>
    </tr>`;
  });
  $("timeline-body").innerHTML = rows.join("") ||
    `<tr><td colspan="3">Short ride — a bottle of water is all you need. 🎉</td></tr>`;

  // Bottles & mixing (osmolality per drink)
  const toneClass = {
    hypotonic: "tone-good",
    isotonic: "tone-good",
    "mildly hypertonic": "tone-warn",
    hypertonic: "tone-serious",
  };
  const drinkRows = plan.drinks.map((d) => {
    const osm = d.carbsG > 0
      ? `<td>${d.concentrationPct.toFixed(1)}%</td>
         <td>${d.mOsm} mOsm/kg <span class="badge ${toneClass[d.tonicity]}">${d.tonicity}</span></td>`
      : `<td>–</td><td><span class="badge tone-good">hydrates fast</span></td>`;
    const note = d.note ? `<div class="muted small">${d.note}</div>` : "";
    return `<tr><td>${d.count} ×</td><td>${d.recipe}${note}</td>${osm}</tr>`;
  });
  $("mixing-body").innerHTML = drinkRows.join("") ||
    `<tr><td colspan="4">No bottles needed — it's a short one.</td></tr>`;
  $("mix-notes").innerHTML = plan.notes.map((n) => `<li>${n}</li>`).join("");
  $("mix-notes").hidden = plan.notes.length === 0;

  // Shopping list
  $("shopping-list").innerHTML =
    plan.shopping.map((s) => `<li>${s.count} × ${s.label}</li>`).join("");

  // Burn vs intake note
  $("burn-note").textContent =
    `You'll burn ~${plan.totalBurnG} g of carbs (${plan.burnPerHour} g/h). ` +
    `The plan replaces ${plan.totalCarbsG} g — the rest comes from glycogen and fat, ` +
    `which is normal and expected.`;

  // Pre/post meals
  const meals = mealAdvice(rider.weightKg, sim.durationS, sim.intensityFactor);
  const menus = meals.pre.menus
    .map((m) => `<li>${m.items.join(" + ")} <span class="muted">(~${m.carbsG} g)</span></li>`)
    .join("");
  $("meal-pre").innerHTML = `
    <p><strong>${meals.pre.hoursBefore} h before rollout:</strong>
      ~${meals.pre.carbsG} g of carbs (${meals.pre.gPerKg} g/kg) with
      ~${meals.pre.waterMl} ml of water. ${meals.pre.note} For example:</p>
    <ul class="shopping">${menus}</ul>
    ${meals.pre.topUp
      ? `<p><strong>~${meals.pre.topUp.minutesBefore} min before:</strong> ` +
        `${meals.pre.topUp.label} (~${meals.pre.topUp.carbsG} g) with another ` +
        `${meals.pre.topUp.waterMl} ml of water.</p>`
      : ""}`;
  $("meal-post").textContent =
    `~${meals.post.carbsG} g carbs + ${meals.post.proteinG} g protein. ${meals.post.note}`;

  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

// --- Wiring ---------------------------------------------------------------

$("tab-gpx").addEventListener("click", () => setMode("gpx"));
$("tab-manual").addEventListener("click", () => setMode("manual"));

$("gpx-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    await loadGpxText(await file.text(), file.name.replace(/\.gpx$/i, ""));
  } catch (err) {
    gpxError(err);
  }
});

$("load-sample").addEventListener("click", async () => {
  try {
    const res = await fetch("data/sample-ride.gpx");
    if (!res.ok) throw new Error("Could not load the sample ride.");
    await loadGpxText(await res.text(), "Sample ride");
  } catch (err) {
    gpxError(err);
  }
});

$("plan-form").addEventListener("submit", (e) => {
  e.preventDefault();
  generate();
});
