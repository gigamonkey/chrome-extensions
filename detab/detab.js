/*
 * Close duplicate tabs.
 */

function normalizeUrl(url, aggressive) {
  if (aggressive) {
    return url.split(/[?#]/)[0];
  } else {
    return url.split(/[#]/)[0];
  }
}


chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {

  if (changeInfo.status == 'complete') {
    let tabUrl = normalizeUrl(tab.url, false);

    chrome.tabs.query({}, (tabs) => {
      for (let i = 0; i < tabs.length; i++) {
        let otherUrl = normalizeUrl(tabs[i].url, false);
        if (otherUrl == tabUrl && tabs[i].id != tabId) {
          chrome.tabs.update(tabs[i].id, { highlighted: true })
          chrome.tabs.remove(tabId);
        }
      }
    });
  }
});


chrome.browserAction.onClicked.addListener(()  => {

  chrome.tabs.query({ pinned: false }, (tabs) => {

    let counts = {};
    let closed = 0;

    for (let i = 0; i < tabs.length; i++) {
      let url = normalizeUrl(tabs[i].url, true);
      if (url in counts) {
        chrome.tabs.remove(tabs[i].id);
        closed++;
      } else {
        counts[url] = 1;
      }
    }
    let p = closed == 1 ? '' : 's';
    alert('Closed ' + closed + ' duplicate tab' + p + '.');
  });
});
