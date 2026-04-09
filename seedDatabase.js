const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { calculateRank } = require('./utils/helpers');
require('dotenv').config();

// MongoDB Atlas Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ MongoDB connection error:', err));

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
        rankPoints: { type: Number, default: 1000 }, // Starting ELO-like rating
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

// Generate 20 fake users
const fakeUsers = [
    {
        username: 'ProGamer2024',
        password: 'password123',
        profile: { rankPoints: 1800, avatar: 'https://i.pravatar.cc/150?img=1', status: 'online' },
        stats: { gamesPlayed: 450, gamesWon: 380, winRate: '84%' },
        achievements: [
            { icon: '🏆', name: 'Champion', unlocked: true },
            { icon: '🔥', name: '20 Win Streak', unlocked: true },
            { icon: '⭐', name: 'Pro Player', unlocked: true },
            { icon: '💎', name: 'Diamond League', unlocked: true }
        ],
        gameHistory: [
            { result: 'won', opponent: 'NightHawk', date: '10 mins ago', replayId: 'R001' },
            { result: 'won', opponent: 'StormBlade', date: '1 hour ago', replayId: 'R002' },
            { result: 'won', opponent: 'ShadowFox', date: '3 hours ago', replayId: 'R003' }
        ]
    },
    {
        username: 'NightHawk',
        password: 'password123',
        profile: { rankPoints: 1650, avatar: 'https://i.pravatar.cc/150?img=2', status: 'online' },
        stats: { gamesPlayed: 380, gamesWon: 295, winRate: '78%' },
        achievements: [
            { icon: '🏆', name: 'Champion', unlocked: true },
            { icon: '🔥', name: '15 Win Streak', unlocked: true },
            { icon: '⭐', name: 'Pro Player', unlocked: true },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'ProGamer2024', date: '10 mins ago', replayId: 'R004' },
            { result: 'won', opponent: 'ThunderStrike', date: '2 hours ago', replayId: 'R005' }
        ]
    },
    {
        username: 'StormBlade',
        password: 'password123',
        profile: { rankPoints: 1550, avatar: 'https://i.pravatar.cc/150?img=3', status: 'online' },
        stats: { gamesPlayed: 320, gamesWon: 230, winRate: '72%' },
        achievements: [
            { icon: '🏆', name: 'Champion', unlocked: true },
            { icon: '🔥', name: '10 Win Streak', unlocked: true },
            { icon: '⭐', name: 'Pro Player', unlocked: true },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'ProGamer2024', date: '1 hour ago', replayId: 'R006' },
            { result: 'won', opponent: 'IceQueen', date: '4 hours ago', replayId: 'R007' }
        ]
    },
    {
        username: 'ShadowFox',
        password: 'password123',
        profile: { rankPoints: 1450, avatar: 'https://i.pravatar.cc/150?img=4', status: 'offline' },
        stats: { gamesPlayed: 285, gamesWon: 195, winRate: '68%' },
        achievements: [
            { icon: '🏆', name: 'Champion', unlocked: true },
            { icon: '🔥', name: '10 Win Streak', unlocked: true },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'ProGamer2024', date: '3 hours ago', replayId: 'R008' },
            { result: 'won', opponent: 'FireDragon', date: '1 day ago', replayId: 'R009' }
        ]
    },
    {
        username: 'ThunderStrike',
        password: 'password123',
        profile: { rankPoints: 1350, avatar: 'https://i.pravatar.cc/150?img=5', status: 'online' },
        stats: { gamesPlayed: 245, gamesWon: 160, winRate: '65%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: true },
            { icon: '⭐', name: 'Pro Player', unlocked: true },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'NightHawk', date: '2 hours ago', replayId: 'R010' },
            { result: 'won', opponent: 'CyberWolf', date: '5 hours ago', replayId: 'R011' }
        ]
    },
    {
        username: 'IceQueen',
        password: 'password123',
        profile: { rankPoints: 1250, avatar: 'https://i.pravatar.cc/150?img=6', status: 'online' },
        stats: { gamesPlayed: 210, gamesWon: 130, winRate: '62%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: true },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'StormBlade', date: '4 hours ago', replayId: 'R012' },
            { result: 'won', opponent: 'PhoenixRise', date: '1 day ago', replayId: 'R013' }
        ]
    },
    {
        username: 'FireDragon',
        password: 'password123',
        profile: { rankPoints: 1150, avatar: 'https://i.pravatar.cc/150?img=7', status: 'offline' },
        stats: { gamesPlayed: 180, gamesWon: 105, winRate: '58%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: true },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'ShadowFox', date: '1 day ago', replayId: 'R014' },
            { result: 'won', opponent: 'MysticSage', date: '2 days ago', replayId: 'R015' }
        ]
    },
    {
        username: 'CyberWolf',
        password: 'password123',
        profile: { rankPoints: 1050, avatar: 'https://i.pravatar.cc/150?img=8', status: 'online' },
        stats: { gamesPlayed: 155, gamesWon: 85, winRate: '55%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'ThunderStrike', date: '5 hours ago', replayId: 'R016' },
            { result: 'draw', opponent: 'VenomStrike', date: '1 day ago', replayId: 'R017' }
        ]
    },
    {
        username: 'PhoenixRise',
        password: 'password123',
        profile: { rankPoints: 1000, avatar: 'https://i.pravatar.cc/150?img=9', status: 'offline' },
        stats: { gamesPlayed: 140, gamesWon: 75, winRate: '54%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'IceQueen', date: '1 day ago', replayId: 'R018' },
            { result: 'won', opponent: 'BlazeFury', date: '3 days ago', replayId: 'R019' }
        ]
    },
    {
        username: 'MysticSage',
        password: 'password123',
        profile: { rankPoints: 950, avatar: 'https://i.pravatar.cc/150?img=10', status: 'online' },
        stats: { gamesPlayed: 125, gamesWon: 65, winRate: '52%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'FireDragon', date: '2 days ago', replayId: 'R020' },
            { result: 'won', opponent: 'CrystalMage', date: '4 days ago', replayId: 'R021' }
        ]
    },
    {
        username: 'VenomStrike',
        password: 'password123',
        profile: { rankPoints: 900, avatar: 'https://i.pravatar.cc/150?img=11', status: 'online' },
        stats: { gamesPlayed: 110, gamesWon: 55, winRate: '50%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'draw', opponent: 'CyberWolf', date: '1 day ago', replayId: 'R022' },
            { result: 'won', opponent: 'NovaBlast', date: '5 days ago', replayId: 'R023' }
        ]
    },
    {
        username: 'BlazeFury',
        password: 'password123',
        profile: { rankPoints: 850, avatar: 'https://i.pravatar.cc/150?img=12', status: 'offline' },
        stats: { gamesPlayed: 98, gamesWon: 45, winRate: '46%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'PhoenixRise', date: '3 days ago', replayId: 'R024' },
            { result: 'won', opponent: 'FrostBite', date: '1 week ago', replayId: 'R025' }
        ]
    },
    {
        username: 'CrystalMage',
        password: 'password123',
        profile: { rankPoints: 800, avatar: 'https://i.pravatar.cc/150?img=13', status: 'online' },
        stats: { gamesPlayed: 85, gamesWon: 38, winRate: '45%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'MysticSage', date: '4 days ago', replayId: 'R026' },
            { result: 'won', opponent: 'DarkKnight', date: '1 week ago', replayId: 'R027' }
        ]
    },
    {
        username: 'NovaBlast',
        password: 'password123',
        profile: { rankPoints: 800, avatar: 'https://i.pravatar.cc/150?img=14', status: 'offline' },
        stats: { gamesPlayed: 72, gamesWon: 30, winRate: '42%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'VenomStrike', date: '5 days ago', replayId: 'R028' },
            { result: 'won', opponent: 'SkyHunter', date: '2 weeks ago', replayId: 'R029' }
        ]
    },
    {
        username: 'FrostBite',
        password: 'password123',
        profile: { rankPoints: 800, avatar: 'https://i.pravatar.cc/150?img=15', status: 'online' },
        stats: { gamesPlayed: 60, gamesWon: 24, winRate: '40%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'BlazeFury', date: '1 week ago', replayId: 'R030' },
            { result: 'won', opponent: 'IronClad', date: '2 weeks ago', replayId: 'R031' }
        ]
    },
    {
        username: 'DarkKnight',
        password: 'password123',
        profile: { rankPoints: 800, avatar: 'https://i.pravatar.cc/150?img=16', status: 'offline' },
        stats: { gamesPlayed: 48, gamesWon: 18, winRate: '38%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'CrystalMage', date: '1 week ago', replayId: 'R032' },
            { result: 'won', opponent: 'SwiftBlade', date: '3 weeks ago', replayId: 'R033' }
        ]
    },
    {
        username: 'SkyHunter',
        password: 'password123',
        profile: { rankPoints: 800, avatar: 'https://i.pravatar.cc/150?img=17', status: 'online' },
        stats: { gamesPlayed: 35, gamesWon: 12, winRate: '34%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'NovaBlast', date: '2 weeks ago', replayId: 'R034' },
            { result: 'won', opponent: 'RuneKeeper', date: '1 month ago', replayId: 'R035' }
        ]
    },
    {
        username: 'IronClad',
        password: 'password123',
        profile: { rankPoints: 800, avatar: 'https://i.pravatar.cc/150?img=18', status: 'offline' },
        stats: { gamesPlayed: 28, gamesWon: 9, winRate: '32%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'FrostBite', date: '2 weeks ago', replayId: 'R036' },
            { result: 'won', opponent: 'EchoStorm', date: '1 month ago', replayId: 'R037' }
        ]
    },
    {
        username: 'SwiftBlade',
        password: 'password123',
        profile: { rankPoints: 800, avatar: 'https://i.pravatar.cc/150?img=19', status: 'online' },
        stats: { gamesPlayed: 20, gamesWon: 6, winRate: '30%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'DarkKnight', date: '3 weeks ago', replayId: 'R038' },
            { result: 'won', opponent: 'VoidWalker', date: '1 month ago', replayId: 'R039' }
        ]
    },
    {
        username: 'RuneKeeper',
        password: 'password123',
        profile: { rankPoints: 800, avatar: 'https://i.pravatar.cc/150?img=20', status: 'offline' },
        stats: { gamesPlayed: 15, gamesWon: 4, winRate: '27%' },
        achievements: [
            { icon: '🎯', name: 'First Win', unlocked: true },
            { icon: '🔥', name: '5 Win Streak', unlocked: false },
            { icon: '⭐', name: 'Pro Player', unlocked: false },
            { icon: '💎', name: 'Diamond League', unlocked: false }
        ],
        gameHistory: [
            { result: 'lost', opponent: 'SkyHunter', date: '1 month ago', replayId: 'R040' },
            { result: 'won', opponent: 'NewPlayer123', date: '2 months ago', replayId: 'R041' }
        ]
    }
];

