const RECOVERABLE_HOST_WORKSPACES = new Set(["", "borrower", "controller"]);
const SERVER_WORKSPACE_NAMES = Object.freeze({
  human_borrower: "borrower",
  principal_controller: "controller"
});

export function resolveAuthenticatedWorkspaceName({
  configuredWorkspaceName,
  serverWorkspaceKind
}) {
  if (configuredWorkspaceName !== "") return configuredWorkspaceName;
  return SERVER_WORKSPACE_NAMES[serverWorkspaceKind] ?? "";
}

export function shouldRecoverAuthenticatedWorkspace({
  connected,
  currentView,
  hostWorkspaceName
}) {
  return (
    connected === true &&
    currentView !== "risk-operations" &&
    RECOVERABLE_HOST_WORKSPACES.has(hostWorkspaceName)
  );
}

export function humanWorkspaceAccess({
  connected,
  hostWorkspaceName,
  serverWorkspaceKind
}) {
  if (connected !== true || serverWorkspaceKind !== "human_borrower") {
    return false;
  }
  return hostWorkspaceName === "" || hostWorkspaceName === "borrower";
}

export function principalWorkspaceAccess({
  connected,
  hostWorkspaceName,
  serverWorkspaceKind
}) {
  if (connected !== true || serverWorkspaceKind !== "principal_controller") {
    return false;
  }
  return hostWorkspaceName === "" || hostWorkspaceName === "controller";
}
