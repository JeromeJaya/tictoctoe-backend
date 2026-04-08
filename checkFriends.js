const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
    username: String,
    friends: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String
    }]
});

const User = mongoose.model('User', userSchema);

async function checkUserFriends() {
    try {
        const user = await User.findOne({ username: 'SkyHunter' });
        
        if (!user) {
            console.log('❌ User SkyHunter not found');
            process.exit(1);
        }
        
        console.log('\n👤 User:', user.username);
        console.log('🆔 ID:', user._id);
        console.log('👥 Friends count:', user.friends ? user.friends.length : 0);
        
        if (user.friends && user.friends.length > 0) {
            console.log('\n📋 Friends list:');
            user.friends.forEach((friend, index) => {
                console.log(`  ${index + 1}. ${friend.username} (${friend.userId})`);
            });
        } else {
            console.log('\n⚠️  No friends found for SkyHunter');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkUserFriends();
