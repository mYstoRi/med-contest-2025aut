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

/**
 * Get members from Google Sheets (direct fetch)
 * Calculates meditation and practice totals by summing daily values
 */
async function getMembersFromSheetsCache() {
    const membersMap = new Map(); // Use Map to dedupe by name+team

    try {
        // Fetch both meditation and practice sheets
        const [medResp, pracResp] = await Promise.all([
            fetch(getSheetUrl(MEDITATION_SHEET)),
            fetch(getSheetUrl(PRACTICE_SHEET)),
        ]);

        const [medCSV, pracCSV] = await Promise.all([
            medResp.ok ? medResp.text() : '',
            pracResp.ok ? pracResp.text() : '',
        ]);

        // Parse meditation sheet - calculate totals from daily values
        if (medCSV) {
            const lines = medCSV.split('\n').map(parseCSVLine);
            const headerRow = lines[0] || [];

            console.log('Meditation header row length:', headerRow.length);
            console.log('Meditation header cols 0-5:', headerRow.slice(0, 6));
            console.log('Meditation first data row:', lines[1]?.slice(0, 6));

            // Find date columns (start at col 3, filter for '/')
            const dateColumns = [];
            for (let c = 3; c < headerRow.length; c++) {
                if (headerRow[c] && headerRow[c].includes('/')) {
                    dateColumns.push(c);
                }
            }
            console.log('Found date columns:', dateColumns.length);

            for (let i = 1; i < lines.length; i++) {
                const row = lines[i];
                if (!row || row.length < 3) continue;
                const team = row[0], name = row[1];
                if (!team || !name) continue;

                // Sum all daily values for total
                let total = 0;
                for (const col of dateColumns) {
                    total += parseFloat(row[col]) || 0;
                }

                const key = `${team}:${name}`;
                if (!membersMap.has(key)) {
                    membersMap.set(key, {
                        id: `sheets_${team}_${name}`,
                        name,
                        team,
                        meditationTotal: total,
                        practiceTotal: 0,
                        source: 'sheets'
                    });
                } else {
                    membersMap.get(key).meditationTotal = total;
                }
            }
        }

        // Parse practice sheet - row 0 has point values, row 1 has dates, data starts row 2
        if (pracCSV) {
            const lines = pracCSV.split('\n').map(parseCSVLine);
            const pointsRow = lines[0] || []; // Point values per session
            const dateRow = lines[1] || [];   // Dates in row 1

            // Find date columns (start at col 3, filter for '/')
            const dateColumns = [];
            for (let c = 3; c < dateRow.length; c++) {
                if (dateRow[c] && dateRow[c].includes('/')) {
                    const points = parseFloat(pointsRow[c]) || 0;
                    dateColumns.push({ col: c, points });
                }
            }

            // Data starts at row 2
            for (let i = 2; i < lines.length; i++) {
                const row = lines[i];
                if (!row || row.length < 3) continue;
                const team = row[0], name = row[1];
                if (!team || !name) continue;

                // Sum points for each attended session
                let total = 0;
                for (const { col, points } of dateColumns) {
                    const attended = parseFloat(row[col]) || 0;
                    if (attended > 0) {
                        total += points > 0 ? points : 1; // Use point value if available
                    }
                }

                const key = `${team}:${name}`;
                if (membersMap.has(key)) {
                    membersMap.get(key).practiceTotal = total;
                } else {
                    membersMap.set(key, {
                        id: `sheets_${team}_${name}`,
                        name,
                        team,
                        meditationTotal: 0,
                        practiceTotal: total,
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

            // Sort by team then name
            filtered.sort((a, b) => {
                if (a.team !== b.team) return a.team.localeCompare(b.team);
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
