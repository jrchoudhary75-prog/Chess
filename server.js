const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.io with CORS enabled for production hosting
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Static files (HTML, CSS, JS, Images, Stockfish) serve karne ke liye
app.use(express.static(__dirname));

// Default Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.io Multiplayer Connection Logic
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. Create Room
    socket.on('create-room', () => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        socket.join(roomId);
        socket.emit('room-created', { roomId: roomId, color: 'white' });
        console.log(`Room Created: ${roomId}`);
    });

    // 2. Join Room
    socket.on('join-room', (roomId) => {
        const room = io.sockets.adapter.rooms.get(roomId);
        
        if (room && room.size === 1) {
            socket.join(roomId);
            socket.to(roomId).emit('game-start', { roomId: roomId, color: 'white' });
            socket.emit('game-start', { roomId: roomId, color: 'black' });
            console.log(`User ${socket.id} joined room: ${roomId}`);
        } else if (room && room.size >= 2) {
            socket.emit('room-error', 'Room is already full!');
        } else {
            socket.emit('room-error', 'Invalid Room Code! Make sure Host created it first.');
        }
    });

    // 3. Move Synchronization
    socket.on('make-move', (data) => {
        socket.to(data.roomId).emit('opp-move', data.move);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Render dwara assigned dynamic PORT ya default 5000
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Chess Server running on port ${PORT}`);
});