"""RF-Behavior demo helpers, in the style of the OctoNet demo (OctoNet_demo/data_loader_new.py
and data_visualizer_new.py): load_recording, iter_segments, show_keyframe.

    from rfb_demo import list_recordings, load_recording, iter_segments, show_keyframe

    list_recordings("RF-Behavior", campaign="C2")               # what is in the download
    recording = load_recording("RF-Behavior", user_id=1, activity="walking", trial_id=1)
    for start, end, clip in iter_segments(recording):
        show_keyframe(clip, "radar", "Radar point cloud")
        show_keyframe(clip, "mocap", "Motion-capture skeleton")

Differences from OctoNet, on purpose:
- A trial of RF-Behavior is one recorded gesture, activity, or affective
  behavior; it is already cut. load_recording takes the trial id (the
  repetition) instead of a cut table. C3 trials are long (about 2 min), so
  iter_segments can split them into windows (segment_s).
- The data stays in the release zips; nothing is unzipped. The loader
  scripts/loader/rfbehavior_loader.py reads the zips.
- Nodes: the radars are nodes 0 to 12, LoRa is node 5, the RFID antenna 13,
  the infrared cameras 14, the body-worn IMUs x (see meta/nodes.csv).
  node_id keeps one radar; a modality on one node is still included.
- Modalities of OctoNet that RF-Behavior does not have raise a clear note in
  show_keyframe (NOT_IN_RF_BEHAVIOR).

Requires: numpy, pandas, matplotlib (the reader scripts next to this file).
"""
import importlib.util
import os
import sys
from datetime import timedelta

# conda environments with PyTorch and MKL can load two OpenMP runtimes; this keeps the demo running
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import Normalize

HERE = os.path.dirname(os.path.abspath(__file__))
# This file works in two places: inside a download (<download>/scripts/demo/, the loader and the
# readers next to it) or in a stand-alone project folder next to a download folder
# (<project>/rfb_demo.py and <project>/downloaded_rfbehavior/scripts/...). In the second case the
# loader and the readers are taken from the download the first time a function gets dataset_root.
if os.path.isdir(os.path.join(HERE, "..", "loader")):
    SCRIPTS = os.path.abspath(os.path.join(HERE, ".."))
    DEFAULT_DATASET = os.path.abspath(os.path.join(SCRIPTS, ".."))   # scripts/ sits in the download folder
else:
    SCRIPTS = None
    DEFAULT_DATASET = os.path.join(HERE, "downloaded_rfbehavior")
L = _RADAR = _MOCAP = _RFID = None


def _bind(dataset_root):
    """Load the loader and the readers, from next to this file or from <dataset_root>/scripts."""
    global SCRIPTS, L, _RADAR, _MOCAP, _RFID
    if L is not None:
        return
    scripts = SCRIPTS or os.path.join(os.path.abspath(dataset_root), "scripts")
    if not os.path.isdir(os.path.join(scripts, "loader")):
        raise FileNotFoundError(f"no scripts/loader in {scripts}: download the dataset first (streaming.py "
                                f"brings scripts/ with it) or set dataset_root to the download folder")
    SCRIPTS = scripts
    sys.path.insert(0, os.path.join(scripts, "loader"))
    import rfbehavior_loader
    L = rfbehavior_loader
    _RADAR = _load_by_path("rfb_reader_radar", os.path.join(scripts, "Radar", "read_vis.py"))
    _MOCAP = _load_by_path("rfb_reader_mocap", os.path.join(scripts, "InfraredCam", "read_vis.py"))
    _RFID = _load_by_path("rfb_reader_rfid", os.path.join(scripts, "RFID", "read_vis.py"))
