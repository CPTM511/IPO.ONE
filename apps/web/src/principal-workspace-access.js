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
