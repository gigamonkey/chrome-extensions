const findScrollableParent = (element) => {
  let currentElement = element;
  while (currentElement && currentElement.parentNode !== null) {
    currentElement = currentElement.parentNode;
    if (currentElement === document.body) {
      // Optionally check if body is scrollable, return it or continue to documentElement
      if (isScrollable(currentElement)) {
        return currentElement;
      }
      currentElement = document.documentElement; // Check the <html> element
    }
    if (isScrollable(currentElement)) {
      return currentElement;
    }
  }
  return null; // No scrollable parent found
};

const isScrollable = (element) => {
  const computedStyle = window.getComputedStyle(element);
  const overflowY = computedStyle.overflowY;
  const overflowX = computedStyle.overflowX;

  // Check if the element is scrollable in either X or Y direction
  const isScrollableY = (overflowY === 'scroll' || overflowY === 'auto') && element.scrollHeight > element.clientHeight;
  const isScrollableX = (overflowX === 'scroll' || overflowX === 'auto') && element.scrollWidth > element.clientWidth;

  return isScrollableY || isScrollableX;
};


const gridDoc = () => document.querySelector('iframe').contentDocument.querySelector('iframe').contentDocument;

const inputElement = () => gridDoc().activeElement;

const column = () => inputElement()?.parentNode.parentNode.dataset.xy.split('_')[0];

const inputCells = async (col) => {

  /*
  const trs = gridDoc().querySelectorAll('#gridTable tbody tr');

  const e1 = await new Promise((resolve, reject) => {
    const scrollable = findScrollableParent(trs[trs.length - 1]);
    scrollable.addEventListener('scrollend', resolve, { once: true });
    trs[trs.length - 1].scrollIntoView();
  });
  console.log(e1);

  const e2 = await new Promise((resolve, reject) => {
    const scrollable = findScrollableParent(trs[0]);
    scrollable.addEventListener('scrollend', resolve, { once: true });
    trs[0].scrollIntoView();
  });
  console.log(e1);
  */

  const divs = [...gridDoc().querySelector('#gridTable').querySelectorAll('div.scoreCell')];
  return divs
    .filter(e => e.parentNode.dataset.xy.startsWith(`${col}_`))
    .map(e => e.querySelector('input.scoreInput'))
    .filter(e => !e.getAttribute('readonly'));
};

const pasteColumn = async (data, col) => {
  const cells = await inputCells(col);

  if (cells.length !== data.length) {
    console.log(`Column mismatch: ${cells.length} cells and ${data.length} data`);
  } else {
    // Simulate entering the data by hand so we trigger whatever event handlers IC is using.
    cells.forEach((e, i) => {
      e.dispatchEvent(new Event('focus', { bubbles: true, cancelable: true }));
      e.value = data[i];
      e.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      e.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      e.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    });
  }
};

const grades = Array(25).fill(4);

const getFromClipboard = () => window.navigator.clipboard.readText().then(t => t.split('\n'))

const pasteGrades = (data) => {
  pasteColumn(data, column());
};


//const doit = () => pasteGrades(grades);

const doit = () => {
  console.log('Click in column.');
  setTimeout(async () => pasteGrades(await getFromClipboard()), 2000);
};
