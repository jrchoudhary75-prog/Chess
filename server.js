const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Body Parser Middleware
app.use(express.json());

// Serve static files from root folder
app.use(express.static(__dirname));

// Default Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Storage for online users, rooms, and active challenges
const onlineUsers = {};       // socket.id -> { socketId, userId, name, avatar, rating, inGame, roomId }
const rooms = {};             // roomId -> { p1: socketId, p2: socketId, p1Info, p2Info }
const pendingChallenges = {}; // challengeId -> { challengeId, fromSocketId, toSocketId, fromInfo, toInfo, timer }

function getPublicOnlineList() {
    return Object.values(onlineUsers).map(u => ({
        socketId: u.socketId,
        userId: u.userId,
        name: u.name,
        avatar: u.avatar || '',
        rating: u.rating || 1200,
        inGame: !!u.inGame
    }));
}

function broadcastOnlineUsers() {
    const list = getPublicOnlineList();
    io.emit('online-users-updated', list);
}

// Socket.io Connection Handler
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. User registration for search & challenge
    socket.on('register-user', (userData) => {
        if (!userData || !userData.name) return;
        onlineUsers[socket.id] = {
            socketId: socket.id,
            userId: userData.googleId || userData.userId || ('user_' + socket.id.substring(0, 6)),
            name: userData.name,
            avatar: userData.profilePic || userData.avatar || '',
            rating: userData.rating || 1200,
            inGame: false,
            roomId: null
        };
        console.log(`Registered player: ${userData.name} (${socket.id})`);
        
        // Notify the user about their registered status
        socket.emit('registered-success', onlineUsers[socket.id]);
        // Broadcast new online list to all users
        broadcastOnlineUsers();
    });

    // 2. Fetch all online players
    socket.on('get-online-players', () => {
        socket.emit('online-users-updated', getPublicOnlineList());
    });

    // 3. Search online players by name or user ID
    socket.on('search-players', (data) => {
        const query = (data && data.query ? data.query : '').trim().toLowerCase();
        const currentSender = onlineUsers[socket.id];
        const allList = Object.values(onlineUsers);
        
        const filtered = allList.filter(u => {
            if (u.socketId === socket.id) return false; // Don't include self
            if (!query) return true; // Empty query returns everyone online
            return u.name.toLowerCase().includes(query) || (u.userId && u.userId.toLowerCase().includes(query));
        }).map(u => ({
            socketId: u.socketId,
            userId: u.userId,
            name: u.name,
            avatar: u.avatar,
            rating: u.rating,
            inGame: !!u.inGame
        }));

        socket.emit('search-results', filtered);
    });

    // 4. Send Challenge / Invite to another online player
    socket.on('send-challenge', (data) => {
        const challenger = onlineUsers[socket.id];
        if (!challenger) {
            return socket.emit('challenge-error', 'Please log in or enter your nickname first!');
        }

        const targetSocketId = data.targetSocketId;
        const targetUser = onlineUsers[targetSocketId];

        if (!targetUser) {
            return socket.emit('challenge-error', 'The player is no longer online.');
        }

        if (targetUser.inGame) {
            return socket.emit('challenge-error', `${targetUser.name} is currently in a match. Try again later!`);
        }

        const challengeId = 'chal_' + Math.random().toString(36).substring(2, 9);

        // Auto-expire challenge after 30 seconds
        const timer = setTimeout(() => {
            if (pendingChallenges[challengeId]) {
                const chal = pendingChallenges[challengeId];
                io.to(chal.fromSocketId).emit('challenge-timeout', { message: `${targetUser.name} did not respond in time.` });
                io.to(chal.toSocketId).emit('challenge-expired', { challengeId });
                delete pendingChallenges[challengeId];
            }
        }, 30000);

        pendingChallenges[challengeId] = {
            challengeId,
            fromSocketId: socket.id,
            toSocketId: targetSocketId,
            fromInfo: challenger,
            toInfo: targetUser,
            timer
        };

        // Notify target player
        io.to(targetSocketId).emit('receive-challenge', {
            challengeId,
            fromSocketId: socket.id,
            fromName: challenger.name,
            fromAvatar: challenger.avatar,
            fromRating: challenger.rating
        });

        // Notify sender that invite has been dispatched
        socket.emit('challenge-sent', {
            challengeId,
            toName: targetUser.name,
            targetSocketId
        });
    });

    // 5. Respond to incoming challenge (Accept or Decline)
    socket.on('respond-challenge', (data) => {
        const { challengeId, accept } = data;
        const challenge = pendingChallenges[challengeId];
        if (!challenge) {
            return socket.emit('challenge-error', 'This challenge has already expired.');
        }

        clearTimeout(challenge.timer);
        delete pendingChallenges[challengeId];

        const challengerSocket = io.sockets.sockets.get(challenge.fromSocketId);
        const challengedSocket = io.sockets.sockets.get(challenge.toSocketId);

        if (!accept) {
            if (challengerSocket) {
                challengerSocket.emit('challenge-declined', {
                    byName: challenge.toInfo.name
                });
            }
            return;
        }

        // Check if both users are still connected
        if (!challengerSocket || !challengedSocket) {
            if (challengerSocket) challengerSocket.emit('challenge-error', 'Player disconnected.');
            if (challengedSocket) challengedSocket.emit('challenge-error', 'Challenger disconnected.');
            return;
        }

        // Create new Game Room
        const roomId = 'ROOM_' + Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = {
            p1: challenge.fromSocketId,
            p2: challenge.toSocketId,
            p1Info: challenge.fromInfo,
            p2Info: challenge.toInfo
        };

        challengerSocket.join(roomId);
        challengedSocket.join(roomId);

        // Update player status to in-game
        if (onlineUsers[challenge.fromSocketId]) {
            onlineUsers[challenge.fromSocketId].inGame = true;
            onlineUsers[challenge.fromSocketId].roomId = roomId;
        }
        if (onlineUsers[challenge.toSocketId]) {
            onlineUsers[challenge.toSocketId].inGame = true;
            onlineUsers[challenge.toSocketId].roomId = roomId;
        }

        // Challenger is White, Challenged is Black
        challengerSocket.emit('game-start', {
            roomId,
            color: 'white',
            opponent: {
                name: challenge.toInfo.name,
                avatar: challenge.toInfo.avatar,
                rating: challenge.toInfo.rating
            }
        });

        challengedSocket.emit('game-start', {
            roomId,
            color: 'black',
            opponent: {
                name: challenge.fromInfo.name,
                avatar: challenge.fromInfo.avatar,
                rating: challenge.fromInfo.rating
            }
        });

        broadcastOnlineUsers();
    });

    // 6. Cancel pending challenge by sender
    socket.on('cancel-challenge', (data) => {
        const { challengeId } = data;
        const challenge = pendingChallenges[challengeId];
        if (challenge) {
            clearTimeout(challenge.timer);
            io.to(challenge.toSocketId).emit('challenge-cancelled', { challengeId });
            delete pendingChallenges[challengeId];
        }
    });

    // 7. Create Room manually by Room Code
    socket.on('create-room', () => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = { p1: socket.id, p2: null, p1Info: onlineUsers[socket.id] || null, p2Info: null };
        socket.join(roomId);
        if (onlineUsers[socket.id]) {
            onlineUsers[socket.id].inGame = true;
            onlineUsers[socket.id].roomId = roomId;
            broadcastOnlineUsers();
        }
        socket.emit('room-created', { roomId, color: 'white' });
    });

    // 8. Join Room manually by Room Code
    socket.on('join-room', (roomId) => {
        roomId = (roomId || '').trim().toUpperCase();
        if (rooms[roomId] && !rooms[roomId].p2) {
            rooms[roomId].p2 = socket.id;
            rooms[roomId].p2Info = onlineUsers[socket.id] || null;
            socket.join(roomId);

            if (onlineUsers[socket.id]) {
                onlineUsers[socket.id].inGame = true;
                onlineUsers[socket.id].roomId = roomId;
                broadcastOnlineUsers();
            }

            const p1Info = rooms[roomId].p1Info || { name: 'Player 1', avatar: '', rating: 1200 };
            const p2Info = rooms[roomId].p2Info || { name: 'Player 2', avatar: '', rating: 1200 };

            io.to(rooms[roomId].p1).emit('game-start', {
                roomId,
                color: 'white',
                opponent: { name: p2Info.name, avatar: p2Info.avatar, rating: p2Info.rating }
            });
            socket.emit('game-start', {
                roomId,
                color: 'black',
                opponent: { name: p1Info.name, avatar: p1Info.avatar, rating: p1Info.rating }
            });
        } else {
            socket.emit('room-error', 'Room not found or already full!');
        }
    });

    // 9. Make Move in Room
    socket.on('make-move', (data) => {
        if (data && data.roomId && data.move) {
            socket.to(data.roomId).emit('opp-move', data.move);
        }
    });

    // 10. Resign Game
    socket.on('resign-game', (data) => {
        if (data && data.roomId) {
            socket.to(data.roomId).emit('opponent-resigned');
            if (rooms[data.roomId]) {
                const r = rooms[data.roomId];
                if (onlineUsers[r.p1]) onlineUsers[r.p1].inGame = false;
                if (onlineUsers[r.p2]) onlineUsers[r.p2].inGame = false;
                delete rooms[data.roomId];
                broadcastOnlineUsers();
            }
        }
    });

    // 11. Leave Game / Back to Lobby
    socket.on('leave-game', (data) => {
        if (data && data.roomId) {
            socket.leave(data.roomId);
            socket.to(data.roomId).emit('opponent-left');
            if (rooms[data.roomId]) {
                const r = rooms[data.roomId];
                if (onlineUsers[r.p1]) onlineUsers[r.p1].inGame = false;
                if (onlineUsers[r.p2]) onlineUsers[r.p2].inGame = false;
                delete rooms[data.roomId];
            }
        }
        if (onlineUsers[socket.id]) {
            onlineUsers[socket.id].inGame = false;
            onlineUsers[socket.id].roomId = null;
        }
        broadcastOnlineUsers();
    });

    // 12. Disconnect Handler
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const user = onlineUsers[socket.id];
        
        // Clean up any pending challenges involving this user
        for (let cid in pendingChallenges) {
            const chal = pendingChallenges[cid];
            if (chal.fromSocketId === socket.id) {
                clearTimeout(chal.timer);
                io.to(chal.toSocketId).emit('challenge-cancelled', { challengeId: cid });
                delete pendingChallenges[cid];
            } else if (chal.toSocketId === socket.id) {
                clearTimeout(chal.timer);
                io.to(chal.fromSocketId).emit('challenge-declined', { byName: user ? user.name : 'Opponent' });
                delete pendingChallenges[cid];
            }
        }

        // Notify room opponent if currently in a match
        if (user && user.roomId) {
            socket.to(user.roomId).emit('opponent-disconnected');
            delete rooms[user.roomId];
        }

        delete onlineUsers[socket.id];
        broadcastOnlineUsers();
    });
});

