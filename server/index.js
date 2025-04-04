import express from "express"
import http from "http"
import { Server } from "socket.io"
import cors from "cors"

const app = express()
const server = http.createServer(app)

// Configure CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  }),
)

// Add a simple route for the root path
app.get("/", (req, res) => {
  res.send({
    status: "ok",
    message: "FileBeam signaling server is running",
    timestamp: new Date().toISOString(),
  })
})

// Add a health check endpoint
app.get("/health", (req, res) => {
  res.send({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
})

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Add this to ensure WebSocket works on Render
  transports: ["websocket", "polling"],
})

// Store active rooms
const rooms = new Map()

// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log("User connected:", socket.id)

  // Join a room
  socket.on("join-room", ({ roomId, isSender }) => {
    console.log(`User ${socket.id} joining room ${roomId} as ${isSender ? "sender" : "receiver"}`)

    // Join the room
    socket.join(roomId)

    // Store room info
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { sender: null, receiver: null })
    }

    const room = rooms.get(roomId)

    if (isSender) {
      room.sender = socket.id
    } else {
      room.receiver = socket.id

      // Notify sender that receiver has joined
      if (room.sender) {
        io.to(room.sender).emit("receiver-joined")
      }
    }

    // Update room info
    rooms.set(roomId, room)
  })

  // Handle WebRTC signaling
  socket.on("offer", ({ roomId, offer }) => {
    console.log(`Received offer from ${socket.id} for room ${roomId}`)

    // Forward offer to receiver
    const room = rooms.get(roomId)
    if (room && room.receiver) {
      io.to(room.receiver).emit("offer", { offer })
    }
  })

  socket.on("answer", ({ roomId, answer }) => {
    console.log(`Received answer from ${socket.id} for room ${roomId}`)

    // Forward answer to sender
    const room = rooms.get(roomId)
    if (room && room.sender) {
      io.to(room.sender).emit("answer", { answer })
    }
  })

  socket.on("ice-candidate", ({ roomId, candidate }) => {
    console.log(`Received ICE candidate from ${socket.id} for room ${roomId}`)

    // Forward ICE candidate to the other peer
    const room = rooms.get(roomId)
    if (room) {
      const targetId = room.sender === socket.id ? room.receiver : room.sender
      if (targetId) {
        io.to(targetId).emit("ice-candidate", { candidate })
      }
    }
  })

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)

    // Clean up rooms
    for (const [roomId, room] of rooms.entries()) {
      if (room.sender === socket.id || room.receiver === socket.id) {
        // Notify the other peer
        const targetId = room.sender === socket.id ? room.receiver : room.sender
        if (targetId) {
          io.to(targetId).emit("peer-disconnected")
        }

        // Remove the room if both peers are gone
        if (room.sender === socket.id) {
          room.sender = null
        }
        if (room.receiver === socket.id) {
          room.receiver = null
        }

        if (!room.sender && !room.receiver) {
          rooms.delete(roomId)
        } else {
          rooms.set(roomId, room)
        }
      }
    }
  })
})

// Start the server
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`)
})

