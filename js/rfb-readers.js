// Readers of the RF-Behavior release zips, in the browser. Pure functions, no DOM.
// Mirrors scripts/<Modality>/read_vis.py of the dataset (same transforms and derived values).
// Needs fflate (window.fflate) for the zips.
window.RFBReaders = (function () {
  const NODE = { radar: "r", lora: "5", rfid: "13", mocap: "14", imu: "x" };
  const CEILING = new Set([0, 1, 2, 3, 4]);
  const GROUND_XYZ = { 5: [1.5, 0, 1.3], 6: [1.06, -1.06, 1.3], 7: [0, -1.5, 1.3], 8: [-1.06, -1.06, 1.3],
                       9: [-1.5, 0, 1.3], 10: [-1.06, 1.06, 1.3], 11: [0, 1.5, 1.3], 12: [1.06, 1.06, 1.3] };
  const CEILING_XY = { 5: { 0: [-2, 4], 1: [2, 4], 2: [0, 0], 3: [-2, -4], 4: [2, -4] },
                       3: { 0: [-0.75, 1.73], 1: [0.75, 1.73], 2: [0, 0], 3: [-0.75, -1.73], 4: [0.75, -1.73] } };
  const GROUND_ROTATION_DEG = { 5: 180, 6: 135, 7: 90, 8: 45, 9: 0, 10: -45, 11: -90, 12: -135 };
  const TAGS = ["A2", "A3", "A4", "A6", "A7", "A8"];
  const TAG_POSITION = { A2: "right wrist", A3: "right forearm", A4: "right upper arm",
                         A6: "left wrist", A7: "left forearm", A8: "left upper arm" };
  const CM_PER_RAD = 2.75;           // 865.5 MHz: half wavelength / pi, as in the RFID reader
  const BODIES = ["Chest", "RightArm", "LeftArm", "Hips", "RightLeg", "LeftLeg"];
  const ARMS_ONLY = ["Chest", "RightArm", "LeftArm"];
  const C3_ARMS_ONLY = new Set(["E01", "E02", "E03", "E04"]);
  const BONES = [["Chest", "RightArm"], ["Chest", "LeftArm"], ["Chest", "Hips"], ["Hips", "RightLeg"], ["Hips", "LeftLeg"]];

  // ---- files ---------------------------------------------------------------
  function zipName(row, mod) {
    const node = mod === "rfid" && row.rfid_node ? row.rfid_node : NODE[mod];   // C4: the antenna position is the node
    return `${node}_${mod}_${row.environment_id}_${row.user_id}_${row.class}_${row.trial_id}_${row.timestamp}.zip`;
  }
  async function fetchZip(url, headers = {}) {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return fflate.unzipSync(new Uint8Array(await r.arrayBuffer()));
  }
  const text = bytes => new TextDecoder("utf-8").decode(bytes);

  // .npy: magic, version, header (a Python dict as text), then the raw array
  function readNpy(bytes) {
    const major = bytes[6];
    const headerLen = major === 1 ? bytes[8] | (bytes[9] << 8)
                                  : bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24);
    const start = (major === 1 ? 10 : 12) + headerLen;
    const header = text(bytes.subarray(major === 1 ? 10 : 12, start));
    const descr = /'descr':\s*'([^']+)'/.exec(header)[1];
    const shape = /'shape':\s*\(([^)]*)\)/.exec(header)[1].split(",").map(s => s.trim()).filter(Boolean).map(Number);
    const body = bytes.slice(start).buffer;   // slice: aligned copy
    const types = { "<f8": Float64Array, "<f4": Float32Array, "<i4": Int32Array, "<i8": BigInt64Array, "<i2": Int16Array };
    const T = types[descr];
    if (!T) throw new Error("npy dtype " + descr);
    return { shape, data: new T(body) };
  }

  // CSV with quotes; returns rows of strings
  function parseCsv(s) {
    const rows = []; let row = [], field = "", q = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function parseTable(s) {
    const rows = parseCsv(s).filter(r => r.length > 1);
    const head = rows[0];
    return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
  }

  // ---- radar ---------------------------------------------------------------
  function radarPosition(r, ceilingHeight) {
    if (CEILING.has(r)) { const h = ceilingHeight >= 4 ? 5 : 3; return [...CEILING_XY[h][r], ceilingHeight]; }
    return GROUND_XYZ[r];
  }
  // points: Float64Array rows of 5 (time, x, y, z, strength) -> {x, y, z} arrays in the global frame
  function toGlobal(points, n, r, ceilingHeight) {
    const [px, py, pz] = radarPosition(r, ceilingHeight);
    const x = new Float64Array(n), y = new Float64Array(n), z = new Float64Array(n);
    if (CEILING.has(r)) {
      for (let i = 0; i < n; i++) { x[i] = points[i * 5 + 3] + px; y[i] = points[i * 5 + 2] + py; z[i] = -points[i * 5 + 1] + pz; }
    } else {
      const t = GROUND_ROTATION_DEG[r] * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      for (let i = 0; i < n; i++) {
        const xr = points[i * 5 + 1], yr = points[i * 5 + 2];
        x[i] = c * xr - s * yr + px; y[i] = s * xr + c * yr + py; z[i] = points[i * 5 + 3] + pz;
      }
    }
    return { x, y, z };
  }
  // zip entries -> {radar: {n, t (s from trial start), x, y, z, strength, frame}}, t0
  function readRadar(entries, ceilingHeight) {
    const radars = {};
    let t0 = Infinity;
    for (const name of Object.keys(entries).sort()) {
      const r = parseInt(name.slice(6, 8));
      const inner = fflate.unzipSync(entries[name]);
      const pts = readNpy(inner["points.npy"]), frame = readNpy(inner["frame.npy"]);
      const n = pts.shape[0];
      if (!n) continue;
      const g = toGlobal(pts.data, n, r, ceilingHeight);
      const tAbs = new Float64Array(n), strength = new Float64Array(n);
      for (let i = 0; i < n; i++) { tAbs[i] = pts.data[i * 5]; strength[i] = pts.data[i * 5 + 4]; }
      t0 = Math.min(t0, tAbs[0]);
      radars[r] = { n, tAbs, ...g, strength, frame: frame.data };
    }
    for (const r of Object.values(radars)) { r.t = Float64Array.from(r.tAbs, v => v - t0); }
    return { radars, t0 };
  }

  // ---- LoRa ----------------------------------------------------------------
  function readLora(entries) {
    const out = {};
    for (const [name, key] of [["abs_200Hz.csv", "abs"], ["diff_200Hz.csv", "diff"], ["var_20Hz.csv", "var"]]) {
      if (!entries[name]) continue;
      const rows = text(entries[name]).trim().split("\n").map(l => l.split(",").map(Number));
      const keep = rows.filter(r => r[0] >= 0.05);          // sample 0 is a filter transient
      out[key] = { t: keep.map(r => r[0]), v: keep.map(r => r[1]) };
    }
    return out;
  }

  // ---- RFID ----------------------------------------------------------------
  function parseStamp(s) {   // "2025-07-10T16:57:37.3355920+03:00" -> ms (fraction beyond ms kept)
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/.exec(s.trim());
    if (!m) return NaN;
    const base = Date.parse(`${m[1]}T${m[2]}${m[4] || "Z"}`);
    return base + (m[3] ? parseFloat("0." + m[3]) * 1000 : 0);
  }
  function readRfid(entries) {
    // columns: Timestamp, EPC, TID, Antenna, RSSI, Frequency, Hostname, PhaseAngle, Doppler; decimal commas in quotes
    const rows = parseCsv(text(entries["rfid.csv"])).slice(3);
    const reads = [];
    let tFirst = null, other = 0;
    for (const f of rows) {
      if (f.length < 8) continue;
      const stamp = parseStamp(f[0]);
      const rssi = parseFloat((f[4] || "").replace(",", ".")), phase = parseFloat((f[7] || "").replace(",", "."));
      if (isNaN(stamp) || isNaN(rssi) || isNaN(phase)) continue;   // damaged row
      const m = /^A(\d)0{20,}$/.exec(f[1]);
      if (!m) { other++; continue; }
      if (tFirst === null) tFirst = stamp;
      reads.push({ t: (stamp - tFirst) / 1000, tag: "A" + m[1], rssi, phase });
    }
    return { reads, other };
  }
  // speed to or from the antenna of each tag (cm/s) in time bins, as in the RFID reader (phase mod pi)
  function rfidSpeed(reads, binS) {
    const byTag = {};
    for (const r of reads) (byTag[r.tag] ??= []).push(r);
    const duration = reads.length ? reads[reads.length - 1].t : 0;
    const nb = Math.max(1, Math.ceil(duration / binS));
    const table = TAGS.map(() => new Array(nb).fill(null));
    const mean = {};
    TAGS.forEach((tag, row) => {
      const rs = (byTag[tag] || []).sort((a, b) => a.t - b.t);
      const sums = new Array(nb).fill(0), counts = new Array(nb).fill(0);
      let all = 0, n = 0;
      for (let i = 1; i < rs.length; i++) {
        const dt = rs[i].t - rs[i - 1].t;
        if (dt <= 0 || dt > 1) continue;
        let d = ((rs[i].phase - rs[i - 1].phase) % Math.PI + Math.PI) % Math.PI;  // mod pi
        if (d > Math.PI / 2) d -= Math.PI;                                          // nearest step
        const speed = Math.abs(d) * CM_PER_RAD / dt;
        const b = Math.min(nb - 1, Math.floor(rs[i].t / binS));
        sums[b] += speed; counts[b]++; all += speed; n++;
      }
      for (let b = 0; b < nb; b++) if (counts[b]) table[row][b] = sums[b] / counts[b];
      mean[tag] = n ? all / n : null;
    });
    return { table, mean, binS, duration, edges: Array.from({ length: nb }, (_, i) => i * binS) };
  }

  // ---- motion capture ------------------------------------------------------
  function readMocap(entries, campaign, cls) {
    const rows = parseCsv(text(entries["mocap.csv"]));
    const names = rows[3], kinds = rows[5];
    const data = rows.slice(7).filter(r => r.length > 2);
    const valid = campaign === "C3" && C3_ARMS_ONLY.has(cls) ? ARMS_ONLY : BODIES;
    const cols = {};
    names.forEach((n, i) => { if (kinds[i] === "Position" && valid.includes(n)) (cols[n] ??= []).push(i); });
    const t = data.map(r => parseFloat(r[1]));
    const position = {};
    for (const [b, c] of Object.entries(cols)) {
      position[b] = [0, 1, 2].map(k => {
        const v = data.map(r => parseFloat(r[c[k]]));
        // fill gaps by linear interpolation, as in the reader
        let last = null, lastI = -1;
        for (let i = 0; i < v.length; i++) {
          if (!isNaN(v[i])) {
            if (last !== null && i - lastI > 1) for (let j = lastI + 1; j < i; j++) v[j] = last + (v[i] - last) * (j - lastI) / (i - lastI);
            else if (last === null) for (let j = 0; j < i; j++) v[j] = v[i];
            last = v[i]; lastI = i;
          }
        }
        for (let j = lastI + 1; j < v.length; j++) v[j] = last;
        return v;
      });
    }
    return { t, bodies: Object.keys(position), position };   // position[body] = [x[], y[], z[]] in mm
  }
  function bodySpeed(t, xyz) {   // m/s per sample
    const n = t.length, s = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      const dt = t[i] - t[i - 1] || 0.01;
      s[i] = Math.hypot(xyz[0][i] - xyz[0][i - 1], xyz[1][i] - xyz[1][i - 1], xyz[2][i] - xyz[2][i - 1]) / 1000 / dt;
    }
    return s;
  }

  // ---- IMU -----------------------------------------------------------------
  function readImu(entries) {
    const out = {};
    for (const name of Object.keys(entries)) {
      if (!name.endsWith("_data.csv")) continue;
      const [sensor, measure] = name.split("_");
      const rows = text(entries[name]).trim().split("\n");
      if (rows.length < 3) continue;                      // empty file
      const head = rows[0].split(",");
      const ti = head.indexOf("timestamp");
      const xi = head.findIndex(h => h.endsWith("_x"));
      const v = rows.slice(1).map(l => l.split(",").map(Number));
      const t0 = v[0][ti];
      (out[sensor] ??= {})[measure] = {
        t: v.map(r => r[ti] - t0), x: v.map(r => r[xi]), y: v.map(r => r[xi + 1]), z: v.map(r => r[xi + 2]),   // time stamps in s
      };
    }
    return out;
  }

  return { NODE, CEILING, TAGS, TAG_POSITION, BODIES, BONES, zipName, fetchZip, readNpy, parseTable, parseCsv,
           radarPosition, readRadar, readLora, readRfid, rfidSpeed, readMocap, bodySpeed, readImu };
})();
