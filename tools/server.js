// 별도 설치 없이 Node.js 기본 기능만 사용하는 로컬 확인용 서버입니다.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

const server = http.createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    const url = new URL(request.url, "http://localhost:8080");
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    const relative = path.relative(root, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !types[path.extname(file)]) {
      response.writeHead(403); response.end("Forbidden"); return;
    }
    const contents = await fs.readFile(file);
    response.writeHead(200, { "Content-Type": types[path.extname(file)] + "; charset=utf-8", "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch {
    response.writeHead(404); response.end("Not found");
  }
});
server.on("error", error => {
  console.error(error.code === "EADDRINUSE" ? "Port 8080 is in use. Close the previous server or open http://localhost:8080." : error.message);
  process.exitCode = 1;
});
server.listen(8080, "127.0.0.1", () => console.log("Open http://localhost:8080 in your browser. Stop: Ctrl+C"));
