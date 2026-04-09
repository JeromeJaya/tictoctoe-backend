const mongoose = require('mongoose');
require('dotenv').config();

const ATLAS_URI = process.env.MONGODB_URI;
const LOCAL_URI = process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/tictactoe';

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

mongoose.connection.on('error', err => {
    console.error('❌ MongoDB connection error:', err);
});

module.exports = { connectToMongo };