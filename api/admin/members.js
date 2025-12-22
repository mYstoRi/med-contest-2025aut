import { requireAuth } from '../_lib/auth.js';
import { getCache, setCache, CACHE_KEYS } from '../_lib/kv.js';

/**
 * Get all members from cache (manual members)
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

/**
 * Get members from Unified Activities
 */
async function getMembersFromUnified() {
    const membersMap = new Map();

    try {
        // Get unified activities
        const activities = await getCache('activities:all') || [];

        // Determine scores from activities
        for (const act of activities) {
            if (!act.member) continue;

            const name = act.member;
            const team = act.team || 'Unknown';
            const type = act.type;
            const value = parseFloat(act.value) || 0; // minutes or count
            const points = parseFloat(act.value) || 0; // Default points = value

            // Calculate specific points
            let medPoints = 0;
            let pracPoints = 0;
            let classPoints = 0;

            if (type === 'meditation') medPoints = points;
            else if (type === 'practice') pracPoints = points;
            else if (type === 'class') classPoints = act.points || (act.value * 50); // Handle legacy class points if needed, assuming value is count? Or consistent points. Unified usually stores points directly or value. sync.js sets value=points for class. Let's verify sync.js logic.
            // In sync.js (lines 328): value: value (from daily: { date: points }). 
            // In daily data from sheets, class value is attendance count usually? 
            // Let's check sync.js conversion again. 
            // sync.js line 328: value is from member.daily[date]. In parseClassSheet, daily values are 1 (attended).
            // But wait, class points are 50 per attendance.
            // In sync.js, does it convert to points?
            // Checking sync.js... "const mergedClass = mergeMembers(existingClass, sheetData.class);" 
            // parseClassSheet returns member.daily where keys are dates, values are 1.
            // So for class, value=1 means 50 points.

            // Correction for Class Points:
            if (type === 'class') {
                // If value is small (likely count), multiply by 50. If large (likely points), keep it.
                // Safest is to rely on what data.js does? data.js aggregates values.
                // Let's assume value in activities:all is "Minutes/Points/Count".
                // In sync.js, for class, value comes from sheet value.
                classPoints = (value < 5) ? value * 50 : value;
            }

            const key = `${team}:${name}`;

            if (!membersMap.has(key)) {
                membersMap.set(key, {
                    id: `db_${team}_${name}`,
                    name,
                    team,
                    meditationTotal: 0,
                    practiceTotal: 0,
                    classTotal: 0,
                    source: 'database'
                });
            }

            const m = membersMap.get(key);
            // Update team if missing
            if ((!m.team || m.team === 'Unknown') && team && team !== 'Unknown') {
                m.team = team;
            }

            if (type === 'meditation') m.meditationTotal += medPoints;
            if (type === 'practice') m.practiceTotal += pracPoints;
            if (type === 'class') m.classTotal += classPoints;
        }

    } catch (error) {
        console.error('Failed to get members from unified activities:', error);
    }

    return Array.from(membersMap.values());
}

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Require admin authentication
    const isAuthed = await requireAuth(req, res);
    if (!isAuthed) return;

    // GET /api/admin/members - Get all members
    if (req.method === 'GET') {
        try {
            // Get manually added members
            const manualMembers = await getMembers();

            // Get synced members (from sheets, includes those with 0 activities)
            const syncedMembers = await getCache('members:synced') || [];

            // Get members from unified activities (to calculate current scores)
            const dbMembers = await getMembersFromUnified();

            // Build comprehensive member map
            const memberMap = new Map();

            // 1. Add synced members first (baseline)
            for (const m of syncedMembers) {
                const key = `${m.team}:${m.name}`;
                memberMap.set(key, { ...m, meditationTotal: 0, practiceTotal: 0, classTotal: 0, totalScore: 0 });
            }

            // 2. Merge activity data (scores)
            for (const m of dbMembers) {
                const key = `${m.team}:${m.name}`;
                if (memberMap.has(key)) {
                    // Update existing synced member with scores
                    const invite = memberMap.get(key);
                    invite.meditationTotal = m.meditationTotal;
                    invite.practiceTotal = m.practiceTotal;
                    invite.classTotal = m.classTotal;
                    invite.id = m.id; // Use DB id if available (likely same prefix if generated consistently)
                    // Actually id in syncedMembers is 'synced_...', in dbMembers is 'db_...'.
                    // Use 'db_' if present as it's linked to activities? Or keep 'synced_'? 
                    // Doesn't strictly matter for display.
                } else {
                    // Member exists in activities but not in synced list (rare, maybe manual submission with typo?)
                    memberMap.set(key, m);
                }
            }

            // 3. Merge manual members (override or add)
            for (const m of manualMembers) {
                const key = `${m.team}:${m.name}`;
                // If exists, override metadata but keep scores? 
                // Manual members usually don't have separate scores stored in members:all, scores come from activities.
                // But getMembers() returns simple objects causing 0 scores if we overwrite.

                let existing = memberMap.get(key);
                if (existing) {
                    memberMap.set(key, { ...existing, ...m, source: 'manual' });
                } else {
                    memberMap.set(key, { ...m, meditationTotal: 0, practiceTotal: 0, classTotal: 0, totalScore: 0 });
                }
            }

            // Flatten and calculate totals
            const allMembers = Array.from(memberMap.values()).map(m => ({
                ...m,
                totalScore: (m.meditationTotal || 0) + (m.practiceTotal || 0) + (m.classTotal || 0)
            }));

            // Sort by total score descending
            allMembers.sort((a, b) => b.totalScore - a.totalScore);

            return res.status(200).json({
                count: allMembers.length,
                members: allMembers
            });
        } catch (error) {
            console.error('Get members error:', error);
            return res.status(500).json({ error: 'Failed to get members' });
        }
    }

    // POST /api/admin/members - Add/Update member
    if (req.method === 'POST') {
        try {
            const { name, team, id } = req.body;

            if (!name || !team) {
                return res.status(400).json({ error: 'Name and Team are required' });
            }

            const members = await getMembers();

            if (id) {
                // Update existing
                const index = members.findIndex(m => m.id === id);
                if (index !== -1) {
                    members[index] = { ...members[index], name, team };
                    await saveMembers(members);
                    return res.status(200).json({ success: true, member: members[index] });
                }
            }

            // Create new
            const newMember = {
                id: generateId(),
                name,
                team,
                meditationTotal: 0,
                practiceTotal: 0,
                classTotal: 0,
                source: 'manual',
                createdAt: new Date().toISOString()
            };

            members.push(newMember);
            await saveMembers(members);

            return res.status(201).json({ success: true, member: newMember });

        } catch (error) {
            console.error('Add member error:', error);
            return res.status(500).json({ error: 'Failed to add member' });
        }
    }

    // DELETE /api/admin/members - Delete member
    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;

            if (!id) {
                return res.status(400).json({ error: 'Member ID is required' });
            }

            let members = await getMembers();
            const initialLength = members.length;
            members = members.filter(m => m.id !== id);

            if (members.length !== initialLength) {
                await saveMembers(members);
                return res.status(200).json({ success: true, message: 'Member deleted' });
            }

            // If not found in manual members, it might be a DB member, checking...
            // Actually we can't delete DB members via this API easily unless we add suppression logic.
            // For now, only manual members can be deleted. DB members come from Sync.

            return res.status(404).json({ error: 'Member not found in manual list' });

        } catch (error) {
            console.error('Delete member error:', error);
            return res.status(500).json({ error: 'Failed to delete member' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
