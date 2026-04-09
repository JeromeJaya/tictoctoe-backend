const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    gameId: {
        type: String,
        required: true,
        unique: true
    },
    players: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        symbol: String // 'X' or 'O'
    }],
    currentBoard: {
        type: [String], // Array of board cells (null, 'X', 'O')
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
        symbol: String
    },
    moves: [{
        playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        playerSymbol: String,
        position: Number,
        timestamp: { type: Date, default: Date.now }
    }],
    boardSize: {
        type: Number,
        default: 3 // 3x3 board
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