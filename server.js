const express = require('express');
const session = require('express-session');
const app = express();
const PORT = 4000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'social-secret-key',
    resave: false,
    saveUninitialized: true
}));

// In-Memory Database
const users = []; // Format: { username, following: [] }
const posts = []; // Format: { id, author, content, likes: [], comments: [] }

// Backend API Routes
app.post('/api/auth', (req, res) => {
    const { username } = req.body;
    if (!username.trim()) return res.status(400).json({ msg: "Invalid username" });
    let user = users.find(u => u.username === username);
    if (!user) {
        user = { username, following: [] };
        users.push(user);
    }
    req.session.user = username;
    res.json({ success: true, username });
});

app.get('/api/user', (req, res) => res.json({ user: req.session.user || null, directory: users }));

app.post('/api/posts', (req, res) => {
    if (!req.session.user) return res.status(401).json({ msg: "Unauthorized" });
    const { content } = req.body;
    const post = { id: posts.length + 1, author: req.session.user, content, likes: [], comments: [] };
    posts.push(post);
    res.json({ success: true, post });
});

app.get('/api/posts', (req, res) => res.json(posts));

app.post('/api/posts/:id/like', (req, res) => {
    if (!req.session.user) return res.status(401).json({ msg: "Unauthorized" });
    const post = posts.find(p => p.id == req.params.id);
    if (post) {
        const userIndex = post.likes.indexOf(req.session.user);
        if (userIndex === -1) post.likes.push(req.session.user);
        else post.likes.splice(userIndex, 1);
    }
    res.json({ success: true, post });
});

app.post('/api/posts/:id/comment', (req, res) => {
    if (!req.session.user) return res.status(401).json({ msg: "Unauthorized" });
    const post = posts.find(p => p.id == req.params.id);
    if (post) {
        post.comments.push({ author: req.session.user, text: req.body.text });
    }
    res.json({ success: true, post });
});

app.post('/api/follow', (req, res) => {
    if (!req.session.user) return res.status(401).json({ msg: "Unauthorized" });
    const { target } = req.body;
    const currentUser = users.find(u => u.username === req.session.user);
    if (currentUser && target !== req.session.user) {
        const idx = currentUser.following.indexOf(target);
        if (idx === -1) currentUser.following.push(target);
        else currentUser.following.splice(idx, 1);
    }
    res.json({ success: true, following: currentUser.following });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Single Page Frontend Interface HTML Layout
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>AlphaSocial Platform</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #eef2f3; margin: 0; display: flex; flex-direction: column; height: 100vh; }
            header { background: #007bff; color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center; }
            .main-layout { display: flex; flex: 1; max-width: 1200px; margin: 20px auto; width: 100%; gap: 20px; }
            .feed-section { flex: 2; display: flex; flex-direction: column; gap: 15px; }
            .sidebar { flex: 1; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); height: fit-content; }
            .post-box, .feed-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            textarea, input[type="text"] { width: 95%; padding: 10px; border: 1px solid #ccc; border-radius: 5px; }
            button { background: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; margin-top: 5px; }
            .comment-section { background: #f8f9fa; padding: 10px; margin-top: 10px; border-radius: 5px; }
            .user-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; }
        </style>
    </head>
    <body>
        <header>
            <h2>AlphaSocial</h2>
            <div id="auth-header"></div>
        </header>

        <div class="main-layout" id="app-body" style="display:none;">
            <div class="feed-section">
                <div class="post-box">
                    <h3>Create a Post</h3>
                    <textarea id="post-content" rows="3" placeholder="What's happening?"></textarea>
                    <button onclick="createPost()">Post</button>
                </div>
                <div id="feed-container"></div>
            </div>
            <div class="sidebar">
                <h3>Users Directory</h3>
                <div id="users-directory"></div>
            </div>
        </div>

        <div id="login-screen" class="post-box" style="max-width: 400px; margin: 100px auto; text-align: center;">
            <h3>Welcome to AlphaSocial</h3>
            <input type="text" id="login-username" placeholder="Enter a username to join/login"><br><br>
            <button onclick="login()">Enter App</button>
        </div>

        <script>
            let currentUser = null;
            let followList = [];

            async function login() {
                const username = document.getElementById('login-username').value;
                const res = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username })
                });
                if(res.ok) { init(); }
            }

            async function init() {
                const res = await fetch('/api/user');
                const data = await res.json();
                if(data.user) {
                    currentUser = data.user;
                    const matchedUser = data.directory.find(u => u.username === currentUser);
                    followList = matchedUser ? matchedUser.following : [];
                    
                    document.getElementById('login-screen').style.display = 'none';
                    document.getElementById('app-body').style.display = 'flex';
                    document.getElementById('auth-header').innerHTML = \`<span>@\${currentUser}</span> | <button onclick="logout()" style="background:#dc3545;">Logout</button>\`;
                    
                    renderUsers(data.directory);
                    loadFeed();
                } else {
                    document.getElementById('login-screen').style.display = 'block';
                    document.getElementById('app-body').style.display = 'none';
                }
            }

            async function logout() {
                await fetch('/api/logout');
                location.reload();
            }

            async function createPost() {
                const content = document.getElementById('post-content').value;
                if(!content.trim()) return;
                await fetch('/api/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
                document.getElementById('post-content').value = '';
                loadFeed();
            }

            async function loadFeed() {
                const res = await fetch('/api/posts');
                const posts = await res.json();
                const container = document.getElementById('feed-container');
                container.innerHTML = '';
                
                posts.reverse().forEach(post => {
                    let commentHtml = '';
                    post.comments.forEach(c => {
                        commentHtml += \`<p style="font-size:13px; margin:4px 0;"><strong>@\${c.author}:</strong> \${c.text}</p>\`;
                    });

                    container.innerHTML += \`
                        <div class="feed-card">
                            <h4>@\${post.author}</h4>
                            <p>\${post.content}</p>
                            <button onclick="likePost(\${post.id})">👍 Like (\${post.likes.length})</button>
                            <div class="comment-section">
                                <h5>Comments</h5>
                                \${commentHtml}
                                <input type="text" id="comment-out-\${post.id}" placeholder="Write a comment..." style="width:75%; height:20px; font-size:12px;">
                                <button onclick="addComment(\${post.id})" style="padding:4px 8px; font-size:12px;">Reply</button>
                            </div>
                        </div>\`;
                });
            }

            async function likePost(id) {
                await fetch(\`/api/posts/\${id}/like\`, { method: 'POST' });
                loadFeed();
            }

            async function addComment(id) {
                const input = document.getElementById(\`comment-out-\${id}\`);
                if(!input.value.trim()) return;
                await fetch(\`/api/posts/\${id}/comment\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: input.value })
                });
                input.value = '';
                loadFeed();
            }

            function renderUsers(directory) {
                const container = document.getElementById('users-directory');
                container.innerHTML = '';
                directory.forEach(u => {
                    if(u.username === currentUser) return;
                    const isFollowing = followList.includes(u.username);
                    container.innerHTML += \`
                        <div class="user-item">
                            <span>@\${u.username}</span>
                            <button onclick="toggleFollow('\${u.username}')" style="background:\${isFollowing ? '#6c757d' : '#28a745'}">
                                \${isFollowing ? 'Unfollow' : 'Follow'}
                            </button>
                        </div>\`;
                });
            }

            async function toggleFollow(target) {
                const res = await fetch('/api/follow', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target })
                });
                const data = await res.json();
                followList = data.following;
                init();
            }

            init();
        </script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => console.log(`Social Network platform online at http://localhost:${PORT}`));