import { getCache, setCache, getCacheMeta, setCacheMeta, CACHE_KEYS } from './_lib/kv.js';

// Google Sheets configuration (same as config.js but for API)
const SHEET_ID = '1b2kQ_9Ry0Eu-BoZ-EcSxZxkbjIzBAAjjPGQZU9v9f_s';
const SHEETS = {
    MEDITATION: '禪定登記',
    PRACTICE: '共修登記',
    CLASS: '會館課登記',
    FORM_RESPONSES: '表單回應 1',
};

// Points configuration
const POINTS = {
    CLASS_PER_ATTENDANCE: 50,
};

// Build Google Sheets CSV URL
function getSheetUrl(sheetName) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

// Parse CSV line handling quoted values
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

// Parse meditation sheet into structured data
function parseMeditationSheet(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const dates = lines[0]?.slice(3) || []; // Row 0 has dates from col 3
    const members = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 3) continue;

        const team = row[0];
        const name = row[1];
        if (!team || !name) continue;

        // Build daily data and calculate total from daily values
        const daily = {};
        let total = 0;
        for (let j = 3; j < row.length && (j - 3) < dates.length; j++) {
            const date = dates[j - 3];
            const minutes = parseFloat(row[j]) || 0;
            if (date && minutes > 0) {
                daily[date] = minutes;
                total += minutes;
            }
        }

        members.push({ team, name, total, daily });
    }

    return { dates, members };
}

// Parse practice sheet into structured data
// Row 0 = points per session, Row 1 = dates, Data from row 2
function parsePracticeSheet(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const pointsRow = lines[0] || []; // Row 0 = points per session
    const datesRow = lines[1] || []; // Row 1 = dates
    const dates = datesRow.slice(3) || [];
    const members = [];

    // Data starts from row 2
    for (let i = 2; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 3) continue;

        const team = row[0];
        const name = row[1];
        if (!team || !name) continue;

        // Calculate points from attendance * points per session
        const daily = {};
        let total = 0;
        for (let j = 3; j < row.length && (j - 3) < dates.length; j++) {
            const date = dates[j - 3];
            const attended = parseFloat(row[j]) || 0;
            const points = parseFloat(pointsRow[j]) || 0;
            if (date && attended > 0 && points > 0) {
                daily[date] = points;
                total += points;
            }
        }

        if (total > 0) {
            members.push({ team, name, total, daily });
        }
    }

    return { dates, members };
}

// Parse class sheet into structured data
function parseClassSheet(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const dates = lines[0]?.slice(4) || []; // Skip team, name, tier, total columns
    const members = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 4) continue;

        const team = row[0];
        const name = row[1];
        const tier = row[2] || ''; // tier column - '領航員' means navigator
        const total = parseFloat(row[3]) || 0;
        if (!team || !name) continue;

        const daily = {};
        for (let j = 4; j < row.length && (j - 4) < dates.length; j++) {
            const date = dates[j - 4];
            const attended = parseFloat(row[j]) || 0;
            if (date && attended > 0) {
                daily[date] = attended;
            }
        }

        members.push({ team, name, tier, total, points: total * POINTS.CLASS_PER_ATTENDANCE, daily });
    }

    return { dates, members };
}

// Parse form responses for recent activity
function parseFormResponses(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const activities = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 4) continue;

        const timestamp = row[0];
        const name = row[1];
        const date = row[2];
        const minutes = parseFloat(row[3]) || 0;

        if (!name || minutes <= 0) continue;

        activities.push({ timestamp, name, date, minutes });
    }

    // Sort by timestamp descending (most recent first)
    activities.sort((a, b) => {
        const parseTs = (ts) => {
            if (!ts) return 0;
            try {
                const parts = ts.split(' ');
                if (parts.length < 2) return 0;
                const datePart = parts[0];
                let timePart = parts[1];
                const isPM = timePart.includes('下午');
                timePart = timePart.replace('下午', '').replace('上午', '');
                const [hours, minutes, seconds] = timePart.split(':').map(Number);
                let hour24 = hours;
                if (isPM && hours < 12) hour24 = hours + 12;
                if (!isPM && hours === 12) hour24 = 0;
                const [year, month, day] = datePart.split('/').map(Number);
                return new Date(year, month - 1, day, hour24, minutes || 0, seconds || 0).getTime();
            } catch {
                return 0;
            }
        };
        return parseTs(b.timestamp) - parseTs(a.timestamp);
    });

    return activities.slice(0, 50); // Return last 50 activities
}

// Fetch data from Google Sheets
async function fetchFromSheets() {
    const [medResp, pracResp, classResp, formResp] = await Promise.all([
        fetch(getSheetUrl(SHEETS.MEDITATION)),
        fetch(getSheetUrl(SHEETS.PRACTICE)),
        fetch(getSheetUrl(SHEETS.CLASS)),
        fetch(getSheetUrl(SHEETS.FORM_RESPONSES)),
    ]);

    const [medCSV, pracCSV, classCSV, formCSV] = await Promise.all([
        medResp.ok ? medResp.text() : '',
        pracResp.ok ? pracResp.text() : '',
        classResp.ok ? classResp.text() : '',
        formResp.ok ? formResp.text() : '',
    ]);

    return {
        meditation: medCSV ? parseMeditationSheet(medCSV) : { dates: [], members: [] },
        practice: pracCSV ? parsePracticeSheet(pracCSV) : { dates: [], members: [] },
        class: classCSV ? parseClassSheet(classCSV) : { dates: [], members: [] },
        recentActivity: formCSV ? parseFormResponses(formCSV) : [],
        syncedAt: new Date().toISOString(),
    };
}

