const http = require("node:http");

const port = Number(process.env.PORT || 18787);
const pid = process.pid;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end(`ok ${pid}\n`);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`listening:${port}:pid:${pid}`);
});

setInterval(() => {
  console.log(`tick:${pid}`);
}, 1000);

function shutdown(signal) {
  console.log(`${signal}:${pid}`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("sigint"));
process.on("SIGTERM", () => shutdown("sigterm"));
