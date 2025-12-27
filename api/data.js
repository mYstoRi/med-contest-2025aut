import { getCache, getCacheMeta, CACHE_KEYS } from './_lib/kv.js';

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
        year = new Date().getFullYear();
    } else {
        return 0;
    }
    return new Date(year, month - 1, day).getTime();
}

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
        const [activities, manualMembers, syncedMembers, meta] = await Promise.all([
            getCache('activities:all'),
            getCache('members:all'),
            getCache('members:synced'),
            getCacheMeta(),
        ]);

        const allActivities = activities || [];

        // Build comprehensive member list (allMembers) for registration form
        const allMemberMap = new Map();

        // 1. Add synced members (from sheets)
        for (const m of (syncedMembers || [])) {
            const key = `${m.team}:${m.name}`;
            allMemberMap.set(key, { name: m.name, team: m.team || 'Unknown' });
        }

        // 2. Add manual members
        for (const m of (manualMembers || [])) {
            const key = `${m.team}:${m.name}`;
            allMemberMap.set(key, { name: m.name, team: m.team || 'Unknown' });
        }

        // 3. Add members from activities (fallback)
        for (const act of allActivities) {
            if (act.member) {
                const team = act.team || 'Unknown';
                const key = `${team}:${act.member}`;
                if (!allMemberMap.has(key)) {
                    allMemberMap.set(key, { name: act.member, team: team });
                }
            }
        }

        // Build team lookup
        const teamLookup = {};
        for (const m of allMemberMap.values()) {
            teamLookup[m.name] = m.team;
        }

        // Initialize response structures
        const data = {
            meditation: { members: [], dates: [] },
            practice: { members: [] },
            class: { members: [] },
            recentActivity: [],
            syncedAt: (meta && meta.syncedAt) || new Date().toISOString(),
            allMembers: Array.from(allMemberMap.values())
        };

        // Aggregation maps
        const memberStats = {
            meditation: {}, // { name: { total, daily: {} } }
            practice: {},
            class: {}
        };

        // Global stats
        let totalMinutes = 0;
        let totalSessions = 0;

        // Process all activities
        for (const act of allActivities) {
            const type = act.type;
            if (!['meditation', 'practice', 'class'].includes(type)) continue;

            const name = act.member;
            const value = parseFloat(act.value) || 0;
            const date = act.date; // Should be YYYY/MM/DD

            // Update global stats (Meditation only)
            if (type === 'meditation') {
                totalMinutes += value;
                totalSessions++;
            }

            // Ensure member entry exists
            if (!memberStats[type][name]) {
                memberStats[type][name] = {
                    name,
                    team: act.team || teamLookup[name] || '',
                    total: 0,
                    daily: {}
                };
                // For class, add points field
                if (type === 'class') {
                    memberStats.class[name].points = 0;
                }
            }

            // Update stats
            if (type === 'class') {
                // Class special logic: value is count (1) usually. Points = value * 50.
                // If stored value is large (>5), assume it's already points.
                const count = (value < 5) ? value : Math.ceil(value / 50);
                const points = (value < 5) ? value * 50 : value;

                memberStats.class[name].total += count; // Total count
                memberStats.class[name].points += points; // Total points
                memberStats.class[name].daily[date] = (memberStats.class[name].daily[date] || 0) + count;
            } else {
                memberStats[type][name].total += value;
                memberStats[type][name].daily[date] = (memberStats[type][name].daily[date] || 0) + value;
            }

            // Update team if found (and not set)
            if (!memberStats[type][name].team && act.team) {
                memberStats[type][name].team = act.team;
            }

            // Collect dates for meditation (used for columns)
            if (type === 'meditation' && !data.meditation.dates.includes(date)) {
                data.meditation.dates.push(date);
            }
        }

        // Add globals to data
        data.totalMinutes = totalMinutes;
        data.totalSessions = totalSessions;

        // Convert maps to lists for response
        data.meditation.members = Object.values(memberStats.meditation);
        data.practice.members = Object.values(memberStats.practice);
        data.class.members = Object.values(memberStats.class);

        // Sort dates
        data.meditation.dates.sort();

        // Recent Activity (filter for meditation with details)
        data.recentActivity = allActivities
            .filter(a => a.type === 'meditation' && (a.thoughts || a.timeOfDay))
            .sort((a, b) => {
                // Primary sort: by activity date (descending)
                const dateA = parseActivityDate(a.date);
                const dateB = parseActivityDate(b.date);
                if (dateB !== dateA) return dateB - dateA;
                // Secondary sort: by createdAt (descending)
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            })
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
