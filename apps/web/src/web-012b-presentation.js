import { agentSteps, initializePublicReviewSurface } from "./web-009-public-review.js";

const review = new URLSearchParams(window.location.search).get("founder_review");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const ease = "cubic-bezier(.2,.8,.2,1)";

function remembered(key) {
  try { return sessionStorage.getItem(key) === "1"; } catch { return true; }
}

function remember(key) {
  try { sessionStorage.setItem(key, "1"); } catch { /* Playback remains optional. */ }
}

const sceneTemplate = (hero) => `
  <div class="b-scene ${hero ? "b-hero-scene" : "b-lifecycle-scene"}" data-b-scene>
    <div class="b-scene-top"><span>${hero ? "AGENT WORKING CAPITAL" : "THE OBLIGATION RECORD"}</span><span class="b-environment">Illustrative · No real funds</span></div>
    <div class="b-identity"><span class="b-initials" aria-hidden="true">NL</span><div><strong>Northstar Labs</strong><span>Principal</span></div><span class="b-binding-label">BOUND TO</span><div class="b-agent-name"><strong>Procurement Agent</strong><span>Compute + data + approved APIs</span></div></div>
    <div class="b-authority"><span class="b-signal-mark" aria-hidden="true"></span><strong data-b-authority>Mandate-bound capital</strong><span data-b-cap>$4,000 / action</span></div>
    <div class="b-record" data-b-record>
      <div class="b-record-heading"><span data-b-kind>Credit Request</span><span class="b-record-state" data-b-status>Within Mandate</span></div>
      <div class="b-principal"><span class="b-currency">USD</span><strong data-b-amount>$18,000</strong><span data-b-amount-note>Requested capital</span></div>
      <dl class="b-terms"><div><dt data-b-term-label="0">Term</dt><dd data-b-term="0">30 days</dd></div><div><dt data-b-term-label="1">Use</dt><dd data-b-term="1">Approved providers</dd></div><div><dt data-b-term-label="2">Authority</dt><dd data-b-term="2">Revocable</dd></div></dl>
      <div class="b-state-detail" data-b-detail></div>
      <div class="b-record-result"><span class="b-result-mark" aria-hidden="true"></span><span data-b-result>One request. Clear terms. Accountable use.</span></div>
    </div>
    <div class="b-evidence"><span>EVIDENCE</span><strong data-b-evidence>Every outcome carries forward.</strong><button type="button" data-b-evidence-toggle aria-expanded="false">View record <svg aria-hidden="true"><use href="/icons.svg#chevron-right"></use></svg></button></div>
    <div class="b-evidence-detail" data-b-evidence-detail hidden><strong>About this example</strong><p>This is an illustrative credit lifecycle, not your account or a transaction. Actual records identify their source, time, authority and verification stage. Future access requires a new capital-provider Decision and Offer.</p></div>
  </div>`;

