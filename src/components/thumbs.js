// The sliding glass thumb behind the selected item in any segmented control or the nav.
//
// The thumb is one pseudo-element per control, positioned through custom properties. This
// watches for selection changes across the whole app, so controls need no extra markup.
// It wakes only for those attribute changes and for controls being added, and the running
// timer writes its digits as character data, which this does not observe.

const CONTAINERS = '.segmented, .nav-links';
const ACTIVE = ':scope > [aria-pressed="true"], :scope > [aria-selected="true"], :scope > [aria-current="page"]';

function place(container) {
  const active = container.querySelector(ACTIVE);
  const { style } = container;
  if (!active) {
    style.setProperty('--thumb-o', '0');
    return;
  }
  style.setProperty('--thumb-x', `${active.offsetLeft}px`);
  style.setProperty('--thumb-y', `${active.offsetTop}px`);
  style.setProperty('--thumb-w', `${active.offsetWidth}px`);
  style.setProperty('--thumb-h', `${active.offsetHeight}px`);
  style.setProperty('--thumb-o', '1');
  // Sliding starts only after the first placement, so nothing slides in on page load.
  if (!container.dataset.thumbReady) {
    requestAnimationFrame(() => {
      container.dataset.thumbReady = 'true';
    });
  }
}

export function startThumbs() {
  let queued = false;
  const placeAll = () => {
    queued = false;
    document.querySelectorAll(CONTAINERS).forEach(place);
  };
  const schedule = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(placeAll);
    }
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        schedule();
        return;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType === 1) {
          schedule();
          return;
        }
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-pressed', 'aria-selected', 'aria-current'],
  });
  window.addEventListener('resize', schedule);
  document.fonts?.ready.then(schedule);
  schedule();
}