NODE_OF = {"lora": 5, "rfid": 13, "mocap": 14, "imu": "x"}
VIEWS = ("radar", "radar_time", "lora", "rfid", "mocap", "imu")
NOT_IN_RF_BEHAVIOR = {
    "depth": "no depth camera (RF-Behavior has infrared motion capture instead of cameras)",
    "rgb": "no RGB video (participants are not filmed)",
    "seek": "no thermal camera", "ira": "no infrared array", "tof": "no time-of-flight sensor",
    "wifi": "no WiFi CSI (the LoRa link at 865.5 MHz is the narrowband RF modality)",
    "vayyar": "no Vayyar imaging radar (13 TI IWR1443 mmWave radars give point clouds)",
    "uwb": "no UWB", "acoustic": "no microphone", "polar": "no heart-rate sensor",
}


def _load_by_path(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


if SCRIPTS is not None:
    _bind(DEFAULT_DATASET)


# ----------------------------------------------------------------------------
# Recordings
# ----------------------------------------------------------------------------
def list_recordings(dataset_root=DEFAULT_DATASET, environment=1, campaign=None, user_id=None, on_disk_only=True):
    """The trials as a table: user, class, name, trial, time stamp, modalities, on_disk.

    The trial table lists the whole dataset; on_disk says which trials the download holds
    (at least one zip). on_disk_only=False lists every trial of the table."""
    _bind(dataset_root)
    t = L.load_trials(dataset_root, [environment])
    if campaign:
        t = t[t["campaign"] == campaign]
    if user_id is not None:
        t = t[t["user_id"] == int(user_id)]
    mods, disk = [], []
    for _, r in t.iterrows():
        have = [m for m in L.MODALITIES if L.has_modality(r, m) and os.path.isfile(L.zip_path(dataset_root, r, m))]
        mods.append(" ".join(m for m in L.MODALITIES if L.has_modality(r, m)))
        disk.append(" ".join(have) if have else "")
    out = t[["campaign", "user_id", "class", "class_name", "trial_id", "timestamp"]].copy()
    if "rfid_node" in t.columns and (t["campaign"] == "C4").any():
        out["antenna_node"] = t["rfid_node"].astype(str).str.replace(r"\.0$", "", regex=True)   # C4: 13, 15, 16, 17
    out["modalities"] = mods
    out["on_disk"] = disk
    if on_disk_only:
        out = out[out["on_disk"] != ""]
    return out.reset_index(drop=True)


def load_recording(dataset_root=DEFAULT_DATASET, environment=1, user_id=1, activity="M10", trial_id=1,
                   timestamp=None, node_id=None, segment_s=None, campaign=None):
    """Load every modality of one trial.

    activity: a class code (M10, A01, E03) or a class name ('arms swing').
    trial_id: the repetition number; timestamp (YYYYMMDDhhmmss) can be given instead.
    node_id: keep this radar only (0-12); the other modalities have one node each and stay.
    segment_s: split the trial into windows of this length for iter_segments (None: one segment).
    campaign: C4 (the gestures with the RFID antenna at a distance) must be named; a gesture code
      alone means C1. For C4, node_id picks the antenna position (13, 15, 16, 17).
    """
    _bind(dataset_root)
    t = L.load_trials(dataset_root, [environment])
    if campaign is None:
        code = str(activity)[:1] in "MAE" and str(activity)[1:].isdigit()
        campaign = ({"M": "C1", "A": "C2", "E": "C3"}[str(activity)[:1]] if code
                    else next(c for c, names in L.CLASS_NAMES.items() if activity in names))
    cls = L.class_code(campaign, activity)
    hit = t[(t["user_id"] == int(user_id)) & (t["class"] == cls) & (t["campaign"] == campaign)]
    if campaign == "C4" and node_id is not None:
        hit = hit[hit["rfid_node"].astype(float) == float(node_id)]
    hit = hit[hit["timestamp"] == str(timestamp)] if timestamp else hit[hit["trial_id"] == int(trial_id)]
    if hit.empty:
        raise FileNotFoundError(f"no trial for user {user_id}, {cls}, trial {trial_id or timestamp}")
    row = hit.iloc[0]
    rec = {"user_id": int(row["user_id"]), "campaign": campaign, "activity": cls,
           "activity_name": row["class_name"], "trial_id": int(row["trial_id"]), "timestamp": row["timestamp"],
           "environment": L.ENV_NAME[environment], "reference_time": pd.Timestamp(row["reference_time"]),
           "ceiling_height": float(row["ceiling_radar_height_m"]), "missing": [], "segments": []}
    for mod in L.MODALITIES:
        if not L.has_modality(row, mod):
            continue
        path = L.zip_path(dataset_root, row, mod)
        if not os.path.isfile(path):
            rec["missing"].append(os.path.relpath(path, dataset_root))
            continue
        if mod == "radar":
            nodes = None if node_id is None else [int(node_id)]
            radars = L.read_radar(path, nodes)
            rec["radar"] = {r: _radar_stream(d) for r, d in radars.items()}
        elif mod == "mocap":
            rec["mocap"] = {14: L.read_mocap(path, campaign, cls)}
        elif mod == "rfid":
            node = int(float(row["rfid_node"])) if str(row.get("rfid_node", "")) not in ("", "nan") else 13
            rec[mod] = {node: L.READERS[mod](path)}
        else:
            rec[mod] = {NODE_OF[mod]: L.READERS[mod](path)}
    rec["segments"] = segment_bounds(rec, segment_s)
    return rec


def _radar_stream(d):
    """Loader radar dict -> the same plus the time of each point in s from the trial start."""
    t = d["points"][:, 0] if len(d["points"]) else np.zeros(0)
    return {"points": d["points"], "frame": d["frame"], "t_abs": t}


def duration_of(rec):
    """Length of the trial in seconds: the longest stream."""
    ends = []
    if "radar" in rec:
        ts = np.concatenate([s["t_abs"] for s in rec["radar"].values() if len(s["t_abs"])] or [np.zeros(0)])
        if len(ts):
            ends.append(ts.max() - ts.min())
    if "lora" in rec:
        ends.append(max(v[-1, 0] for v in rec["lora"][5].values()))
    if "rfid" in rec:
        for d in rec["rfid"].values():
            if len(d["time"]):
                ends.append(d["time"][-1])
    if "mocap" in rec:
        ends.append(rec["mocap"][14]["time"][-1])
    if "imu" in rec:
        ends.append(max((m[-1, 0] - m[0, 0]) / 1.0 for s in rec["imu"]["x"].values() for m in s.values() if len(m)))
    return float(max(ends)) if ends else 0.0


def segment_bounds(rec, segment_s=None):
    """(start, end) datetimes: the whole trial, or windows of segment_s seconds."""
    t0 = rec["reference_time"]
    total = duration_of(rec)
    if not segment_s or segment_s >= total:
        return [(t0, t0 + timedelta(seconds=total))]
    edges = np.arange(0, total, segment_s)
    return [(t0 + timedelta(seconds=float(a)), t0 + timedelta(seconds=float(min(a + segment_s, total))))
            for a in edges]


def iter_segments(recording):
    """Yield (start, end, clip) for each segment; a clip holds the streams cut to [start, end)."""
    for start, end in recording["segments"]:
        yield start, end, _slice(recording, start, end)


def _slice(rec, start, end):
    t0 = rec["reference_time"]
    a, b = (start - t0).total_seconds(), (end - t0).total_seconds()
    clip = {k: v for k, v in rec.items() if k not in L.MODALITIES}
    clip.update({"start_s": a, "end_s": b})
    if "radar" in rec:
        t_min = min((s["t_abs"].min() for s in rec["radar"].values() if len(s["t_abs"])), default=0.0)
        clip["radar"] = {}
        for r, s in rec["radar"].items():
            t = s["t_abs"] - t_min
            keep = (t >= a) & (t < b)
            clip["radar"][r] = {"points": s["points"][keep], "frame": s["frame"][keep], "t": t[keep]}
    if "lora" in rec:
        clip["lora"] = {5: {k: v[(v[:, 0] >= a) & (v[:, 0] < b)] for k, v in rec["lora"][5].items()}}
    if "rfid" in rec:
        clip["rfid"] = {}
        for node, d in rec["rfid"].items():
            keep = (d["time"] >= a) & (d["time"] < b)
            clip["rfid"][node] = {k: v[keep] for k, v in d.items()}
    if "mocap" in rec:
        d = rec["mocap"][14]
        keep = (d["time"] >= a) & (d["time"] < b)
        clip["mocap"] = {14: {"time": d["time"][keep], "bodies": d["bodies"],
                              "position": {n: p[keep] for n, p in d["position"].items()},
                              "rotation": {n: p[keep] for n, p in d["rotation"].items()}}}
    if "imu" in rec:
        clip["imu"] = {"x": {}}
        for sensor, measures in rec["imu"]["x"].items():
            clip["imu"]["x"][sensor] = {}
            for measure, m in measures.items():
                if not len(m):
                    clip["imu"]["x"][sensor][measure] = m
                    continue
                t = m[:, 0] - m[0, 0]
                clip["imu"]["x"][sensor][measure] = m[(t >= a) & (t < b)]
    return clip


# ----------------------------------------------------------------------------
# Key frames
# ----------------------------------------------------------------------------
INK, MUTED = "#1f2328", "#6b7280"


def show_keyframe(clip, view, title=None):
    """Draw one modality of a clip: the key frame (the middle of the clip) for the radar cloud
    and the skeleton, the whole clip for the others. In a notebook the figure is shown under the
    cell; in a script it is returned. None for a modality that RF-Behavior does not have."""
    if view in NOT_IN_RF_BEHAVIOR:
        print(f"Note: '{view}' is not in RF-Behavior: {NOT_IN_RF_BEHAVIOR[view]}. Views: {', '.join(VIEWS)}.")
        return None
    if view not in VIEWS:
        raise ValueError(f"Unknown view {view!r}. Choose from {', '.join(VIEWS)}")
    mod = "radar" if view.startswith("radar") else view
    if mod not in clip:
        print(f"Note: this trial has no {mod} data.")
        return None
    fig = {"radar": _plot_radar_cloud, "radar_time": _plot_radar_time, "lora": _plot_lora,
           "rfid": _plot_rfid, "mocap": _plot_mocap, "imu": _plot_imu}[view](clip, title)
    try:                       # in a notebook: show the figure under the cell
        from IPython import get_ipython
        from IPython.display import display
        if get_ipython() is not None:
            display(fig)
            plt.close(fig)
            return None        # shown already; no second copy from the cell's return value
    except ImportError:
        pass
    return fig


def _plot_radar_cloud(clip, title, span_s=0.3):
    """3-D point cloud in the room at the key frame: points within span_s around the middle."""
    mid = (clip["start_s"] + clip["end_s"]) / 2
    fig = plt.figure(figsize=(8, 6.5))
    ax = fig.add_subplot(111, projection="3d")
    h = clip["ceiling_height"]
    for r, s in sorted(clip["radar"].items()):
        pos = _RADAR.radar_position(r, h)
        ax.scatter([pos[0]], [pos[1]], [pos[2]], marker="v" if r in _RADAR.CEILING else "s", s=40,
                   color=_RADAR.RADAR_COLORS[r], edgecolors=INK, linewidths=0.6, depthshade=False)
        keep = np.abs(s["t"] - mid) <= span_s / 2
        if keep.any():
            g = _RADAR.to_global(s["points"][keep], r, h)
            ax.scatter(g[:, 0], g[:, 1], g[:, 2], s=12, color=_RADAR.RADAR_COLORS[r], depthshade=False,
                       label=f"radar {r}")
    circle = np.linspace(0, 2 * np.pi, 100)
    ax.plot(1.5 * np.cos(circle), 1.5 * np.sin(circle), 0, color=MUTED, linewidth=0.8, linestyle="--")
    ax.set_xlim(-4.5, 4.5); ax.set_ylim(-4.5, 4.5); ax.set_zlim(0, h + 0.5)
    ax.set_box_aspect((9, 9, h + 0.5))
    ax.set_xlabel("x (m)"); ax.set_ylabel("y (m)"); ax.set_zlabel("z (m)")
    ax.view_init(elev=22, azim=-50)
    ax.legend(loc="upper left", fontsize=8, frameon=False, ncol=2)
    ax.set_title(f"{title or 'Radar point cloud'}  -  {mid:.2f} s, +-{span_s / 2:.2f} s", loc="left")
    return fig


def _plot_radar_time(clip, title):
    """Points per frame of each radar in time (the trial view of the radar reader)."""
    radars = sorted(clip["radar"])
    a, b = clip["start_s"], clip["end_s"]
    bin_s = 0.1 if b - a < 8 else (0.5 if b - a < 40 else 2.0)
    edges = np.arange(a, b + bin_s, bin_s)
    table = np.full((len(radars), len(edges) - 1), np.nan)
    for row, r in enumerate(radars):
        s = clip["radar"][r]
        if not len(s["t"]):
            continue
        frames = pd.DataFrame({"t": s["t"], "f": s["frame"]}).groupby("f").agg(t=("t", "first"), n=("t", "size"))
        index = np.digitize(frames["t"], edges) - 1
        for k in np.unique(index):
            if 0 <= k < table.shape[1]:
                table[row, k] = frames["n"][index == k].mean()
    fig, ax = plt.subplots(figsize=(10, 1.4 + 0.37 * len(radars)), layout="constrained")
    mesh = ax.pcolormesh(edges, np.arange(len(radars) + 1), table, cmap="Blues", norm=Normalize(0, 10),
                         edgecolors="white", linewidth=1.0)
    ax.set_yticks(np.arange(len(radars)) + 0.5, [f"{r} {'ceiling' if r in _RADAR.CEILING else 'ground'}" for r in radars])
    ax.invert_yaxis(); ax.set_xlabel("time (s)")
    fig.colorbar(mesh, ax=ax, label="points per frame", extend="max")
    ax.set_title(f"{title or 'Radar'}  -  points per frame, one cell = {bin_s:g} s", loc="left")
    return fig


def _plot_lora(clip, title):
    d = clip["lora"][5]
    fig, axes = plt.subplots(3, 1, figsize=(10, 7), sharex=True, layout="constrained")
    for ax, (key, name) in zip(axes, [("abs", "amplitude (abs_200Hz)"), ("diff", "difference (diff_200Hz)"),
                                      ("var", "variance (var_20Hz)")]):
        v = d.get(key)
        if v is not None and len(v):
            ax.plot(v[:, 0], v[:, 1], color="#2171b5", linewidth=0.8)
        ax.set_title(name, loc="left", fontsize=10)
    axes[-1].set_xlabel("time (s)")
    fig.suptitle(title or "LoRa features", x=0.01, ha="left", fontweight="bold")
    return fig


def _plot_rfid(clip, title):
    """Speed of each tag to or from the antenna (the motion view of the RFID reader)."""
    if clip.get("campaign") == "C4":
        print("Note: C4 figures are not drawn: the positions of the tags A1, A5 and A9 on the body are not recorded.")
        return plt.figure()
    d = next(iter(clip["rfid"].values()))
    body = pd.DataFrame({"time": d["time"], "PhaseAngle": d["phase"],
                         "tag": pd.Series(d["epc"]).str.extract(_RFID.BODY_TAG, expand=False).map(lambda x: f"A{x}" if isinstance(x, str) else None)})
    body = body.dropna(subset=["tag"])
    if body.empty:
        print("Note: no body-tag reads in this clip.")
        return plt.figure()
    body["time"] -= clip["start_s"]
    duration = clip["end_s"] - clip["start_s"]
    bin_s = _RFID.nice_bin(duration)
    edges, table = _RFID.speed_in_time(body, bin_s, duration)
    fig, ax = plt.subplots(figsize=(10, 3.8), layout="constrained")
    mesh = ax.pcolormesh(edges + clip["start_s"], np.arange(len(_RFID.TAGS) + 1), table, cmap="Blues",
                         norm=Normalize(0, _RFID.SPEED_MAX), edgecolors="white", linewidth=1.5)
    ax.set_yticks(np.arange(len(_RFID.TAGS)) + 0.5, [f"{t}  {_RFID.TAG_POSITION[t]}" for t in _RFID.TAGS])
    ax.invert_yaxis(); ax.set_xlabel("time (s)")
    fig.colorbar(mesh, ax=ax, label="speed to or from the antenna (cm/s)", extend="max")
    ax.set_title(f"{title or 'RFID'}  -  one cell = {bin_s:g} s", loc="left")
    return fig


def _plot_mocap(clip, title):
    """3-D stick figure at the key frame (the middle of the clip), with the paths of the clip."""
    d = clip["mocap"][14]
    if not len(d["time"]):
        print("Note: no motion-capture frames in this clip.")
        return plt.figure()
    i = len(d["time"]) // 2
    P = d["position"]
    fig = plt.figure(figsize=(8, 7))
    ax = fig.add_subplot(111, projection="3d")
    for b in d["bodies"]:
        ax.plot(P[b][:, 0], P[b][:, 2], P[b][:, 1], color=_MOCAP.BODY_COLOR[b], linewidth=1.0, alpha=0.4)
    for b1, b2 in _MOCAP.BONES:
        if b1 in P and b2 in P:
            ax.plot([P[b1][i, 0], P[b2][i, 0]], [P[b1][i, 2], P[b2][i, 2]], [P[b1][i, 1], P[b2][i, 1]],
                    color="#9aa3ad", linewidth=3, solid_capstyle="round")
    for b in d["bodies"]:
        ax.scatter([P[b][i, 0]], [P[b][i, 2]], [P[b][i, 1]], s=60, color=_MOCAP.BODY_COLOR[b],
                   edgecolors="white", label=_MOCAP.BODY_LABEL[b], depthshade=False)
    stack = np.stack([P[b] for b in d["bodies"]])
    lo, hi = stack.min(axis=(0, 1)), stack.max(axis=(0, 1))
    half = max((hi[0] - lo[0]) / 2, (hi[2] - lo[2]) / 2, 450.0) + 200.0
    cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    top = max(hi[1] + 150.0, 1900.0)
    ax.set_xlim(cx - half, cx + half); ax.set_ylim(cz - half, cz + half); ax.set_zlim(0, top)
    ax.set_box_aspect((2 * half, 2 * half, top))
    ax.set_xlabel("X side (mm)"); ax.set_ylabel("Z front (mm)"); ax.set_zlabel("Y up (mm)")
    ax.view_init(elev=18, azim=-55)
    ax.legend(loc="upper left", fontsize=8, frameon=False, ncol=2)
    ax.set_title(f"{title or 'Motion capture'}  -  t = {d['time'][i]:.2f} s", loc="left")
    return fig


def _plot_imu(clip, title):
    sensors = clip["imu"]["x"]
    fig, axes = plt.subplots(3, len(sensors), figsize=(4.2 * len(sensors), 7.5), sharex=True,
                             squeeze=False, layout="constrained")
    for col, (sensor, measures) in enumerate(sensors.items()):
        for row, (measure, unit) in enumerate([("acc", "m/s²"), ("gyro", "deg/s"), ("magn", "µT")]):
            ax = axes[row, col]
            m = measures.get(measure)
            if m is not None and len(m):
                t = m[:, 0] - m[0, 0] + clip["start_s"]
                for k, c in enumerate(("#08306b", "#2171b5", "#9ecae1")):
                    ax.plot(t, m[:, k + 1], color=c, linewidth=0.7, label="xyz"[k])
            else:
                ax.text(0.5, 0.5, "empty file", ha="center", transform=ax.transAxes, color=MUTED)
            if row == 0:
                ax.set_title(sensor, loc="left")
            if col == 0:
                ax.set_ylabel(f"{measure} ({unit})")
    axes[0, 0].legend(fontsize=8, frameon=False, ncol=3)
    for ax in axes[-1]:
        ax.set_xlabel("time (s)")
    fig.suptitle(title or "IMU", x=0.01, ha="left", fontweight="bold")
    return fig