const states = [
  { kind: "Principal record", status: "Verified", note: "Scenario budget", terms: ["Owner / controller", "Current review", "Identity bound"], labels: ["Relationship", "Review", "Authority"], detail: "Northstar Labs is the accountable Principal. Verification alone does not grant spending authority.", result: "Accountability starts with an identified Principal.", evidence: "Principal verification record" },
  { kind: "Agent identity binding", status: "Bound", note: "Scenario budget", terms: ["Northstar Labs", "Account proof", "Principal bound"], labels: ["Controller", "Binding", "Agent"], detail: "The Procurement Agent acts for its Principal. Its identity is linked; its permitted actions are defined separately.", result: "One accountable Principal. One bound Agent.", evidence: "Identity binding recorded" },
  { kind: "Mandate", status: "Active · revocable", note: "Aggregate budget", terms: ["30 days", "$4,000", "Approved catalog"], labels: ["Expiry", "Per action", "Providers"], detail: "<div class=\"b-mandate-lines\"><div><span>Purpose</span><strong>Compute, data, approved APIs</strong></div><div><span>Stop conditions</span><strong>Cap · expiry · revocation</strong></div></div>", result: "Authority surrounds every use of capital.", evidence: "Mandate version 01" },
  { kind: "Credit Request", status: "Within Mandate", note: "Requested capital", terms: ["30 days", "Approved providers", "Mandate bound"], labels: ["Term", "Use", "Authority"], detail: "A request for working capital, made inside the Principal’s purpose, budget and time boundaries.", result: "A request does not grant capital or authority.", evidence: "Credit intent prepared" },
  { kind: "Capital Offers", status: "Compare terms", note: "Offer B principal", terms: ["30 days", "$540", "$18,540"], labels: ["Term", "Agreed cost", "Total due"], detail: "<div class=\"b-offers\"><div><span>Offer A</span><strong>$14,000</strong><small>21 days · $350 cost</small></div><div class=\"b-selected-offer\"><span>Offer B</span><strong>$18,000</strong><small>30 days · $540 cost</small><em>Selected</em></div><div><span>Offer C</span><strong>$18,000</strong><small>45 days · $900 cost</small></div></div>", result: "Capital providers set terms. The Principal chooses.", evidence: "Offer comparison · not yet accepted" },
  { kind: "Obligation", status: "Accepted terms", note: "Original principal", terms: ["30 days", "$540", "$18,540"], labels: ["Term", "Agreed cost", "Total due"], detail: "<div class=\"b-acceptance\"><span>Offer B</span><svg aria-hidden=\"true\"><use href=\"/icons.svg#chevron-right\"></use></svg><span>Accepted by Northstar Labs</span><svg aria-hidden=\"true\"><use href=\"/icons.svg#chevron-right\"></use></svg><strong>Obligation</strong></div>", result: "The accepted terms become an accountable obligation.", evidence: "Offer acceptance linked to Obligation" },
  { kind: "Authorization", status: "Purpose limited", note: "Obligation principal", terms: ["$4,000", "Approved catalog", "With Mandate"], labels: ["Per action", "Destination", "Expires"], detail: "<div class=\"b-mandate-lines\"><div><span>Source</span><strong>Mandate + accepted Obligation</strong></div><div><span>Stop</span><strong>Cap or revocation</strong></div></div>", result: "No withdrawal. No self-transfer. Approved use only.", evidence: "Bounded authorization attached" },
  { kind: "Approved Use receipt", status: "Recorded", note: "Obligation principal", terms: ["$6,240", "Compute + data", "Inside Mandate"], labels: ["Total usage", "Purpose", "Policy"], detail: "Approved provider usage is recorded across bounded actions. The total is not a single action above the $4,000 cap.", result: "Execution Evidence records what happened and why it was allowed.", evidence: "Approved-use Evidence recorded" },
  { kind: "Repayment receipt", status: "Repaid in full", note: "Original principal", terms: ["$18,000", "$540", "$18,540"], labels: ["Principal", "Agreed cost", "Settled total"], detail: "<div class=\"b-repayment\"><span>Outstanding after repayment</span><strong>$0.00</strong></div>", result: "Principal and agreed cost settled in this example.", evidence: "Execution + repayment linked" },
  { kind: "Credit State", status: "Evidence added", note: "Completed obligation", terms: ["Settled", "Recorded", "New decision"], labels: ["Repayment", "Approved use", "Future access"], detail: "<div class=\"b-mandate-lines\"><div><span>What changed</span><strong>Verified repayment + approved use</strong></div><div><span>What comes next</span><strong>Capital-provider review</strong></div></div>", result: "A future Offer still requires a new capital-provider decision.", evidence: "A stronger record. No automatic limit increase." }
];

function createScene(container, hero = false) {
  container.innerHTML = sceneTemplate(hero);
  const scene = container.querySelector("[data-b-scene]");
  const detail = scene.querySelector("[data-b-detail]");
  let current = -1;
  let animation;
  reduced.addEventListener("change", () => { if (reduced.matches) animation?.cancel(); });
  scene.querySelector("[data-b-evidence-toggle]").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const expanded = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(expanded));
    scene.querySelector("[data-b-evidence-detail]").hidden = !expanded;
  });
  return (index) => {
    if (current === index) return;
    const state = states[index];
    const previous = current;
    current = index;
    scene.dataset.state = String(index);
    for (const [field, value] of Object.entries({kind: state.kind, status: state.status, "amount-note": state.note, result: state.result, evidence: state.evidence})) {
      scene.querySelector(`[data-b-${field}]`).textContent = value;
    }
    scene.querySelector("[data-b-authority]").textContent = index < 2 ? "Accountable identity" : "Mandate-bound capital";
    scene.querySelector("[data-b-cap]").textContent = index < 2 ? "Not yet authorized" : "$4,000 / action";
    state.terms.forEach((term, i) => {
      scene.querySelector(`[data-b-term="${i}"]`).textContent = term;
      scene.querySelector(`[data-b-term-label="${i}"]`).textContent = state.labels[i];
    });
    // Only the state-specific explanation changes; identity, principal and record remain mounted.
    detail.innerHTML = state.detail;
    animation?.cancel();
    if (previous >= 0 && !reduced.matches) animation = detail.animate([
      { opacity: .25, transform: `translateY(${index > previous ? 8 : -8}px)` },
      { opacity: 1, transform: "translateY(0)" }
    ], { duration: 400, easing: ease });
  };
}

