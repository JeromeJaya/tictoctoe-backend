const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const url = require('url');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const ATLAS_URI = process.env.MONGODB_URI;
const LOCAL_URI = process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/tictactoe';
const frontendDir = path.join(__dirname, '..', 'frontend');

async function connectToMongo() {
    const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
    };

    if (ATLAS_URI) {
        try {
            await mongoose.connect(ATLAS_URI, options);
            console.log('✅ Connected to MongoDB Atlas');
            return;
        } catch (err) {
            console.error('❌ MongoDB Atlas connection error:', err);
            console.log('➡️ Attempting local MongoDB fallback...');
        }
    }

    try {
        await mongoose.connect(LOCAL_URI, options);
        console.log('✅ Connected to local MongoDB');
    } catch (err) {
        console.error('❌ Local MongoDB connection error:', err);
        console.error('Please start a local MongoDB server, or set MONGODB_URI / LOCAL_MONGODB_URI to a valid MongoDB connection string.');
    }
}

connectToMongo();

mongoose.connection.on('error', err => {
    console.error('❌ MongoDB connection error:', err);
});

// User Schema
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

// Game Schema for multiplayer games
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

// Helper function to parse request body
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

// Helper function to send JSON response
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

// Helper function to serve static HTML files
function serveFile(res, filePath, contentType) {
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content, 'utf-8');
        }
    });
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        sendJSON(res, 200, { message: 'OK' });
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    try {
        // Serve Login Page (Root)
        if (pathname === '/' && req.method === 'GET') {
            const filePath = path.join(frontendDir, 'index.html');
            return serveFile(res, filePath, 'text/html');
        }

        // Favicon request
        else if (pathname === '/favicon.ico' && req.method === 'GET') {
            res.writeHead(204, {
                'Content-Type': 'image/x-icon',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end();
        }

        // Serve Dashboard Page
        else if (pathname === '/dashboard' && req.method === 'GET') {
            const filePath = path.join(frontendDir, 'dashboard.html');
            return serveFile(res, filePath, 'text/html');
        }

        // Serve other HTML files
        else if (pathname.endsWith('.html') && req.method === 'GET') {
            const filePath = path.join(frontendDir, pathname);
            return serveFile(res, filePath, 'text/html');
        }

        // Get User Profile Endpoint
        else if (pathname === '/api/user' && req.method === 'GET') {
            const query = url.parse(req.url, true).query;
            const userId = query.userId;

            if (!userId) {
                return sendJSON(res, 400, { error: 'User ID is required' });
            }

            try {
                const user = await User.findById(userId).select('-password');
                if (!user) {
                    return sendJSON(res, 404, { error: 'User not found' });
                }
                return sendJSON(res, 200, { user });
            } catch (error) {
                return sendJSON(res, 500, { error: 'Server error' });
            }
        }

        // Get Friends List Endpoint
        else if (pathname === '/api/friends' && req.method === 'GET') {
            const query = url.parse(req.url, true).query;
            const userId = query.userId;

            if (!userId) {
                return sendJSON(res, 400, { error: 'User ID is required' });
            }

            try {
                const user = await User.findById(userId);
                if (!user) {
                    return sendJSON(res, 404, { error: 'User not found' });
                }
                
                // Ensure friends field exists and is an array
                const friendsList = user.friends || [];
                
                // Manually populate friends to handle missing references
                const populatedFriends = [];
                
                for (const friendRef of friendsList) {
                    try {
                        const friendUser = await User.findById(friendRef.userId).select('-password');
                        if (friendUser) {
                            populatedFriends.push({
                                userId: friendUser,
                                username: friendUser.username
                            });
                        }
                    } catch (err) {
                        console.error('Error populating friend:', err.message);
                        // Skip invalid references
                    }
                }
                
                return sendJSON(res, 200, { friends: populatedFriends });
            } catch (error) {
                console.error('Error fetching friends:', error);
                return sendJSON(res, 500, { error: 'Server error: ' + error.message });
            }
        }

        // Get All Users Endpoint (for testing)
        else if (pathname === '/api/users' && req.method === 'GET') {
            try {
                const users = await User.find().select('-password').limit(50);
                return sendJSON(res, 200, { users });
            } catch (error) {
                return sendJSON(res, 500, { error: 'Server error' });
            }
        }

        // Add Friend Endpoint
        else if (pathname === '/api/add-friend' && req.method === 'POST') {
            const body = await parseBody(req);
            const { userId, friendId } = body;

            if (!userId || !friendId) {
                return sendJSON(res, 400, { error: 'User ID and Friend ID are required' });
            }

            try {
                // Check if trying to add self
                if (userId === friendId) {
                    return sendJSON(res, 400, { error: 'Cannot add yourself as a friend' });
                }

                // Get current user
                const user = await User.findById(userId);
                if (!user) {
                    return sendJSON(res, 404, { error: 'User not found' });
                }

                // Get friend user
                const friend = await User.findById(friendId);
                if (!friend) {
                    return sendJSON(res, 404, { error: 'Friend not found' });
                }

                // Check if already friends
                const alreadyFriends = user.friends.some(f => f.userId.toString() === friendId);
                if (alreadyFriends) {
                    return sendJSON(res, 400, { error: 'Already friends with this user' });
                }

                // Add friend to user's list
                user.friends.push({
                    userId: friendId,
                    username: friend.username
                });

                // Also add user to friend's list (mutual friendship)
                friend.friends.push({
                    userId: userId,
                    username: user.username
                });

                await user.save();
                await friend.save();

                return sendJSON(res, 200, { 
                    message: 'Friend added successfully',
                    friend: {
                        userId: friend._id,
                        username: friend.username
                    }
                });
            } catch (error) {
                console.error('Error adding friend:', error);
                return sendJSON(res, 500, { error: 'Server error' });
            }
        }

        // Register Endpoint
        else if (pathname === '/register' && req.method === 'POST') {
            const body = await parseBody(req);
            const { username, password } = body;

            // Validate input
            if (!username || !password) {
                return sendJSON(res, 400, { error: 'Please provide username and password' });
            }

            // Check if user already exists
            const existingUser = await User.findOne({ username });
            if (existingUser) {
                return sendJSON(res, 400, { error: 'Username already exists' });
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Create new user
            const newUser = new User({
                username,
                password: hashedPassword
            });

            await newUser.save();

            return sendJSON(res, 201, { 
                message: 'User registered successfully',
                userId: newUser._id 
            });
        }

        // Login Endpoint
        else if (pathname === '/login' && req.method === 'POST') {
            console.log('Login request received');
            const body = await parseBody(req);
            console.log('Login body parsed:', body);
            const { username, password } = body;

            // Validate input
            if (!username || !password) {
                console.log('Login validation failed: missing username/password');
                return sendJSON(res, 400, { error: 'Please provide username and password' });
            }

            if (mongoose.connection.readyState !== 1) {
                console.log('Login failed: database not connected');
                return sendJSON(res, 500, { error: 'Database not connected' });
            }

            // Find user
            console.log('Looking up user:', username);
            const user = await User.findOne({ username });
            console.log('User lookup result:', !!user);
            if (!user) {
                return sendJSON(res, 400, { error: 'Invalid credentials' });
            }

            // Check password
            const isMatch = await bcrypt.compare(password, user.password);
            console.log('Password comparison result:', isMatch);
            if (!isMatch) {
                return sendJSON(res, 400, { error: 'Invalid credentials' });
            }

            return sendJSON(res, 200, { 
                message: 'Login successful',
                userId: user._id,
                username: user.username
            });
        }

        // Test Endpoint
        else if (pathname === '/' && req.method === 'GET') {
            return sendJSON(res, 200, { message: 'Tic Tac Toe API is running' });
        }

        // 404 - Not Found
        else {
            return sendJSON(res, 404, { error: 'Route not found' });
        }

    } catch (error) {
        console.error('Server error:', error);
        return sendJSON(res, 500, { error: 'Internal server error' });
    }
});

// WebSocket Server for Real-time Communication
const wss = new WebSocket.Server({ server });

// Store connected clients by user ID
const clients = new Map();

// Challenge storage (in production, use Redis or database)
const pendingChallenges = new Map();

// Active game rooms
const gameRooms = new Map();

wss.on('connection', (ws, req) => {
    const userId = req.url.split('?userId=')[1];
    
    if (userId) {
        clients.set(userId, ws);
        console.log(`User ${userId} connected via WebSocket`);
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                handleWebSocketMessage(userId, data, ws);
            } catch (error) {
                console.error('WebSocket message parse error:', error);
            }
        });
        
        ws.on('close', () => {
            clients.delete(userId);
            console.log(`User ${userId} disconnected`);
        });
        
        ws.on('error', (error) => {
            console.error(`WebSocket error for user ${userId}:`, error);
            clients.delete(userId);
        });
    }
});

