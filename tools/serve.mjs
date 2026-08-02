/* A static server for the repository root, with no dependencies, because
 * the two things worth opening in a browser both need it:
 *
 *   app/babel-phase1.html    the simulator -- and served at top level it
 *                            gets real mouse capture, which the published
 *                            artifact cannot have (see spec/technical
 *                            -specification.md and core/README.md)
 *   core/conformance.html    the GPU harness, which fetches vectors.json
 *
 * Usage:  node tools/serve.mjs [port]
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, extname, normalize, sep } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.argv[2] || 8731);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".md":   "text/plain; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".pdf":  "application/pdf",
  ".jsonl": "text/plain; charset=utf-8"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/app/babel-phase1.html";
    /* stay inside the repository: normalise, then check the prefix */
    const path = normalize(join(ROOT, rel));
    if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)){
      res.writeHead(403).end("outside the repository");
      return;
    }
    const info = await stat(path);
    if (info.isDirectory()){ res.writeHead(404).end("no directory listing"); return; }
    const body = await readFile(path);
    res.writeHead(200, {
      "content-type": TYPES[extname(path).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"          // the app is edited while it is open
    }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const at = p => `  http://127.0.0.1:${PORT}/${p}`;
  console.log(`\nserving ${ROOT}\n`);
  console.log("  the Library");
  console.log(at("app/babel-phase1.html"));
  console.log("  the GPU conformance harness");
  console.log(at("core/conformance.html"));
  console.log("\n  Click once to capture the mouse -- at top level, unlike the artifact,");
  console.log("  pointer lock is available. Q hands it back, E reads the volume you face.");
  console.log("\n  Ctrl+C to stop.\n");
});