function initializeThemes() {
  const controls = document.querySelectorAll("[data-web009-theme], [data-web009-app-theme]");
  controls.forEach((old) => {
    const wrapper = document.createElement("label");
    wrapper.className = "b-theme";
    wrapper.innerHTML = `<span class="b-visually-hidden">Appearance</span><select aria-label="Appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>`;
    old.replaceWith(wrapper);
    wrapper.querySelector("select").addEventListener("change", (event) => document.dispatchEvent(new CustomEvent("ipo-theme-select", { detail: event.target.value })));
  });
  const update = () => {
    document.body.dataset.web009Theme = document.documentElement.dataset.ipoTheme;
    document.querySelectorAll(".b-theme select").forEach((select) => { select.value = document.documentElement.dataset.ipoThemePreference; });
  };
  document.addEventListener("ipo-theme-change", update);
  update();
}

function initializeHero(root) {
  const original = root.querySelector(".web010-hero-product");
  const stage = document.createElement("div");
  stage.className = "b-hero-stage";
  stage.innerHTML = `<div class="b-hero-topline"><span>CAPITAL, WITH CONTEXT.</span><span>01 — 04</span></div><div data-b-hero-mount></div><div class="b-hero-controls"><div role="group" aria-label="Explore the credit system">${[[2,"Mandate"],[4,"Offer"],[5,"Obligation"],[9,"Evidence"]].map(([state,label])=>`<button type="button" data-b-hero-state="${state}" aria-pressed="false">${label}</button>`).join("")}</div><button type="button" data-b-hero-play>Replay</button></div><p class="b-hero-caption" data-b-hero-caption>Explore the relationship between authority, capital and evidence.</p>`;
  original.replaceWith(stage);
  const renderScene = createScene(stage.querySelector("[data-b-hero-mount]"), true);
  const key = "ipo-one-web012b-hero-played";
  let timer;
  let playing = false;
  const render = (index) => {
    renderScene(index);
    stage.querySelectorAll("[data-b-hero-state]").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.bHeroState) === index)));
  };
  const stop = () => {
    clearTimeout(timer);
    playing = false;
    stage.dataset.playback = "stopped";
    stage.querySelector("[data-b-hero-play]").textContent = "Replay";
    remember(key);
    document.dispatchEvent(new Event("ipo-hero-finished"));
  };
  const play = () => {
    stop();
    if (reduced.matches) { render(4); stage.dataset.playback = "reduced-motion"; return; }
    playing = true;
    stage.dataset.playback = "playing";
    stage.querySelector("[data-b-hero-play]").textContent = "Skip";
    render(2);
    timer = setTimeout(() => { render(4); timer = setTimeout(() => { render(5); timer = setTimeout(stop, 800); }, 800); }, 800);
  };
  stage.querySelectorAll("[data-b-hero-state]").forEach((button) => button.addEventListener("click", () => { stop(); render(Number(button.dataset.bHeroState)); }));
  stage.querySelector("[data-b-hero-play]").addEventListener("click", () => playing ? stop() : play());
  stage.querySelector("[data-b-evidence-toggle]").addEventListener("click", stop);
  stage.addEventListener("focusin", event => { if (!event.target.matches("[data-b-hero-play]")) stop(); });
  stage.addEventListener("keydown", event => { if (event.key !== "Tab" && !event.target.matches("[data-b-hero-play]")) stop(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  root.querySelectorAll("a, [data-web009-access]").forEach((control) => control.addEventListener("click", stop));
  reduced.addEventListener("change", () => { if (reduced.matches) stop(); });
  render(4);
  stage.dataset.playback = reduced.matches ? "reduced-motion" : "ready";
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) { if (playing) stop(); return; }
    if (!remembered(key) && !reduced.matches && !document.hidden) play();
    else if (!playing) stage.dataset.playback = reduced.matches ? "reduced-motion" : "seen";
  }, {threshold: .5});
  observer.observe(stage);
  return stop;
}

