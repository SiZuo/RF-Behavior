// Where the page reads data and figures from.
// The sample copies in this repository. The Hub repository is gated, so a browser
// cannot fetch https://huggingface.co/datasets/Si-Z/RF-Behavior/resolve/main/... without a token.
window.RFB = {
  DATA_BASE: "data/samples",
  META_BASE: "data/meta",
  FIGURES_MANIFEST: "figures/manifest.json",
  DATASET_URL: "https://huggingface.co/datasets/Si-Z/RF-Behavior",
};
