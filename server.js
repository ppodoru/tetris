import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');

const PORT = 3001;
const io = new Server(PORT, {
  cors: {
    origin: "*",
  }
});

// Track rooms: roomCode -> { players: [{ id, name }], started: bool }
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getAvailableRooms() {
  const list = [];
  for (const [code, data] of rooms) {
    if (!data.started && data.players.length === 1) {
      list.push({ code, hostName: data.players[0].name });
    }
  }
  return list;
}

function broadcastRoomList() {
  io.emit('room_list', getAvailableRooms());
}

// --- Leaderboard ---
function loadLeaderboard() {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load leaderboard:', e);
  }
  return {};
}

function saveLeaderboard(data) {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2));
}

let leaderboard = loadLeaderboard(); // { playerName: { wins, losses } }
const resultRecordedRooms = new Set(); // rooms whose result has already been saved

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // Create a new room
  socket.on("create_room", ({ name }) => {
    let code = generateRoomCode();
    // Ensure uniqueness
    while (rooms.has(code)) {
      code = generateRoomCode();
    }

    rooms.set(code, {
      players: [{ id: socket.id, name: name || 'Player 1' }],
      started: false
    });

    socket.join(code);
    socket.emit("room_created", { room: code });
    broadcastRoomList();
    console.log(`Room ${code} created by ${name} (${socket.id})`);
  });

  // Join an existing room
  socket.on("join_room", ({ name, room }) => {
    const roomCode = room.toUpperCase();
    const roomData = rooms.get(roomCode);

    if (!roomData) {
      socket.emit("join_error", { message: "Room not found" });
      return;
    }

    if (roomData.players.length >= 2) {
      socket.emit("join_error", { message: "Room is full" });
      return;
    }

    if (roomData.started) {
      socket.emit("join_error", { message: "Game already in progress" });
      return;
    }

    roomData.players.push({ id: socket.id, name: name || 'Player 2' });
    socket.join(roomCode);

    // Notify both players with each other's names
    const [host, guest] = roomData.players;
    
    io.to(host.id).emit("game_start", { 
      room: roomCode, 
      opponentName: guest.name 
    });
    io.to(guest.id).emit("game_start", { 
      room: roomCode, 
      opponentName: host.name 
    });

    roomData.started = true;
    resultRecordedRooms.delete(roomCode);
    broadcastRoomList();
    console.log(`Room ${roomCode}: ${guest.name} joined. Game starting!`);
  });

  // List available rooms
  socket.on("list_rooms", () => {
    socket.emit("room_list", getAvailableRooms());
  });

  // Relay game actions
  socket.on("game_action", (data) => {
    if (data.room) {
      if (data.type === 'restart') {
        resultRecordedRooms.delete(data.room);
        console.log(`Leaderboard record guard cleared for room ${data.room} due to restart`);
      }
      socket.to(data.room).emit("opponent_action", data);
    }
  });

  // Report game result
  socket.on("game_result", ({ winner, loser, room }) => {
    if (room) {
      if (resultRecordedRooms.has(room)) {
        console.log(`Duplicate game_result ignored for room ${room}`);
        return;
      }
      resultRecordedRooms.add(room);
    }

    leaderboard = loadLeaderboard(); // Always reload from disk before updating
    if (winner) {
      if (!leaderboard[winner]) leaderboard[winner] = { wins: 0, losses: 0 };
      leaderboard[winner].wins++;
    }
    if (loser) {
      if (!leaderboard[loser]) leaderboard[loser] = { wins: 0, losses: 0 };
      leaderboard[loser].losses++;
    }
    saveLeaderboard(leaderboard);
    console.log(`Result: ${winner} beat ${loser} (room: ${room})`);
    
    // Broadcast the game result to everyone in the room
    if (room) {
      io.to(room).emit("game_over", { winner, loser });
    }
  });

  // Get leaderboard
  socket.on("get_leaderboard", () => {
    leaderboard = loadLeaderboard(); // Always reload from disk before sending
    const sorted = Object.entries(leaderboard)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    socket.emit("leaderboard_data", sorted);
  });

  // Handle disconnecting (before rooms are cleared)
  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (room !== socket.id && rooms.has(room)) {
        socket.to(room).emit("opponent_disconnected");
        rooms.delete(room);
        broadcastRoomList();
        console.log(`Room ${room} closed (player disconnected)`);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
  });

  // Leave room explicitly
  socket.on("leave_room", (room) => {
    socket.to(room).emit("opponent_disconnected");
    socket.leave(room);
    rooms.delete(room);
    broadcastRoomList();
    console.log(`Room ${room} closed (player left)`);
  });
});

console.log(`Socket.IO matchmaker server running on port ${PORT}`);
