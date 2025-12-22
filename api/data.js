import { getCache, getCacheMeta, CACHE_KEYS } from './_lib/kv.js';

// API Handler - Database only (aggregates from unified activities)
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get unified activities and metadata
        const [activities, manualMembers, meta] = await Promise.all([
            getCache('activities:all'),
            getCache('members:all'),
            getCacheMeta(),
        ]);

        const allActivities = activities || [];

        // Helper to normalize date (YYYY/MM/DD -> MM/DD for frontend display compatibility)
        // Ideally frontend should handle YYYY/MM/DD, but keeping MM/DD for now if that's what it expects
        // Actually, let's return YYYY/MM/DD and let frontend handle it, or check what frontend expects. 
        // Existing code used normalizeDate to convert to MM/DD. 
        // Let's stick to returning normalized dates (YYYY/MM/DD) but maybe frontend needs MM/DD keys for charts?
        // Let's keep keys as YYYY/MM/DD in the output. The previous system had mixed keys.

        // Build team lookup
        const teamLookup = {};
        const membersList = manualMembers || [];
        for (const m of membersList) {
            if (m.name && m.team) {
                teamLookup[m.name] = m.team;
            }
        }

        // Also build team lookup from activities themselves (if source is database/sheets)
        for (const act of allActivities) {
            if (act.member && act.team && !teamLookup[act.member]) {
                teamLookup[act.member] = act.team;
            }
        }

        // Initialize response structures
        const data = {
            meditation: { members: [], dates: [] },
            practice: { members: [] },
            class: { members: [] },
            recentActivity: [],
            syncedAt: (meta && meta.syncedAt) || new Date().toISOString()
        };

        // Aggregation maps
        const memberStats = {
            meditation: {}, // { name: { total, daily: {} } }
            practice: {},
            class: {}
        };

        // Process all activities
        for (const act of allActivities) {
            const type = act.type;
            if (!['meditation', 'practice', 'class'].includes(type)) continue;

            const name = act.member;
            const value = parseFloat(act.value) || 0;
            const date = act.date; // Should be YYYY/MM/DD

            // Ensure member entry exists
            if (!memberStats[type][name]) {
                memberStats[type][name] = {
                    name,
                    team: act.team || teamLookup[name] || '',
                    total: 0,
                    daily: {}
                };
            }

            // Update stats
            memberStats[type][name].total += value;
            memberStats[type][name].daily[date] = (memberStats[type][name].daily[date] || 0) + value;

            // Update team if found (and not set)
            if (!memberStats[type][name].team && act.team) {
                memberStats[type][name].team = act.team;
            }

            // Collect dates for meditation (used for columns)
            if (type === 'meditation' && !data.meditation.dates.includes(date)) {
                data.meditation.dates.push(date);
            }
        }

        // Convert maps to lists for response
        data.meditation.members = Object.values(memberStats.meditation);
        data.practice.members = Object.values(memberStats.practice);
        data.class.members = Object.values(memberStats.class);

        // Sort dates
        data.meditation.dates.sort();

        // Recent Activity (filter for meditation with details)
        data.recentActivity = allActivities
            .filter(a => a.type === 'meditation' && (a.thoughts || a.timeOfDay))
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0, 50)
            .map(a => ({
                id: a.id,
                name: a.member,
                team: a.team || teamLookup[a.member],
                minutes: a.value,
                date: a.date,
                thoughts: a.thoughts,
                timeOfDay: a.timeOfDay,
                timestamp: a.createdAt
            }));

        // Return Data
        return res.status(200).json(data);

    } catch (error) {
        console.error('Data API error:', error);
        return res.status(500).json({ error: 'Failed to fetch data' });
    }
}
