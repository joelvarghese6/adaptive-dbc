import type { IncomingMessage, ServerResponse } from "node:http";
import { toErrorPayload } from "@adaptive/shared";

/** Read and parse a JSON body. Empty bodies yield {}. */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const err = new Error("Request body must be valid JSON.");
    (err as NodeJS.ErrnoException).code = "BAD_JSON";
    throw err;
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function sendError(res: ServerResponse, err: unknown): void {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code === "NOT_FOUND") return sendJson(res, 404, { error: "Not found." });
  if (code === "BAD_JSON") return sendJson(res, 400, { error: "Request body must be valid JSON." });
  const { code: errorCode, message } = toErrorPayload(err);
  const status =
    errorCode === "VALIDATION_ERROR"
      ? 400
      : errorCode === "WALLET_ERROR"
        ? 400
        : errorCode === "RPC_ERROR"
          ? 502
          : 500;
  sendJson(res, status, { error: message, code: errorCode });
}

export function logRequest(req: IncomingMessage, status: number, startedAt: number): void {
  const ms = Date.now() - startedAt;
  console.log(JSON.stringify({ method: req.method, url: req.url, status, ms }));
}
