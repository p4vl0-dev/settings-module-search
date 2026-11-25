/**
 * Settings Module Search
 * Compatible with Foundry VTT v12+.
 *
 * v12 uses the legacy SettingsConfig Application and a jQuery render hook.
 * v13+ uses ApplicationV2 and the renderApplicationV2 hook.
 * Both paths are normalized to an HTMLElement before binding the same logic.
 */

const MODULE_ID = "settings-module-search";
const SEARCH_INPUT_ID = "settings-config-search-filter";
const HIDDEN_CLASS = "settings-module-search-hidden";
const BOUND_ATTRIBUTE = "settingsModuleSearchBound";

// v14 uses buttons. Earlier SettingsConfig templates may use links or other
// elements with data-tab, so selectors deliberately support both structures.
const CATEGORY_NAV_SELECTORS = [
  'nav.tabs [data-action="tab"][data-group="categories"][data-tab]',
  'nav.tabs [data-group="categories"][data-tab]',
  'nav.tabs[data-group="categories"] [data-tab]',
  'aside nav.tabs [data-tab]',
  'nav.tabs.vertical [data-tab]',
  'nav.tabs [data-tab]'
];

/**
 * Normalize text for forgiving, case-insensitive, accent-insensitive matching.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Convert the HTML argument used by legacy Application hooks (jQuery) or
 * ApplicationV2 hooks (HTMLElement) into a plain HTMLElement.
 * @param {unknown} html
 * @returns {HTMLElement|null}
 */
function toHTMLElement(html) {
  if (typeof HTMLElement !== "undefined" && html instanceof HTMLElement) return html;
  if (html && typeof HTMLElement !== "undefined" && html[0] instanceof HTMLElement) return html[0];
  if (html?.element && typeof HTMLElement !== "undefined" && html.element instanceof HTMLElement) {
    return html.element;
  }
  return null;
}

/**
 * Find the SettingsConfig search input. The first selector matches v14; the
 * fallbacks cover the differently structured legacy templates.
 * @param {HTMLElement} root
 * @returns {HTMLInputElement|null}
 */
function findSearchInput(root) {
  const selectors = [
    `#${SEARCH_INPUT_ID}`,
    'input[type="search"][aria-label="Фильтр"]',
    'input[type="search"][aria-label="Filter"]',
    'input[type="search"][name="search"]',
    'input[type="search"]'
  ];

  for (const selector of selectors) {
    const input = root.querySelector(selector);
    if (input instanceof HTMLInputElement) return input;
  }
  return null;
}

/**
 * Return navigation controls for setting categories. Only elements inside the
 * settings category navigation are considered; this does not inspect setting
 * rows or package metadata.
 * @param {HTMLElement} root
 * @returns {HTMLElement[]}
 */
function getCategoryButtons(root) {
  const found = new Set();
  for (const selector of CATEGORY_NAV_SELECTORS) {
    for (const element of root.querySelectorAll(selector)) {
      if (element.hasAttribute("data-tab")) found.add(element);
    }
  }
  return Array.from(found);
}

/**
 * The visible label is the ONLY searchable field. Package ID, description,
 * author, hints, and individual setting names are intentionally ignored.
 * @param {HTMLElement} button
 * @returns {string}
 */
function getCategorySearchText(button) {
  return normalizeText(button.textContent ?? "");
}

/**
 * Check whether the visible category label matches every query term.
 * @param {string} searchableText
 * @param {string} query
 * @returns {boolean}
 */
function matchesQuery(searchableText, query) {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  return terms.length === 0 || terms.every((term) => searchableText.includes(term));
}

/**
 * Preserve Foundry's own and the active system's settings categories.
 * @param {string} categoryId
 * @returns {boolean}
 */
function isPinnedCategory(categoryId) {
  const systemId = globalThis.game?.system?.id;
  return categoryId === "core"
    || categoryId === "system"
    || Boolean(systemId && categoryId === systemId);
}

/**
 * Get the active category identifier across legacy and ApplicationV2 markup.
 * @param {HTMLElement[]} buttons
 * @returns {string|null}
 */
function getActiveCategoryId(buttons) {
  const active = buttons.find((button) =>
    button.getAttribute("aria-pressed") === "true"
    || button.getAttribute("aria-selected") === "true"
    || button.classList.contains("active")
    || button.classList.contains("selected")
  );
  return active?.getAttribute("data-tab") ?? null;
}

/**
 * Activate a category using its native navigation control. This delegates tab
 * state changes to Foundry and works for both legacy links and v14 buttons.
 * @param {HTMLElement|undefined} button
 * @param {string|null} currentCategoryId
 */
function activateCategory(button, currentCategoryId) {
  if (!button) return;
  const categoryId = button.getAttribute("data-tab");
  if (!categoryId || categoryId === currentCategoryId) return;
  button.click();
}

