const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const STATES = new Set(["created", "active", "partially_repaid", "fully_repaid", "delinquent", "overdue", "defaulted", "restructured", "repurchased", "written_off", "closed"]);

export function acceptObligationHistoryPage(page, subjectId) {
  const date = value => typeof value === "string" && /Z$/.test(value) && Number.isFinite(new Date(value).getTime());
  if (!page || page.schemaVersion !== "owned_obligation_history_page.v1" || page.subjectId !== subjectId ||
      page.nonAuthorizing !== true || !date(page.asOf) || !Array.isArray(page.items) || page.items.length > 25 ||
      typeof page.hasMore !== "boolean" ||
      (page.hasMore ? !/^[A-Za-z0-9_-]{1,1024}$/.test(page.nextCursor ?? "") || page.items.length === 0 : page.nextCursor !== null) ||
      page.items.some(item => !IDENTIFIER.test(item.obligationId ?? "") || !STATES.has(item.state) || !date(item.createdAt)) ||
      new Set(page.items.map(item => item.obligationId)).size !== page.items.length) {
    throw new Error("History page failed Subject and scope validation.");
  }
  return page;
}

export function createObligationHistoryBrowser({ root, searchButton, previousButton, nextButton, getContext, readPage, openRecord, formatState }) {
  const form = root.querySelector("form");
  const rows = root.querySelector("[data-history-rows]");
  const status = root.querySelector("[data-history-status]");
  const previous = previousButton;
  const next = nextButton;
  let scope;
  let owner;
  let page;
  let cursors = [undefined];
  let index = 0;
  let filters = {};
  function clear() {
    owner = null; page = null; cursors = [undefined]; index = 0; filters = {};
    root.removeAttribute("aria-busy");
    form.reset(); rows.replaceChildren();
    status.textContent = getContext()
      ? "Browse authorized records for the current Subject. Every opened record is checked again."
      : "Restore an authorized Subject in this workspace to browse history.";
    previous.disabled = true; next.disabled = true;
    searchButton.disabled = !getContext();
  }
  function synchronize() {
    const context = getContext();
    const nextScope = JSON.stringify(context);
    if (scope !== nextScope) { scope = nextScope; clear(); }
    searchButton.disabled = Boolean(owner) || !context;
  }
  async function load(targetIndex, requestedFilters = filters) {
    synchronize();
    const context = getContext();
    if (!context || owner) return;
    const token = {}; owner = token;
    const requestScope = scope;
    const current = () => owner === token && JSON.stringify(getContext()) === requestScope;
    rows.replaceChildren(); page = null;
    previous.disabled = true; next.disabled = true; searchButton.disabled = true;
    status.textContent = "Loading authorized history…";
    root.setAttribute("aria-busy", "true");
    try {
      const result = acceptObligationHistoryPage(await readPage(context, {
        subjectId: context.subjectId, limit: 25, ...requestedFilters,
        ...(cursors[targetIndex] ? { cursor: cursors[targetIndex] } : {})
      }), context.subjectId);
      if (!current()) return;
      index = targetIndex; filters = requestedFilters; page = result;
      cursors[index + 1] = result.nextCursor;
      status.textContent = result.items.length
        ? `Page ${index + 1} · ${result.items.length} authorized record${result.items.length === 1 ? "" : "s"}. ${result.hasMore ? "More records are available." : "End of these results."} Refresh the search to check for changed records. These pages do not calculate credit totals.`
        : "No authorized records match these filters. Change the filters or refresh the search.";
      for (const [position, item] of result.items.entries()) {
        const row = document.createElement("div"); row.className = "obligation-history-row";
        const button = document.createElement("button"); button.type = "button"; button.className = "secondary";
        const created = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(item.createdAt));
        button.textContent = `Open record ${index * 25 + position + 1} · ${formatState(item.state)} · ${created}`;
        button.addEventListener("click", () => { if (JSON.stringify(getContext()) === requestScope) void openRecord(item.obligationId); });
        const technical = document.createElement("details");
        const summary = document.createElement("summary"); summary.textContent = "Record reference";
        const code = document.createElement("code"); code.textContent = item.obligationId;
        technical.append(summary, code); row.append(button, technical); rows.append(row);
      }
    } catch {
      if (current()) status.textContent = "History could not be read for this workspace. Check the filters and retry the search; no previous results are shown.";
    } finally {
      if (current()) {
        owner = null; root.removeAttribute("aria-busy"); synchronize();
        previous.disabled = !page || index === 0; next.disabled = !page?.hasMore;
      }
    }
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    const values = new FormData(form);
    const createdFrom = values.get("createdFrom");
    const createdThrough = values.get("createdThrough");
    if (createdFrom && createdThrough && createdFrom > createdThrough) {
      owner = null; page = null; rows.replaceChildren(); previous.disabled = true; next.disabled = true;
      status.textContent = "The start date must be on or before the end date.";
      return;
    }
    cursors = [undefined];
    void load(0, { ...(values.get("state") ? { state: values.get("state") } : {}),
      ...(createdFrom ? { createdFrom: `${createdFrom}T00:00:00.000Z` } : {}),
      ...(createdThrough ? { createdBefore: new Date(new Date(`${createdThrough}T00:00:00.000Z`).getTime() + 86_400_000).toISOString() } : {}) });
  });
  form.addEventListener("input", () => {
    // A response for previous filters cannot replace the edited search.
    owner = null; page = null; rows.replaceChildren(); root.removeAttribute("aria-busy");
    previous.disabled = true; next.disabled = true; searchButton.disabled = !getContext();
    status.textContent = "Filters changed. Search history to load matching records.";
  });
  previous.addEventListener("click", () => void load(index - 1));
  next.addEventListener("click", () => void load(index + 1));
  return { synchronize, clear };
}
