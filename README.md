# RF-Behavior project site

Static site of the RF-Behavior dataset (GitHub Pages). No build step: HTML, CSS, and
plain JavaScript.

| Folder | Content |
|---|---|
| `index.html`, `css/`, `js/` | The page. `js/config.js` says where the data and the figures come from. |
| `figures/` | Figures of the gallery and `manifest.json`, made by `build_gallery.py` of the dataset tools with the dataset's reader scripts. |
| `data/samples/` | Sample zips in the release format: 37 laboratory trials (one participant per campaign, repetition 01) and trials of one living-room and one industrial participant. The full dataset is on [Hugging Face](https://huggingface.co/datasets/Si-Z/RF-Behavior). |
| `data/meta/` | `trials_samples.csv`, `classes.csv`, `nodes.csv` |
| `assets/` | Logos and the setup figure |
| `demo/` | Stand-alone demo in the style of the OctoNet demo: `streaming.py` downloads a selection from the Hub by `config.json`, `demo.ipynb` loads and draws it (`rfb_demo.py`). See its README. |

The site is served by GitHub Pages from the `main` branch: https://sizuo.github.io/RF-Behavior/

The explorer reads the sample zips in this repository (no login). With "whole dataset on
Hugging Face" and the visitor's own read token it reads any trial of C1 to C3 straight from
the Hub (`HUB_BASE` in `js/config.js`): the trial tables `meta/trials_*.csv` fill the
dropdowns, the zips are fetched with the token. The token is kept in the visitor's browser
only. The Hub repository is gated, thus the samples stay in this repository for visitors
without a token.

License: MIT for the site; the data samples are CC BY-NC-SA 4.0 (see the dataset card).
