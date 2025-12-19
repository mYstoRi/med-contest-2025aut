import { verifyPassword, createSession, deleteSession, getSessionFromRequest, verifySession } from '../_lib/auth.js';

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // POST /api/admin/auth - Login
    if (req.method === 'POST') {
        try {
            const { password } = req.body || {};

            if (!password) {
                return res.status(400).json({ error: 'Password required' });
            }

            const isValid = await verifyPassword(password);
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid password' });
            }

            const token = await createSession();

            // Set cookie for browser-based auth
            res.setHeader('Set-Cookie', `admin_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24}`);

            return res.status(200).json({
                success: true,
                token,
                message: 'Logged in successfully'
            });
        } catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({ error: 'Login failed' });
        }
    }

    // GET /api/admin/auth - Check auth status
    if (req.method === 'GET') {
        const token = getSessionFromRequest(req);
        if (!token) {
            return res.status(200).json({ authenticated: false });
        }

        const isValid = await verifySession(token);
        return res.status(200).json({ authenticated: isValid });
    }

    // DELETE /api/admin/auth - Logout
    if (req.method === 'DELETE') {
        const token = getSessionFromRequest(req);
        if (token) {
            await deleteSession(token);
        }

        // Clear cookie
        res.setHeader('Set-Cookie', 'admin_session=; Path=/; HttpOnly; Max-Age=0');

        return res.status(200).json({ success: true, message: 'Logged out' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
