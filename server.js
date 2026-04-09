const http = require('http');
const url = require('url');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

// Import modules
const { connectToMongo } = require('./config/database');
const { handleAPIRequest } = require('./routes/api');
const { setupWebSocket } = require('./routes/websocket');

// Connect to MongoDB
connectToMongo();

// Create HTTP Server
const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    // Handle API requests
    await handleAPIRequest(req, res);
});

// Setup WebSocket server
const wss = setupWebSocket(server);

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