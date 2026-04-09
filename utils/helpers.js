const fs = require('fs');
const path = require('path');

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

// Ranking system functions
function calculateRank(rankPoints) {
    if (rankPoints < 1100) return 'Bronze';
    if (rankPoints < 1200) return 'Silver';
    if (rankPoints < 1300) return 'Gold';
    if (rankPoints < 1400) return 'Platinum';
    if (rankPoints < 1500) return 'Diamond';
    if (rankPoints < 1600) return 'Master';
    if (rankPoints < 1700) return 'Grandmaster';
    return 'Legend';
}

function updateRankPoints(currentPoints, result, opponentPoints = 1200) {
    // Simple ELO-like rating system
    const K = 32; // K-factor for rating changes
    const expectedScore = 1 / (1 + Math.pow(10, (opponentPoints - currentPoints) / 400));

    let actualScore;
    if (result === 'win') actualScore = 1;
    else if (result === 'loss') actualScore = 0;
    else actualScore = 0.5; // draw

    const newPoints = Math.round(currentPoints + K * (actualScore - expectedScore));
    return Math.max(800, newPoints); // Minimum rank points of 800
}

module.exports = { parseBody, sendJSON, serveFile, checkWinner, calculateRank, updateRankPoints };