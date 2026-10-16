/* menu.js - the dish grid: search with suggestions, filters, sorting,
   paging (button + infinite scroll), favourites and quantity steppers. */

const menuGrid = $('#menuGrid');
const menuStatus = $('#menuStatus');
const resultCount = $('#resultCount');
const loadMoreBtn = $('#loadMoreBtn');
const catTabs = $('#catTabs');
const picksStrip = $('#picksStrip');
const searchInput = $('#searchInput');
const suggestBox = $('#suggestBox');
const sentinel = $('#scrollSentinel');

// every menu request carries a number; a reply from an older one is dropped
let menuRequestId = 0;
let suggestIndex = -1;

/* --------------------------------------------------------- loading */

async function loadMenu({ append = false } = {}) {
  const myRequest = ++menuRequestId;

  if (append) {
    loadMoreBtn.textContent = 'Loading...';
    loadMoreBtn.disabled = true;
  } else {
    state.page = 1;
    menuGrid.innerHTML = skeletonCards(8);
    hideStatus(menuStatus);
  }

  try {
    const data = await api.getMenu({
      veg: state.filters.veg,
      q: state.filters.q,
      category: state.filters.category,
      sort: state.filters.sort,
      servedOnly: state.filters.servedOnly ? 'true' : '',
      maxPrice: state.filters.maxPrice,
      page: state.page,
      limit: 5,
    });

    if (myRequest !== menuRequestId) return; // a newer search already won

    state.dishes = append ? state.dishes.concat(data.dishes) : data.dishes;
    state.total = data.total;
    state.pages = data.pages;
    state.hasMore = data.hasMore;
    state.slot = data.slot;
    state.open = data.open;
    state.serverTime = data.serverTime;

    renderSlotBar();
    renderMenu();
  } catch (err) {
    if (err.cancelled || myRequest !== menuRequestId) return;

    menuGrid.innerHTML = '';
    showStatus(menuStatus, errorBlock(err, 'menuRetry'));
    const retry = $('#menuRetry');
    if (retry) retry.addEventListener('click', () => loadMenu());
  } finally {
    if (myRequest === menuRequestId) {
      loadMoreBtn.textContent = 'Load more';
      loadMoreBtn.disabled = false;
    }
  }
}

async function loadCategories() {
  try {
    const { categories } = await api.getCategories();
    state.categories = categories;

    render(
      catTabs,
      [{ name: 'All', count: state.total }]
        .concat(categories)
        .map(
          (c) => html`<button class="cat-tab ${state.filters.category === c.name ? 'active' : ''}"
                    data-cat="${c.name}">${c.name}
              <span class="cat-count">${c.count || ''}</span></button>`
        )
        .join('')
    );
  } catch (e) {
    catTabs.innerHTML = '';
  }
}

async function loadPicks() {
  try {
    const { picks } = await api.getPicks();
    state.picks = picks;

    if (picks.length === 0) return show(picksStrip.parentElement, false);

    show(picksStrip.parentElement, true);
    render(
      picksStrip,
      picks
        .map(
          (d) => html`<button class="pick-chip" data-id="${d.id}">
              <span class="pick-name">${d.name}</span>
              <span class="pick-price">${rupees(d.price)}</span>
            </button>`
        )
        .join('')
    );
  } catch (e) {
    show(picksStrip.parentElement, false);
  }
}

/* ----------------------------------------------------- interactions */

// one delegated listener, so it survives every re-render
delegate(menuGrid, '[data-action]', 'click', (e, node) => {
  const card = node.closest('.dish-card');
  if (!card) return;

  const dish = state.dishes.find((d) => d.id === Number(card.dataset.id));
  if (!dish) return;

  switch (node.dataset.action) {
    case 'open':
      openDishModal(dish.id);
      break;

    case 'fav': {
      const on = toggleFavourite(dish.id);
      node.classList.toggle('on', on);
      node.setAttribute('aria-pressed', String(on));
      toast(on ? `Saved ${dish.name}` : `Removed ${dish.name}`, 'info', { ms: 1500 });
      break;
    }

    case 'add':
    case 'inc': {
      const result = addToCart(dish, 1);
      if (!result.ok) return toast(result.reason, 'warn');
      if (node.dataset.action === 'add') toast(`${dish.name} added`, 'ok', { ms: 1500 });
      updateCardQty(dish.id);
      break;
    }

    case 'dec':
      addToCart(dish, -1);
      updateCardQty(dish.id);
      break;

    default:
      break;
  }
});