function initializeLifecycle(root, stopHero) {
  const lifecycle = root.querySelector("[data-web010-lifecycle]");
  lifecycle.classList.add("b-lifecycle");
  const rail = lifecycle.querySelector("[data-web010-step-rail]");
  const window = lifecycle.querySelector(".web010-product-window");
  window.innerHTML = `<div class="b-lifecycle-heading"><div><p class="b-kicker">EXPLORE THE LIFECYCLE</p><h4 data-b-step-title></h4></div><span data-b-pin-label>State 1 of 10</span></div><div data-b-lifecycle-mount></div><div class="b-state-facts"><div><span>Authorized by</span><strong data-web009-step-authority></strong></div><div><span>Permitted</span><strong data-web010-step-permitted></strong></div><div><span>Prohibited</span><strong data-web010-step-prohibited></strong></div></div><span class="b-visually-hidden" data-b-announcement aria-live="polite"></span>`;
  lifecycle.querySelector(".web010-lifecycle-footer").innerHTML = `<span data-web010-current-indicator>01 / 10</span><div class="b-transport"><button type="button" data-b-prev aria-label="Previous state">Previous</button><button type="button" data-b-next aria-label="Next state">Next</button><button type="button" data-b-play>Play</button><button type="button" data-b-unpin hidden>Unpin</button></div><label class="b-state-select"><span class="b-visually-hidden">All lifecycle states</span><select aria-label="All lifecycle states">${agentSteps.map((step,i)=>`<option value="${i}">${String(i+1).padStart(2,"0")} · ${step.title}</option>`).join("")}</select></label>`;
  const renderScene = createScene(window.querySelector("[data-b-lifecycle-mount]"));
  let index = 0;
  let pinned = null;
  let timer;
  let interacted = false;
  let playing = false;
  let scrollingByControl = false;
  let scrollRelease;
  let drag;
  let dragged = false;
  const key = "ipo-one-web012b-lifecycle-played";
  rail.innerHTML = agentSteps.map((step,i)=>`<li><button type="button" data-web010-step="${i}" aria-pressed="false"><span>${String(i+1).padStart(2,"0")}</span><strong>${step.title}</strong></button></li>`).join("");
  const buttons = [...rail.querySelectorAll("button")];
  const render = (next, announce = false) => {
    index = Math.max(0,Math.min(9,next));
    const step = agentSteps[index];
    lifecycle.dataset.lifecycleIndex = String(index);
    lifecycle.dataset.activeObject = step.object;
    renderScene(index);
    buttons.forEach((button,i) => {
      button.classList.toggle("active", i === index);
      button.setAttribute("aria-current", i === index ? "step" : "false");
      button.setAttribute("aria-pressed", String(i === pinned));
      button.tabIndex = i === index ? 0 : -1;
    });
    window.querySelector("[data-b-step-title]").textContent = step.title;
    window.querySelector("[data-b-pin-label]").textContent = pinned === null ? `State ${index+1} of 10` : `Pinned · ${index+1} of 10`;
    window.querySelector("[data-web009-step-authority]").textContent = step.authorizedBy;
    window.querySelector("[data-web010-step-permitted]").textContent = step.permitted;
    window.querySelector("[data-web010-step-prohibited]").textContent = step.prohibited;
    lifecycle.querySelector("[data-web010-current-indicator]").textContent = `${String(index+1).padStart(2,"0")} / 10`;
    lifecycle.querySelector("[data-b-unpin]").hidden = pinned === null;
    lifecycle.querySelector("[data-b-prev]").disabled = index === 0;
    lifecycle.querySelector("[data-b-next]").disabled = index === 9;
    lifecycle.querySelector(".b-state-select select").value = String(index);
    if (announce) window.querySelector("[data-b-announcement]").textContent = `${index+1} of 10. ${step.title}. ${states[index].result}`;
  };
  const stop = (manual = true) => {
    clearTimeout(timer);
    playing = false;
    if (manual) { interacted = true; remember(key); stopHero(); }
    lifecycle.dataset.autoplay = reduced.matches ? "reduced-motion" : "stopped";
    const control = lifecycle.querySelector("[data-b-play]");
    control.textContent = reduced.matches ? "Static mode" : "Play";
    control.disabled = reduced.matches;
    control.title = reduced.matches ? "Automatic playback is off because reduced motion is enabled. All states remain selectable." : "Play the illustrative lifecycle";
  };
  const select = (next, { pin = false, focus = false } = {}) => {
    stop();
    pinned = pin ? (pinned === next ? null : next) : null;
    render(next,true);
    if (focus) buttons[index].focus({preventScroll:true});
    if (matchMedia("(max-width: 760px)").matches) {
      scrollingByControl = true;
      clearTimeout(scrollRelease);
      const left = buttons[index].offsetLeft - buttons[0].offsetLeft;
      rail.scrollTo({left,behavior:reduced.matches?"instant":"smooth"});
      scrollRelease = setTimeout(() => { scrollingByControl = false; }, 650);
    }
  };
  buttons.forEach((button,i)=> {
    button.addEventListener("pointerenter", (event)=> { if (event.pointerType !== "mouse" || drag) return; stop(); if(pinned===null) render(i); });
    button.addEventListener("click", ()=>{if(!dragged)select(i,{pin:true});});
  });
  rail.addEventListener("pointerdown", event => {
    if (event.pointerType !== "mouse" || !matchMedia("(max-width: 760px)").matches) return;
    stop(); scrollingByControl = false; dragged = false; pinned = null;
    drag = {x: event.clientX, left: rail.scrollLeft};
  });
  rail.addEventListener("pointermove", event => {
    if (!drag) return;
    if (Math.abs(event.clientX - drag.x) > 8) {
      dragged = true;
      rail.setPointerCapture(event.pointerId);
      rail.classList.add("b-dragging");
      rail.scrollLeft = drag.left - (event.clientX - drag.x);
    }
  });
  const endDrag = () => { drag = null; rail.classList.remove("b-dragging"); };
  rail.addEventListener("pointerup", endDrag);
  rail.addEventListener("pointercancel", endDrag);
  rail.addEventListener("click", event => { if (dragged) {event.preventDefault();event.stopPropagation();dragged=false;} }, true);
  lifecycle.addEventListener("keydown", (event)=> {
    if (event.target.closest("select") || (!rail.contains(event.target) && event.target !== lifecycle)) return;
    const targets={ArrowLeft:index-1,ArrowRight:index+1,Home:0,End:9};
    if(event.key in targets) {event.preventDefault(); select(targets[event.key],{focus:true});}
    else if (event.target === lifecycle && ["Enter", " "].includes(event.key)) { event.preventDefault(); select(index,{pin:true,focus:true}); }
  });
  lifecycle.querySelector("[data-b-prev]").addEventListener("click",()=>select(index-1));
  lifecycle.querySelector("[data-b-next]").addEventListener("click",()=>select(index+1));
  lifecycle.querySelector("[data-b-unpin]").addEventListener("click",()=>select(index,{focus:true}));
  lifecycle.querySelector(".b-state-select select").addEventListener("change",event=>select(Number(event.target.value)));
  const play = () => {
    stop();
    if(reduced.matches) return;
    pinned=null; playing=true;
    lifecycle.dataset.autoplay="running";
    lifecycle.querySelector("[data-b-play]").textContent="Pause";
    if(index===9) render(0);
    const tick=()=>{if(index===9){stop(false);lifecycle.dataset.autoplay="complete";return;}render(index+1);timer=setTimeout(tick,1800);};
    timer=setTimeout(tick,1800);
  };
  lifecycle.querySelector("[data-b-play]").addEventListener("click",()=>playing?stop():play());
  lifecycle.querySelector("[data-b-evidence-toggle]").addEventListener("click",()=>stop());
  let touchOrigin;
  rail.addEventListener("touchstart",event=>{stop();scrollingByControl=false;touchOrigin=event.touches[0];},{passive:true});
  rail.addEventListener("touchmove",event=>{
    const point=event.touches[0];
    if(!touchOrigin||!point||pinned===null)return;
    const dx=Math.abs(point.clientX-touchOrigin.clientX);
    const dy=Math.abs(point.clientY-touchOrigin.clientY);
    if(dx>8&&dx>dy){pinned=null;render(index);}
  },{passive:true});
  let scrollTimer;
  rail.addEventListener("scroll",()=> {
    if(!matchMedia("(max-width: 760px)").matches || pinned!==null || playing || scrollingByControl) return;
    clearTimeout(scrollTimer);
    scrollTimer=setTimeout(()=> {
      const rect=rail.getBoundingClientRect();
      const nearest=buttons.reduce((best,button,i)=> {const distance=Math.abs(button.getBoundingClientRect().left-rect.left);return distance<best.distance?{i,distance}:best;},{i:index,distance:Infinity});
      render(nearest.i);
    },120);
  },{passive:true});
  document.addEventListener("visibilitychange",()=>{if(document.hidden)stop();});
  reduced.addEventListener("change",()=>stop(false));
  let visible = false;
  const maybePlay = () => {
    if (!visible) return;
    if(interacted || remembered(key) || reduced.matches || document.hidden) return;
    if(root.querySelector(".b-hero-stage").dataset.playback==="playing") return;
    play();
  };
  const observer=new IntersectionObserver(entries=> {
    visible = entries.some(entry=>entry.isIntersecting);
    if(!visible) {if(playing)stop(false);return;}
    maybePlay();
  },{threshold:.5});
  document.addEventListener("ipo-hero-finished", maybePlay);
  observer.observe(lifecycle);
  stop(false);
  render(0);
}