async function seedDatabase() {
    try {
        console.log('🌱 Starting database seeding...');
        
        // Clear existing users (optional - comment out if you want to keep existing users)
        // await User.deleteMany({});
        // console.log('🗑️ Cleared existing users');
        
        // Hash passwords and create users
        const usersToInsert = [];
        
        for (const userData of fakeUsers) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(userData.password, salt);
            
            // Calculate rank title from rankPoints
            const rankTitle = calculateRank(userData.profile.rankPoints);
            
            usersToInsert.push({
                ...userData,
                password: hashedPassword,
                profile: {
                    ...userData.profile,
                    rank: rankTitle
                }
            });
        }
        
        // Insert all users
        const insertedUsers = await User.insertMany(usersToInsert, { ordered: false });
        console.log(`✅ Successfully inserted ${insertedUsers.length} users`);
        
        // Update friends list for each user (random friends)
        for (let i = 0; i < insertedUsers.length; i++) {
            const randomFriends = [];
            const friendCount = Math.floor(Math.random() * 5) + 3; // 3-7 friends
            
            for (let j = 0; j < friendCount; j++) {
                let randomIndex;
                do {
                    randomIndex = Math.floor(Math.random() * insertedUsers.length);
                } while (randomIndex === i || randomFriends.includes(insertedUsers[randomIndex]._id));
                
                randomFriends.push({
                    userId: insertedUsers[randomIndex]._id,
                    username: insertedUsers[randomIndex].username
                });
            }
            
            await User.findByIdAndUpdate(insertedUsers[i]._id, {
                friends: randomFriends
            });
        }
        
        console.log('✅ Updated friend lists');
        console.log('🎉 Database seeding completed successfully!');
        
        // Display sample users
        console.log('\n📋 Sample Users Created:');
        insertedUsers.slice(0, 5).forEach(user => {
            console.log(`- ${user.username} (Rank: ${user.profile.rank}, Status: ${user.profile.status})`);
        });
        console.log(`... and ${insertedUsers.length - 5} more users`);
        
        process.exit(0);
    } catch (error) {
        if (error.code === 11000) {
            console.log('⚠️  Users already exist in database (duplicate key error)');
            console.log('💡 To re-seed, first delete existing users or clear the collection');
        } else {
            console.error('❌ Error seeding database:', error.message);
        }
        process.exit(1);
    }
}

seedDatabase();