function handleWebSocketMessage(userId, data, ws) {
    switch (data.type) {
        case 'challenge':
            handleChallenge(userId, data);
            break;
        case 'challenge_response':
            handleChallengeResponse(userId, data);
            break;
        case 'game_move':
            handleGameMove(userId, data);
            break;
        case 'join_game':
            handleJoinGame(userId, data, ws);
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
}

async function handleChallenge(fromUserId, data) {
    const { toUserId, fromUsername } = data;
    const challengeId = `${fromUserId}_${toUserId}_${Date.now()}`;
    
    try {
        // Get challenger profile data
        const challenger = await User.findById(fromUserId).select('username profile');
        
        // Store pending challenge
        pendingChallenges.set(challengeId, {
            fromUserId,
            toUserId,
            fromUsername,
            challengeId,
            timestamp: Date.now()
        });
        
        // Send challenge to target user
        const targetWs = clients.get(toUserId);
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
                type: 'challenge_received',
                challengeId,
                challengerId: fromUserId,
                challengerName: challenger.username,
                challengerAvatar: challenger.profile?.avatar || 'https://i.pravatar.cc/40',
                message: `${challenger.username} challenged you to a Tic Tac Toe game!`
            }));
        }
        
        // Confirm to sender
        const senderWs = clients.get(fromUserId);
        if (senderWs && senderWs.readyState === WebSocket.OPEN) {
            senderWs.send(JSON.stringify({
                type: 'challenge_sent',
                challengeId,
                toUserId,
                message: `Challenge sent to ${data.toUsername}!`
            }));
        }
    } catch (error) {
        console.error('Error handling challenge:', error);
    }
}

