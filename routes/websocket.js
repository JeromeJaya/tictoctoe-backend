const WebSocket = require('ws');
const User = require('../models/user');
const Game = require('../models/game');
const { checkWinner, calculateRank, updateRankPoints } = require('../utils/helpers');

// Store connected clients by user ID (Map - already in use)
const clients = new Map();

// Challenge storage (in production, use Redis or database) (Map - already in use)
const pendingChallenges = new Map();

// Active game rooms (Map - already in use)
const gameRooms = new Map();

// Track online users for quick lookup (Set - NEW)
const onlineUsers = new Set();

// Track pending challenge pairs to prevent duplicates (Set - NEW)
const pendingChallengePairs = new Set();

// Store WebSocket private metadata (WeakMap - NEW)
const wsPrivateData = new WeakMap();

// Track active game session objects (WeakSet - NEW)
const activeGameSessions = new WeakSet();

function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', async (ws, req) => {
        const userId = req.url.split('?userId=')[1];

        if (userId) {
            clients.set(userId, ws);
            onlineUsers.add(userId); // Track online user
            
            // Store private WebSocket metadata using WeakMap
            wsPrivateData.set(ws, {
                userId,
                connectedAt: Date.now(),
                messageCount: 0,
                lastActivity: Date.now(),
                gamesPlayed: 0
            });
            
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
                    // Update message count and last activity
                    const privateData = wsPrivateData.get(ws);
                    if (privateData) {
                        privateData.messageCount++;
                        privateData.lastActivity = Date.now();
                        wsPrivateData.set(ws, privateData);
                    }
                    
                    const data = JSON.parse(message.toString());
                    handleWebSocketMessage(userId, data, ws);
                } catch (error) {
                    console.error('WebSocket message parse error:', error);
                }
            });

            ws.on('close', async () => {
                clients.delete(userId);
                onlineUsers.delete(userId); // Remove from online users
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
                onlineUsers.delete(userId); // Remove from online users

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
        case 'start_multi_level_game':
            handleStartMultiLevelGame(userId, data);
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
    const challengeKey = `${fromUserId}_${toUserId}`;
    
    // Prevent duplicate challenges using Set
    if (pendingChallengePairs.has(challengeKey)) {
        const senderWs = clients.get(fromUserId);
        if (senderWs && senderWs.readyState === WebSocket.OPEN) {
            senderWs.send(JSON.stringify({
                type: 'challenge_error',
                message: 'You already have a pending challenge with this user!'
            }));
        }
        return;
    }
    
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
            timestamp: Date.now(),
            gameType: 'single'
        });
        
        // Track challenge pair to prevent duplicates
        pendingChallengePairs.add(challengeKey);

        // Send challenge to target user
        const targetWs = clients.get(toUserId);
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
                type: 'challenge_received',
                challengeId,
                challengerId: fromUserId,
                challengerName: challenger.username,
                challengerAvatar: challenger.profile?.avatar || 'https://i.pravatar.cc/40',
                message: `${challenger.username} challenged you to a Tic Tac Toe game!`,
                gameType: 'single'
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
        pendingChallengePairs.delete(challengeKey); // Clean up on error
    }
}

