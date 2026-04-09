const url = require('url');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const User = require('../models/user');
const Game = require('../models/game');
const { parseBody, sendJSON, serveFile } = require('../utils/helpers');

const frontendDir = path.join(__dirname, '..', 'frontend');

// Configure Cloudinary
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('✅ Cloudinary configured');
} else {
    console.log('⚠️ Cloudinary not configured - profile image uploads will fail');
}

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Check if file is an image
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

async function handleAPIRequest(req, res) {
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

        // Upload Profile Image Endpoint
        else if (pathname === '/api/upload-profile-image' && req.method === 'POST') {
            // Handle multipart form data with multer
            upload.single('profileImage')(req, res, async (err) => {
                if (err) {
                    if (err instanceof multer.MulterError) {
                        if (err.code === 'LIMIT_FILE_SIZE') {
                            return sendJSON(res, 400, { error: 'File too large. Maximum size is 5MB.' });
                        }
                    }
                    return sendJSON(res, 400, { error: err.message || 'File upload error' });
                }

                if (!req.file) {
                    return sendJSON(res, 400, { error: 'No file uploaded' });
                }

                const userId = req.body.userId;
                if (!userId) {
                    return sendJSON(res, 400, { error: 'User ID is required' });
                }

                try {
                    // Check if Cloudinary is configured
                    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
                        return sendJSON(res, 500, { error: 'Image upload service not configured. Please set up Cloudinary credentials.' });
                    }

                    // Upload to Cloudinary
                    const result = await new Promise((resolve, reject) => {
                        const uploadStream = cloudinary.uploader.upload_stream(
                            {
                                folder: 'tictactoe-profiles',
                                public_id: `profile-${userId}-${Date.now()}`,
                                transformation: [
                                    { width: 200, height: 200, crop: 'fill', gravity: 'face' },
                                    { quality: 'auto' }
                                ]
                            },
                            (error, result) => {
                                if (error) {
                                    console.error('Cloudinary upload error:', error);
                                    reject(error);
                                } else {
                                    resolve(result);
                                }
                            }
                        );
                        uploadStream.end(req.file.buffer);
                    });

                    // Update user profile with new image URL
                    const user = await User.findByIdAndUpdate(
                        userId,
                        { 'profile.avatar': result.secure_url },
                        { new: true }
                    );

                    if (!user) {
                        return sendJSON(res, 404, { error: 'User not found' });
                    }

                    return sendJSON(res, 200, {
                        message: 'Profile image uploaded successfully',
                        avatarUrl: result.secure_url
                    });

                } catch (error) {
                    console.error('Error uploading image:', error);
                    return sendJSON(res, 500, { error: `Failed to upload image: ${error.message}` });
                }
            });
            return; // Important: return here to prevent further processing
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
}

module.exports = { handleAPIRequest };