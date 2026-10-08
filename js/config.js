// Where the page reads data and figures from.
// The sample copies in this repository. The Hub repository is gated, so a browser
// cannot fetch https://huggingface.co/datasets/Si-Z/RF-Behavior/resolve/main/... without a token.
window.RFB = {
  DATA_BASE: "data/samples",
  META_BASE: "data/meta",
  // the whole dataset: read by the explorer with the visitor's own Hugging Face token (the repo is gated)
  HUB_BASE: "https://huggingface.co/datasets/Si-Z/RF-Behavior/resolve/main",
  HUB_TABLES: ["meta/trials_Lab.csv", "meta/trials_LivingRoom.csv", "meta/trials_Industry.csv"],
  FIGURES_MANIFEST: "figures/manifest.json",
  DATASET_URL: "https://huggingface.co/datasets/Si-Z/RF-Behavior",
};