async function handleChallengeResponse(fromUserId, data) {
    const { challengeId, accepted, gameType } = data;
    const challenge = pendingChallenges.get(challengeId);

    if (!challenge) {
        return;
    }

    // Remove pending challenge
    pendingChallenges.delete(challengeId);
    
    // Remove challenge pair from Set to allow future challenges
    const challengeKey = `${challenge.fromUserId}_${challenge.toUserId}`;
    pendingChallengePairs.delete(challengeKey);

    const challengerWs = clients.get(challenge.fromUserId);
    const responderWs = clients.get(fromUserId);

    if (accepted) {
        try {
            // Create new game room
            const gameId = `game_${challenge.fromUserId}_${fromUserId}_${Date.now()}`;
            
            // Check if it's a multi-level game
            if (gameType === 'multi_level') {
                await createMultiLevelGame(gameId, challenge, fromUserId, challengerWs, responderWs);
            } else {
                // Original single level game
                await createSingleLevelGame(gameId, challenge, fromUserId, challengerWs, responderWs);
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

// Create single level game (original)
async function createSingleLevelGame(gameId, challenge, fromUserId, challengerWs, responderWs) {
    const boardSize = 3;
    const initialBoard = Array(boardSize * boardSize).fill(null);

    const newGame = new Game({
        gameId,
        players: [
            { userId: challenge.fromUserId, username: challenge.fromUsername, symbol: 'X', levelsWon: 0 },
            { userId: fromUserId, username: challenge.toUsername || 'Opponent', symbol: 'O', levelsWon: 0 }
        ],
        currentBoard: initialBoard,
        currentPlayer: 'X',
        gameStatus: 'active',
        boardSize,
        isMultiLevel: false
    });

    await newGame.save();

    const gameRoom = {
        gameId,
        players: [challenge.fromUserId, fromUserId],
        game: newGame,
        createdAt: Date.now()
    };
    
    // Track game session using WeakSet
    activeGameSessions.add(gameRoom);
    
    gameRooms.set(gameId, gameRoom);

    const gameStartMessage = {
        type: 'game_start',
        gameId,
        players: newGame.players,
        currentBoard: newGame.currentBoard,
        currentPlayer: newGame.currentPlayer,
        boardSize: newGame.boardSize,
        isMultiLevel: false
    };

    if (challengerWs && challengerWs.readyState === WebSocket.OPEN) {
        challengerWs.send(JSON.stringify(gameStartMessage));
    }

    if (responderWs && responderWs.readyState === WebSocket.OPEN) {
        responderWs.send(JSON.stringify(gameStartMessage));
    }
}

// Create multi-level game with 3 levels
async function createMultiLevelGame(gameId, challenge, fromUserId, challengerWs, responderWs) {
    const levels = [
        { levelNumber: 1, boardSize: 3, board: Array(3 * 3).fill(null), currentPlayer: 'X', gameStatus: 'active' },
        { levelNumber: 2, boardSize: 4, board: Array(4 * 4).fill(null), currentPlayer: 'X', gameStatus: 'waiting' },
        { levelNumber: 3, boardSize: 5, board: Array(5 * 5).fill(null), currentPlayer: 'X', gameStatus: 'waiting' }
    ];

    const newGame = new Game({
        gameId,
        isMultiLevel: true,
        levels: levels,
        currentLevel: 1,
        players: [
            { userId: challenge.fromUserId, username: challenge.fromUsername, symbol: 'X', levelsWon: 0 },
            { userId: fromUserId, username: challenge.toUsername || 'Opponent', symbol: 'O', levelsWon: 0 }
        ],
        currentBoard: levels[0].board,
        currentPlayer: 'X',
        gameStatus: 'active',
        boardSize: 3
    });

    await newGame.save();

    const gameRoom = {
        gameId,
        players: [challenge.fromUserId, fromUserId],
        game: newGame,
        createdAt: Date.now()
    };
    
    // Track game session using WeakSet
    activeGameSessions.add(gameRoom);
    
    gameRooms.set(gameId, gameRoom);

    const gameStartMessage = {
        type: 'game_start',
        gameId,
        players: newGame.players,
        currentBoard: newGame.currentBoard,
        currentPlayer: newGame.currentPlayer,
        boardSize: newGame.boardSize,
        isMultiLevel: true,
        currentLevel: 1,
        totalLevels: 3
    };

    if (challengerWs && challengerWs.readyState === WebSocket.OPEN) {
        challengerWs.send(JSON.stringify(gameStartMessage));
    }

    if (responderWs && responderWs.readyState === WebSocket.OPEN) {
        responderWs.send(JSON.stringify(gameStartMessage));
    }
}

// Handle starting a multi-level game (from challenge)
async function handleStartMultiLevelGame(userId, data) {
    const { toUserId, toUsername, fromUsername } = data;
    const challengeId = `${userId}_${toUserId}_${Date.now()}`;

    try {
        const challenger = await User.findById(userId).select('username profile');

        pendingChallenges.set(challengeId, {
            fromUserId: userId,
            toUserId: toUserId,
            fromUsername: fromUsername || challenger.username,
            toUsername: toUsername,
            challengeId,
            timestamp: Date.now(),
            gameType: 'multi_level'
        });

        const targetWs = clients.get(toUserId);
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
                type: 'challenge_received',
                challengeId,
                challengerId: userId,
                challengerName: challenger.username,
                challengerAvatar: challenger.profile?.avatar || 'https://i.pravatar.cc/40',
                message: `${challenger.username} challenged you to a 3-Level Battle!`,
                gameType: 'multi_level'
            }));
        }

        const senderWs = clients.get(userId);
        if (senderWs && senderWs.readyState === WebSocket.OPEN) {
            senderWs.send(JSON.stringify({
                type: 'challenge_sent',
                challengeId,
                toUserId: toUserId,
                message: `Multi-Level Challenge sent to ${toUsername}!`
            }));
        }
    } catch (error) {
        console.error('Error handling multi-level challenge:', error);
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

        // Check if it's a multi-level game
        if (game.isMultiLevel) {
            await handleMultiLevelMove(game, gameRoom, player, userId, position);
        } else {
            await handleSingleLevelMove(game, gameRoom, player, userId, position);
        }

    } catch (error) {
        console.error('Error handling game move:', error);
    }
}

