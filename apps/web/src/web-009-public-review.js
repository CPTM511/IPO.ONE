const REVIEW_QUERIES = new Set(["web-009", "web-010", "web-011"]);
const AUTOPLAY_SESSION_KEY = "ipo-one-web010-agent-demo-played";

export const agentSteps = Object.freeze([
  { title: "Principal verified", kicker: "Principal record", authorizedBy: "Verified Principal", permitted: "Identity-bound request preparation", prohibited: "Self-granted authority", object: "Principal verification record" },
  { title: "Agent identity bound", kicker: "Identity binding", authorizedBy: "Verified Principal", permitted: "One accountable Agent relationship", prohibited: "Unbound or substituted Agent identity", object: "Agent identity binding" },
  { title: "Mandate created", kicker: "Mandate", authorizedBy: "Northstar Labs", permitted: "Compute, data and approved APIs", prohibited: "Withdrawals and unapproved providers", object: "Mandate" },
  { title: "Credit requested", kicker: "Credit Request", authorizedBy: "Active Mandate", permitted: "$18,000 for 30 days", prohibited: "Purpose or amount expansion", object: "Credit Request" },
  { title: "Capital offers received", kicker: "Capital Offers", authorizedBy: "Capital-provider policy", permitted: "Compare exact provider-authored terms", prohibited: "Authority before acceptance", object: "Capital Offers" },
  { title: "Offer accepted", kicker: "Obligation", authorizedBy: "Verified Principal", permitted: "Accept Offer B exactly as displayed", prohibited: "Hidden or changed terms", object: "Obligation" },
  { title: "Authorization created", kicker: "Authorization", authorizedBy: "Mandate + accepted Obligation", permitted: "$4,000 per approved provider action", prohibited: "Cash withdrawal or self-transfer", object: "Authorization" },
  { title: "Approved use completed", kicker: "Approved Use", authorizedBy: "Bounded Authorization", permitted: "Compute and data inside the Mandate", prohibited: "Unknown destination or excess spend", object: "Approved Use receipt" },
  { title: "Repayment verified", kicker: "Repayment", authorizedBy: "Servicing policy", permitted: "Verified settlement Evidence", prohibited: "Unobserved or unresolved outcome", object: "Repayment receipt" },
  { title: "Credit State improved", kicker: "Credit State", authorizedBy: "Verified repayment + execution", permitted: "Consideration in a future decision", prohibited: "Automatic limit or capital grant", object: "Credit State" }
]);

const paths = Object.freeze({
  human: {
    objects: ["Identity", "Consent", "Evidence", "Request", "Offer", "Obligation", "Repayment", "Credit State"],
    note: "A Human gives deliberate Consent and reviews exact terms before accepting the shared Obligation."
  },
  agent: {
    objects: ["Principal", "Agent Identity", "Mandate", "Plan", "Request", "Offer", "Authorization", "Obligation", "Repayment", "Credit State"],
    note: "An Agent begins with accountable Principal authority and a bounded execution plan."
  }
});

const examples = Object.freeze({
  rest: `POST /tenant/v1/operations\ncontent-type: application/json\n\n{\n  "operationId": "pilotRequestCredit",\n  "request": { "schemaVersion": "tenant_protocol_request.v1" }\n}`,
  typescript: `await tenantProtocol.execute({\n  operationId: "pilotRequestCredit",\n  request: creditIntentRequest\n});`,
  python: `requests.post(\n  f"{tenant_url}/tenant/v1/operations",\n  json={"operationId": "pilotRequestCredit", "request": credit_intent},\n  headers=session_headers,\n)`,
  mcp: `ipo_one_request_credit({\n  schemaVersion: "tenant_protocol_request.v1",\n  request: creditIntentRequest\n})`,
  a2a: `// Capability discovery + authenticated handoff\n// Use the current versioned capability catalog.\n// Authority remains Principal- and Mandate-bound.`
});

