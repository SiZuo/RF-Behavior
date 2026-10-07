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

The site is served by GitHub Pages from the `main` branch: https://sizuo.github.io/RF-Behavior/

The explorer reads the sample zips in this repository. The dataset repository on the
Hub is gated (terms must be accepted), so a browser cannot fetch its files without a
token; `DATA_BASE` in `js/config.js` therefore stays on `data/samples`.

License: MIT for the site; the data samples are CC BY-NC-SA 4.0 (see the dataset card).