// Port Binding
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

// Optional Non-blocking MongoDB Connection
const MONGO_URI = process.env.MONGODB_URI;
let User = null;
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
      .then(() => console.log("MongoDB Connected"))
      .catch(err => console.error("MongoDB Connection Error:", err.message));

    const userSchema = new mongoose.Schema({
        googleId: String,
        name: String,
        email: String,
        profilePic: String,
        rating: { type: Number, default: 1200 },
        isOnline: { type: Boolean, default: false }
    });
    User = mongoose.model('User', userSchema);
} else {
    console.log("Info: Running in fast in-memory mode without MongoDB.");
}

// Search User API (fallback / db support)
app.get('/api/users/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        if (User) {
            const users = await User.find({ name: { $regex: query, $options: 'i' } }).limit(10);
            return res.json(users);
        }
        // Fallback to online users list if no DB
        const results = Object.values(onlineUsers).filter(u => 
            u.name.toLowerCase().includes(query.toLowerCase())
        );
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// User Sync API Route
app.post('/api/user/sync', async (req, res) => {
    try {
        const { googleId, name, email, profilePic } = req.body;
        if (User) {
            let user = await User.findOne({ googleId });
            if (!user) {
                user = await User.create({ googleId, name, email, profilePic });
            }
            return res.json(user);
        }
        res.json({ googleId, name, email, profilePic, rating: 1200 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});