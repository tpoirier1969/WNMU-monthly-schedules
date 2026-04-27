(function () {
  const VERSION = 'v1.4.25-context-menu-cell-hitbox-fix';

  function proxyContextMenuToProgramContent(event) {
    if (event.__wnmuContextProxy) return;

    const cell = event.target.closest?.('td.program-cell[data-entry-id], .program-cell[data-entry-id]');
    if (!cell) return;

    // If the user already hit the program content, let the normal handler run.
    if (event.target.closest?.('.program-content')) return;

    const content = cell.querySelector('.program-content');
    if (!content) return;

    // Route right-clicks on the "dead" part of the cell to the existing
    // program-content menu handler. This preserves all existing tag/note logic.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const proxy = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey
    });
    Object.defineProperty(proxy, '__wnmuContextProxy', { value: true });

    content.dispatchEvent(proxy);
  }

  function injectStyles() {
    if (document.getElementById('wnmuContextHitboxV1425Styles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuContextHitboxV1425Styles';
    style.textContent = `
      .program-cell[data-entry-id] {
        cursor: context-menu;
      }
      .program-cell[data-entry-id] .program-content {
        min-height: 100%;
      }
    `;
    document.head.appendChild(style);
  }

  function start() {
    injectStyles();

    // Capture phase, early enough to catch the table-cell background before the
    // older renderer gives up on it. Proxied events are allowed through.
    document.addEventListener('contextmenu', proxyContextMenuToProgramContent, true);

    window.WNMU_CONTEXT_HITBOX_FIX_VERSION = VERSION;

    const flag = document.getElementById('versionFlag');
    if (flag && !flag.textContent.includes('context hitbox')) {
      flag.textContent = `${flag.textContent} • context hitbox 1.4.25`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
