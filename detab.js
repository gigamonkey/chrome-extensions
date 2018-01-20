/*
 * Close duplicate tabs.
 */

chrome.browserAction.onClicked.addListener(()  => {

  chrome.tabs.query({}, (tabs) => {

    var counts = {};
    var closed = 0;

    for (var i = 0; i < tabs.length; i++) {
      var url = tabs[i].url.split(/[?#]/)[0]
      if (url in counts) {
        chrome.tabs.remove(tabs[i].id);
        closed++;
      } else {
        counts[url] = 1;
      }
    }
    var p = closed == 1 ? '' : 's';
    alert('Closed ' + closed + ' duplicate tab' + p + '.');
  });
});