function setPressed(buttons, active) {
  for (const button of buttons) {
    const selected = button === active;
    button.classList.toggle("active", selected);
    button.setAttribute(button.getAttribute("role") === "tab" ? "aria-selected" : "aria-pressed", String(selected));
  }
}

function initializeAgentLifecycle(root) {
  const lifecycle = root.querySelector("[data-web010-lifecycle]");
  const rail = lifecycle.querySelector("[data-web010-step-rail]");
  const objects = [...lifecycle.querySelectorAll("[data-web010-object]")];
  const pinStatus = lifecycle.querySelector("[data-web010-pin-status]");
  const releasePin = lifecycle.querySelector("[data-web010-unpin]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0;
  let pinnedIndex = null;
  let userInteracted = false;
  let autoplayTimer;
  let dragStartX;
  let dragScrollLeft;
  let dragged = false;
  let scrollTimer;

  const updateHero = (index) => {
    const heroIndex = [0, 0, 0, 0, 1, 2, 2, 3, 4, 5][index];
    for (const item of root.querySelectorAll("[data-web010-hero-stage]")) {
      const itemIndex = Number(item.dataset.web010HeroStage);
      item.classList.toggle("active", itemIndex === heroIndex);
      item.classList.toggle("complete", itemIndex < heroIndex);
    }
  };

  const render = (index, { scroll = false } = {}) => {
    current = Math.max(0, Math.min(agentSteps.length - 1, index));
    const step = agentSteps[current];
    const buttons = [...rail.querySelectorAll("button")];
    lifecycle.dataset.lifecycleIndex = String(current);
    lifecycle.dataset.activeObject = step.object;
    lifecycle.querySelector("[data-web009-step-number]").textContent = String(current + 1).padStart(2, "0");
    lifecycle.querySelector("[data-web009-step-title]").textContent = step.title;
    lifecycle.querySelector("[data-web010-object-kicker]").textContent = step.kicker;
    lifecycle.querySelector("[data-web009-step-authority]").textContent = step.authorizedBy;
    lifecycle.querySelector("[data-web010-step-permitted]").textContent = step.permitted;
    lifecycle.querySelector("[data-web010-step-prohibited]").textContent = step.prohibited;
    lifecycle.querySelector("[data-web009-step-object]").textContent = step.object;
    lifecycle.querySelector("[data-web010-current-indicator]").textContent = `${String(current + 1).padStart(2, "0")} / 10`;
    buttons.forEach((button, buttonIndex) => {
      const active = buttonIndex === current;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(pinnedIndex === buttonIndex));
      button.setAttribute("aria-current", active ? "step" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    objects.forEach((object, objectIndex) => {
      const active = objectIndex === current;
      object.classList.toggle("is-active", active);
      object.setAttribute("aria-hidden", String(!active));
    });
    releasePin.hidden = pinnedIndex === null;
    pinStatus.textContent = pinnedIndex === null
      ? (lifecycle.dataset.autoplay === "running" ? "Demonstrating" : `State ${current + 1} of 10`)
      : `Pinned · ${String(pinnedIndex + 1).padStart(2, "0")}`;
    updateHero(current);
    if (scroll && matchMedia("(max-width: 760px)").matches) {
      buttons[current]?.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "nearest", inline: "center" });
    }
  };

  const cancelAutoplay = (state = "cancelled") => {
    userInteracted = true;
    clearInterval(autoplayTimer);
    autoplayTimer = undefined;
    sessionStorage.setItem(AUTOPLAY_SESSION_KEY, "1");
    if (lifecycle.dataset.autoplay === "running" || !lifecycle.dataset.autoplay) lifecycle.dataset.autoplay = state;
    render(current);
  };

  const buttons = agentSteps.map((step, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.web010Step = String(index);
    button.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><strong>${step.title}</strong>`;
    button.addEventListener("pointerenter", () => {
      cancelAutoplay();
      if (pinnedIndex === null) render(index);
    });
    button.addEventListener("click", () => {
      cancelAutoplay();
      if (dragged) return;
      pinnedIndex = pinnedIndex === index ? null : index;
      render(index, { scroll: true });
    });
    item.append(button);
    return item;
  });
  rail.replaceChildren(...buttons);

  lifecycle.addEventListener("keydown", (event) => {
    const keyTargets = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: agentSteps.length - 1 };
    if (event.key in keyTargets) {
      event.preventDefault();
      cancelAutoplay();
      pinnedIndex = null;
      render(keyTargets[event.key], { scroll: true });
      rail.querySelectorAll("button")[current]?.focus();
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && event.target === lifecycle) {
      event.preventDefault();
      cancelAutoplay();
      pinnedIndex = pinnedIndex === current ? null : current;
      render(current);
    }
  });

  releasePin.addEventListener("click", () => {
    pinnedIndex = null;
    render(current);
    rail.querySelectorAll("button")[current]?.focus();
  });

  const closestStep = () => {
    const center = rail.scrollLeft + rail.clientWidth / 2;
    return [...rail.querySelectorAll("button")].reduce((best, button, index) => {
      const distance = Math.abs(button.offsetLeft + button.offsetWidth / 2 - center);
      return distance < best.distance ? { index, distance } : best;
    }, { index: current, distance: Number.POSITIVE_INFINITY }).index;
  };
  rail.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && !matchMedia("(max-width: 760px)").matches) return;
    cancelAutoplay();
    dragStartX = event.clientX;
    dragScrollLeft = rail.scrollLeft;
    dragged = false;
    rail.setPointerCapture(event.pointerId);
  });
  rail.addEventListener("pointermove", (event) => {
    if (dragStartX === undefined) return;
    const delta = event.clientX - dragStartX;
    if (Math.abs(delta) > 5) dragged = true;
    rail.scrollLeft = dragScrollLeft - delta;
    if (pinnedIndex === null) render(closestStep());
  });
  const finishDrag = (event) => {
    if (dragStartX === undefined) return;
    dragStartX = undefined;
    rail.releasePointerCapture(event.pointerId);
    if (pinnedIndex === null) render(closestStep(), { scroll: true });
    setTimeout(() => { dragged = false; }, 0);
  };
  rail.addEventListener("pointerup", finishDrag);
  rail.addEventListener("pointercancel", finishDrag);
  rail.addEventListener("scroll", () => {
    if (!matchMedia("(max-width: 760px)").matches || pinnedIndex !== null) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => render(closestStep()), 80);
  }, { passive: true });

  const startAutoplay = () => {
    if (userInteracted) {
      lifecycle.dataset.autoplay = "cancelled";
      render(current);
      return;
    }
    if (reducedMotion.matches) {
      lifecycle.dataset.autoplay = "reduced-motion";
      render(0);
      return;
    }
    if (sessionStorage.getItem(AUTOPLAY_SESSION_KEY) === "1") {
      lifecycle.dataset.autoplay = "seen";
      render(0);
      return;
    }
    sessionStorage.setItem(AUTOPLAY_SESSION_KEY, "1");
    lifecycle.dataset.autoplay = "running";
    render(0);
    autoplayTimer = setInterval(() => {
      if (current >= agentSteps.length - 1) {
        clearInterval(autoplayTimer);
        autoplayTimer = undefined;
        lifecycle.dataset.autoplay = "complete";
        render(current);
        return;
      }
      render(current + 1, { scroll: true });
    }, 720);
  };
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35)) return;
      observer.disconnect();
      startAutoplay();
    }, { threshold: [0.35] });
    observer.observe(lifecycle);
  } else {
    startAutoplay();
  }
  render(0);
}

function initializePathSelector(root) {
  const buttons = [...root.querySelectorAll("[data-web009-path]")];
  const flow = root.querySelector("[data-web009-path-flow]");
  const note = root.querySelector("[data-web009-path-note]");
  const render = (button) => {
    const path = paths[button.dataset.web009Path];
    flow.replaceChildren(...path.objects.map((name, index) => {
      const item = document.createElement("li");
      item.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span>${name}`;
      return item;
    }));
    note.textContent = path.note;
    setPressed(buttons, button);
  };
  buttons.forEach((button) => button.addEventListener("click", () => render(button)));
  render(buttons[0]);
}

