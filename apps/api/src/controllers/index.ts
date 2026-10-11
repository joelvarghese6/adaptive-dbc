import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../middleware/index.js";
import { handleRequest } from "../routes/index.js";
import { listLaunchRecords } from "../store.js";

/** Thin controller layer for operations not bound to a single launch. */
export async function handleRoot(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, {
    service: "@adaptive/api",
    routes: [
      "POST /api/launches",
      "GET /api/launches",
      "GET /api/launches/:id",
      "POST /api/launches/:id/analyze",
      "POST /api/launches/:id/simulate",
      "POST /api/launches/:id/deploy",
      "GET /api/launches/:id/status",
    ],
    launches: listLaunchRecords().length,
  });
}

export { handleRequest };
