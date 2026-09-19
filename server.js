const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Body Parser Middleware
app.use(express.json());

// Sabhi static files ko root folder se allow karega
app.use(express.static(__dirname));

// Default Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

socket.emit('register-user', myUserId);

const connectedUsers = {}; // { userId: socket.id }

io.on('connection', (socket) => {
    // User registration
    socket.on('register-user', (userId) => {
        connectedUsers[userId] = socket.id;
    });

    // Friend search request
    socket.on('search-user', (searchId) => {
        if (connectedUsers[searchId]) {
            socket.emit('user-found', { userId: searchId, status: 'Online' });
        } else {
            socket.emit('user-not-found');
        }
    });

    // Jab user disconnect ho jaye
    socket.on('disconnect', () => {
        for (let id in connectedUsers) {
            if (connectedUsers[id] === socket.id) {
                delete connectedUsers[id];
                break;
            }
        }
    });
});

// Socket.io Real-time Multiplayer Logic
const rooms = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('create-room', () => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = { p1: socket.id, p2: null };
        socket.join(roomId);
        socket.emit('room-created', { roomId, color: 'white' });
    });

    socket.on('join-room', (roomId) => {
        roomId = roomId.toUpperCase();
        if (rooms[roomId] && !rooms[roomId].p2) {
            rooms[roomId].p2 = socket.id;
            socket.join(roomId);
            io.to(rooms[roomId].p1).emit('game-start', { roomId, color: 'white' });
            socket.emit('game-start', { roomId, color: 'black' });
        } else {
            socket.emit('room-error', 'Room not found or already full!');
        }
    });
    // Server.js mein
socket.on('send-challenge', (data) => {
    let targetSocketId = connectedUsers[data.friendId];
    if (targetSocketId) {
        // Sirf ushi specific friend ko challenge bhejein
        io.to(targetSocketId).emit('receive-challenge', {
            fromUserId: data.myId,
            roomId: data.roomId // agar room pehle se banaya hai
        });
    }
});

    socket.on('make-move', (data) => {
        socket.to(data.roomId).emit('opp-move', data.move);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Port Binding (Using server.listen instead of app.listen for Socket.io)
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

// Non-blocking MongoDB Connection
const MONGO_URI = process.env.MONGODB_URI;
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
      .then(() => console.log("MongoDB Connected"))
      .catch(err => console.error("MongoDB Connection Error:", err.message));
} else {
    console.log("Warning: MONGODB_URI environment variable is missing.");
}
 
// User Schema
const userSchema = new mongoose.Schema({
    googleId: String,
    name: String,
    email: String,
    profilePic: String,
    rating: { type: Number, default: 1200 },
    isOnline: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

// Search User API
app.get('/api/users/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const users = await User.find({ name: { $regex: query,$options: 'i' } }).limit(10);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// User Sync API Route
app.post('/api/user/sync', async (req, res) => {
    try {
        const { googleId, name, email, profilePic } = req.body;
        let user = await User.findOne({ googleId });
        if (!user) {
            user = await User.create({ googleId, name, email, profilePic });
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Server.js mein
const connectedUsers = {}; // { userId: socket.id }

io.on('connection', (socket) => {
    // Jab user login ya connect ho apni ID ke sath
    socket.on('register-user', (userId) => {
        connectedUsers[userId] = socket.id;
    });

    // Search user event
    socket.on('search-user', (queryId) => {
        if (connectedUsers[queryId]) {
            socket.emit('user-found', { userId: queryId, status: 'Online' });
        } else {
            socket.emit('user-not-found');
        }
    });
});