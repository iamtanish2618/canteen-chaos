/* ui.js - everything the person sees that is not a view: toasts with
   undo, the modal stack, skeletons, status blocks and the slot ribbon. */

/* ------------------------------------------------------------ toasts */

const toastBox = $('#toasts');
const MAX_TOASTS = 3;

/**
 * toast('Saved')                       plain
 * toast('Removed', 'info', { action: { label: 'Undo', onClick } })
 */
function toast(message, kind = 'info', { ms = 3200, action = null } = {}) {
  const node = document.createElement('div');
  node.className = `toast toast-${kind}`;

  node.innerHTML = html`<span class="toast-text">${message}</span>`;

  if (action) {
    const button = document.createElement('button');
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      action.onClick();
      dismiss();
    });
    node.appendChild(button);
    node.style.pointerEvents = 'auto';
  }

  toastBox.appendChild(node);
  while (toastBox.children.length > MAX_TOASTS) toastBox.firstElementChild.remove();

  requestAnimationFrame(() => node.classList.add('in'));

  const timer = setTimeout(dismiss, ms);

  function dismiss() {
    clearTimeout(timer);
    node.classList.remove('in');
    setTimeout(() => node.remove(), 220);
  }

  return dismiss;
}

/* ------------------------------------------------- status + skeletons */

function showStatus(node, markup) {
  if (!node) return;
  node.innerHTML = markup;
  node.hidden = false;
}

function hideStatus(node) {
  if (!node) return;
  node.hidden = true;
  node.innerHTML = '';
}

function skeletonCards(count = 8) {
  return Array.from({ length: count })
    .map(
      () => `
      <article class="dish-card skeleton" aria-hidden="true">
        <div class="sk-img"></div>
        <div class="dish-body">
          <div class="sk-line w70"></div>
          <div class="sk-line w40"></div>
          <div class="sk-line w30"></div>
        </div>
      </article>`
    )
    .join('');
}

function skeletonRows(count = 4) {
  return Array.from({ length: count })
    .map(() => '<div class="sk-row"><div class="sk-line w40"></div><div class="sk-line w70"></div></div>')
    .join('');
}

function emptyBlock(title, sub) {
  return html`<p class="status-title">${title}</p>
    <p class="status-sub">${sub}</p>`;
}

function errorBlock(error, retryId) {
  const detail = error.details && error.details.length ? error.details[0] : error.message;
  const trace = error.requestId ? html`<p class="status-trace">ref ${error.requestId}</p>` : '';

  return html`<p class="status-title">${error.offline ? 'You are offline' : 'Could not load this'}</p>
    <p class="status-sub">${detail}</p>
    ${raw(trace)}
    <button class="ghost-btn" id="${retryId}">Try again</button>`;
}

/* ------------------------------------------------------- modal stack */

// More than one modal can be open (dish detail on top of the cart, say),
// so they are kept on a stack and Escape closes the top one.
const modalStack = [];

function openModal(id, { onClose = null } = {}) {
  const node = document.getElementById(id);
  if (!node) return;

  const entry = { id, node, onClose, lastFocused: document.activeElement };
  modalStack.push(entry);

  node.hidden = false;
  $('#modalBackdrop').hidden = false;
  document.body.classList.add('no-scroll');

  focusFirst(node);
  if (modalStack.length === 1) document.addEventListener('keydown', modalKeydown);
}

function closeModal(id) {
  const index = id ? modalStack.findIndex((m) => m.id === id) : modalStack.length - 1;
  if (index === -1) return;

  const [entry] = modalStack.splice(index, 1);
  entry.node.hidden = true;

  if (modalStack.length === 0) {
    $('#modalBackdrop').hidden = true;
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', modalKeydown);
  }

  if (entry.lastFocused && entry.lastFocused.focus) entry.lastFocused.focus();
  if (entry.onClose) entry.onClose();
}

function closeAllModals() {
  while (modalStack.length) closeModal();
}

const topModal = () => modalStack[modalStack.length - 1] || null;

function modalKeydown(e) {
  const top = topModal();
  if (!top) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal(top.id);
    return;
  }

  if (e.key !== 'Tab') return;

  const focusables = focusableIn(top.node);
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

$('#modalBackdrop').addEventListener('click', () => closeModal());
delegate(document.body, '[data-close-modal]', 'click', (e, node) =>
  closeModal(node.dataset.closeModal || undefined)
);

/* -------------------------------------------------------- slot ribbon */

const SLOT_TEXT = {
  breakfast: 'Breakfast is being served (7:00 - 11:00 AM)',
  lunch: 'Lunch is being served (11:30 AM - 4:00 PM)',
  evening: 'Evening menu is on (4:30 - 10:00 PM)',
  allday: 'Snacks and beverages only right now',
};

function renderSlotBar() {
  const bar = $('#slotBar');
  if (!bar) return;

  if (!state.open) {
    bar.textContent = 'The canteen is closed. Orders open at 7:00 AM.';
    bar.className = 'slot-bar closed';
    return;
  }

  const base = SLOT_TEXT[state.slot] || 'Open';
  bar.textContent = state.rushHour ? `${base} — lunch rush, expect delays` : base;
  bar.className = state.rushHour ? 'slot-bar rush' : 'slot-bar';
}

/* --------------------------------------------------------- star row */

function starRow(value, { interactive = false, dishId = null } = {}) {
  const rounded = Math.round(value);

  return Array.from({ length: 5 })
    .map((_, i) => {
      const filled = i < rounded ? 'on' : '';
      return interactive
        ? `<button class="star ${filled}" data-star="${i + 1}" data-dish="${dishId}"
                   aria-label="${i + 1} star">&#9733;</button>`
        : `<span class="star ${filled}">&#9733;</span>`;
    })
    .join('');
}

// Keep the filter bar below the sticky header, including wrapped/mobile navigation.
const stickyHeader = document.querySelector(".site-header");
if (stickyHeader && "ResizeObserver" in window) {
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--header-height", `${stickyHeader.getBoundingClientRect().height}px`);
  }).observe(stickyHeader);
}
