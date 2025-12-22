import { Redis } from '@upstash/redis';

// Create Redis client for session management
const kv = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

// Simple session-based authentication
const SESSION_TTL = 60 * 60 * 24; // 24 hours

/**
 * Hash password using simple method (for demo - use bcrypt in production)
 */
function simpleHash(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
}

/**
 * Generate a random session token
 */
function generateSessionToken() {
    return Math.random().toString(36).substring(2) +
        Math.random().toString(36).substring(2) +
        Date.now().toString(36);
}

/**
 * Verify admin password
 */
export async function verifyPassword(password) {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
        console.error('ADMIN_PASSWORD environment variable not set');
        return false;
    }
    return password === adminPassword;
}

/**
 * Create a new session for authenticated admin
 */
export async function createSession() {
    const token = generateSessionToken();
    try {
        await kv.set(`session:${token}`, {
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + SESSION_TTL * 1000).toISOString()
        }, { ex: SESSION_TTL });
        return token;
    } catch (error) {
        console.error('Failed to create session:', error);
        // Fallback: return token anyway (stateless mode)
        return token;
    }
}

/**
 * Verify session token
 */
export async function verifySession(token) {
    if (!token) return false;
    try {
        const session = await kv.get(`session:${token}`);
        return !!session;
    } catch (error) {
        console.error('Failed to verify session:', error);
        // Fallback: check if token looks valid (stateless mode)
        return token.length > 20;
    }
}

/**
 * Delete session (logout)
 */
export async function deleteSession(token) {
    if (!token) return;
    try {
        await kv.del(`session:${token}`);
    } catch (error) {
        console.error('Failed to delete session:', error);
    }
}

/**
 * Extract session token from request
 */
export function getSessionFromRequest(req) {
    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    // Check cookie
    const cookies = req.headers.cookie?.split(';') || [];
    for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'admin_session') {
            return value;
        }
    }

    return null;
}

/**
 * Middleware-like function to check auth
 */
export async function requireAuth(req, res) {
    const token = getSessionFromRequest(req);
    if (!token) {
        res.status(401).json({ error: 'Not authenticated' });
        return false;
    }

    const isValid = await verifySession(token);
    if (!isValid) {
        res.status(401).json({ error: 'Session expired' });
        return false;
    }

    return true;
}
