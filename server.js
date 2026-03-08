const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const ROOT = __dirname;
const rooms = new Map();

function makePlayerName() {
  return "Player " + Math.floor(1000 + Math.random() * 9000);
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function snapshotFor(room, socketId) {
  const role = room.hostId === socketId ? "host" : room.guestId === socketId ? "guest" : null;
  return {
    roomId: room.id,
    role,
    songId: room.songId,
    players: {
      host: room.hostUser,
      guest: room.guestUser
    }
  };
}

function broadcastRoom(io, room) {
  if (room.hostId) io.to(room.hostId).emit("room:update", snapshotFor(room, room.hostId));
  if (room.guestId) io.to(room.guestId).emit("room:update", snapshotFor(room, room.guestId));
}

function leaveRoom(io, socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  socket.leave(roomId);
  socket.data.roomId = null;
  socket.data.role = null;
  if (!room) return;
  if (room.hostId === socket.id) {
    room.hostId = room.guestId || null;
    room.hostUser = room.guestUser || null;
    room.guestId = null;
    room.guestUser = null;
    if (room.hostId) {
      const promoted = io.sockets.sockets.get(room.hostId);
      if (promoted) promoted.data.role = "host";
    }
  } else if (room.guestId === socket.id) {
    room.guestId = null;
    room.guestUser = null;
  }
  if (!room.hostId && !room.guestId) {
    rooms.delete(roomId);
    return;
  }
  broadcastRoom(io, room);
}

function createGameServer({ port = Number(process.env.PORT) || 3000, host = process.env.HOST || "0.0.0.0" } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: true, credentials: true } });

  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.use("/assets", express.static(path.join(ROOT, "assets")));
  app.use("/dist", express.static(path.join(ROOT, "dist")));
  app.use(express.static(ROOT));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(ROOT, "downloads.html"));
  });

  app.get("/play", (_req, res) => {
    res.sendFile(path.join(ROOT, "FNF - Online.html"));
  });

  io.on("connection", socket => {
    socket.data.user = { id: socket.id, username: makePlayerName() };
    socket.data.roomId = null;
    socket.data.role = null;
    socket.emit("session:ready", { user: socket.data.user });

    socket.on("session:set-name", payload => {
      const name = String(payload?.username || "").trim().slice(0, 18);
      if (!name) return;
      socket.data.user = { ...socket.data.user, username: name };
      const room = rooms.get(socket.data.roomId || "");
      if (!room) return;
      if (room.hostId === socket.id) room.hostUser = socket.data.user;
      if (room.guestId === socket.id) room.guestUser = socket.data.user;
      broadcastRoom(io, room);
    });

    socket.on("room:host", payload => {
      leaveRoom(io, socket);
      const room = {
        id: makeRoomCode(),
        songId: payload?.songId || "sporting",
        hostId: socket.id,
        hostUser: socket.data.user,
        guestId: null,
        guestUser: null
      };
      rooms.set(room.id, room);
      socket.data.roomId = room.id;
      socket.data.role = "host";
      socket.join(room.id);
      broadcastRoom(io, room);
    });

    socket.on("room:join", payload => {
      const roomId = String(payload?.roomId || "").trim().toUpperCase();
      const room = rooms.get(roomId);
      if (!room) {
        socket.emit("room:error", { message: "Room not found." });
        return;
      }
      if (room.guestId && room.guestId !== socket.id) {
        socket.emit("room:error", { message: "Room is already full." });
        return;
      }
      leaveRoom(io, socket);
      room.guestId = socket.id;
      room.guestUser = socket.data.user;
      socket.data.roomId = room.id;
      socket.data.role = "guest";
      socket.join(room.id);
      broadcastRoom(io, room);
    });

    socket.on("room:leave", () => {
      leaveRoom(io, socket);
      socket.emit("room:update", { roomId: "", role: null, songId: null, players: { host: null, guest: null } });
    });

    socket.on("room:set-song", payload => {
      const room = rooms.get(socket.data.roomId || "");
      if (!room || socket.data.role !== "host") return;
      room.songId = payload?.songId || room.songId;
      broadcastRoom(io, room);
    });

    socket.on("game:start", payload => {
      const room = rooms.get(socket.data.roomId || "");
      if (!room || socket.data.role !== "host") return;
      if (!room.hostId || !room.guestId) {
        socket.emit("room:error", { message: "A second player has to join before you can start." });
        return;
      }
      room.songId = payload?.songId || room.songId;
      const startAt = Date.now() + 3000;
      io.to(room.id).emit("game:start", { roomId: room.id, songId: room.songId, startAt });
      broadcastRoom(io, room);
    });

    socket.on("game:judgment", payload => {
      const room = rooms.get(socket.data.roomId || "");
      if (!room) return;
      socket.to(room.id).emit("game:judgment", payload);
    });

    socket.on("game:dodge", payload => {
      const room = rooms.get(socket.data.roomId || "");
      if (!room) return;
      socket.to(room.id).emit("game:dodge", payload);
    });

    socket.on("disconnect", () => {
      leaveRoom(io, socket);
    });
  });

  return new Promise(resolve => {
    server.listen(port, host, () => {
      resolve({ app, server, io, port: server.address().port, host });
    });
  });
}

module.exports = { createGameServer };

if (require.main === module) {
  createGameServer().then(({ port, host }) => {
    console.log("FNF online server running at http://" + (host === "0.0.0.0" ? "localhost" : host) + ":" + port);
  });
}
