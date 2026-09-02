const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  const filePath = path.join(PUBLIC, urlPath);

  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not Found");
    }

    const ext = path.extname(filePath).toLowerCase();

    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });

    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room, data, except = null) {
  for (const client of room) {
    if (client !== except) {
      send(client, data);
    }
  }
}

wss.on("connection", ws => {
  ws.room = null;
  ws.id = Math.random().toString(36).slice(2);

  send(ws, {
    type: "connected",
    id: ws.id
  });

  ws.on("message", raw => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      const roomId = String(msg.room || "").trim();

      if (!roomId) return;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      const room = rooms.get(roomId);

      ws.room = roomId;

      const existingUsers = [];

      for (const client of room) {
        existingUsers.push(client.id);
      }

      room.add(ws);

      send(ws, {
        type: "room-users",
        users: existingUsers
      });

      broadcast(
        room,
        {
          type: "user-joined",
          id: ws.id
        },
        ws
      );

      return;
    }

    if (!ws.room) return;

    const room = rooms.get(ws.room);

    if (!room) return;

    if (
      msg.type === "offer" ||
      msg.type === "answer" ||
      msg.type === "ice"
    ) {
      const target = [...room].find(client => client.id === msg.to);

      if (target) {
        send(target, {
          ...msg,
          from: ws.id
        });
      }

      return;
    }

    if (msg.type === "chat") {
      broadcast(room, {
        type: "chat",
        from: ws.id,
        message: String(msg.message || "").slice(0, 2000),
        time: Date.now()
      });

      return;
    }
  });

  ws.on("close", () => {
    if (!ws.room) return;

    const room = rooms.get(ws.room);

    if (!room) return;

    room.delete(ws);

    broadcast(room, {
      type: "user-left",
      id: ws.id
    });

    if (room.size === 0) {
      rooms.delete(ws.room);
    }
  });

  ws.on("error", () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }
}, 25000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Meetsy running on port ${PORT}`);
});