function initializeRails(root) {
  const buttons = [...root.querySelectorAll("[data-web009-rail]")];
  buttons.forEach((button) => button.addEventListener("click", () => {
    root.querySelector("[data-web009-rail-value]").textContent = button.dataset.web009Rail;
    setPressed(buttons, button);
  }));
}

function initializeCodeTabs(root) {
  const buttons = [...root.querySelectorAll("[data-web009-code]")];
  const panel = root.querySelector("[data-web009-code-panel]");
  const render = (button) => {
    panel.textContent = examples[button.dataset.web009Code];
    setPressed(buttons, button);
  };
  buttons.forEach((button) => button.addEventListener("click", () => render(button)));
  render(buttons[0]);
}

function initializeTheme() {
  const buttons = [...document.querySelectorAll("[data-web009-theme], [data-web009-app-theme]")];
  const themes = ["system", "light", "dark"];
  let index = Math.max(0, themes.indexOf(sessionStorage.getItem("ipo-one-review-theme")));
  const render = () => {
    const requested = themes[index];
    const resolved = requested === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : requested;
    document.body.dataset.web009Theme = resolved;
    for (const button of buttons) {
      button.textContent = requested[0].toUpperCase() + requested.slice(1);
      button.setAttribute("aria-label", `Theme: ${requested}`);
    }
    sessionStorage.setItem("ipo-one-review-theme", requested);
  };
  buttons.forEach((button) => button.addEventListener("click", () => {
    index = (index + 1) % themes.length;
    render();
  }));
  render();
}

