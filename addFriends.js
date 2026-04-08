const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB Atlas Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema (simplified for this script)
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    friends: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String
    }]
});

const User = mongoose.model('User', userSchema);

async function addFriendsToAllUsers() {
    try {
        console.log('🌱 Starting to add friends to all users...');
        
        // Get all users
        const allUsers = await User.find({});
        console.log(`📊 Found ${allUsers.length} users`);
        
        if (allUsers.length === 0) {
            console.log('❌ No users found in database. Please run seedDatabase.js first.');
            process.exit(1);
        }
        
        // Add friends to each user
        let totalFriendsAdded = 0;
        
        for (let i = 0; i < allUsers.length; i++) {
            const currentUser = allUsers[i];
            console.log(`\nProcessing: ${currentUser.username}`);
            
            // Clear existing friends
            currentUser.friends = [];
            
            // Determine number of friends (3-8 friends per user)
            const friendCount = Math.floor(Math.random() * 6) + 3;
            
            // Get potential friends (exclude current user)
            const potentialFriends = allUsers.filter(u => u._id.toString() !== currentUser._id.toString());
            
            // Shuffle and pick random friends
            const shuffled = potentialFriends.sort(() => 0.5 - Math.random());
            const selectedFriends = shuffled.slice(0, Math.min(friendCount, shuffled.length));
            
            // Add friends
            for (const friend of selectedFriends) {
                currentUser.friends.push({
                    userId: friend._id,
                    username: friend.username
                });
            }
            
            await currentUser.save();
            totalFriendsAdded += currentUser.friends.length;
            
            console.log(`  ✅ Added ${currentUser.friends.length} friends: ${currentUser.friends.map(f => f.username).join(', ')}`);
        }
        
        console.log(`\n🎉 Successfully added friends to all users!`);
        console.log(`📊 Total friend relationships created: ${totalFriendsAdded}`);
        console.log(`👥 Average friends per user: ${(totalFriendsAdded / allUsers.length).toFixed(1)}`);
        
        // Display summary for first few users
        console.log('\n📋 Sample Users and Their Friends:');
        const sampleUsers = await User.find({}).limit(5);
        for (const user of sampleUsers) {
            console.log(`- ${user.username}: ${user.friends.length} friends`);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error adding friends:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

addFriendsToAllUsers();
