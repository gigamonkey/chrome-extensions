document.addEventListener('DOMContentLoaded', () => {

  chrome.tabs.query({}, (tabs) => {

    var ul = document.getElementById('tabUrls');

    var li = document.createElement('li');
    li.textContent = 'BAR';
    ul.appendChild(li);

    for (var i = 0; i < tabs.length; i++) {
      var li = document.createElement('li');
      li.textContent = tabs[i].url;
      ul.appendChild(li);
    }
  });
});
