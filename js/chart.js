// SVG elevation profile with fueling-event markers and a hover crosshair.
// Colors come from CSS custom properties on .viz-root (light/dark aware).

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function niceStep(range, maxTicks) {
  const rough = range / maxTicks;
  const pow = 10 ** Math.floor(Math.log10(rough));
  for (const m of [1, 2, 5, 10]) {
    if (pow * m >= rough) return pow * m;
  }
  return pow * 10;
}

function fmtClock(s) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

/**
 * Render the profile chart.
 * @param {HTMLElement} container
 * @param {Array<{dist:number, ele:number}>} profile meters
 * @param {Array} events fueling events with distM set
 * @param {Array<number>} cumTime seconds at each profile point
 */
export function renderChart(container, profile, events, cumTime) {
  container.textContent = "";
  const W = 860;
  const H = 300;
  const M = { top: 18, right: 16, bottom: 34, left: 52 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const maxDist = profile[profile.length - 1].dist;
  let minEle = Infinity;
  let maxEle = -Infinity;
  for (const p of profile) {
    if (p.ele < minEle) minEle = p.ele;
    if (p.ele > maxEle) maxEle = p.ele;
  }
  const elePad = Math.max(20, (maxEle - minEle) * 0.12);
  const y0 = Math.floor((minEle - elePad) / 10) * 10;
  const y1 = Math.ceil((maxEle + elePad) / 10) * 10;

  const x = (d) => M.left + (d / maxDist) * iw;
  const y = (e) => M.top + ih - ((e - y0) / (y1 - y0)) * ih;

  const svg = el("svg", {
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": "Elevation profile with fueling points",
  });
  svg.classList.add("profile-chart");

  // Gridlines + y ticks (elevation)
  const yStep = niceStep(y1 - y0, 5);
  for (let v = Math.ceil(y0 / yStep) * yStep; v <= y1; v += yStep) {
    svg.append(
      el("line", { x1: M.left, x2: M.left + iw, y1: y(v), y2: y(v), class: "grid" })
    );
    const t = el("text", { x: M.left - 8, y: y(v) + 4, class: "tick", "text-anchor": "end" });
    t.textContent = `${Math.round(v)} m`;
    svg.append(t);
  }
  // x ticks (distance)
  const xStep = niceStep(maxDist / 1000, 8);
  for (let km = 0; km * 1000 <= maxDist; km += xStep) {
    const t = el("text", {
      x: x(km * 1000),
      y: M.top + ih + 22,
      class: "tick",
      "text-anchor": "middle",
    });
    t.textContent = `${km} km`;
    svg.append(t);
  }
  svg.append(
    el("line", {
      x1: M.left, x2: M.left + iw,
      y1: M.top + ih, y2: M.top + ih,
      class: "axis-line",
    })
  );

  // Area + line
  let d = `M ${x(profile[0].dist)} ${y(profile[0].ele)}`;
  for (let i = 1; i < profile.length; i++) {
    d += ` L ${x(profile[i].dist).toFixed(1)} ${y(profile[i].ele).toFixed(1)}`;
  }
  svg.append(
    el("path", {
      d: `${d} L ${x(maxDist)} ${M.top + ih} L ${x(0)} ${M.top + ih} Z`,
      class: "area",
    })
  );
  svg.append(el("path", { d, class: "line" }));

  // Elevation lookup for marker placement
  const eleAt = (dist) => {
    let lo = 0;
    let hi = profile.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (profile[mid].dist < dist) lo = mid + 1;
      else hi = mid;
    }
    return profile[lo].ele;
  };

  // Fueling markers (≥8px, 2px surface ring)
  for (const ev of events) {
    if (ev.distM == null || ev.distM > maxDist) continue;
    const c = el("circle", {
      cx: x(ev.distM),
      cy: y(eleAt(ev.distM)),
      r: 5,
      class: ev.type === "eat" ? "marker-eat" : "marker-drink",
    });
    const title = el("title");
    title.textContent = `${fmtClock(ev.timeS)} · ${ev.label}`;
    c.append(title);
    svg.append(c);
  }

  // Hover crosshair + tooltip
  const cross = el("line", {
    y1: M.top, y2: M.top + ih, class: "crosshair", visibility: "hidden",
  });
  svg.append(cross);
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;

  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  wrap.append(svg, tip);
  container.append(wrap);

  svg.addEventListener("pointermove", (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < M.left || px > M.left + iw) {
      cross.setAttribute("visibility", "hidden");
      tip.hidden = true;
      return;
    }
    const dist = ((px - M.left) / iw) * maxDist;
    let lo = 0;
    let hi = profile.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (profile[mid].dist < dist) lo = mid + 1;
      else hi = mid;
    }
    const p = profile[lo];
    cross.setAttribute("x1", x(p.dist));
    cross.setAttribute("x2", x(p.dist));
    cross.setAttribute("visibility", "visible");
    const time = cumTime && cumTime[lo] != null ? ` · ${fmtClock(cumTime[lo])}` : "";
    tip.textContent = `${(p.dist / 1000).toFixed(1)} km · ${Math.round(p.ele)} m${time}`;
    tip.hidden = false;
    const frac = (x(p.dist) - M.left) / iw;
    tip.style.left = `${(x(p.dist) / W) * 100}%`;
    tip.style.transform = frac > 0.8 ? "translateX(-105%)" : "translateX(8px)";
  });
  svg.addEventListener("pointerleave", () => {
    cross.setAttribute("visibility", "hidden");
    tip.hidden = true;
  });
}
