/*
 * Close duplicate tabs.
 */

document.addEventListener('DOMContentLoaded', () => {

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
    document.getElementById('msg').innerText = 'close ' + closed + ' duplicate tabs.'
  });
});
