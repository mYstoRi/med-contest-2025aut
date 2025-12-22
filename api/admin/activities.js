import { requireAuth } from '../_lib/auth.js';
import { getCache, setCache, deleteCache, CACHE_KEYS } from '../_lib/kv.js';

// Activity types
const ACTIVITY_TYPES = ['meditation', 'practice', 'class'];

/**
 * Get all activities from unified storage
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
 * Save activities to unified storage
 */
async function saveActivities(activities) {
    try {
        const { setDataPermanent } = await import('../_lib/kv.js');
        await setDataPermanent('activities:all', activities);
    } catch (error) {
        console.error('Failed to save activities:', error);
        throw error;
    }
}

/**
 * Generate unique ID
 */
function generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse activity date to milliseconds for sorting
 * Handles formats: YYYY/MM/DD, MM/DD
 */
function parseActivityDate(dateStr) {
    if (!dateStr) return 0;
    const parts = dateStr.split('/');
    let year, month, day;

    if (parts.length === 3) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
    } else if (parts.length === 2) {
        month = parseInt(parts[0], 10) || 1;
        day = parseInt(parts[1], 10) || 1;
        // Assume current year for MM/DD format
        year = new Date().getFullYear();
    } else {
        return 0;
    }
    return new Date(year, month - 1, day).getTime();
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Require admin authentication
    const isAuthed = await requireAuth(req, res);
    if (!isAuthed) return;

    // GET /api/admin/activities - Get all activities
    if (req.method === 'GET') {
        try {
            console.time('getActivities');
            let activities = await getActivities();
            console.timeEnd('getActivities');
            console.log(`📊 Loaded ${activities.length} activities`);

            // Parse query parameters for filtering
            const { type, team, member, date, source } = req.query || {};

            // Apply filters
            if (type) {
                activities = activities.filter(a => a.type === type);
            }
            if (team) {
                activities = activities.filter(a => a.team === team);
            }
            if (member) {
                activities = activities.filter(a =>
                    a.member?.toLowerCase().includes(member.toLowerCase())
                );
            }
            if (date) {
                activities = activities.filter(a => a.date?.includes(date));
            }
            if (source) {
                activities = activities.filter(a => a.source === source);
            }

            // Sort by date descending (newest first)
            activities.sort((a, b) => {
                const dateA = parseActivityDate(a.date);
                const dateB = parseActivityDate(b.date);
                return dateB - dateA;
            });

            // Limit to 500 for performance
            const totalCount = activities.length;
            activities = activities.slice(0, 500);

            // Debug log
            const withThoughts = activities.filter(a => a.thoughts).length;
            console.log(`📊 Activities: ${activities.length}/${totalCount} total, ${withThoughts} with thoughts`);

            return res.status(200).json({
                count: activities.length,
                totalCount,
                activities
            });
        } catch (error) {
            console.error('Get activities error:', error);
            return res.status(500).json({ error: 'Failed to get activities' });
        }
    }

    // POST /api/admin/activities - Add new activity
    if (req.method === 'POST') {
        try {
            const body = req.body || {};
            const { type, team, member, date, value, notes, thoughts, timeOfDay } = body;

            // Validate required fields
            if (!type || !ACTIVITY_TYPES.includes(type)) {
                return res.status(400).json({ error: 'Invalid type. Must be meditation, practice, or class' });
            }
            if (!team || !member || !date) {
                return res.status(400).json({ error: 'Missing required fields: team, member, date' });
            }

            const activity = {
                id: generateId(),
                type,
                team,
                member,
                date,
                value: parseFloat(value) || 1,
                notes: notes || undefined,
                thoughts: thoughts || undefined,
                timeOfDay: timeOfDay || undefined,
                source: 'admin',
                createdAt: new Date().toISOString()
            };

            const activities = await getActivities();
            activities.push(activity);
            await saveActivities(activities);

            // Invalidate main data cache
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

    // DELETE /api/admin/activities?id=xxx or ?ids=xxx,yyy,zzz
    if (req.method === 'DELETE') {
        try {
            const { id, ids } = req.query || {};

            // Support bulk delete with comma-separated IDs
            let idsToDelete = [];
            if (ids) {
                idsToDelete = ids.split(',').map(s => s.trim()).filter(Boolean);
            } else if (id) {
                idsToDelete = [id];
            }

            if (idsToDelete.length === 0) {
                return res.status(400).json({ error: 'Activity ID(s) required. Use ?id=xxx or ?ids=xxx,yyy,zzz' });
            }

            // Load all activities
            let activities = await getActivities();
            const originalCount = activities.length;

            // Create a Set for O(1) lookup
            const deleteSet = new Set(idsToDelete);

            // Filter out the activities to delete
            activities = activities.filter(a => !deleteSet.has(a.id));

            const deletedCount = originalCount - activities.length;

            if (deletedCount > 0) {
                await saveActivities(activities);
                await deleteCache(CACHE_KEYS.META);
            }

            console.log(`🗑️ Deleted ${deletedCount} activities (requested ${idsToDelete.length})`);

            return res.status(200).json({
                success: true,
                deletedCount,
                requestedCount: idsToDelete.length,
                message: `Deleted ${deletedCount} activities`
            });
        } catch (error) {
            console.error('Delete activity error:', error);
            return res.status(500).json({ error: 'Failed to delete activity' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
