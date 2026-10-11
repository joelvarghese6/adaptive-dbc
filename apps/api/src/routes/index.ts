import type { IncomingMessage, ServerResponse } from "node:http";
import { parseLaunchId } from "@adaptive/shared";
import {
  analyzeLaunch,
  createLaunch,
  deployLaunchById,
  getLaunchStatus,
  simulateLaunch,
} from "../services/index.js";
import { getLaunchRecord, listLaunchRecords } from "../store.js";
import { readJsonBody, sendError, sendJson } from "../middleware/index.js";

/**
 * Minimal route table. Keeps the product flow; refine if a framework is
 * adopted later. Handlers delegate to services, never business logic here.
 */
export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";
  const path = url.pathname;

  try {
    if (method === "GET" && path === "/api/health")
      return sendJson(res, 200, { status: "ok", network: "devnet" });

    if (method === "GET" && path === "/api/launches")
      return sendJson(res, 200, { launches: listLaunchRecords() });

    if (method === "POST" && path === "/api/launches") {
      const body = await readJsonBody(req);
      const launch = createLaunch((body as Record<string, unknown>)["asset"] ?? body);
      return sendJson(res, 201, { launch });
    }

    const match = path.match(/^\/api\/launches\/([^/]+)(?:\/(analyze|simulate|deploy|status))?$/);
    if (match) {
      const id = parseLaunchId(decodeURIComponent(match[1]));
      const action = match[2];

      if (method === "GET" && !action) {
        const launch = getLaunchRecord(id);
        if (!launch) return sendJson(res, 404, { error: "Launch not found." });
        return sendJson(res, 200, { launch });
      }
      if (method === "POST" && action === "analyze")
        return sendJson(res, 200, { launch: analyzeLaunch(id) });
      if (method === "POST" && action === "simulate")
        return sendJson(res, 200, { launch: simulateLaunch(id) });
      if (method === "POST" && action === "deploy") {
        const body = (await readJsonBody(req)) as Record<string, unknown>;
        const launch = await deployLaunchById(id, {
          rpcUrl: typeof body["rpcUrl"] === "string" ? body["rpcUrl"] : undefined,
          quoteMint: typeof body["quoteMint"] === "string" ? body["quoteMint"] : undefined,
        });
        return sendJson(res, 200, { launch });
      }
      if (method === "GET" && action === "status") {
        const rpcUrl = url.searchParams.get("rpcUrl") ?? undefined;
        return sendJson(res, 200, { launch: await getLaunchStatus(id, rpcUrl ?? undefined) });
      }
    }

    return sendJson(res, 404, { error: "Not found." });
  } catch (err) {
    return sendError(res, err);
  }
}
