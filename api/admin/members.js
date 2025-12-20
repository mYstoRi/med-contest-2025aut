import { requireAuth } from '../_lib/auth.js';
import { getCache, setCache, CACHE_KEYS } from '../_lib/kv.js';

/**
 * Get all members from cache
 */
async function getMembers() {
    try {
        const members = await getCache('members:all');
        return members || [];
    } catch (error) {
        console.error('Failed to get members:', error);
        return [];
    }
}

/**
 * Save members to cache
 */
async function saveMembers(members) {
    try {
        await setCache('members:all', members, 60 * 60 * 24 * 30); // 30 days TTL
    } catch (error) {
        console.error('Failed to save members:', error);
    }
}

/**
 * Generate unique ID
 */
function generateId() {
    return 'm_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

// Google Sheets config
const SHEET_ID = '1b2kQ_9Ry0Eu-BoZ-EcSxZxkbjIzBAAjjPGQZU9v9f_s';
const MEDITATION_SHEET = '禪定登記';

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

const PRACTICE_SHEET = '共修登記';
const CLASS_SHEET = '會館課登記';
const CLASS_POINTS_PER_ATTENDANCE = 50;

/**
 * Get members from database (synced data)
 * Uses the same data that was synced via /api/admin/sync
 */
async function getMembersFromDatabase() {
    const membersMap = new Map();

    try {
        // Get synced data from database (same keys as sync.js uses)
        const [meditation, practice, classData] = await Promise.all([
            getCache('data:meditation'),
            getCache('data:practice'),
            getCache('data:class'),
        ]);

        // Parse meditation data
        if (meditation?.members) {
            for (const m of meditation.members) {
                const key = `${m.team}:${m.name}`;
                if (!membersMap.has(key)) {
                    membersMap.set(key, {
                        id: `db_${m.team}_${m.name}`,
                        name: m.name,
                        team: m.team,
                        meditationTotal: m.total || 0,
                        practiceTotal: 0,
                        classTotal: 0,
                        source: 'database'
                    });
                } else {
                    membersMap.get(key).meditationTotal = m.total || 0;
                }
            }
        }

        // Parse practice data
        if (practice?.members) {
            for (const m of practice.members) {
                const key = `${m.team}:${m.name}`;
                if (!membersMap.has(key)) {
                    membersMap.set(key, {
                        id: `db_${m.team}_${m.name}`,
                        name: m.name,
                        team: m.team,
                        meditationTotal: 0,
                        practiceTotal: m.total || 0,
                        classTotal: 0,
                        source: 'database'
                    });
                } else {
                    membersMap.get(key).practiceTotal = m.total || 0;
                }
            }
        }

        // Parse class data (has tier info)
        if (classData?.members) {
            for (const m of classData.members) {
                const key = `${m.team}:${m.name}`;
                if (!membersMap.has(key)) {
                    membersMap.set(key, {
                        id: `db_${m.team}_${m.name}`,
                        name: m.name,
                        team: m.team,
                        tier: m.tier || '',
                        meditationTotal: 0,
                        practiceTotal: 0,
                        classTotal: m.points || 0,
                        source: 'database'
                    });
                } else {
                    membersMap.get(key).classTotal = m.points || 0;
                    membersMap.get(key).tier = m.tier || '';
                }
            }
        }
    } catch (error) {
        console.error('Failed to get members from database:', error);
    }

    return Array.from(membersMap.values());
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

    // GET is public, other methods require auth
    if (req.method !== 'GET') {
        const isAuthed = await requireAuth(req, res);
        if (!isAuthed) return;
    }

    // GET /api/admin/members - Get all members (from database + manually added)
    if (req.method === 'GET') {
        try {
            const manualMembers = await getMembers();
            const dbMembers = await getMembersFromDatabase();

            // Merge: dedupe by name+team, prefer manual over database
            const seenKeys = new Set();
            const allMembers = [];

            // Manual first (higher priority)
            for (const m of manualMembers) {
                const key = `${m.team}:${m.name}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    allMembers.push(m);
                }
            }

            // Then database
            for (const m of dbMembers) {
                const key = `${m.team}:${m.name}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    allMembers.push(m);
                }
            }

            const { team } = req.query || {};

            let filtered = allMembers;
            if (team) {
                filtered = filtered.filter(m => m.team === team);
            }

            // Sort by team, then by tier (領航員 first), then by name
            filtered.sort((a, b) => {
                if (a.team !== b.team) return a.team.localeCompare(b.team);
                // 領航員 (navigator) comes before other tiers
                const aIsNavigator = a.tier === '領航員' ? 0 : 1;
                const bIsNavigator = b.tier === '領航員' ? 0 : 1;
                if (aIsNavigator !== bIsNavigator) return aIsNavigator - bIsNavigator;
                return a.name.localeCompare(b.name);
            });

            return res.status(200).json({
                count: filtered.length,
                totalDatabase: dbMembers.length,
                totalManual: manualMembers.length,
                members: filtered
            });
        } catch (error) {
            console.error('Get members error:', error);
            return res.status(500).json({ error: 'Failed to get members' });
        }
    }

    // POST /api/admin/members - Add new member
    if (req.method === 'POST') {
        try {
            const { name, team } = req.body || {};

            if (!name) {
                return res.status(400).json({ error: 'Member name is required' });
            }
            if (!team) {
                return res.status(400).json({ error: 'Team is required' });
            }

            const members = await getMembers();

            // Check for duplicate
            const existing = members.find(m => m.name === name && m.team === team);
            if (existing) {
                return res.status(409).json({ error: 'Member already exists in this team' });
            }

            const member = {
                id: generateId(),
                name,
                team,
                createdAt: new Date().toISOString()
            };

            members.push(member);
            await saveMembers(members);

            return res.status(201).json({
                success: true,
                member,
                message: 'Member added successfully'
            });
        } catch (error) {
            console.error('Add member error:', error);
            return res.status(500).json({ error: 'Failed to add member' });
        }
    }

    // PUT /api/admin/members - Update member
    if (req.method === 'PUT') {
        try {
            const { id, name, team } = req.body || {};

            if (!id) {
                return res.status(400).json({ error: 'Member ID required' });
            }

            const members = await getMembers();
            const index = members.findIndex(m => m.id === id);

            if (index === -1) {
                return res.status(404).json({ error: 'Member not found' });
            }

            if (name) members[index].name = name;
            if (team) members[index].team = team;
            members[index].updatedAt = new Date().toISOString();

            await saveMembers(members);

            return res.status(200).json({
                success: true,
                member: members[index],
                message: 'Member updated successfully'
            });
        } catch (error) {
            console.error('Update member error:', error);
            return res.status(500).json({ error: 'Failed to update member' });
        }
    }

    // DELETE /api/admin/members?id=xxx - Delete member
    if (req.method === 'DELETE') {
        try {
            const { id } = req.query || {};

            if (!id) {
                return res.status(400).json({ error: 'Member ID required' });
            }

            // Find the member first to get name and team
            const members = await getMembers();
            let memberToDelete = null;
            let memberIndex = members.findIndex(m => m.id === id);

            if (memberIndex !== -1) {
                memberToDelete = members[memberIndex];
            } else {
                // Try to find by db_ id pattern (for database-sourced members)
                // Format: db_${team}_${name}
                if (id.startsWith('db_')) {
                    const match = id.match(/^db_(.+)_(.+)$/);
                    if (match) {
                        memberToDelete = { team: match[1], name: match[2] };
                    }
                }
            }

            if (!memberToDelete) {
                return res.status(404).json({ error: 'Member not found' });
            }

            const { name, team } = memberToDelete;
            console.log(`Deleting member: ${name} from team: ${team}`);

            // 1. Remove from manual members list
            if (memberIndex !== -1) {
                members.splice(memberIndex, 1);
                await saveMembers(members);
                console.log(`Removed from members:all`);
            }

            // 2. Remove from meditation data
            const meditation = await getCache(CACHE_KEYS.MEDITATION);
            if (meditation?.members) {
                const medIdx = meditation.members.findIndex(m => m.name === name && m.team === team);
                if (medIdx !== -1) {
                    meditation.members.splice(medIdx, 1);
                    await setCache(CACHE_KEYS.MEDITATION, meditation, 60 * 60 * 24 * 365);
                    console.log(`Removed from meditation data`);
                }
            }

            // 3. Remove from practice data
            const practice = await getCache(CACHE_KEYS.PRACTICE);
            if (practice?.members) {
                const pracIdx = practice.members.findIndex(m => m.name === name && m.team === team);
                if (pracIdx !== -1) {
                    practice.members.splice(pracIdx, 1);
                    await setCache(CACHE_KEYS.PRACTICE, practice, 60 * 60 * 24 * 365);
                    console.log(`Removed from practice data`);
                }
            }

            // 4. Remove from class data
            const classData = await getCache(CACHE_KEYS.CLASS);
            if (classData?.members) {
                const classIdx = classData.members.findIndex(m => m.name === name && m.team === team);
                if (classIdx !== -1) {
                    classData.members.splice(classIdx, 1);
                    await setCache(CACHE_KEYS.CLASS, classData, 60 * 60 * 24 * 365);
                    console.log(`Removed from class data`);
                }
            }

            // 5. Remove associated activities
            const activities = await getCache('activities:all');
            if (activities && Array.isArray(activities)) {
                const filtered = activities.filter(a => !(a.member === name && a.team === team));
                if (filtered.length !== activities.length) {
                    await setCache('activities:all', filtered, 60 * 60 * 24 * 7);
                    console.log(`Removed ${activities.length - filtered.length} activities`);
                }
            }

            return res.status(200).json({
                success: true,
                deleted: { name, team },
                message: 'Member deleted from all data sources'
            });
        } catch (error) {
            console.error('Delete member error:', error);
            return res.status(500).json({ error: 'Failed to delete member' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
