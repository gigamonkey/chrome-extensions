/*
 * Sort tabs by url.
 */

function quicksort(tabs, low, high) {
  // array of tabs and the indices to sort as a half-open interval, [low, high).
  if (high - low > 1) {
    let p = partition(tabs, low, high);
    quicksort(tabs, low, p);
    quicksort(tabs, p + 1, high);
  }
}

function partition(tabs, low, high) {
  // Pick an arbitrary element and put all elements less than it to
  // its left and all greater elements to it's right, returning the
  // index where it ends up.

  // This element to be positioned correctly
  let pivot = tabs[high - 1];

  // Where the pivot element will end up.
  let p = low;

  for (let i = low; i < high - 1; i++) {
    if (tabs[i].url <= pivot.url) {
      swap(tabs, p, i)
      p++;
    }
  }
  swap(tabs, p, high - 1);
  return p;
}

function swap(tabs, i, j) {
  let tmp = tabs[i];
  tabs[i] = tabs[j];
  tabs[j] = tmp;
}

chrome.browserAction.onClicked.addListener(()  => {

  chrome.tabs.query({ pinned: false, currentWindow: true }, (tabs) => {

    let min = tabs.length;
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].index < min) {
        min = tabs[i].index;
      }
    }

    quicksort(tabs, 0, tabs.length);

    for (let i = 0; i < tabs.length; i++) {
      chrome.tabs.move(tabs[i].id, { index: i + min });
    }
  });
});