// Handle single level game move (original logic)
async function handleSingleLevelMove(game, gameRoom, player, userId, position) {
    const currentBoard = game.currentBoard;
    const boardSize = game.boardSize;

    // Validate move
    if (game.currentPlayer !== player.symbol) {
        console.error('Not player\'s turn:', player.symbol, 'current:', game.currentPlayer);
        return;
    }

    if (position < 0 || position >= currentBoard.length || currentBoard[position] !== null) {
        console.error('Invalid move position:', position);
        return;
    }

    // Make the move
    currentBoard[position] = player.symbol;
    game.moves.push({
        playerId: userId,
        playerSymbol: player.symbol,
        position: position
    });

    // Check for winner
    const winner = checkWinner(currentBoard, boardSize);
    if (winner) {
        game.gameStatus = 'finished';
        game.winner = {
            userId: player.userId,
            username: player.username,
            symbol: player.symbol
        };

        // Update player stats
        await updatePlayerStats(game);
    } else if (!currentBoard.includes(null)) {
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
        gameId: game.gameId,
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
}

// Handle multi-level game move
async function handleMultiLevelMove(game, gameRoom, player, userId, position) {
    const currentLevel = game.currentLevel;
    const levelIndex = currentLevel - 1;
    const currentLevelData = game.levels[levelIndex];
    
    if (!currentLevelData) {
        console.error('Level data not found for level:', currentLevel);
        return;
    }

    const currentBoard = currentLevelData.board;
    const boardSize = currentLevelData.boardSize;

    // Validate move
    if (currentLevelData.currentPlayer !== player.symbol) {
        console.error('Not player\'s turn:', player.symbol, 'current:', currentLevelData.currentPlayer);
        return;
    }

    if (position < 0 || position >= currentBoard.length || currentBoard[position] !== null) {
        console.error('Invalid move position:', position);
        return;
    }

    // Make the move
    currentBoard[position] = player.symbol;
    game.moves.push({
        playerId: userId,
        playerSymbol: player.symbol,
        position: position,
        levelNumber: currentLevel
    });

    // Check for winner at current level
    const winner = checkWinner(currentBoard, boardSize);
    let levelFinished = false;
    let levelWinner = null;

    if (winner) {
        levelFinished = true;
        levelWinner = player;
        
        // Update player's levels won count
        const playerIndex = game.players.findIndex(p => p.userId.toString() === userId);
        if (playerIndex !== -1) {
            game.players[playerIndex].levelsWon += 1;
        }

        // Mark level as finished
        currentLevelData.gameStatus = 'finished';
        currentLevelData.winner = {
            userId: player.userId,
            username: player.username,
            symbol: player.symbol
        };

        console.log(`Player ${player.username} won level ${currentLevel}!`);
    } else if (!currentBoard.includes(null)) {
        // Draw at this level - move to next level
        levelFinished = true;
        levelWinner = null;
        currentLevelData.gameStatus = 'finished';
        console.log(`Level ${currentLevel} ended in a draw! Moving to next level.`);
    }

    if (levelFinished) {
        // Check if same player won first two levels (automatic win)
        const player1WonLevel1 = game.levels[0]?.winner?.userId?.toString() === game.players[0].userId.toString();
        const player2WonLevel1 = game.levels[0]?.winner?.userId?.toString() === game.players[1].userId.toString();
        const player1WonLevel2 = game.levels[1]?.winner?.userId?.toString() === game.players[0].userId.toString();
        const player2WonLevel2 = game.levels[1]?.winner?.userId?.toString() === game.players[1].userId.toString();

        // Determine overall winner if same player won first two levels
        let overallWinner = null;
        
        if (currentLevel === 1 && winner) {
            // Store level 1 winner for checking in next level
        } else if (currentLevel === 2 && winner) {
            // Check if player won both level 1 and level 2
            if ((player1WonLevel1 && player1WonLevel2) || (player2WonLevel1 && player2WonLevel2)) {
                overallWinner = winner;
            }
        } else if (currentLevel === 2 && !winner) {
            // Draw in level 2 - need to play level 3
        } else if (currentLevel === 3) {
            // Final level - determine winner by majority
            const player1LevelsWon = game.players[0].levelsWon;
            const player2LevelsWon = game.players[1].levelsWon;
            
            if (player1LevelsWon > player2LevelsWon) {
                overallWinner = game.players[0];
            } else if (player2LevelsWon > player1LevelsWon) {
                overallWinner = game.players[1];
            }
            // If equal, last level winner wins
            if (!overallWinner && winner) {
                overallWinner = winner;
            }
        }

        if (overallWinner) {
            // Game over - overall winner determined
            game.gameStatus = 'finished';
            game.winner = {
                userId: overallWinner.userId,
                username: overallWinner.username,
                symbol: overallWinner.symbol,
                isMultiLevelWinner: true,
                levelsWon: overallWinner.levelsWon
            };

            game.updatedAt = new Date();
            await game.save();

            // Update player stats
            await updatePlayerStats(game);

            // Broadcast final result to both players
            const finalResultMessage = {
                type: 'game_move',
                gameId: game.gameId,
                playerId: userId,
                playerSymbol: player.symbol,
                position,
                currentBoard: game.currentBoard,
                currentPlayer: game.currentPlayer,
                gameStatus: game.gameStatus,
                winner: game.winner,
                isMultiLevelWinner: true,
                levelsWon: game.players.map(p => ({ username: p.username, levelsWon: p.levelsWon })),
                message: `🏆 ${overallWinner.username} wins the Multi-Level Battle!`
            };

            gameRoom.players.forEach(playerId => {
                const playerWs = clients.get(playerId);
                if (playerWs && playerWs.readyState === WebSocket.OPEN) {
                    playerWs.send(JSON.stringify(finalResultMessage));
                }
            });
            return;
        }

        // Move to next level if available
        if (currentLevel < 3) {
            const nextLevelIndex = currentLevel;
            const nextLevel = game.levels[nextLevelIndex];
            
            game.currentLevel = currentLevel + 1;
            game.currentBoard = nextLevel.board;
            game.currentPlayer = 'X'; // Reset to X for new level
            game.boardSize = nextLevel.boardSize;
            nextLevel.gameStatus = 'active';
            nextLevel.currentPlayer = 'X';

            game.updatedAt = new Date();
            await game.save();

            // Update game room
            gameRoom.game = game;

            // Broadcast level transition
            const levelTransitionMessage = {
                type: 'level_transition',
                gameId: game.gameId,
                currentLevel: game.currentLevel,
                boardSize: nextLevel.boardSize,
                currentBoard: nextLevel.board,
                currentPlayer: 'X',
                previousLevelWinner: winner ? player.username : null,
                levelsWon: game.players.map(p => ({ username: p.username, levelsWon: p.levelsWon })),
                message: winner 
                    ? `🎉 ${player.username} won Level ${currentLevel}! Get ready for Level ${currentLevel + 1}...`
                    : `🤝 Level ${currentLevel} draw! Moving to Level ${currentLevel + 1}...`
            };

            gameRoom.players.forEach(playerId => {
                const playerWs = clients.get(playerId);
                if (playerWs && playerWs.readyState === WebSocket.OPEN) {
                    playerWs.send(JSON.stringify(levelTransitionMessage));
                }
            });
        } else {
            // All levels finished - determine final winner by majority
            const player1LevelsWon = game.players[0].levelsWon;
            const player2LevelsWon = game.players[1].levelsWon;
            
            let finalWinner = null;
            if (player1LevelsWon > player2LevelsWon) {
                finalWinner = game.players[0];
            } else if (player2LevelsWon > player1LevelsWon) {
                finalWinner = game.players[1];
            } else if (levelWinner) {
                // Tie-breaker: last level winner
                finalWinner = levelWinner;
            }

            game.gameStatus = 'finished';
            game.winner = {
                userId: finalWinner.userId,
                username: finalWinner.username,
                symbol: finalWinner.symbol,
                isMultiLevelWinner: true,
                levelsWon: finalWinner.levelsWon
            };

            game.updatedAt = new Date();
            await game.save();

            // Update player stats
            await updatePlayerStats(game);

            // Broadcast final result
            const finalResultMessage = {
                type: 'game_move',
                gameId: game.gameId,
                playerId: userId,
                playerSymbol: player.symbol,
                position,
                currentBoard: game.currentBoard,
                currentPlayer: game.currentPlayer,
                gameStatus: game.gameStatus,
                winner: game.winner,
                isMultiLevelWinner: true,
                levelsWon: game.players.map(p => ({ username: p.username, levelsWon: p.levelsWon })),
                message: `🏆 ${finalWinner.username} wins the Multi-Level Battle with ${finalWinner.levelsWon} levels!`
            };

            gameRoom.players.forEach(playerId => {
                const playerWs = clients.get(playerId);
                if (playerWs && playerWs.readyState === WebSocket.OPEN) {
                    playerWs.send(JSON.stringify(finalResultMessage));
                }
            });
        }
    } else {
        // Continue current level - switch turns
        currentLevelData.currentPlayer = currentLevelData.currentPlayer === 'X' ? 'O' : 'X';
        game.currentPlayer = currentLevelData.currentPlayer;

        game.updatedAt = new Date();
        await game.save();

        // Update game room
        gameRoom.game = game;

        // Broadcast move to both players
        const moveMessage = {
            type: 'game_move',
            gameId: game.gameId,
            playerId: userId,
            playerSymbol: player.symbol,
            position,
            currentBoard: currentBoard,
            currentPlayer: currentLevelData.currentPlayer,
            gameStatus: 'active',
            currentLevel: game.currentLevel,
            boardSize: boardSize
        };

        gameRoom.players.forEach(playerId => {
            const playerWs = clients.get(playerId);
            if (playerWs && playerWs.readyState === WebSocket.OPEN) {
                playerWs.send(JSON.stringify(moveMessage));
            }
        });
    }
}
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
                const opponentUser = opponent ? await User.findById(opponent.userId) : null;
                const opponentPoints = opponentUser ? opponentUser.profile.rankPoints : 1200;

                user.profile.rankPoints = updateRankPoints(
                    user.profile.rankPoints,
                    result,
                    opponentPoints
                );

                // Update rank title based on points
                user.profile.rank = calculateRank(user.profile.rankPoints);

                // Broadcast rank change to all connected clients
                broadcastRankChange(user._id.toString(), user.profile.rank, user.profile.rankPoints);

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

        // Check if it's a multi-level game
        if (game.isMultiLevel) {
            const currentLevel = game.currentLevel;
            const levelData = game.levels[currentLevel - 1];
            
            const gameStartMessage = {
                type: 'game_start',
                gameId: game.gameId,
                players: game.players,
                currentBoard: levelData.board,
                currentPlayer: levelData.currentPlayer,
                boardSize: levelData.boardSize,
                isMultiLevel: true,
                currentLevel: currentLevel,
                totalLevels: 3,
                levelsWon: game.players.map(p => ({ username: p.username, levelsWon: p.levelsWon }))
            };

            ws.send(JSON.stringify(gameStartMessage));
        } else {
            // Single level game
            const gameStartMessage = {
                type: 'game_start',
                gameId: game.gameId,
                players: game.players,
                currentBoard: game.currentBoard,
                currentPlayer: game.currentPlayer,
                boardSize: game.boardSize,
                isMultiLevel: false
            };

            ws.send(JSON.stringify(gameStartMessage));
        }

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

// Helper function to check if user is online (using Set)
function isUserOnline(userId) {
    return onlineUsers.has(userId);
}

// Helper function to get all online users (using Set)
function getOnlineUsers() {
    return Array.from(onlineUsers);
}

// Helper function to get WebSocket metadata (using WeakMap)
function getWebSocketMetadata(ws) {
    return wsPrivateData.get(ws);
}

// Helper function to cleanup expired challenges (using Set and Map)
function cleanupExpiredChallenges() {
    const now = Date.now();
    const expiredIds = [];
    
    pendingChallenges.forEach((challenge, id) => {
        if (now - challenge.timestamp > 30000) { // 30 seconds expiry
            expiredIds.push(id);
            const challengeKey = `${challenge.fromUserId}_${challenge.toUserId}`;
            pendingChallengePairs.delete(challengeKey);
        }
    });
    
    expiredIds.forEach(id => pendingChallenges.delete(id));
    
    if (expiredIds.length > 0) {
        console.log(`Cleaned up ${expiredIds.length} expired challenges`);
    }
}

// Helper function to get active game stats (using WeakSet and Map)
function getActiveGameStats() {
    const stats = {
        totalGameRooms: gameRooms.size,
        activeSessions: 0,
        totalPlayers: 0
    };
    
    gameRooms.forEach((room) => {
        if (activeGameSessions.has(room)) {
            stats.activeSessions++;
            stats.totalPlayers += room.players.length;
        }
    });
    
    return stats;
}

// Run cleanup every 10 seconds
setInterval(cleanupExpiredChallenges, 10000);