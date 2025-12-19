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
 * Get members from Google Sheets (direct fetch)
 * Calculates meditation and practice totals by summing daily values
 */
async function getMembersFromSheetsCache() {
    const membersMap = new Map(); // Use Map to dedupe by name+team

    try {
        // Fetch meditation, practice, and class sheets
        const [medResp, pracResp, classResp] = await Promise.all([
            fetch(getSheetUrl(MEDITATION_SHEET)),
            fetch(getSheetUrl(PRACTICE_SHEET)),
            fetch(getSheetUrl(CLASS_SHEET)),
        ]);

        const [medCSV, pracCSV, classCSV] = await Promise.all([
            medResp.ok ? medResp.text() : '',
            pracResp.ok ? pracResp.text() : '',
            classResp.ok ? classResp.text() : '',
        ]);

        // Parse meditation sheet - EXACT LOGIC FROM team.js
        // Row 0 has dates header, data starts from row 1
        // Sum all daily values (columns 3 onwards)
        if (medCSV) {
            const lines = medCSV.split('\n').map(parseCSVLine);

            for (let i = 1; i < lines.length; i++) {
                const row = lines[i];
                if (!row || row.length < 4) continue;

                const team = row[0], name = row[1];
                if (!team || !name) continue;

                // Sum all daily values (columns 3 onwards) - same as team.js
                let totalMinutes = 0;
                for (let j = 3; j < row.length; j++) {
                    totalMinutes += parseFloat(row[j]) || 0;
                }

                const key = `${team}:${name}`;
                if (!membersMap.has(key)) {
                    membersMap.set(key, {
                        id: `sheets_${team}_${name}`,
                        name,
                        team,
                        meditationTotal: totalMinutes,
                        practiceTotal: 0,
                        classTotal: 0,
                        source: 'sheets'
                    });
                } else {
                    membersMap.get(key).meditationTotal = totalMinutes;
                }
            }
        }


        // Parse practice sheet - EXACT LOGIC FROM team.js
        // Row 0 has the points per session for each date column
        // Row 1 has dates, data starts from row 2
        if (pracCSV) {
            const lines = pracCSV.split('\n').map(parseCSVLine);

            // Row 0 has points per session (slice from col 3)
            const pointsPerSession = lines[0] ? lines[0].slice(3).map(p => parseFloat(p) || 0) : [];

            // Data starts from row 2
            for (let i = 2; i < lines.length; i++) {
                const row = lines[i];
                if (!row || row.length < 4) continue;

                const team = row[0], name = row[1];
                if (!team || !name) continue;

                // Calculate points: attendance (1) * points per session
                let totalPoints = 0;
                for (let j = 3; j < row.length && (j - 3) < pointsPerSession.length; j++) {
                    const attended = parseFloat(row[j]) || 0;
                    if (attended > 0) {
                        totalPoints += pointsPerSession[j - 3] || 0;
                    }
                }

                const key = `${team}:${name}`;
                if (membersMap.has(key)) {
                    membersMap.get(key).practiceTotal = totalPoints;
                } else {
                    membersMap.set(key, {
                        id: `sheets_${team}_${name}`,
                        name,
                        team,
                        meditationTotal: 0,
                        practiceTotal: totalPoints,
                        classTotal: 0,
                        source: 'sheets'
                    });
                }
            }
        }

        // Parse class sheet - EXACT LOGIC FROM team.js
        // Row 0 = dates header, data from row 1
        // Column 0 = team, 1 = name, 2 = tier, 3 = total count
        if (classCSV) {
            const lines = classCSV.split('\n').map(parseCSVLine);

            for (let i = 1; i < lines.length; i++) {
                const row = lines[i];
                if (!row || row.length < 4) continue;

                const team = row[0], name = row[1], tier = row[2];
                // Column 3 has the total count
                const totalClasses = parseFloat(row[3]) || 0;
                if (!team || !name) continue;

                const classPoints = totalClasses * CLASS_POINTS_PER_ATTENDANCE;

                const key = `${team}:${name}`;
                if (membersMap.has(key)) {
                    membersMap.get(key).classTotal = classPoints;
                    membersMap.get(key).tier = tier || '';
                } else {
                    membersMap.set(key, {
                        id: `sheets_${team}_${name}`,
                        name,
                        team,
                        tier: tier || '',
                        meditationTotal: 0,
                        practiceTotal: 0,
                        classTotal: classPoints,
                        source: 'sheets'
                    });
                }
            }
        }
    } catch (error) {
        console.error('Failed to get members from Sheets:', error);
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

    // GET /api/admin/members - Get all members (from Sheets + manually added)
    if (req.method === 'GET') {
        try {
            const manualMembers = await getMembers();
            const sheetsMembers = await getMembersFromSheetsCache();

            // Merge: dedupe by name+team, prefer manual over sheets
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

            // Then sheets
            for (const m of sheetsMembers) {
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
                totalSheets: sheetsMembers.length,
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

            const members = await getMembers();
            const index = members.findIndex(m => m.id === id);

            if (index === -1) {
                return res.status(404).json({ error: 'Member not found' });
            }

            const deleted = members.splice(index, 1)[0];
            await saveMembers(members);

            return res.status(200).json({
                success: true,
                deleted,
                message: 'Member deleted successfully'
            });
        } catch (error) {
            console.error('Delete member error:', error);
            return res.status(500).json({ error: 'Failed to delete member' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
