/*
 * Mark all students tardy in IC.
 *
 * This is pretty gross insofar as it relies on all kinds of internals of IC but
 * at leas as of now (circa 2024) it works.
 */
chrome.action.onClicked.addListener(async (tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      const doc1 = document.querySelectorAll('iframe')[0].contentDocument;
      const doc2 = doc1.querySelectorAll('iframe')[0].contentDocument;
      const spans = doc2.querySelectorAll('li[ng-class="{active:isTardy(student)}"] span');
      spans.forEach(e => e.click());
    }
  });
});
