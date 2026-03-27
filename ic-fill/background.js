chrome.action.onClicked.addListener(async (tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    files: ['fill.js']
  });
});