delegate(picksStrip, '.pick-chip', 'click', (e, node) => openDishModal(Number(node.dataset.id)));

delegate(catTabs, '.cat-tab', 'click', (e, node) => {
  $$('.cat-tab', catTabs).forEach((t) => t.classList.remove('active'));
  node.classList.add('active');
  state.filters.category = node.dataset.cat;
  loadMenu();
});

/* ------------------------------------------------ search + suggest */

const runSearch = debounce(() => {
  state.filters.q = searchInput.value.trim();
  loadMenu();
}, 300);

const runSuggest = debounce(async () => {
  const q = searchInput.value.trim();
  if (q.length < 2) return hideSuggestions();

  try {
    const { suggestions } = await api.suggest(q);
    if (suggestions.length === 0) return hideSuggestions();

    render(
      suggestBox,
      suggestions
        .map(
          (s, i) => html`<button class="suggest-item" role="option" data-id="${s.id}" data-index="${i}">
              <span>${s.name}</span><span class="suggest-cat">${s.category}</span>
            </button>`
        )
        .join('')
    );

    suggestIndex = -1;
    show(suggestBox, true);
  } catch (e) {
    hideSuggestions();
  }
}, 180);

function hideSuggestions() {
  show(suggestBox, false);
  suggestBox.innerHTML = '';
  suggestIndex = -1;
}

searchInput.addEventListener('input', () => {
  runSearch();
  runSuggest();
});

searchInput.addEventListener('keydown', (e) => {
  const items = $$('.suggest-item', suggestBox);

  if (e.key === 'Escape') return hideSuggestions();
  if (items.length === 0) return;

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    suggestIndex = clamp(suggestIndex + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1);
    items.forEach((item, i) => item.classList.toggle('active', i === suggestIndex));
    return;
  }

  if (e.key === 'Enter' && suggestIndex >= 0) {
    e.preventDefault();
    items[suggestIndex].click();
  }
});

delegate(suggestBox, '.suggest-item', 'click', (e, node) => {
  hideSuggestions();
  openDishModal(Number(node.dataset.id));
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) hideSuggestions();
});

/* ---------------------------------------------------------- filters */

$('#sortSelect').addEventListener('change', (e) => {
  state.filters.sort = e.target.value;
  loadMenu();
});

delegate('.chips', '.chip[data-veg]', 'click', (e, node) => {
  $$('.chip[data-veg]').forEach((c) => c.classList.remove('active'));
  node.classList.add('active');
  state.filters.veg = node.dataset.veg;
  loadMenu();
});

$('#servedOnlyChip').addEventListener('click', (e) => {
  state.filters.servedOnly = !state.filters.servedOnly;
  e.currentTarget.classList.toggle('active', state.filters.servedOnly);
  e.currentTarget.setAttribute('aria-pressed', String(state.filters.servedOnly));
  loadMenu();
});

$('#priceRange').addEventListener('input', (e) => {
  const value = Number(e.target.value);
  setText('#priceValue', value >= 150 ? 'Any price' : `Under ${rupees(value)}`);
  state.filters.maxPrice = value >= 150 ? '' : value;
  runPriceFilter();
});

const runPriceFilter = debounce(() => loadMenu(), 350);

loadMoreBtn.addEventListener('click', () => {
  state.page += 1;
  loadMenu({ append: true });
});

/* --------------------------------------------------- infinite scroll */

// The button still works; this just saves the person a click.
if ('IntersectionObserver' in window && sentinel) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      if (!visible) return;
      if (state.route !== 'menu' || !state.hasMore || loadMoreBtn.disabled) return;

      state.page += 1;
      loadMenu({ append: true });
    },
    { rootMargin: '300px' }
  );

  observer.observe(sentinel);
}

// the cart can change from the cart panel, so keep the grid in step
on('cart', ({ dishId, cleared }) => {
  if (state.route !== 'menu') return;
  if (cleared) return renderMenu();
  if (dishId) updateCardQty(dishId);
});
