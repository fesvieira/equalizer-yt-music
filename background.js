chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url.includes("music.youtube.com")) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    }).catch(() => {});
  }
});
