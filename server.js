const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const ROOT = __dirname;
const rooms = new Map();
const matchmakingQueue = [];
const MATCH_START_DELAY_MS = 8000;

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
    ready: {
      host: !!room.hostReady,
      guest: !!room.guestReady
    },
    startAt: Number(room.startAt || 0),
    players: {
      host: room.hostUser,
      guest: room.guestUser
    }
  };
}

function resetReady(room) {
  room.hostReady = false;
  room.guestReady = false;
  room.startAt = 0;
}

function queueSnapshot(position) {
  return {
    queued: position > 0,
    position,
    status: position > 0
      ? (position === 1 ? "Searching for another player now." : "Searching for another player. Queue position " + position + ".")
      : ""
  };
}

function broadcastRoom(io, room) {
  if (room.hostId) io.to(room.hostId).emit("room:update", snapshotFor(room, room.hostId));
  if (room.guestId) io.to(room.guestId).emit("room:update", snapshotFor(room, room.guestId));
}

function refreshMatchmakingQueue(io) {
  for (let index = matchmakingQueue.length - 1; index >= 0; index--) {
    const socketId = matchmakingQueue[index];
    const socket = io.sockets.sockets.get(socketId);
    if (!socket || !socket.connected || socket.data.roomId) {
      matchmakingQueue.splice(index, 1);
    }
  }
  matchmakingQueue.forEach((socketId, index) => {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) return;
    socket.data.matchmaking = true;
    socket.emit("matchmaking:update", queueSnapshot(index + 1));
  });
}

function removeFromMatchmaking(io, socketOrId, notify = true) {
  const socketId = typeof socketOrId === "string" ? socketOrId : socketOrId?.id;
  if (!socketId) return;
  for (let index = matchmakingQueue.length - 1; index >= 0; index--) {
    if (matchmakingQueue[index] === socketId) matchmakingQueue.splice(index, 1);
  }
  const socket = typeof socketOrId === "string" ? io.sockets.sockets.get(socketId) : socketOrId;
  if (socket) {
    socket.data.matchmaking = false;
    if (notify) socket.emit("matchmaking:update", queueSnapshot(0));
  }
  refreshMatchmakingQueue(io);
}

function nextQueuedSocket(io) {
  while (matchmakingQueue.length) {
    const socketId = matchmakingQueue.shift();
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.connected && !socket.data.roomId) {
      socket.data.matchmaking = false;
      refreshMatchmakingQueue(io);
      return socket;
    }
  }
  return null;
}

function makeRoomForHost(socket, songId) {
  const room = {
    id: makeRoomCode(),
    songId: songId || socket.data.lastSongId || "sporting",
    hostId: socket.id,
    hostUser: socket.data.user,
    guestId: null,
    guestUser: null,
    hostReady: false,
    guestReady: false,
    startAt: 0
  };
  rooms.set(room.id, room);
  socket.data.roomId = room.id;
  socket.data.role = "host";
  socket.join(room.id);
  return room;
}

function leaveRoom(io, socket) {
  removeFromMatchmaking(io, socket, false);
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
  resetReady(room);
  broadcastRoom(io, room);
}

function createGameServer({ port = Number(process.env.PORT) || 3000, host = process.env.HOST || "0.0.0.0" } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: true, credentials: true } });

  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, queue: matchmakingQueue.length });
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
    socket.data.matchmaking = false;
    socket.data.lastSongId = "sporting";
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
      const songId = payload?.songId || socket.data.lastSongId || "sporting";
      socket.data.lastSongId = songId;
      const room = makeRoomForHost(socket, songId);
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
      socket.data.lastSongId = room.songId;
      socket.join(room.id);
      resetReady(room);
      broadcastRoom(io, room);
    });

    socket.on("room:leave", () => {
      leaveRoom(io, socket);
      socket.emit("room:update", {
        roomId: "",
        role: null,
        songId: null,
        ready: { host: false, guest: false },
        startAt: 0,
        players: { host: null, guest: null }
      });
    });

    socket.on("room:set-song", payload => {
      const room = rooms.get(socket.data.roomId || "");
      if (!room || socket.data.role !== "host") return;
      room.songId = payload?.songId || room.songId;
      socket.data.lastSongId = room.songId;
      resetReady(room);
      broadcastRoom(io, room);
    });

    socket.on("matchmaking:join", payload => {
      const songId = payload?.songId || socket.data.lastSongId || "sporting";
      socket.data.lastSongId = songId;
      leaveRoom(io, socket);
      removeFromMatchmaking(io, socket, false);
      const waiting = nextQueuedSocket(io);
      if (waiting && waiting.id !== socket.id) {
        const room = makeRoomForHost(waiting, waiting.data.lastSongId || songId || "sporting");
        room.guestId = socket.id;
        room.guestUser = socket.data.user;
        socket.data.roomId = room.id;
        socket.data.role = "guest";
        socket.data.lastSongId = room.songId;
        socket.join(room.id);
        resetReady(room);
        waiting.emit("matchmaking:update", { queued: false, position: 0, status: "Match found. Ready up when you load in." });
        socket.emit("matchmaking:update", { queued: false, position: 0, status: "Match found. Ready up when you load in." });
        broadcastRoom(io, room);
        return;
      }
      matchmakingQueue.push(socket.id);
      socket.data.matchmaking = true;
      refreshMatchmakingQueue(io);
    });

    socket.on("matchmaking:leave", () => {
      removeFromMatchmaking(io, socket, true);
    });

    socket.on("game:ready", payload => {
      const room = rooms.get(socket.data.roomId || "");
      if (!room || (socket.data.role !== "host" && socket.data.role !== "guest")) return;
      if (!room.hostId || !room.guestId) {
        socket.emit("room:error", { message: "A second player has to join before you can start." });
        return;
      }
      if (socket.data.role === "host" && payload?.songId) {
        room.songId = payload.songId;
        socket.data.lastSongId = room.songId;
      }
      if (socket.data.role === "host") room.hostReady = !!payload?.ready;
      if (socket.data.role === "guest") room.guestReady = !!payload?.ready;
      room.startAt = 0;
      if (room.hostReady && room.guestReady) {
        const startAt = Date.now() + MATCH_START_DELAY_MS;
        resetReady(room);
        room.startAt = startAt;
        io.to(room.id).emit("game:start", {
          roomId: room.id,
          songId: room.songId,
          startAt,
          delayMs: MATCH_START_DELAY_MS
        });
      }
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
      removeFromMatchmaking(io, socket, false);
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
