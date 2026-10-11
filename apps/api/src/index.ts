import { createServer } from "node:http";
import { handleRoot } from "./controllers/index.js";
import { handleRequest } from "./routes/index.js";
import { logRequest } from "./middleware/index.js";

const PORT = Number(process.env["PORT"] ?? 4000);

const server = createServer((req, res) => {
  const startedAt = Date.now();
  // Minimal CORS for the Next.js dev server.
  res.setHeader("access-control-allow-origin", process.env["WEB_ORIGIN"] ?? "http://localhost:3000");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const done = () => logRequest(req, res.statusCode, startedAt);
  res.on("finish", done);

  if (req.url === "/" && req.method === "GET") {
    void handleRoot(req, res);
    return;
  }
  void handleRequest(req, res);
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ service: "@adaptive/api", port: PORT, network: "devnet" }));
});
