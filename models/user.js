const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    profile: {
        rank: String,
        rankPoints: { type: Number, default: 1000 }, // Starting ELO-like rating
        avatar: String,
        status: {
            type: String,
            enum: ['online', 'offline'],
            default: 'offline'
        }
    },
    stats: {
        gamesPlayed: { type: Number, default: 0 },
        gamesWon: { type: Number, default: 0 },
        winRate: { type: String, default: '0%' }
    },
    achievements: [{
        icon: String,
        name: String,
        unlocked: { type: Boolean, default: false }
    }],
    gameHistory: [{
        result: { type: String, enum: ['won', 'lost', 'draw'] },
        opponent: String,
        date: String,
        replayId: String
    }],
    friends: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', userSchema);

module.exports = User;