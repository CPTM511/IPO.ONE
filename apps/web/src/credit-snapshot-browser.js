const FAILURE_STATES = {
  credit_state_projection_incomplete: ["Awaiting complete refresh", "Terminal records are awaiting a complete history refresh. The hosted worker runs every 15 minutes; a backlog or failed run can take longer. Retry this read after the refresh."],
  credit_state_resource_limit: ["Refresh blocked", "The complete history exceeds the refresh byte budget. No partial credit totals are shown. Operations must resolve the resource limit before this record can be read."],
  credit_state_no_finalized_outcomes: ["No finalized outcomes", "This Subject has no finalized credit outcomes yet. An empty history does not imply positive repayment performance."],
  tenant_resource_unavailable: ["Record unavailable", "This record is unavailable to the signed-in workspace. Restore the current Subject before retrying."],
  authorization_denied: ["Record unavailable", "This record is unavailable to the signed-in workspace. Restore the current Subject before retrying."]
};

function timestamp(value) {
  return typeof value === "string" && /Z$/.test(value) && Number.isFinite(new Date(value).getTime());
}

export function acceptCreditSnapshot(view, subjectId) {
  const p = view?.creditState;
  if (view?.schemaVersion !== "tenant_owned_credit_state_view.v1" || !timestamp(view.asOf) ||
      !p || p.subjectId !== subjectId || p.schemaVersion !== "credit_state_projection.v1" ||
      !/^0x[0-9a-f]{64}$/.test(p.creditStateHash ?? "") || !timestamp(p.updatedAt) ||
      new Date(p.updatedAt) > new Date(view.asOf) ||
      (view.lastRefreshAttemptAt != null && (!timestamp(view.lastRefreshAttemptAt) || new Date(view.lastRefreshAttemptAt) > new Date(view.asOf))) ||
      !Number.isSafeInteger(p.metrics?.completedCycleCount) || p.metrics.completedCycleCount < 1 ||
      !Array.isArray(p.trackRecord) || p.trackRecord.length !== p.metrics.completedCycleCount ||
      !p.latestOutcome || !p.factors ||
      ["authorizing", "automaticLimitChange", "fundsAuthority", "piiIncluded", "productionAuthority", "productionFundsMoved", "rawTransactionDataIncluded", "scoreAuthoritative"].some(key => p[key] !== false) ||
      p.sandboxOnly !== true) throw new Error("Credit snapshot failed Subject, time or completeness validation.");
  return view;
}

export function creditSnapshotPresentation(state, formatState = value => value) {
  if (state.error) {
    const [label, copy] = FAILURE_STATES[state.errorCode] ?? ["Read failed", "The verified Credit Track Record could not be read. Retry the read; no economic action is repeated."];
    return { label, title: label, copy };
  }
  if (state.busy) return { label: "Updating snapshot", title: "Checking complete credit history", copy: "The previous snapshot is cleared while this read checks complete server history. The hosted worker runs every 15 minutes; this view does not update automatically." };
  if (!state.projection) return { label: "Not loaded", title: "No credit snapshot loaded", copy: "Restore an owned Subject and load its outcome-derived Credit State. No positive history is inferred from an empty browser state. The hosted worker runs every 15 minutes." };
  const p = state.projection;
  const formatDate = value => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long", timeZone: "UTC" }).format(new Date(value));
  return { label: `Verified snapshot · v${p.projectionVersion}`, title: `${p.metrics.completedCycleCount} completed credit cycle${p.metrics.completedCycleCount === 1 ? "" : "s"}`,
    copy: `Snapshot as of ${formatDate(state.asOf)}. ${formatState(p.latestOutcome.outcomeLabel)} is the latest terminal Credit Outcome in this snapshot. ` +
      (state.lastRefreshAttemptAt ? `Last successful worker attempt: ${formatDate(state.lastRefreshAttemptAt)}. ` : "Last worker attempt time is unavailable. ") +
      "The hosted materializer runs every 15 minutes; backlogs or failures can delay updates. Reload the verified record to check for newer outcomes; this view does not update automatically. It does not authorize funds or an automatic limit change." };
}

export function createCreditSnapshotLoader({ state, getContext, read, render, notify, onAuthenticationError }) {
  let owner;
  let scope;
  function synchronize() {
    const next = JSON.stringify(getContext());
    if (scope !== next) {
      scope = next;
      owner = null;
      Object.assign(state, { busy: false, queried: false, subjectId: null, projection: null, asOf: null,
        lastRefreshAttemptAt: null, error: false, errorCode: null });
    }
  }
  async function load() {
    synchronize();
    const context = getContext();
    if (!context) return;
    const token = {};
    owner = token;
    const requestScope = scope;
    const current = () => owner === token && JSON.stringify(getContext()) === requestScope;
    Object.assign(state, { busy: true, projection: null, asOf: null, lastRefreshAttemptAt: null, error: false, errorCode: null });
    render();
    try {
      const view = acceptCreditSnapshot(await read(context.subjectId), context.subjectId);
      if (!current()) return;
      Object.assign(state, { queried: true, subjectId: context.subjectId, projection: view.creditState,
        asOf: view.asOf, lastRefreshAttemptAt: view.lastRefreshAttemptAt ?? null });
      notify("Verified Credit Track Record snapshot loaded");
    } catch (error) {
      if (!current()) return;
      Object.assign(state, { projection: null, asOf: null, error: true, errorCode: error?.code ?? "read_failed" });
      notify(creditSnapshotPresentation(state).copy, true);
      onAuthenticationError(error);
    } finally {
      if (current()) { state.busy = false; owner = null; render(); }
    }
  }
  return { load, synchronize };
}
