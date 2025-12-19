import { requireAuth } from '../_lib/auth.js';
import { getCache, setCache, deleteCache, CACHE_KEYS } from '../_lib/kv.js';

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // All routes require authentication
    const isAuthed = await requireAuth(req, res);
    if (!isAuthed) return;

    // POST /api/admin/invalidate - Clear all caches
    if (req.method === 'POST') {
        try {
            await Promise.all([
                deleteCache(CACHE_KEYS.MEDITATION),
                deleteCache(CACHE_KEYS.PRACTICE),
                deleteCache(CACHE_KEYS.CLASS),
                deleteCache(CACHE_KEYS.META),
            ]);

            return res.status(200).json({
                success: true,
                message: 'Cache invalidated. Next request will fetch fresh data from Google Sheets.',
                invalidatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Cache invalidation error:', error);
            return res.status(500).json({ error: 'Failed to invalidate cache' });
        }
    }

    // GET /api/admin/invalidate - Get cache status
    if (req.method === 'GET') {
        try {
            const meta = await getCache(CACHE_KEYS.META);

            return res.status(200).json({
                hasCachedData: !!meta,
                lastSyncedAt: meta?.syncedAt || null,
                cacheAge: meta?.syncedAt
                    ? Math.round((Date.now() - new Date(meta.syncedAt).getTime()) / 1000) + ' seconds'
                    : null
            });
        } catch (error) {
            console.error('Cache status error:', error);
            return res.status(200).json({ hasCachedData: false, error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