function initializeMobileMenu(root) {
  const menu=root.querySelector(".web011-mobile-nav");
  const summary=menu.querySelector("summary");
  const nav=menu.querySelector("nav");
  const close=document.createElement("button");
  close.type="button";close.textContent="Close menu";close.className="b-menu-close";nav.append(close);
  const background = [...root.children].filter(element => !element.contains(menu));
  const adjacent = [...menu.parentElement.children].filter(element => element !== menu);
  const locked = [...background, ...adjacent];
  const previous = new Map();
  menu.addEventListener("toggle", () => {
    summary.setAttribute("aria-expanded", String(menu.open));
    locked.forEach(element => {
      if (menu.open) { previous.set(element, element.inert); element.inert = true; }
      else if (previous.has(element)) { element.inert = previous.get(element); previous.delete(element); }
    });
    document.body.classList.toggle("b-menu-open", menu.open);
  });
  const finish=()=>{menu.open=false;summary.focus();};
  close.addEventListener("click",finish);
  menu.addEventListener("keydown",event=> {
    if(!menu.open)return;
    if(event.key==="Escape"){event.preventDefault();finish();}
    if(event.key==="Tab"){
      const items=[summary,...nav.querySelectorAll("a,button")];
      const current=items.indexOf(document.activeElement);
      if(event.shiftKey&&current===0){event.preventDefault();items.at(-1).focus();}
      else if(!event.shiftKey&&current===items.length-1){event.preventDefault();summary.focus();}
    }
  });
  nav.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{menu.open=false;}));
  matchMedia("(max-width: 1150px)").addEventListener("change", event => {
    if (!event.matches && menu.open) {menu.open=false;root.querySelector(".web009-brand").focus();}
  });
}