/**
 * Apply a search exclusively to category navigation controls.
 * @param {HTMLElement} root
 * @param {string} query
 */
function applyCategorySearch(root, query) {
  const buttons = getCategoryButtons(root);
  if (!buttons.length) return;

  const normalizedQuery = normalizeText(query);
  const pinnedButtons = buttons.filter((button) =>
    isPinnedCategory(button.getAttribute("data-tab") ?? "")
  );
  const moduleButtons = buttons.filter((button) =>
    !isPinnedCategory(button.getAttribute("data-tab") ?? "")
  );

  if (!normalizedQuery) {
    for (const button of buttons) {
      button.hidden = false;
      button.classList.remove(HIDDEN_CLASS);
      button.removeAttribute("aria-hidden");
    }
    return;
  }

  const matchingModuleButtons = moduleButtons.filter((button) =>
    matchesQuery(getCategorySearchText(button), normalizedQuery)
  );
  const visibleIds = new Set([
    ...pinnedButtons.map((button) => button.getAttribute("data-tab")),
    ...matchingModuleButtons.map((button) => button.getAttribute("data-tab"))
  ]);

  for (const button of buttons) {
    const visible = visibleIds.has(button.getAttribute("data-tab"));
    button.hidden = !visible;
    button.classList.toggle(HIDDEN_CLASS, !visible);
    if (visible) button.removeAttribute("aria-hidden");
    else button.setAttribute("aria-hidden", "true");
  }

  const currentCategoryId = getActiveCategoryId(buttons);

  // One matching module is an unambiguous destination.
  if (matchingModuleButtons.length === 1) {
    activateCategory(matchingModuleButtons[0], currentCategoryId);
    return;
  }

  // If the active category was hidden, move to a visible category.
  if (currentCategoryId && !visibleIds.has(currentCategoryId)) {
    activateCategory(matchingModuleButtons[0] ?? pinnedButtons[0], currentCategoryId);
  }
}

/**
 * Determine whether an event originated from the SettingsConfig search field.
 * @param {EventTarget|null} target
 * @param {HTMLInputElement|null} searchInput
 * @returns {boolean}
 */
function isSearchInputTarget(target, searchInput) {
  if (!(target instanceof HTMLInputElement)) return false;
  return target === searchInput || target.id === SEARCH_INPUT_ID;
}

/**
 * Bind input and keyboard events in capture phase. The input itself remains a
 * normal editable field. We stop propagation only to prevent Foundry's native
 * setting-entry filter from changing the contents of the selected category.
 * keyup is included for v12's legacy SearchFilter implementation.
 * @param {HTMLElement} root
 */
function bindSettingsSearch(root) {
  if (root.dataset[BOUND_ATTRIBUTE] === "true") return;

  const searchInput = findSearchInput(root);
  if (!searchInput) return;

  root.dataset[BOUND_ATTRIBUTE] = "true";

  const listener = (event) => {
    if (!isSearchInputTarget(event.target, searchInput)) return;

    // Do not preventDefault and never mutate input.value. The keystroke,
    // paste, selection, and browser search-clear behavior remain native.
    event.stopImmediatePropagation();
    applyCategorySearch(root, searchInput.value);
  };

  root.addEventListener("input", listener, true);
  root.addEventListener("search", listener, true);
  root.addEventListener("keyup", listener, true);

  if (searchInput.value.trim()) {
    applyCategorySearch(root, searchInput.value);
  }
}

/**
 * Legacy v12 render hook supplies a jQuery-wrapped HTML element.
 * @param {*} application
 * @param {*} html
 */
function onLegacySettingsConfigRender(application, html) {
  // This hook is class-specific: it fires only for SettingsConfig.
  const root = toHTMLElement(html);
  if (root) bindSettingsSearch(root);
}

/**
 * ApplicationV2 render hook supplies a native HTMLElement.
 * @param {*} application
 * @param {*} element
 */
function onApplicationV2Render(application, element) {
  const SettingsConfig = globalThis.foundry?.applications?.settings?.SettingsConfig;
  const isSettingsConfig = (SettingsConfig && application instanceof SettingsConfig)
    || application?.constructor?.name === "SettingsConfig";
  if (!isSettingsConfig) return;

  const root = toHTMLElement(element);
  if (root) bindSettingsSearch(root);
}

Hooks.once("init", () => {
  // Foundry v12: ApplicationV1 / FormApplication-style SettingsConfig.
  Hooks.on("renderSettingsConfig", onLegacySettingsConfigRender);

  // Foundry v13+: SettingsConfig is rendered through ApplicationV2.
  Hooks.on("renderApplicationV2", onApplicationV2Render);
});
