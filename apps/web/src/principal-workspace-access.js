const RECOVERABLE_HOST_WORKSPACES = new Set(["", "borrower", "controller"]);

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
