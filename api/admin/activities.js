import { requireAuth } from '../_lib/auth.js';
import { getCache, setCache, deleteCache, CACHE_KEYS } from '../_lib/kv.js';

// Activity types
const ACTIVITY_TYPES = ['meditation', 'practice', 'class'];

/**
 * Get all activities from cache
 */
async function getActivities() {
    try {
        const activities = await getCache('activities:all');
        return activities || [];
    } catch (error) {
        console.error('Failed to get activities:', error);
        return [];
    }
}

/**
 * Save activities to cache
 */
async function saveActivities(activities) {
    try {
        await setCache('activities:all', activities, 60 * 60 * 24 * 7); // 7 days TTL
    } catch (error) {
        console.error('Failed to save activities:', error);
    }
}

/**
 * Generate unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET is public (for now), other methods require auth
    if (req.method !== 'GET') {
        const isAuthed = await requireAuth(req, res);
        if (!isAuthed) return;
    }

    // GET /api/admin/activities - Get all activities (optionally filtered)
    if (req.method === 'GET') {
        try {
            const activities = await getActivities();
            const { type, team, member, date } = req.query || {};

            let filtered = activities;

            if (type && ACTIVITY_TYPES.includes(type)) {
                filtered = filtered.filter(a => a.type === type);
            }
            if (team) {
                filtered = filtered.filter(a => a.team === team);
            }
            if (member) {
                filtered = filtered.filter(a => a.member === member);
            }
            if (date) {
                filtered = filtered.filter(a => a.date === date);
            }

            return res.status(200).json({
                count: filtered.length,
                activities: filtered
            });
        } catch (error) {
            console.error('Get activities error:', error);
            return res.status(500).json({ error: 'Failed to get activities' });
        }
    }

    // POST /api/admin/activities - Add new activity
    if (req.method === 'POST') {
        try {
            const { type, team, member, date, value, notes } = req.body || {};

            // Validate required fields
            if (!type || !ACTIVITY_TYPES.includes(type)) {
                return res.status(400).json({ error: `Type must be one of: ${ACTIVITY_TYPES.join(', ')}` });
            }
            if (!team) {
                return res.status(400).json({ error: 'Team is required' });
            }
            if (!member) {
                return res.status(400).json({ error: 'Member name is required' });
            }
            if (!date) {
                return res.status(400).json({ error: 'Date is required' });
            }

            const activity = {
                id: generateId(),
                type,
                team,
                member,
                date,
                value: parseFloat(value) || 1, // Default to 1 for attendance
                notes: notes || null,
                createdAt: new Date().toISOString(),
                source: 'admin' // Mark as manually added
            };

            const activities = await getActivities();
            activities.push(activity);
            await saveActivities(activities);

            // Invalidate main data cache so next fetch will include this
            await deleteCache(CACHE_KEYS.META);

            return res.status(201).json({
                success: true,
                activity,
                message: 'Activity added successfully'
            });
        } catch (error) {
            console.error('Add activity error:', error);
            return res.status(500).json({ error: 'Failed to add activity' });
        }
    }

    // DELETE /api/admin/activities?id=xxx - Delete an activity
    if (req.method === 'DELETE') {
        try {
            const { id } = req.query || {};

            if (!id) {
                return res.status(400).json({ error: 'Activity ID required' });
            }

            const activities = await getActivities();
            const index = activities.findIndex(a => a.id === id);

            if (index === -1) {
                return res.status(404).json({ error: 'Activity not found' });
            }

            const deleted = activities.splice(index, 1)[0];
            await saveActivities(activities);

            // Invalidate main data cache
            await deleteCache(CACHE_KEYS.META);

            return res.status(200).json({
                success: true,
                deleted,
                message: 'Activity deleted successfully'
            });
        } catch (error) {
            console.error('Delete activity error:', error);
            return res.status(500).json({ error: 'Failed to delete activity' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