function clarifyCreditProgress(root) {
  const articles = root.querySelectorAll(".web009-before-after article");
  const terms = [
    [["Original request", "$18,000"], ["Requested term", "30 days"], ["Credit record", "Limited history"]],
    [["New Evidence", "Repayment + execution"], ["Future access", "New Decision + Offer"], ["Credit record", "Verified outcome added"]]
  ];
  articles.forEach((article, i) => article.querySelectorAll("dl > div").forEach((row, j) => {
    row.querySelector("dt").textContent = terms[i][j][0];
    row.querySelector("dd").textContent = terms[i][j][1];
  }));
  const note = document.createElement("p");
  note.className = "b-credit-note";
  note.textContent = "Illustrative record · Future terms require a new capital-provider decision. Repayment does not automatically increase a limit.";
  root.querySelector(".web009-before-after").after(note);
}

function compactSandboxNotice() {
  const banner = document.querySelector(".safety-banner");
  const items = banner.querySelector(".safety-items");
  const disclosure = document.createElement("details");
  disclosure.className = "b-sandbox-details";
  const summary = document.createElement("summary");
  summary.textContent = "Sandbox boundaries & privacy";
  disclosure.append(summary, items);
  banner.append(disclosure);
}

if (!review || review === "web-012b" || review === "web-026") {
  const root = document.querySelector("#web009PublicReview");
  document.body.classList.add("web012b-review-mode");
  initializePublicReviewSurface(root, { lifecycle: false, theme: false });
  initializeThemes();
  const stopHero=initializeHero(root);
  initializeLifecycle(root,stopHero);
  initializeMobileMenu(root);
  clarifyCreditProgress(root);
  compactSandboxNotice();
  root.querySelectorAll('a[href="/whitepaper"]').forEach(link => { link.href = "/whitepaper?founder_review=web-012b"; });
  if (new URLSearchParams(location.search).get("preview_data") === "fixture") {
    const note = document.createElement("p");
    note.className = "b-fixture-label";
    note.textContent = "Design review · Synthetic QA data · Not a live account";
    document.querySelector(".topbar").after(note);
  }
}