async function handleChallengeResponse(fromUserId, data) {
    const { challengeId, accepted } = data;
    const challenge = pendingChallenges.get(challengeId);
    
    if (!challenge) {
        return;
    }
    
    // Remove pending challenge
    pendingChallenges.delete(challengeId);
    
    const challengerWs = clients.get(challenge.fromUserId);
    const responderWs = clients.get(fromUserId);
    
    if (accepted) {
        try {
            // Create new game room
            const gameId = `game_${challenge.fromUserId}_${fromUserId}_${Date.now()}`;
            const boardSize = 3; // Start with 3x3
            const initialBoard = Array(boardSize * boardSize).fill(null);
            
            const newGame = new Game({
                gameId,
                players: [
                    { userId: challenge.fromUserId, username: challenge.fromUsername, symbol: 'X' },
                    { userId: fromUserId, username: challenge.toUsername || 'Opponent', symbol: 'O' }
                ],
                currentBoard: initialBoard,
                currentPlayer: 'X',
                gameStatus: 'active',
                boardSize
            });
            
            await newGame.save();
            
            // Store game room mapping for WebSocket routing
            gameRooms.set(gameId, {
                gameId,
                players: [challenge.fromUserId, fromUserId],
                game: newGame
            });
            
            // Notify both players to start the game
            const gameStartMessage = {
                type: 'game_start',
                gameId,
                players: newGame.players,
                currentBoard: newGame.currentBoard,
                currentPlayer: newGame.currentPlayer,
                boardSize: newGame.boardSize
            };
            
            if (challengerWs && challengerWs.readyState === WebSocket.OPEN) {
                challengerWs.send(JSON.stringify(gameStartMessage));
            }
            
            if (responderWs && responderWs.readyState === WebSocket.OPEN) {
                responderWs.send(JSON.stringify(gameStartMessage));
            }
            
        } catch (error) {
            console.error('Error creating game:', error);
            
            // Notify both players of error
            const errorMessage = {
                type: 'game_error',
                message: 'Failed to start game. Please try again.'
            };
            
            if (challengerWs && challengerWs.readyState === WebSocket.OPEN) {
                challengerWs.send(JSON.stringify(errorMessage));
            }
            
            if (responderWs && responderWs.readyState === WebSocket.OPEN) {
                responderWs.send(JSON.stringify(errorMessage));
            }
        }
    } else {
        // Challenge rejected
        if (challengerWs && challengerWs.readyState === WebSocket.OPEN) {
            challengerWs.send(JSON.stringify({
                type: 'challenge_rejected',
                challengeId,
                message: 'Challenge was rejected.'
            }));
        }
        
        if (responderWs && responderWs.readyState === WebSocket.OPEN) {
            responderWs.send(JSON.stringify({
                type: 'challenge_rejected',
                challengeId,
                message: 'You rejected the challenge.'
            }));
        }
    }
}

