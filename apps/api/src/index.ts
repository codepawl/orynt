const server = Bun.serve({
  port: 3001,
  fetch(req) {
    return new Response("CodePawl API");
  },
});

console.log(`API server running at ${server.url}`);
