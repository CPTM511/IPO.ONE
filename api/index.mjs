// Legacy process-local demonstration only. This entry point is not canonical
// product truth and is not release eligible; use api/vercel-sandbox.mjs for M1-B.
import { handleIpoOneRequest } from "../apps/api/src/server.js";

export default function handler(request, response) {
  return handleIpoOneRequest(request, response);
}