// Handle game moves
async function handleGameMove(userId, data) {
    const { gameId, position } = data;
    const gameRoom = gameRooms.get(gameId);
    
    if (!gameRoom) {
        console.error('Game room not found:', gameId);
        return;
    }
    
    try {
        const game = await Game.findOne({ gameId });
        if (!game || game.gameStatus !== 'active') {
            console.error('Game not found or not active:', gameId);
            return;
        }
        
        // Find the player making the move
        const player = game.players.find(p => p.userId.toString() === userId);
        if (!player) {
            console.error('Player not in game:', userId);
            return;
        }
        
        // Validate move
        if (game.currentPlayer !== player.symbol) {
            console.error('Not player\'s turn:', player.symbol, 'current:', game.currentPlayer);
            return;
        }
        
        if (position < 0 || position >= game.currentBoard.length || game.currentBoard[position] !== null) {
            console.error('Invalid move position:', position);
            return;
        }
        
        // Make the move
        game.currentBoard[position] = player.symbol;
        game.moves.push({
            playerId: userId,
            playerSymbol: player.symbol,
            position: position
        });
        
        // Check for winner
        const winner = checkWinner(game.currentBoard, game.boardSize);
        if (winner) {
            game.gameStatus = 'finished';
            game.winner = {
                userId: player.userId,
                username: player.username,
                symbol: player.symbol
            };
            
            // Update player stats
            await updatePlayerStats(game);
        } else if (!game.currentBoard.includes(null)) {
            // Draw
            game.gameStatus = 'finished';
            await updatePlayerStats(game, true); // true for draw
        } else {
            // Switch turns
            game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
        }
        
        game.updatedAt = new Date();
        await game.save();
        
        // Update game room
        gameRoom.game = game;
        
        // Broadcast move to both players
        const moveMessage = {
            type: 'game_move',
            gameId,
            playerId: userId,
            playerSymbol: player.symbol,
            position,
            currentBoard: game.currentBoard,
            currentPlayer: game.currentPlayer,
            gameStatus: game.gameStatus,
            winner: game.winner
        };
        
        // Send to both players
        gameRoom.players.forEach(playerId => {
            const playerWs = clients.get(playerId);
            if (playerWs && playerWs.readyState === WebSocket.OPEN) {
                playerWs.send(JSON.stringify(moveMessage));
            }
        });
        
    } catch (error) {
        console.error('Error handling game move:', error);
    }
}

