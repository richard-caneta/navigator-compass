const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzt0MhVz1yUNLTEFNrCDJ6rbqH9RQ1uyd5t_1-n6kBBStqsKSQVPunYqQZgXvRc_PN1qw/exec";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

// Added force parameter to bypass the staleness check when users click Refresh
async function syncRulesData(force = false) {
  try {
    const storage = await chrome.storage.local.get(['lastSynced', 'rulesData']);
    const localTimestamp = storage.lastSynced || 0;
    
    const statusRes = await fetch(`${WEB_APP_URL}?action=status`, { redirect: "follow" });
    const statusData = await statusRes.json();
    if (statusData.error) throw new Error(statusData.error);
    
    const remoteTimestamp = statusData.modifiedTime;

    if (force || remoteTimestamp > localTimestamp || !storage.rulesData) {
      console.log("Fetching fresh rulebook...");
      const dataRes = await fetch(`${WEB_APP_URL}?action=rules`, { redirect: "follow" });
      const rulesData = await dataRes.json();
      await chrome.storage.local.set({
        rulesData: rulesData,
        lastSynced: Date.now() // Save exact time of local refresh
      });
      console.log("Local cache updated successfully.");
    }
  } catch (error) {
    console.error("Background sync failed:", error);
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(() => syncRulesData(false));
chrome.runtime.onStartup.addListener(() => syncRulesData(false));

chrome.alarms.create("syncData", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "syncData") syncRulesData(false);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "forceSync") {
    syncRulesData(true)
      .then(() => sendResponse({ status: 'success' }))
      .catch((error) => sendResponse({ status: 'error', error: error.message }));
    return true; // Keep the message channel open for async execution
  }
});