import { handleIpoOneRequest } from "../apps/api/src/server.js";

export default function handler(request, response) {
  return handleIpoOneRequest(request, response);
}
