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
 * Get activities from Google Sheets (direct fetch)
 * Converts the denormalized Sheets data to normalized activity format
 */
async function getActivitiesFromSheetsCache() {
    const activities = [];
    let formCSV = ''; // Declare at function scope for individual sessions

    try {
        // First try cache for structured data
        let [meditation, practice, classData] = await Promise.all([
            getCache(CACHE_KEYS.MEDITATION),
            getCache(CACHE_KEYS.PRACTICE),
            getCache(CACHE_KEYS.CLASS),
        ]);

        // Always fetch Form Responses for individual meditation sessions
        const formResp = await fetch(getSheetUrl(SHEETS.FORM_RESPONSES));
        formCSV = formResp.ok ? await formResp.text() : '';

        // If cache is empty, fetch structured data directly from Google Sheets
        if (!meditation?.members || meditation.members.length === 0) {
            console.log('Cache empty, fetching directly from Google Sheets');

            const [medResp, pracResp, classResp] = await Promise.all([
                fetch(getSheetUrl(SHEETS.MEDITATION)),
                fetch(getSheetUrl(SHEETS.PRACTICE)),
                fetch(getSheetUrl(SHEETS.CLASS)),
            ]);

            const [medCSV, pracCSV, classCSV] = await Promise.all([
                medResp.ok ? medResp.text() : '',
                pracResp.ok ? pracResp.text() : '',
                classResp.ok ? classResp.text() : '',
            ]);

            // Parse meditation CSV
            // Columns: team(0), name(1), total(2), dates(3+)
            if (medCSV) {
                const lines = medCSV.split('\n').map(parseCSVLine);
                const headerRow = lines[0] || [];
                // Filter to only valid dates (contain '/')
                const dateColumns = [];
                for (let c = 3; c < headerRow.length; c++) {
                    if (headerRow[c] && headerRow[c].includes('/')) {
                        dateColumns.push({ col: c, date: headerRow[c] });
                    }
                }
                meditation = { members: [] };

                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i];
                    if (!row || row.length < 3) continue;
                    const team = row[0], name = row[1];
                    if (!team || !name) continue;

                    const daily = {};
                    for (const { col, date } of dateColumns) {
                        const value = parseFloat(row[col]) || 0;
                        if (value > 0) daily[date] = value;
                    }
                    meditation.members.push({ team, name, daily });
                }
            }

            // Parse practice CSV
            // Columns: team(0), name(1), total(2), dates(3+)
            if (pracCSV) {
                const lines = pracCSV.split('\n').map(parseCSVLine);
                const headerRow = lines[0] || [];
                const dateColumns = [];
                for (let c = 3; c < headerRow.length; c++) {
                    if (headerRow[c] && headerRow[c].includes('/')) {
                        dateColumns.push({ col: c, date: headerRow[c] });
                    }
                }
                practice = { members: [] };

                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i];
                    if (!row || row.length < 3) continue;
                    const team = row[0], name = row[1];
                    if (!team || !name) continue;

                    const daily = {};
                    for (const { col, date } of dateColumns) {
                        const value = parseFloat(row[col]) || 0;
                        if (value > 0) daily[date] = value;
                    }
                    practice.members.push({ team, name, daily });
                }
            }


            // Parse class CSV
            // Columns: team(0), name(1), tier(2), class(3), total(4), dates(5+)
            if (classCSV) {
                const lines = classCSV.split('\n').map(parseCSVLine);
                const headerRow = lines[0] || [];
                const dateColumns = [];
                for (let c = 5; c < headerRow.length; c++) {
                    if (headerRow[c] && headerRow[c].includes('/')) {
                        dateColumns.push({ col: c, date: headerRow[c] });
                    }
                }
                classData = { members: [] };

                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i];
                    if (!row || row.length < 5) continue;
                    const team = row[0], name = row[1];
                    if (!team || !name) continue;

                    const daily = {};
                    for (const { col, date } of dateColumns) {
                        const value = parseFloat(row[col]) || 0;
                        if (value > 0) daily[date] = value;
                    }
                    classData.members.push({ team, name, daily });

                }
            }
        }

        // Build member name -> team mapping from meditation sheet
        const memberTeamMap = {};
        if (meditation?.members) {
            for (const member of meditation.members) {
                memberTeamMap[member.name] = member.team;
            }
        }

        // Parse Form Responses for individual meditation sessions
        // Columns: timestamp(0), name(1), date(2), minutes(3), [comments(4) - NOT team]
        if (formCSV) {
            const lines = formCSV.split('\n').map(parseCSVLine);
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i];
                if (!row || row.length < 4) continue;

                const timestamp = row[0];
                const name = row[1];
                const date = row[2];
                const minutes = parseFloat(row[3]) || 0;
                // Use memberTeamMap ONLY - column 4 contains comments, not team
                const team = memberTeamMap[name] || 'Unknown';

                if (!name || minutes <= 0) continue;

                // Use timestamp for unique ID so each session is separate
                const uniqueId = timestamp ?
                    `form_med_${name}_${timestamp.replace(/[^a-zA-Z0-9]/g, '')}` :
                    `form_med_${name}_${date}_${Math.random().toString(36).substring(7)}`;

                activities.push({
                    id: uniqueId,
                    type: 'meditation',
                    team,
                    member: name,
                    date,
                    value: minutes,
                    timestamp,
                    source: 'form'
                });
            }
        }

        // Convert practice data to activities
        if (practice?.members) {
            for (const member of practice.members) {
                if (member.daily) {
                    for (const [date, value] of Object.entries(member.daily)) {
                        if (value > 0) {
                            activities.push({
                                id: `sheets_prac_${member.team}_${member.name}_${date}`,
                                type: 'practice',
                                team: member.team,
                                member: member.name,
                                date,
                                value,
                                source: 'sheets'
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
                                id: `sheets_class_${member.team}_${member.name}_${date}`,
                                type: 'class',
                                team: member.team,
                                member: member.name,
                                date,
                                value,
                                source: 'sheets'
                            });
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Failed to get activities from Sheets:', error);
    }

    // Sort activities by date (newest first)
    // Parse date helper for MM/DD format
    const parseDate = (dateStr) => {
        if (!dateStr) return new Date(0);
        const parts = dateStr.split('/');
        const month = parseInt(parts[0]) || 1;
        const day = parseInt(parts[1]) || 1;
        // Assume year based on month (Dec-May = spans new year)
        const year = month < 6 ? 2026 : 2025;
        return new Date(year, month - 1, day);
    };

    // Parse timestamp helper for form responses
    const parseTimestamp = (ts) => {
        if (!ts) return null;
        try {
            const parts = ts.split(' ');
            if (parts.length < 2) return null;
            const datePart = parts[0];
            let timePart = parts[1];
            const isPM = timePart.includes('下午');
            timePart = timePart.replace('下午', '').replace('上午', '');
            const [hours, minutes, seconds] = timePart.split(':').map(Number);
            let hour24 = hours;
            if (isPM && hours < 12) hour24 = hours + 12;
            if (!isPM && hours === 12) hour24 = 0;
            const [year, month, day] = datePart.split('/').map(Number);
            return new Date(year, month - 1, day, hour24, minutes || 0, seconds || 0);
        } catch {
            return null;
        }
    };

    activities.sort((a, b) => {
        // Try timestamp first (form responses have this)
        const tsA = a.timestamp ? parseTimestamp(a.timestamp) : null;
        const tsB = b.timestamp ? parseTimestamp(b.timestamp) : null;

        if (tsA && tsB) return tsB - tsA; // Both have timestamps - compare them
        if (tsA) return -1; // Only A has timestamp - A comes first
        if (tsB) return 1;  // Only B has timestamp - B comes first

        // Fall back to date comparison
        return parseDate(b.date) - parseDate(a.date);
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

    // GET /api/admin/activities - Get all activities (from Sheets cache + manually added)
    if (req.method === 'GET') {
        try {
            // Get manually added activities
            const manualActivities = await getActivities();

            // Get activities from Google Sheets cache
            const sheetsActivities = await getActivitiesFromSheetsCache();

            // Merge: manual activities first (they can override)
            const allActivities = [...sheetsActivities, ...manualActivities];

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

            // Sort by date descending, then by type
            filtered.sort((a, b) => {
                // Sort by date (simple string compare works for M/D format within same month)
                if (a.date !== b.date) {
                    return b.date.localeCompare(a.date);
                }
                return a.type.localeCompare(b.type);
            });

            // Limit to most recent 100 for performance
            filtered = filtered.slice(0, 100);

            return res.status(200).json({
                count: filtered.length,
                totalSheets: sheetsActivities.length,
                totalManual: manualActivities.length,
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
