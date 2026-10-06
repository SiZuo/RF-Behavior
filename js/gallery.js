// Gallery: dropdowns over figures/manifest.json (made by build_gallery.py with the dataset's readers).
(async function () {
  const M = await (await fetch(RFB.FIGURES_MANIFEST)).json();
  const $ = id => document.getElementById(id);
  const sel = { env: $("env"), campaign: $("campaign"), user: $("user"), cls: $("cls"), modality: $("modality"),
                view: $("view"), radars: $("radars") };
  const RADAR_LABEL = { all: "all radars", ground: "ground radars (5-12)" };
  const CAMPAIGN_LABEL = {};
  M.trials.forEach(t => { CAMPAIGN_LABEL[t.campaign] = `${t.campaign} ${t.campaign_name}`; });

  function fill(select, options, keep) {
    const old = select.value;
    select.innerHTML = "";
    options.forEach(([label, value]) => {
      const o = document.createElement("option"); o.textContent = label; o.value = value; select.append(o);
    });
    if (keep && options.some(([, v]) => v === old)) select.value = old;
  }
  const uniq = xs => [...new Set(xs)];
  const inEnv = () => M.trials.filter(t => String(t.environment_id) === sel.env.value);
  const trialsOf = () => inEnv().filter(t => t.campaign === sel.campaign.value);
  const trial = () => inEnv().find(t => t.campaign === sel.campaign.value && t.user === sel.user.value
                                        && t.cls === sel.cls.value);

  function onEnv() {
    const cs = uniq(inEnv().map(t => t.campaign));
    fill(sel.campaign, cs.map(c => [CAMPAIGN_LABEL[c], c]), true);
    onCampaign();
  }
  function onCampaign() { fill(sel.user, uniq(trialsOf().map(t => t.user)).map(u => [u, u]), true); onUser(); }
  function onUser() {
    const ts = trialsOf().filter(t => t.user === sel.user.value);
    fill(sel.cls, ts.map(t => [`${t.cls}  ${t.class_name}`, t.cls]), true);
    onClass();
  }
  function onClass() { fill(sel.modality, trial().modalities.map(m => [M.modality_label[m], m]), true); onModality(); }
  function onModality() {
    fill(sel.view, M.views[sel.modality.value].map(v => [v, v]), true);
    const radar = sel.modality.value === "radar";
    $("radars-label").style.display = radar ? "" : "none";
    if (radar) fill(sel.radars, ["all", "ground"].map(r => [RADAR_LABEL[r], r]), true);
    show();
  }
  function show() {
    const t = trial();
    const radars = sel.modality.value === "radar" ? sel.radars.value : "-";
    const f = M.figures.find(g => g.environment_id === t.environment_id && g.campaign === t.campaign && g.user === t.user && g.cls === t.cls
                                  && g.modality === sel.modality.value && g.view === sel.view.value
                                  && g.radars === radars);
    const img = $("figure");
    if (!f) { img.removeAttribute("src"); $("caption").textContent = "No figure for this choice."; return; }
    img.src = f.file;
    img.alt = `${M.modality_label[f.modality]}, ${f.view}`;
    const win = f.window[0] === null && f.window[1] === null ? "whole trial"
              : `${f.window[0] ?? 0} to ${f.window[1] ?? "end"} s`;
    $("caption").textContent = `${t.environment}  ${t.campaign} / ${t.user} / ${t.cls} ${t.class_name}, ` +
      `repetition ${t.rep}  -  ${M.modality_label[f.modality]}, ${f.view.split(":")[0]} view, ${win}` +
      (f.modality === "radar" ? `, ${RADAR_LABEL[f.radars]}` : "");
    $("facts").innerHTML = t.facts.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
  }

  const envs = [];
  M.trials.forEach(t => { if (!envs.some(e => e[1] === String(t.environment_id))) envs.push([t.environment, String(t.environment_id)]); });
  fill(sel.env, envs);
  sel.env.onchange = onEnv; sel.campaign.onchange = onCampaign; sel.user.onchange = onUser; sel.cls.onchange = onClass;
  sel.modality.onchange = onModality; sel.view.onchange = show; sel.radars.onchange = show;
  onEnv();
})();
