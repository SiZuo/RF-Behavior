# RF-Behavior with the OctoNet pipeline

A stand-alone folder, in the style of the OctoNet demo: download a part of
the RF-Behavior dataset with `streaming.py` and a `config.json`, then load
and draw it in `demo.ipynb` with the same calls as the OctoNet demo
(`load_recording`, `iter_segments`, `show_keyframe`).

Dataset: https://huggingface.co/datasets/Si-Z/RF-Behavior (gated; request
access on that page, then log in once with `hf auth login`).

| File | Content |
|---|---|
| `streaming.py` | The OctoNet demo's `streaming.py` with three marked one-line changes: `--repo_id` (default `Si-Z/RF-Behavior`), `meta/` and `scripts/` always downloaded, a quieter message for files outside the data folders |
| `config_example.json` | A selection in the OctoNet format: users 1 and 3, classes A01 and E01, trial 1 (13 zips) |
| `rfb_demo.py` | `list_recordings`, `load_recording`, `iter_segments`, `show_keyframe`; it uses the loader and the readers that come with the download (`downloaded_rfbehavior/scripts/`) |
| `demo.ipynb` | The demo: download, load one trial, one figure per modality |

## Run

```bash
pip install huggingface_hub numpy pandas matplotlib tqdm jupyter
hf auth login
python streaming.py --config_path config_example.json --local_dir downloaded_rfbehavior
jupyter notebook demo.ipynb        # then "Run all"
```

The download keeps the release format (one zip per trial and modality in
`radar/ lora/ rfid/ mocap/ imu/`, plus `meta/` and `scripts/`). No unzip step
is needed. PyTorch is optional (the loader uses it when present).

Config keys, as in OctoNet: `node_id` (r, 5, 13, 14, x), `modality_id`
(radar, lora, rfid, mocap, imu), `scene_id` (1 laboratory, 2 living room,
3 industrial site), `user_id` (1 to 61), `activity_id` (M01-M21, A01-A10,
E01-E06), `trial_id`.

Scripts: MIT license. Data: CC BY-NC-SA 4.0, see the dataset card.
