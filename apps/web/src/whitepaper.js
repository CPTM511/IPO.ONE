const progress = document.querySelector("#readingProgress");
const content = document.querySelector("#whitepaperContent");
const tocLinks = [...document.querySelectorAll("#whitepaperToc a")];
const mobileToc = document.querySelector("#mobileToc");
const backToTop = document.querySelector(".back-to-top");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const sections = tocLinks
  .map((link) => document.getElementById(link.getAttribute("href").slice(1)))
  .filter(Boolean);

function updateProgress() {
  if (!progress || !content) return;
  const start = content.offsetTop;
  const distance = Math.max(1, content.offsetHeight - window.innerHeight);
  const ratio = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
  progress.style.width = `${ratio * 100}%`;
}

function setActiveSection(id) {
  for (const link of tocLinks) {
    const active = link.getAttribute("href") === `#${id}`;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
  if (mobileToc && [...mobileToc.options].some((option) => option.value === `#${id}`)) {
    mobileToc.value = `#${id}`;
  }
}

const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
  if (visible[0]) setActiveSection(visible[0].target.id);
}, { rootMargin: "-12% 0px -76% 0px", threshold: 0 });

for (const section of sections) sectionObserver.observe(section);

mobileToc?.addEventListener("change", () => {
  const target = document.getElementById(mobileToc.value.slice(1));
  target?.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
});

function updateBackToTop() {
  backToTop?.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.7);
}

function activateDiagramNode(node) {
  const diagram = node.closest(".protocol-diagram");
  if (!diagram) return;
  const id = node.dataset.diagramNode;
  const relationships = [...diagram.querySelectorAll("[data-diagram-edge]")];
  const related = new Set([id]);
  for (const relationship of relationships) {
    const edge = relationship.dataset.diagramEdge.split(" ");
    const matches = edge.includes(id);
    relationship.classList.toggle("is-related", matches);
    if (matches) for (const candidate of edge) related.add(candidate);
  }
  for (const candidate of diagram.querySelectorAll("[data-diagram-node]")) {
    const active = candidate === node;
    candidate.classList.toggle("is-active", active);
    candidate.classList.toggle("is-related", !active && related.has(candidate.dataset.diagramNode));
    candidate.setAttribute("aria-pressed", String(active));
  }
}

for (const node of document.querySelectorAll("[data-diagram-node]")) {
  node.addEventListener("click", () => activateDiagramNode(node));
  node.addEventListener("focus", () => activateDiagramNode(node));
}

window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("scroll", updateBackToTop, { passive: true });
window.addEventListener("resize", updateProgress, { passive: true });
const initialSection = document.getElementById(window.location.hash.slice(1));
if (initialSection && sections.includes(initialSection)) setActiveSection(initialSection.id);
updateProgress();
updateBackToTop();
