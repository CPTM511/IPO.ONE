const progress = document.querySelector("#readingProgress");
const content = document.querySelector("#whitepaperContent");
const tocLinks = [...document.querySelectorAll("#whitepaperToc a")];
const mobileToc = document.querySelector("#mobileToc");
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
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
});

window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("resize", updateProgress, { passive: true });
updateProgress();
