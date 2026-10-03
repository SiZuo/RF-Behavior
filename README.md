# RF-Behavior project site

Static site of the RF-Behavior dataset (GitHub Pages). No build step: HTML, CSS, and
plain JavaScript.

| Folder | Content |
|---|---|
| `index.html`, `css/`, `js/` | The page. `js/config.js` says where the data and the figures come from. |
| `figures/` | Figures of the gallery and `manifest.json`, made by `build_gallery.py` of the dataset tools with the dataset's reader scripts. |
| `data/samples/` | Sample zips of 37 trials (one participant per campaign, repetition 01), in the release format. The full dataset is on [Hugging Face](https://huggingface.co/datasets/Si-Z/RF-Behavior). |
| `data/meta/` | `trials_samples.csv`, `classes.csv`, `nodes.csv` |
| `assets/` | Logos and the setup figure |

Local preview: `python -m http.server 8000` in this folder, then open http://localhost:8000.

When the dataset is public, set `DATA_BASE` in `js/config.js` to the Hub URL
(`https://huggingface.co/datasets/Si-Z/RF-Behavior/resolve/main`) and the page reads
the full dataset.

License: MIT for the site; the data samples are CC BY-NC-SA 4.0 (see the dataset card).
