// Allows users to open the side panel by clicking the toolbar icon,
// instead of Chrome opening a popup.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
