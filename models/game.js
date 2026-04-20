const mongoose = require('mongoose');
console.log("📦 Loading Game model...");
const gameSchema = new mongoose.Schema({
    gameId: {
        type: String,
        required: true,
        unique: true
    },
    isMultiLevel: {
        type: Boolean,
        default: false
    },
    levels: [{
        levelNumber: Number,
        boardSize: Number,
        board: [String],
        currentPlayer: String,
        gameStatus: {
            type: String,
            enum: ['waiting', 'active', 'finished'],
            default: 'waiting'
        },
        winner: {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            username: String,
            symbol: String
        },
        moves: [{
            playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            playerSymbol: String,
            position: Number,
            timestamp: { type: Date, default: Date.now }
        }]
    }],
    currentLevel: {
        type: Number,
        default: 1
    },
    players: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        symbol: String,
        levelsWon: { type: Number, default: 0 },
        totalTimeTaken: { type: Number, default: 0 } // Time in milliseconds
    }],
    currentBoard: {
        type: [String],
        default: []
    },
    currentPlayer: {
        type: String,
        enum: ['X', 'O'],
        default: 'X'
    },
    gameStatus: {
        type: String,
        enum: ['waiting', 'active', 'finished'],
        default: 'waiting'
    },
    winner: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        symbol: String,
        isMultiLevelWinner: { type: Boolean, default: false },
        levelsWon: { type: Number, default: 0 },
        wonByTime: { type: Boolean, default: false } // True if won by faster time in draw
    },
    moves: [{
        playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        playerSymbol: String,
        position: Number,
        levelNumber: Number,
        timestamp: { type: Date, default: Date.now }
    }],
    boardSize: {
        type: Number,
        default: 3
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

const Game = mongoose.model('Game', gameSchema);

module.exports = Game;