const express = require('express');
const mongoose = require('mongoose');
const app = express();

// Body Parser Middleware (ज़रूरी)
app.use(express.json());
app.use(express.static(__dirname));

// MongoDB Connection
const MONGO_URI = process.env.MONGODB_URI || "YOUR_MONGODB_CONNECTION_STRING";
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Error:", err));

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