// API Handler - Database first, no auto-sync from sheets
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

        // Get data from database
        const [meditation, practice, classData, meta, manualActivities, manualMembers] = await Promise.all([
            getCache(CACHE_KEYS.MEDITATION),
            getCache(CACHE_KEYS.PRACTICE),
            getCache(CACHE_KEYS.CLASS),
            getCacheMeta(),
            getCache('activities:all'),
            getCache('members:all'),
        ]);

        // Initialize structures if empty
        const syncedRecentActivity = meta?.recentActivity || [];

        // Convert manual meditation activities to recentActivity format
        // Note: manualActivities is now stored pre-sorted (newest first)
        const manualRecentActivities = (manualActivities || [])
            .filter(a => a.type === 'meditation')
            .map(a => ({
                type: 'meditation',
                name: a.member,
                team: a.team,
                date: a.date,
                minutes: a.value,
                points: a.value,
                timestamp: a.createdAt || a.date,
            }));

        // Parse date helper for sorting
        const parseDate = (dateStr) => {
            if (!dateStr) return 0;
            const normalized = (dateStr || '').replace(/\//g, '-');
            return new Date(normalized).getTime() || 0;
        };

        // Combine synced and manual activities, then sort by date (newest first)
        // Note: Synced data is sorted by timestamp, not date, so we need to re-sort
        const allActivities = [...syncedRecentActivity, ...manualRecentActivities];
        allActivities.sort((a, b) => parseDate(b.date) - parseDate(a.date));
        const combinedActivity = allActivities.slice(0, 50);

        const result = {
            meditation: meditation || { dates: [], members: [] },
            practice: practice || { dates: [], members: [] },
            class: classData || { dates: [], members: [] },
            recentActivity: combinedActivity, // Already limited to 50 by merge
            syncedAt: meta?.syncedAt || null,
        };

        // Merge Manual Members
        // We add them to 'meditation' list as base, as that's used for Register form
        if (manualMembers && Array.isArray(manualMembers)) {
            manualMembers.forEach(m => {
                // Check if already in meditation members
                if (!result.meditation.members.some(ex => ex.name === m.name && ex.team === m.team)) {
                    result.meditation.members.push({
                        team: m.team,
                        name: m.name,
                        total: 0,
                        daily: {}
                    });
                }
                // Ensure team exists in other lists if needed, or wait for activity to add them
            });
        }

        // Merge Manual Activities
        if (manualActivities && Array.isArray(manualActivities)) {
            manualActivities.forEach(activity => {
                const { type, team, member, date, value } = activity;
                let targetCategory = null;

                if (type === 'meditation') targetCategory = result.meditation;
                else if (type === 'practice') targetCategory = result.practice;
                else if (type === 'class') targetCategory = result.class;

                if (targetCategory) {
                    // Find or Create Member
                    let memberObj = targetCategory.members.find(m => m.name === member && m.team === team);
                    if (!memberObj) {
                        memberObj = { team, name: member, total: 0, daily: {} };
                        if (type === 'class') memberObj.tier = ''; // Class specific
                        targetCategory.members.push(memberObj);
                    }

                    // Update Totals and Daily
                    // Note: Manual activity might duplicate sheet data if not careful. 
                    // Assuming manual is additive or override? 
                    // Admin usually adds missing data. We'll add it.
                    // Ideally we should check if date exists? 
                    // For now, we overwrite/set the value for that date to the manual value.
                    // If multiple manual entries for same date? Admin only allows one?
                    // Admin addActivity allows multiple. We'll assume simple case.

                    // Logic: If manual value exists, USE it? Or ADD it?
                    // Code below ADDS if not present, or ADDS to existing?
                    // Let's assume manual records are discrete events.
                    // If daily[date] exists, we accumulate?
                    // Sheet data is usually "total minutes for that day".
                    // Admin manual add is "add activity".
                    // If I add 30 mins.
                    // We should add to daily[date].

                    const currentValue = memberObj.daily[date] || 0;
                    // For class, value is 1 (attendance) usually, but activity.value might be points.
                    // parseClassSheet uses points = total * 50.
                    // If type is class, value is attendance count?

                    // Simple addition
                    memberObj.daily[date] = currentValue + value;
                    memberObj.total += value;
                    // Note: Class total in parseClassSheet is 'total count'. 
                    // But points is total * 50.
                    // Check parseClassSheet: "total = parseFloat(row[3])", "points: total * POINTS.CLASS_PER_ATTENDANCE"
                    // If we update class, we need to update 'points' field if it exists?
                    if (type === 'class' && memberObj.points !== undefined) {
                        memberObj.points += (value * 50); // Assuming value is 1 for attendance
                    }

                    // Add date to dates list if missing and keep sorted?
                    // Dates array usually sorted.
                    if (!targetCategory.dates.includes(date)) {
                        targetCategory.dates.push(date);
                        targetCategory.dates.sort(); // Simple sort YYYY/MM/DD works
                    }
                }
            });
        }

        // Check if database has data (synced or manual)
        const hasData = result.meditation.members.length > 0 ||
            result.practice.members.length > 0 ||
            result.class.members.length > 0;

        return res.status(200).json({
            ...result,
            isEmpty: !hasData,
            message: hasData ? null : 'Database is empty. Use admin panel to sync from Google Sheets.',
        });
    } catch (error) {
        console.error('Data API error:', error);
        return res.status(500).json({ error: 'Failed to fetch data', details: error.message });
    }
}
