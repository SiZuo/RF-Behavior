// Explore: read the zips of a sample trial in the browser and draw them with Plotly.
(async function () {
  const R = RFBReaders;
  const $ = id => document.getElementById(id);
  const sel = { campaign: $("x-campaign"), user: $("x-user"), cls: $("x-cls"), modality: $("x-modality"),
                view: $("x-view"), radars: $("x-radars"), start: $("x-start"), end: $("x-end") };
  const status = $("x-status"), plot = $("x-plot");
  const MOD_LABEL = { radar: "Radar", lora: "LoRa", rfid: "RFID", mocap: "Motion capture", imu: "IMU" };
  const VIEWS = {
    radar: ["point cloud in time (3-D)", "points per radar in time"],
    lora: ["the three features"],
    rfid: ["motion of the tags", "RSSI and phase of each tag"],
    mocap: ["skeleton in time (3-D)", "speed of each rigid body"],
    imu: ["angular speed of each sensor", "acceleration", "angular rate", "magnetic field"],
  };
  const HAS = { radar: "radar_files", lora: "lora_files", rfid: "rfid_file", mocap: "mocap_file", imu: "imu_files" };
  const RADAR_COLORS = ["#1f77b4", "#2ca02c", "#9467bd", "#8c564b", "#7f7f7f", "#d62728", "#ff7f0e", "#bcbd22",
                        "#17becf", "#e377c2", "#aec7e8", "#ffbb78", "#98df8a"];
  const BLUES = [[0, "#f7fbff"], [0.25, "#c6dbef"], [0.5, "#6baed6"], [0.75, "#2171b5"], [1, "#08306b"]];
  const dark = () => matchMedia("(prefers-color-scheme: dark)").matches;
  const base = () => ({
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: dark() ? "#1a1e23" : "#ffffff",
    font: { family: "Inter, system-ui, sans-serif", size: 12, color: dark() ? "#e8e9eb" : "#121417" },
    margin: { l: 56, r: 20, t: 56, b: 48 }, height: 520, title: { y: 0.98, yanchor: "top" },
  });
  const grid = () => ({ gridcolor: dark() ? "#2a2f36" : "#e4e5e8", zerolinecolor: dark() ? "#2a2f36" : "#e4e5e8" });

  const trials = R.parseTable(await (await fetch(`${RFB.META_BASE}/trials_samples.csv`)).text());
  const cache = {};

  // ---- choices -------------------------------------------------------------
  function fill(select, options, keep) {
    const old = select.value; select.innerHTML = "";
    options.forEach(([label, value]) => { const o = document.createElement("option"); o.textContent = label; o.value = value; select.append(o); });
    if (keep && options.some(([, v]) => v === old)) select.value = old;
  }
  const uniq = xs => [...new Set(xs)];
  const row = () => trials.find(t => t.campaign === sel.campaign.value && t.user === sel.user.value && t.class === sel.cls.value);
  function onCampaign() {
    fill(sel.user, uniq(trials.filter(t => t.campaign === sel.campaign.value).map(t => t.user)).map(u => [u, u]), true); onUser();
  }
  function onUser() {
    const ts = trials.filter(t => t.campaign === sel.campaign.value && t.user === sel.user.value);
    fill(sel.cls, ts.map(t => [`${t.class}  ${t.class_name}`, t.class]), true); onClass();
  }
  function onClass() {
    const r = row();
    fill(sel.modality, Object.keys(HAS).filter(m => +r[HAS[m]] > 0).map(m => [MOD_LABEL[m], m]), true);
    const missing = new Set(r.radar_missing.split(";").filter(Boolean).map(Number));
    const present = [...Array(13).keys()].filter(k => !missing.has(k));
    fill(sel.radars, [["all radars", "all"], ["ceiling radars (0-4)", "ceiling"], ["ground radars (5-12)", "ground"],
                      ...present.map(k => [`radar ${k}`, String(k)])], true);
    setWindow(r, r.campaign === "C3" ? 20 : null);
    onModality();
  }
  // the slider with two handles: 0 to the length of the trial
  function trialLength(r) {
    const d = ["radar_duration_s", "mocap_duration_s", "lora_duration_s", "rfid_duration_s", "imu_duration_s"]
      .map(k => parseFloat(r[k])).filter(v => !isNaN(v));
    return Math.ceil(Math.max(1, ...d));
  }
  function setWindow(r, end) {
    const max = trialLength(r);
    sel.start.max = max; sel.end.max = max;
    sel.start.value = 0; sel.end.value = end && end < max ? end : max;
    showWindow();
  }
  function showWindow() {
    let a = parseFloat(sel.start.value), b = parseFloat(sel.end.value);
    const max = parseFloat(sel.end.max);
    if (b - a < 0.5) { if (this === sel.start) { a = Math.max(0, b - 0.5); sel.start.value = a; } else { b = Math.min(max, a + 0.5); sel.end.value = b; } }
    $("x-fill").style.left = `${a / max * 100}%`; $("x-fill").style.width = `${(b - a) / max * 100}%`;
    $("x-window").textContent = a === 0 && b >= max ? `whole trial (${max} s)` : `${a.toFixed(1)} to ${b.toFixed(1)} s`;
  }
  function onModality() {
    fill(sel.view, VIEWS[sel.modality.value].map(v => [v, v]), true);
    $("x-radars-label").style.display = sel.modality.value === "radar" ? "" : "none";
    draw();
  }
  function radarSet(r) {
    const missing = new Set(r.radar_missing.split(";").filter(Boolean).map(Number));
    const present = [...Array(13).keys()].filter(k => !missing.has(k));
    const v = sel.radars.value;
    if (v === "ceiling") return present.filter(k => R.CEILING.has(k));
    if (v === "ground") return present.filter(k => !R.CEILING.has(k));
    if (/^\d+$/.test(v)) return [+v];
    return present;
  }
  function window_() {
    const s = parseFloat(sel.start.value), e = parseFloat(sel.end.value);
    return [s, e >= parseFloat(sel.end.max) ? Infinity : e];
  }

  // ---- data ----------------------------------------------------------------
  async function load(r, mod) {
    const key = `${mod}/${R.zipName(r, mod)}`;
    if (!cache[key]) {
      status.textContent = `Loading ${key} …`;
      const entries = await R.fetchZip(`${RFB.DATA_BASE}/${key}`);
      cache[key] = mod === "radar" ? R.readRadar(entries, parseFloat(r.ceiling_radar_height_m))
                 : mod === "lora" ? R.readLora(entries)
                 : mod === "rfid" ? R.readRfid(entries)
                 : mod === "mocap" ? R.readMocap(entries, r.campaign, r.class)
                 : R.readImu(entries);
    }
    return cache[key];
  }
  const title = (r, extra) => `${r.campaign} / ${r.user} / ${r.class} ${r.class_name}, repetition ${r.repetition}  -  ${extra}`;

  // ---- views ---------------------------------------------------------------
  function radarCloud(r, d, radars, [s, e]) {
    const ceiling = parseFloat(r.ceiling_radar_height_m);
    const present = radars;                       // every selected radar keeps its legend entry
    let tMax = 0, tMin = Infinity;
    for (const k of present) if (d.radars[k]) for (const t of d.radars[k].t) if (t >= s && t <= e) { tMax = Math.max(tMax, t); tMin = Math.min(tMin, t); }
    if (!isFinite(tMin)) throw new Error("no points in the window");
    let step = 0.1, n = Math.floor((tMax - tMin) / step) + 1;
    if (n > 200) { step = (tMax - tMin) / 200; n = 200; }
    const frames = [];
    for (let i = 0; i < n; i++) {
      const t = tMin + i * step;
      frames.push({ name: String(i), data: present.map(k => {
        const p = d.radars[k], x = [], y = [], z = [];
        if (p) for (let j = 0; j < p.n; j++) if (p.t[j] >= t && p.t[j] < t + step) { x.push(p.x[j]); y.push(p.y[j]); z.push(p.z[j]); }
        if (!x.length) { x.push(99); y.push(99); z.push(99); }   // a point outside the room keeps the legend entry
        return { x, y, z };
      }), layout: { title: { text: title(r, `point cloud, ${t.toFixed(2)} s`) } } });
    }
    const traces = present.map((k, i) => ({ type: "scatter3d", mode: "markers",
      name: `radar ${k}${d.radars[k] ? "" : " (no file)"}`, marker: { size: 3, color: RADAR_COLORS[k] }, ...frames[0].data[i] }));
    const pos = radars.map(k => R.radarPosition(k, ceiling));
    traces.push({ type: "scatter3d", mode: "markers+text", name: "radar positions", text: radars.map(String),
      textposition: "top center", textfont: { size: 10 }, x: pos.map(p => p[0]), y: pos.map(p => p[1]), z: pos.map(p => p[2]),
      marker: { size: 5, color: radars.map(k => RADAR_COLORS[k]), symbol: radars.map(k => R.CEILING.has(k) ? "diamond" : "square"),
                line: { color: "#121417", width: 1 } }, hoverinfo: "text" });
    const circle = [...Array(61).keys()].map(i => i / 60 * 2 * Math.PI);
    traces.push({ type: "scatter3d", mode: "lines", name: "1.5 m circle", showlegend: false, hoverinfo: "skip",
      x: circle.map(a => 1.5 * Math.cos(a)), y: circle.map(a => 1.5 * Math.sin(a)), z: circle.map(() => 0),
      line: { color: "#9aa3ad", width: 2, dash: "dash" } });
    const axis = { range: [-4.5, 4.5], ...grid() };
    const layout = { ...base(), height: 640, title: { text: title(r, `point cloud, ${tMin.toFixed(2)} s`), x: 0.02, y: 0.985, yanchor: "top" },
      scene: { xaxis: { ...axis, title: "x (m)" }, yaxis: { ...axis, title: "y (m)" },
               zaxis: { range: [0, ceiling + 0.5], title: "z (m)", ...grid() }, aspectmode: "manual",
               aspectratio: { x: 1, y: 1, z: (ceiling + 0.5) / 9 }, camera: { eye: { x: 1.4, y: -1.6, z: 0.9 } } },
      legend: { orientation: "h", x: 1, xanchor: "right", y: 1.02, yanchor: "bottom", itemsizing: "constant" }, margin: { l: 20, r: 20, t: 120, b: 90 },
      updatemenus: [{ type: "buttons", direction: "right", x: 0, y: 1.02, xanchor: "left", yanchor: "bottom", showactive: false, pad: { r: 6 }, buttons: [
        { label: "Play", method: "animate", args: [null, { frame: { duration: Math.max(60, step * 1000), redraw: true }, fromcurrent: true, transition: { duration: 0 } }] },
        { label: "Pause", method: "animate", args: [[null], { mode: "immediate", frame: { duration: 0, redraw: false } }] }] }],
      sliders: [{ x: 0, len: 1, y: 0, yanchor: "top", pad: { t: 24 }, currentvalue: { visible: false },
        steps: frames.map((f, i) => ({ label: (tMin + i * step).toFixed(1), method: "animate",
          args: [[f.name], { mode: "immediate", frame: { duration: 0, redraw: true }, transition: { duration: 0 } }] })) }],
    };
    return { traces, layout, frames };
  }

  function radarHeat(r, d, radars, [s, e]) {
    const present = radars.filter(k => d.radars[k]);
    let tMax = 0;
    for (const k of present) for (const t of d.radars[k].t) if (t <= e) tMax = Math.max(tMax, t);
    const dur = tMax - s, bin = dur < 8 ? 0.1 : dur < 40 ? 0.5 : 2;
    const nb = Math.ceil(dur / bin) + 1;
    const z = radars.map(k => {
      const rowv = new Array(nb).fill(null);
      const p = d.radars[k]; if (!p) return rowv;
      const perFrame = {};                              // frame -> {t, n}
      for (let j = 0; j < p.n; j++) if (p.t[j] >= s && p.t[j] <= e) { const f = p.frame[j]; (perFrame[f] ??= { t: p.t[j], n: 0 }).n++; }
      const sums = new Array(nb).fill(0), counts = new Array(nb).fill(0);
      for (const f of Object.values(perFrame)) { const b = Math.min(nb - 1, Math.floor((f.t - s) / bin)); sums[b] += f.n; counts[b]++; }
      for (let b = 0; b < nb; b++) if (counts[b]) rowv[b] = sums[b] / counts[b];
      return rowv;
    });
    const traces = [{ type: "heatmap", z, x: [...Array(nb).keys()].map(b => s + b * bin), y: radars.map(k => `${k} ${R.CEILING.has(k) ? "ceiling" : "ground"}`),
      colorscale: BLUES, zmin: 0, zmax: 10, xgap: 1, ygap: 1, colorbar: { title: "points per frame" }, hoverongaps: false }];
    const layout = { ...base(), title: { text: title(r, `points per radar in time, one cell = ${bin} s`), x: 0.02 },
      xaxis: { title: "time (s)", ...grid() }, yaxis: { autorange: "reversed", type: "category", ...grid() } };
    return { traces, layout };
  }

  function loraView(r, d, [s, e]) {
    const keys = [["abs", "amplitude (abs_200Hz)"], ["diff", "difference (diff_200Hz)"], ["var", "variance (var_20Hz)"]];
    const traces = keys.map(([k, name], i) => {
      const f = d[k]; const idx = f.t.map((t, j) => j).filter(j => f.t[j] >= s && f.t[j] <= e);
      return { type: "scatter", mode: "lines", name, x: idx.map(j => f.t[j]), y: idx.map(j => f.v[j]),
               line: { width: 1, color: ["#2171b5", "#6baed6", "#08306b"][i] }, xaxis: "x", yaxis: `y${i + 1}` };
    });
    const layout = { ...base(), height: 600, title: { text: title(r, "LoRa features"), x: 0.02 }, showlegend: false,
      xaxis: { title: "time (s)", domain: [0, 1], anchor: "y3", ...grid() },
      yaxis: { domain: [0.72, 1], title: "amplitude", ...grid() }, yaxis2: { domain: [0.37, 0.65], title: "difference", ...grid() },
      yaxis3: { domain: [0, 0.3], title: "variance", ...grid() },
      annotations: keys.map(([, name], i) => ({ text: name, x: 0, xref: "paper", y: [1, 0.65, 0.3][i], yref: "paper", yanchor: "bottom", showarrow: false, font: { size: 12 } })) };
    return { traces, layout };
  }

  function rfidMotion(r, d, [s, e]) {
    const reads = d.reads.filter(x => x.t >= s && x.t <= e);
    const dur = reads.length ? reads[reads.length - 1].t - reads[0].t : 1;
    const bin = dur < 5 ? 0.25 : dur < 30 ? 1 : 5;
    const sp = R.rfidSpeed(reads.map(x => ({ ...x, t: x.t - reads[0].t })), bin);
    const labels = R.TAGS.map(t => `${t} ${R.TAG_POSITION[t]}  ·  ${sp.mean[t] === null ? "no reads" : sp.mean[t].toFixed(1) + " cm/s"}`);
    const traces = [{ type: "heatmap", z: sp.table, x: sp.edges.map(t => t + reads[0].t), y: labels,
      colorscale: BLUES, zmin: 0, zmax: 60, xgap: 1, ygap: 1, hoverongaps: false, colorbar: { title: "cm/s" } }];
    const layout = { ...base(), title: { text: title(r, `speed of each tag to or from the antenna, one cell = ${bin} s; row label = mean`), x: 0.02 },
      xaxis: { title: "time (s)", ...grid() }, yaxis: { autorange: "reversed", type: "category", ...grid() },
      margin: { l: 200, r: 20, t: 56, b: 48 } };
    return { traces, layout };
  }

  function rfidRaw(r, d, [s, e]) {
    const reads = d.reads.filter(x => x.t >= s && x.t <= e);
    const traces = [];
    R.TAGS.forEach((tag, i) => {
      const rs = reads.filter(x => x.tag === tag); if (!rs.length) return;
      const color = ["#08306b", "#2171b5", "#6baed6", "#7f2704", "#d94801", "#fd8d3c"][i];
      traces.push({ type: "scatter", mode: "markers", name: tag, legendgroup: tag, marker: { size: 4, color }, x: rs.map(x => x.t), y: rs.map(x => x.rssi), yaxis: "y" });
      traces.push({ type: "scatter", mode: "markers", name: tag, legendgroup: tag, showlegend: false, marker: { size: 4, color }, x: rs.map(x => x.t), y: rs.map(x => x.phase), yaxis: "y2" });
    });
    const layout = { ...base(), height: 600, title: { text: title(r, "RSSI and phase of each tag"), x: 0.02 },
      xaxis: { title: "time (s)", anchor: "y2", ...grid() }, yaxis: { domain: [0.55, 1], title: "RSSI (dBm)", ...grid() },
      yaxis2: { domain: [0, 0.45], title: "phase (rad)", range: [0, 2 * Math.PI], ...grid() }, legend: { orientation: "h", y: 1.06 } };
    return { traces, layout };
  }

  function mocapSkeleton(r, d, [s, e]) {
    const idx = d.t.map((t, i) => i).filter(i => d.t[i] >= s && d.t[i] <= e);
    if (!idx.length) throw new Error("no frames in the window");
    const stepN = Math.max(1, Math.ceil(idx.length / 150));
    const used = idx.filter((_, j) => j % stepN === 0);
    const bodies = d.bodies, bones = R.BONES.filter(([a, b]) => bodies.includes(a) && bodies.includes(b));
    // mocap frame: X side, Y up, Z front (mm) -> plot x = X, y = Z, z = Y, in metres
    const P = (b, i) => [d.position[b][0][i] / 1000, d.position[b][2][i] / 1000, d.position[b][1][i] / 1000];
    const frameData = i => {
      const pts = bodies.map(b => P(b, i));
      const lines = { x: [], y: [], z: [] };
      bones.forEach(([a, b]) => { const pa = P(a, i), pb = P(b, i); lines.x.push(pa[0], pb[0], null); lines.y.push(pa[1], pb[1], null); lines.z.push(pa[2], pb[2], null); });
      return [{ x: pts.map(p => p[0]), y: pts.map(p => p[1]), z: pts.map(p => p[2]), text: bodies }, lines];
    };
    const frames = used.map(i => ({ name: String(i), data: frameData(i), layout: { title: { text: title(r, `skeleton, ${d.t[i].toFixed(2)} s`) } } }));
    const f0 = frameData(used[0]);
    const traces = [{ type: "scatter3d", mode: "markers+text", name: "rigid bodies", textposition: "top center", textfont: { size: 10 },
                      marker: { size: 6, color: "#2171b5" }, ...f0[0] },
                    { type: "scatter3d", mode: "lines", name: "links", line: { color: "#6baed6", width: 6 }, ...f0[1] }];
    // the paths of all bodies in the window, light
    bodies.forEach(b => traces.push({ type: "scatter3d", mode: "lines", name: `${b} path`, showlegend: false, hoverinfo: "skip",
      x: idx.map(i => P(b, i)[0]), y: idx.map(i => P(b, i)[1]), z: idx.map(i => P(b, i)[2]), line: { color: "rgba(107,174,214,0.35)", width: 2 } }));
    // axes fitted to the motion in the window: a cube around the person, at least 2 m wide
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const b of bodies) for (const i of idx) { const p = P(b, i); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }
    const half = Math.max(1.0, (hi[0] - lo[0]) / 2 + 0.3, (hi[1] - lo[1]) / 2 + 0.3);
    const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, zTop = Math.max(2.0, hi[2] + 0.2);
    const layout = { ...base(), height: 640, title: { text: title(r, `skeleton, ${d.t[used[0]].toFixed(2)} s`), x: 0.02, y: 0.985, yanchor: "top" },
      scene: { xaxis: { range: [cx - half, cx + half], title: "X side (m)", ...grid() }, yaxis: { range: [cy - half, cy + half], title: "Z front (m)", ...grid() },
               zaxis: { range: [0, zTop], title: "Y up (m)", ...grid() },
               aspectmode: "manual", aspectratio: { x: 1, y: 1, z: zTop / (2 * half) }, camera: { eye: { x: 1.3, y: -1.9, z: 0.6 } } },
      legend: { orientation: "h", x: 1, xanchor: "right", y: 1.02, yanchor: "bottom", itemsizing: "constant" }, margin: { l: 20, r: 20, t: 120, b: 90 },
      updatemenus: [{ type: "buttons", direction: "right", x: 0, y: 1.02, xanchor: "left", yanchor: "bottom", showactive: false, pad: { r: 6 }, buttons: [
        { label: "Play", method: "animate", args: [null, { frame: { duration: 60, redraw: true }, fromcurrent: true, transition: { duration: 0 } }] },
        { label: "Pause", method: "animate", args: [[null], { mode: "immediate", frame: { duration: 0, redraw: false } }] }] }],
      sliders: [{ x: 0, len: 1, y: 0, yanchor: "top", pad: { t: 24 }, currentvalue: { visible: false },
        steps: frames.map((f, j) => ({ label: d.t[used[j]].toFixed(1), method: "animate", args: [[f.name], { mode: "immediate", frame: { duration: 0, redraw: true }, transition: { duration: 0 } }] })) }] };
    return { traces, layout, frames };
  }

  function mocapSpeed(r, d, [s, e]) {
    const idx = d.t.map((t, i) => i).filter(i => d.t[i] >= s && d.t[i] <= e);
    const colors = { Chest: "#08306b", RightArm: "#2171b5", LeftArm: "#6baed6", Hips: "#7f2704", RightLeg: "#d94801", LeftLeg: "#fd8d3c" };
    const traces = d.bodies.map(b => { const sp = R.bodySpeed(d.t, d.position[b]);
      // smooth over 0.25 s (25 samples)
      const sm = idx.map(i => { let a = 0, n = 0; for (let j = Math.max(0, i - 12); j <= Math.min(sp.length - 1, i + 12); j++) { a += sp[j]; n++; } return a / n; });
      return { type: "scatter", mode: "lines", name: b, x: idx.map(i => d.t[i]), y: sm, line: { width: 1.5, color: colors[b] } }; });
    const layout = { ...base(), title: { text: title(r, "speed of each rigid body (smoothed 0.25 s)"), x: 0.02 },
      xaxis: { title: "time (s)", ...grid() }, yaxis: { title: "speed (m/s)", rangemode: "tozero", ...grid() } };
    return { traces, layout };
  }

  function imuView(r, d, view, [s, e]) {
    const sensors = Object.keys(d);
    const colors = { Chest: "#08306b", RightArm: "#2171b5", LeftArm: "#6baed6", Hips: "#7f2704", RightLeg: "#d94801", LeftLeg: "#fd8d3c" };
    if (view.startsWith("angular speed")) {
      const traces = sensors.filter(sn => d[sn].gyro).map(sn => { const g = d[sn].gyro;
        const idx = g.t.map((t, i) => i).filter(i => g.t[i] >= s && g.t[i] <= e);
        return { type: "scatter", mode: "lines", name: sn, line: { width: 1, color: colors[sn] }, x: idx.map(i => g.t[i]), y: idx.map(i => Math.hypot(g.x[i], g.y[i], g.z[i])) }; });
      return { traces, layout: { ...base(), title: { text: title(r, "angular speed of each sensor"), x: 0.02 }, xaxis: { title: "time (s)", ...grid() }, yaxis: { title: "deg/s", rangemode: "tozero", ...grid() } } };
    }
    const measure = { acceleration: "acc", "angular rate": "gyro", "magnetic field": "magn" }[view];
    const unit = { acc: "m/s²", gyro: "deg/s", magn: "µT" }[measure];
    const traces = [], n = sensors.length, layout = { ...base(), height: 200 + 170 * n, title: { text: title(r, `${view}, three axes of each sensor`), x: 0.02 }, legend: { orientation: "h", y: 1.04 } };
    sensors.forEach((sn, k) => {
      const m = d[sn][measure]; const ya = k === 0 ? "y" : `y${k + 1}`;
      const top = 1 - k / n, bottom = 1 - (k + 1) / n + 0.06;
      layout[k === 0 ? "yaxis" : `yaxis${k + 1}`] = { domain: [bottom, top], title: `${sn} (${unit})`, ...grid() };
      if (!m) return;
      const idx = m.t.map((t, i) => i).filter(i => m.t[i] >= s && m.t[i] <= e);
      [["x", "#08306b"], ["y", "#2171b5"], ["z", "#9ecae1"]].forEach(([ax, c]) => traces.push({ type: "scatter", mode: "lines", name: ax, showlegend: k === 0, legendgroup: ax,
        line: { width: 1, color: c }, x: idx.map(i => m.t[i]), y: idx.map(i => m[ax][i]), yaxis: ya }));
    });
    layout.xaxis = { title: "time (s)", anchor: n === 1 ? "y" : `y${n}`, ...grid() };
    return { traces, layout };
  }

  // ---- draw ----------------------------------------------------------------
  let busy = false;
  async function draw() {
    if (busy) return; busy = true;
    const r = row(), mod = sel.modality.value, view = sel.view.value, win = window_();
    try {
      const d = await load(r, mod);
      status.textContent = "Drawing …";
      let out;
      if (mod === "radar") out = view.startsWith("point cloud") ? radarCloud(r, d, radarSet(r), win) : radarHeat(r, d, radarSet(r), win);
      else if (mod === "lora") out = loraView(r, d, win);
      else if (mod === "rfid") out = view.startsWith("motion") ? rfidMotion(r, d, win) : rfidRaw(r, d, win);
      else if (mod === "mocap") out = view.startsWith("skeleton") ? mocapSkeleton(r, d, win) : mocapSpeed(r, d, win);
      else out = imuView(r, d, view, win);
      await Plotly.newPlot(plot, out.traces, out.layout, { responsive: true, displaylogo: false });
      if (out.frames) await Plotly.addFrames(plot, out.frames);
      status.textContent = `${MOD_LABEL[mod]} of ${r.campaign} / ${r.user} / ${r.class}, read from ${R.zipName(r, mod)} in this page.`;
    } catch (err) {
      status.textContent = `Cannot draw: ${err.message}`;
      console.error(err);
    } finally { busy = false; }
  }

  fill(sel.campaign, uniq(trials.map(t => t.campaign)).map(c => [`${c} ${trials.find(t => t.campaign === c).campaign_name}`, c]));
  sel.campaign.onchange = onCampaign; sel.user.onchange = onUser; sel.cls.onchange = onClass;
  sel.modality.onchange = onModality; sel.view.onchange = draw; sel.radars.onchange = draw;
  $("x-draw").onclick = draw;
  sel.start.oninput = showWindow; sel.end.oninput = showWindow;
  sel.start.onchange = draw; sel.end.onchange = draw;
  onCampaign();
})();
