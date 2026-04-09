const WebSocket = require('ws');
const User = require('../models/user');
const Game = require('../models/game');
const { checkWinner, calculateRank, updateRankPoints } = require('../utils/helpers');

// Store connected clients by user ID
const clients = new Map();

// Challenge storage (in production, use Redis or database)
const pendingChallenges = new Map();

// Active game rooms
const gameRooms = new Map();

function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', async (ws, req) => {
        const userId = req.url.split('?userId=')[1];

        if (userId) {
            clients.set(userId, ws);
            console.log(`User ${userId} connected via WebSocket`);

            // Update user status to online in database
            try {
                await User.findByIdAndUpdate(userId, {
                    'profile.status': 'online'
                });
                console.log(`User ${userId} status set to online`);

                // Broadcast user status change to all connected clients
                broadcastUserStatusChange(userId, 'online');
            } catch (error) {
                console.error('Error updating user status:', error);
            }

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    handleWebSocketMessage(userId, data, ws);
                } catch (error) {
                    console.error('WebSocket message parse error:', error);
                }
            });

            ws.on('close', async () => {
                clients.delete(userId);
                console.log(`User ${userId} disconnected`);

                // Update user status to offline in database
                try {
                    await User.findByIdAndUpdate(userId, {
                        'profile.status': 'offline'
                    });
                    console.log(`User ${userId} status set to offline`);

                    // Broadcast user status change to all connected clients
                    broadcastUserStatusChange(userId, 'offline');
                } catch (error) {
                    console.error('Error updating user status:', error);
                }
            });

            ws.on('error', async (error) => {
                console.error(`WebSocket error for user ${userId}:`, error);
                clients.delete(userId);

                // Update user status to offline on error
                try {
                    await User.findByIdAndUpdate(userId, {
                        'profile.status': 'offline'
                    });
                    broadcastUserStatusChange(userId, 'offline');
                } catch (err) {
                    console.error('Error updating user status on error:', err);
                }
            });
        }
    });

    return wss;
}

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

// Broadcast user status change to all connected clients
function broadcastUserStatusChange(userId, status) {
    const statusMessage = {
        type: 'user_status_change',
        userId,
        status
    };

    // Send to all connected clients
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(statusMessage));
        }
    });
}

// Broadcast rank change to all connected clients
function broadcastRankChange(userId, newRank, newRankPoints) {
    const rankMessage = {
        type: 'rank_change',
        userId,
        rank: newRank,
        rankPoints: newRankPoints
    };

    // Send to all connected clients
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(rankMessage));
        }
    });
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

// Update player stats after game ends
async function updatePlayerStats(game, isDraw = false) {
    try {
        for (const player of game.players) {
            const user = await User.findById(player.userId);
            if (user) {
                user.stats.gamesPlayed += 1;

                const result = isDraw ? 'draw' : (game.winner && game.winner.userId.toString() === player.userId.toString() ? 'won' : 'lost');

                if (!isDraw && game.winner && game.winner.userId.toString() === player.userId.toString()) {
                    user.stats.gamesWon += 1;
                }

                const winRate = user.stats.gamesPlayed > 0 ?
                    Math.round((user.stats.gamesWon / user.stats.gamesPlayed) * 100) : 0;
                user.stats.winRate = `${winRate}%`;

                // Update ranking points
                const opponent = game.players.find(p => p.userId.toString() !== player.userId.toString());
                if (opponent) {
                    const opponentUser = await User.findById(opponent.userId);
                    const opponentPoints = opponentUser ? opponentUser.profile.rankPoints : 1200;

                    user.profile.rankPoints = updateRankPoints(
                        user.profile.rankPoints,
                        result,
                        opponentPoints
                    );
                } else {
                    // If no opponent found, use default rating change
                    if (result === 'win') user.profile.rankPoints += 25;
                    else if (result === 'loss') user.profile.rankPoints -= 25;
                }

                // Update rank title based on points
                user.profile.rank = calculateRank(user.profile.rankPoints);

                // Broadcast rank change to all connected clients
                broadcastRankChange(user.userId, user.profile.rank, user.profile.rankPoints);

                // Add to game history
                user.gameHistory.push({
                    result: result,
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

module.exports = { setupWebSocket };