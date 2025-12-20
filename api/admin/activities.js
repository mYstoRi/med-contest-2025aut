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

// Google Sheets config
const SHEET_ID = '1b2kQ_9Ry0Eu-BoZ-EcSxZxkbjIzBAAjjPGQZU9v9f_s';
const SHEETS = {
    MEDITATION: '禪定登記',
    PRACTICE: '共修登記',
    CLASS: '會館課登記',
    FORM_RESPONSES: '表單回應 1',
};

function getSheetUrl(sheetName) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
}

/**
 * Get activities from database (synced data)
 * Uses the same data that was synced via /api/admin/sync
 */
async function getActivitiesFromDatabase() {
    const activities = [];

    try {
        // Get synced data from database (same keys as sync.js uses)
        const [meditation, practice, classData, meta] = await Promise.all([
            getCache('data:meditation'),
            getCache('data:practice'),
            getCache('data:class'),
            getCache('data:meta'),
        ]);

        // Convert meditation data to activities
        if (meditation?.members) {
            for (const member of meditation.members) {
                if (member.daily) {
                    for (const [date, value] of Object.entries(member.daily)) {
                        if (value > 0) {
                            activities.push({
                                id: `db_med_${member.team}_${member.name}_${date}`,
                                type: 'meditation',
                                team: member.team,
                                member: member.name,
                                date,
                                value,
                                source: 'database'
                            });
                        }
                    }
                }
            }
        }

        // Convert practice data to activities
        if (practice?.members) {
            for (const member of practice.members) {
                if (member.daily) {
                    for (const [date, value] of Object.entries(member.daily)) {
                        if (value > 0) {
                            activities.push({
                                id: `db_prac_${member.team}_${member.name}_${date}`,
                                type: 'practice',
                                team: member.team,
                                member: member.name,
                                date,
                                value,
                                source: 'database'
                            });
                        }
                    }
                }
            }
        }

        // Convert class data to activities
        if (classData?.members) {
            for (const member of classData.members) {
                if (member.daily) {
                    for (const [date, value] of Object.entries(member.daily)) {
                        if (value > 0) {
                            activities.push({
                                id: `db_class_${member.team}_${member.name}_${date}`,
                                type: 'class',
                                team: member.team,
                                member: member.name,
                                date,
                                value,
                                source: 'database'
                            });
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Failed to get activities from database:', error);
    }

    // Sort activities by date (newest first)
    const parseDateToMs = (dateStr) => {
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
            year = month < 6 ? 2026 : 2025;
        } else {
            return 0;
        }
        return new Date(year, month - 1, day).getTime();
    };

    activities.sort((a, b) => {
        const dateA = parseDateToMs(a.date);
        const dateB = parseDateToMs(b.date);
        return dateB - dateA;
    });

    return activities;
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

    // GET /api/admin/activities - Get all activities (from database + manually added)
    if (req.method === 'GET') {
        try {
            // Get manually added activities
            const manualActivities = await getActivities();

            // Get activities from database (synced data)
            const dbActivities = await getActivitiesFromDatabase();

            // Merge: database activities first, then manual overrides
            const allActivities = [...dbActivities, ...manualActivities];

            const { type, team, member, date, source } = req.query || {};

            let filtered = allActivities;

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
            if (source) {
                filtered = filtered.filter(a => a.source === source);
            }

            // Sort by date descending (use proper date parsing, not string compare)
            const parseDateToMs = (dateStr) => {
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
                    year = month < 6 ? 2026 : 2025;
                } else {
                    return 0;
                }
                return new Date(year, month - 1, day).getTime();
            };

            filtered.sort((a, b) => {
                const dateA = parseDateToMs(a.date);
                const dateB = parseDateToMs(b.date);
                if (dateB !== dateA) {
                    return dateB - dateA;
                }
                return a.type.localeCompare(b.type);
            });

            // Limit to most recent 100 for performance
            filtered = filtered.slice(0, 100);

            return res.status(200).json({
                count: filtered.length,
                totalDatabase: dbActivities.length,
                totalManual: manualActivities.length,
                activities: filtered
            });
        } catch (error) {
            console.error('Get activities error:', error);
            return res.status(500).json({ error: 'Failed to get activities' });
        }
    }

    // POST /api/admin/activities - Add new activity or bulk activities
    if (req.method === 'POST') {
        try {
            const body = req.body || {};

            // Check if bulk submission (activities array)
            if (body.activities && Array.isArray(body.activities)) {
                const newActivities = [];

                for (const item of body.activities) {
                    const { type, team, member, date, value } = item;

                    // Validate each activity
                    if (!type || !ACTIVITY_TYPES.includes(type)) continue;
                    if (!team || !member || !date) continue;

                    newActivities.push({
                        id: generateId(),
                        type,
                        team,
                        member,
                        date,
                        value: parseFloat(value) || 1,
                        createdAt: new Date().toISOString(),
                        source: 'admin'
                    });
                }

                if (newActivities.length === 0) {
                    return res.status(400).json({ error: 'No valid activities provided' });
                }

                const activities = await getActivities();
                activities.push(...newActivities);
                await saveActivities(activities);

                // Invalidate cache
                await deleteCache(CACHE_KEYS.META);

                return res.status(201).json({
                    success: true,
                    count: newActivities.length,
                    message: `${newActivities.length} activities added successfully`
                });
            }

            // Single activity submission (legacy support)
            const { type, team, member, date, value, notes } = body;

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
