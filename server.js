const express = require('express');
const mongoose = require('mongoose');
const app = express();

// Body Parser Middleware
app.use(express.json());
app.use(express.static(__dirname));

// 1. Port Binding (Server ko pehle start karein taaki Render timeout na ho)
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

// 2. Non-blocking MongoDB Connection
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
        const users = await User.find({ name: { $regex: query, $options: 'i' } }).limit(10);
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