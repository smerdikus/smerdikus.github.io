const navToggle = document.querySelector(".nav-toggle");
const navMenu = document.querySelector(".nav-menu");
const viewLinks = document.querySelectorAll("[data-view-link]");
const primaryViewLinks = document.querySelectorAll(".nav-menu [data-view-link]");
const views = document.querySelectorAll("[data-view]");
const focusTabs = document.querySelectorAll("[data-focus-tab]");
const focusPanels = document.querySelectorAll("[data-focus-panel]");
const focusScenes =
  typeof window.createFocusScenesController === "function"
    ? window.createFocusScenesController()
    : null;

const validViews = new Set(["focus", "about", "skills", "contacts"]);
const validFocusTabs = new Set(["ml", "quant", "quantum"]);

const state = {
  view: "focus",
  focus: "ml",
};

const focusOrder = ["ml", "quant", "quantum"];

function resetScrollPosition() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function closeMenu() {
  if (!navMenu || !navToggle) {
    return;
  }

  navMenu.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
}

function parseHash() {
  const hash = window.location.hash.replace(/^#/, "");

  if (!hash) {
    return { view: state.view, focus: state.focus };
  }

  const [rawView, rawFocus] = hash.split("/");
  const view = validViews.has(rawView) ? rawView : "focus";
  const focus =
    view === "focus" && validFocusTabs.has(rawFocus) ? rawFocus : state.focus;

  return { view, focus };
}

function makeHash(view, focus) {
  if (view === "focus") {
    return `#focus/${focus}`;
  }

  return `#${view}`;
}

function updateTitle(view, focus) {
  const focusTitles = {
    ml: "Machine Learning",
    quant: "Quant Finance",
    quantum: "Quantum Computing",
  };

  if (view === "focus") {
    document.title = `Petr Šmerda | ${focusTitles[focus]}`;
    return;
  }

  const viewTitles = {
    about: "About",
    skills: "Skills",
    contacts: "Contacts",
  };

  document.title = `Petr Šmerda | ${viewTitles[view]}`;
}

function applyState(nextState) {
  state.view = nextState.view;
  state.focus = nextState.focus;

  views.forEach((view) => {
    const isActive = view.dataset.view === state.view;
    view.hidden = !isActive;
    view.classList.toggle("is-active", isActive);
  });

  primaryViewLinks.forEach((link) => {
    const isActive = link.dataset.viewLink === state.view;
    link.classList.toggle("is-active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  focusTabs.forEach((tab) => {
    const isActive = tab.dataset.focusTab === state.focus;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });

  focusPanels.forEach((panel) => {
    const isActive = panel.dataset.focusPanel === state.focus;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  });

  if (focusScenes) {
    focusScenes.setActiveFocus(state.focus, state.view === "focus");
  }

  updateTitle(state.view, state.focus);
  closeMenu();
}

function navigate(view, focus = state.focus) {
  const nextHash = makeHash(view, focus);

  if (window.location.hash !== nextHash) {
    window.history.pushState(null, "", nextHash);
  }

  applyState({ view, focus });
  resetScrollPosition();
}

if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    const isOpen = navMenu.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

viewLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const view = link.dataset.viewLink;

    if (!view || !validViews.has(view)) {
      return;
    }

    event.preventDefault();
    navigate(view);
  });
});

focusTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const focus = tab.dataset.focusTab;

    if (!focus || !validFocusTabs.has(focus)) {
      return;
    }

    navigate("focus", focus);
  });
});

document.addEventListener("click", (event) => {
  if (!navMenu || !navToggle) {
    return;
  }

  const target = event.target;
  if (
    target instanceof Element &&
    !navMenu.contains(target) &&
    !navToggle.contains(target)
  ) {
    closeMenu();
  }
});

window.addEventListener("keydown", (event) => {
  if (state.view !== "focus") {
    return;
  }

  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  ) {
    return;
  }

  const currentIndex = focusOrder.indexOf(state.focus);
  const nextIndex =
    event.key === "ArrowRight"
      ? (currentIndex + 1) % focusOrder.length
      : (currentIndex - 1 + focusOrder.length) % focusOrder.length;

  navigate("focus", focusOrder[nextIndex]);
});

window.addEventListener("popstate", () => {
  applyState(parseHash());
  resetScrollPosition();
});

if (!window.location.hash) {
  window.history.replaceState(null, "", makeHash(state.view, state.focus));
}

applyState(parseHash());
resetScrollPosition();