function initializeAccessGateway(root) {
  const gatewayControl = document.getElementById("accessBtn");
  for (const button of root.querySelectorAll("[data-web009-access]")) {
    button.addEventListener("click", () => gatewayControl?.click());
  }
}

function initializeAppContext() {
  const context = document.getElementById("web009AppContext");
  const roles = {
    human_borrower: ["Borrower", "Human Borrower", "Verified Human context"],
    principal_controller: ["Controller", "Principal / Agent Operator", "Verified Principal context"],
    capital_partner: ["Capital Partner", "Capital Partner", "Verified Capital Partner context"],
    risk_operator: ["Risk", "Risk & Operations", "Verified Risk/Ops context"]
  };
  const update = () => {
    const active = document.body.classList.contains("workspace-session-active");
    context.hidden = !active;
    if (!active) return;
    const role = document.body.dataset.web009WorkspaceRole;
    const configured = document.querySelector('meta[name="ipo-one-workspace-name"]')?.content;
    const labels = roles[role] ?? [configured || "Authenticated", "Authorized role", "Verified Actor context"];
    document.getElementById("web009WorkspaceContext").textContent = labels[0];
    document.getElementById("web009RoleContext").textContent = labels[1];
    document.getElementById("web009IdentityContext").textContent = labels[2];
  };
  new MutationObserver(update).observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "data-web009-workspace-role"]
  });
  update();
}

export function initializeWeb009PublicReview(location = window.location) {
  if (!REVIEW_QUERIES.has(new URLSearchParams(location.search).get("founder_review"))) return false;
  const root = document.getElementById("web009PublicReview");
  if (!root) return false;
  initializePublicReviewSurface(root);
  return true;
}

export function initializePublicReviewSurface(root, { lifecycle = true, theme = true } = {}) {
  document.body.classList.add("web009-review-mode");
  root.hidden = false;
  if (lifecycle) initializeAgentLifecycle(root);
  initializePathSelector(root);
  initializeRails(root);
  initializeCodeTabs(root);
  if (theme) initializeTheme();
  initializeAccessGateway(root);
  initializeAppContext();
}

if (typeof window !== "undefined") initializeWeb009PublicReview();