// Helper function to check winner
function checkWinner(board, size) {
    // Check rows
    for (let r = 0; r < size; r++) {
        let rowWin = true;
        for (let c = 1; c < size; c++) {
            if (board[r * size + c] !== board[r * size]) {
                rowWin = false;
                break;
            }
        }
        if (rowWin && board[r * size]) return board[r * size];
    }
    
    // Check columns
    for (let c = 0; c < size; c++) {
        let colWin = true;
        for (let r = 1; r < size; r++) {
            if (board[r * size + c] !== board[c]) {
                colWin = false;
                break;
            }
        }
        if (colWin && board[c]) return board[c];
    }
    
    // Diagonal 1
    let diag1 = true;
    for (let i = 1; i < size; i++) {
        if (board[i * size + i] !== board[0]) {
            diag1 = false;
            break;
        }
    }
    if (diag1 && board[0]) return board[0];
    
    // Diagonal 2
    let diag2 = true;
    for (let i = 1; i < size; i++) {
        if (board[i * size + (size - i - 1)] !== board[size - 1]) {
            diag2 = false;
            break;
        }
    }
    if (diag2 && board[size - 1]) return board[size - 1];
    
    return null;
}

// Update player stats after game ends
async function updatePlayerStats(game, isDraw = false) {
    try {
        for (const player of game.players) {
            const user = await User.findById(player.userId);
            if (user) {
                user.stats.gamesPlayed += 1;
                
                if (!isDraw && game.winner && game.winner.userId.toString() === player.userId.toString()) {
                    user.stats.gamesWon += 1;
                }
                
                const winRate = user.stats.gamesPlayed > 0 ? 
                    Math.round((user.stats.gamesWon / user.stats.gamesPlayed) * 100) : 0;
                user.stats.winRate = `${winRate}%`;
                
                // Add to game history
                user.gameHistory.push({
                    result: isDraw ? 'draw' : (game.winner && game.winner.userId.toString() === player.userId.toString() ? 'won' : 'lost'),
                    opponent: game.players.find(p => p.userId.toString() !== player.userId.toString()).username,
                    date: new Date().toISOString().split('T')[0],
                    replayId: game.gameId
                });
                
                await user.save();
            }
        }
    } catch (error) {
        console.error('Error updating player stats:', error);
    }
}

// Handle joining an existing game
async function handleJoinGame(userId, data, ws) {
    const { gameId } = data;
    
    try {
        const game = await Game.findOne({ gameId });
        
        if (!game) {
            ws.send(JSON.stringify({
                type: 'game_error',
                message: 'Game not found. Please return to dashboard and try again.'
            }));
            return;
        }
        
        // Check if user is part of this game
        const player = game.players.find(p => p.userId.toString() === userId);
        if (!player) {
            ws.send(JSON.stringify({
                type: 'game_error',
                message: 'You are not part of this game.'
            }));
            return;
        }
        
        // Update game room if it doesn't exist
        if (!gameRooms.has(gameId)) {
            gameRooms.set(gameId, {
                gameId,
                players: game.players.map(p => p.userId.toString()),
                game: game
            });
        }
        
        // Send game start message
        const gameStartMessage = {
            type: 'game_start',
            gameId: game.gameId,
            players: game.players,
            currentBoard: game.currentBoard,
            currentPlayer: game.currentPlayer,
            boardSize: game.boardSize
        };
        
        ws.send(JSON.stringify(gameStartMessage));
        console.log(`User ${userId} joined game ${gameId}`);
        
    } catch (error) {
        console.error('Error joining game:', error);
        ws.send(JSON.stringify({
            type: 'game_error',
            message: 'Error joining game. Please try again.'
        }));
    }
}

// Start Server
server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Use a different port by setting PORT=<port> and restart.`);
        process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
});
