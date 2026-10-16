/* Pure menu rendering helpers. Loaded before menu.js; invoked after app setup. */
/* -------------------------------------------------------- rendering */

function renderMenu() {
  if (state.dishes.length === 0) {
    menuGrid.innerHTML = "";
    showStatus(
      menuStatus,
      emptyBlock(
        "Nothing matches that",
        'Try another search, or turn off "Served now".',
      ),
    );
    resultCount.textContent = "";
    show(loadMoreBtn, false);
    return;
  }

  hideStatus(menuStatus);
  menuGrid.innerHTML = state.dishes.map(dishCard).join("");
  const prices = state.dishes
    .map((d) => Number(d.price))
    .filter((p) => !Number.isNaN(p));
  const priceNote = prices.length
    ? ` · first ${rupees(prices[0])} · last ${rupees(prices[prices.length - 1])}`
    : "";
  resultCount.textContent = `Showing ${state.dishes.length} dishes · requested page size 5 · total ${state.total}${priceNote}`;
  show(loadMoreBtn, state.hasMore);
}

function badgeFor(dish) {
  if (dish.disabled) return '<span class="badge sold">Off menu</span>';
  if (dish.stock === 0) return '<span class="badge sold">Sold out</span>';
  if (!dish.servedNow)
    return html`<span class="badge later">${dish.slotLabel}</span>`;
  if (dish.stock <= 3)
    return html`<span class="badge low">Only ${dish.stock} left</span>`;
  if ((dish.tags || []).includes("bestseller"))
    return '<span class="badge hot">Bestseller</span>';
  if ((dish.tags || []).includes("new"))
    return '<span class="badge new">New</span>';
  return "";
}

function qtyControl(dish) {
  const qty = cartQty(dish.id);

  if (qty > 0) {
    return html`<div class="qty-row">
      <button
        class="qty-btn"
        data-action="dec"
        aria-label="One less ${dish.name}"
      >
        &minus;
      </button>
      <span class="qty-value" data-qty="${dish.id}">${qty}</span>
      <button
        class="qty-btn"
        data-action="inc"
        aria-label="One more ${dish.name}"
      >
        +
      </button>
    </div>`;
  }

  const label = dish.orderable
    ? "Add to Cart"
    : dish.blockedReason || "Not now";
  return html`<button
    class="add-btn"
    data-action="add"
    ${raw(dish.orderable ? "" : "disabled")}
  >
    ${label}
  </button>`;
}

function dishCard(dish) {
  const fav = isFavourite(dish.id);

  return html`<article
    class="dish-card ${dish.orderable ? "" : "blocked"}"
    data-id="${dish.id}"
  >
    <div class="img-wrap">
      <img
        src="${dish.image}"
        alt="${dish.name}"
        loading="lazy"
        data-action="open"
      />
      ${raw(badgeFor(dish))}
      <button
        class="fav-btn ${fav ? "on" : ""}"
        data-action="fav"
        aria-pressed="${fav}"
        aria-label="Save ${dish.name}"
      >
        &#9733;
      </button>
    </div>

    <div class="dish-body">
      <h3 class="dish-name">
        <button class="name-btn" data-action="open">${dish.name}</button>
      </h3>

      <div class="dish-meta">
        <span
          class="veg-dot ${dish.veg ? "" : "nonveg"}"
          title="${dish.veg ? "Veg" : "Non-veg"}"
        ></span>
        <span>${dish.category}</span>
        <span class="rating"
          >&#9733;
          ${dish.rating}${dish.ratingCount
            ? ` (${dish.ratingCount})`
            : ""}</span
        >
        ${raw(
          dish.spicy
            ? '<span class="spicy" title="Spicy">&#127798;</span>'
            : "",
        )}
      </div>

      <div class="price-row">
        <span class="dish-price">${rupees(dish.price)}</span>
        <span class="prep">~${dish.prepMinutes} min</span>
      </div>

      ${raw(qtyControl(dish))}
    </div>
  </article>`;
}

/** Repaint one card's control without touching the rest of the grid. */
function updateCardQty(dishId) {
  const card = menuGrid.querySelector(`.dish-card[data-id="${dishId}"]`);
  if (!card) return;

  const dish = state.dishes.find((d) => d.id === Number(dishId));
  if (!dish) return;

  const body = $(".dish-body", card);
  const control = body.querySelector(".qty-row, .add-btn");
  if (!control) return;

  const holder = document.createElement("div");
  holder.innerHTML = qtyControl(dish);
  control.replaceWith(holder.firstElementChild);
}
