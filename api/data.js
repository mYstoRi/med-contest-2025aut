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
    const dates = lines[0]?.slice(3) || []; // Skip team, name, total columns
    const members = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 3) continue;

        const team = row[0];
        const name = row[1];
        const total = parseFloat(row[2]) || 0;
        if (!team || !name) continue;

        // Build daily data
        const daily = {};
        for (let j = 3; j < row.length && (j - 3) < dates.length; j++) {
            const date = dates[j - 3];
            const minutes = parseFloat(row[j]) || 0;
            if (date && minutes > 0) {
                daily[date] = minutes;
            }
        }

        members.push({ team, name, total, daily });
    }

    return { dates, members };
}

// Parse practice sheet into structured data
function parsePracticeSheet(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const dates = lines[0]?.slice(3) || [];
    const members = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 3) continue;

        const team = row[0];
        const name = row[1];
        const total = parseFloat(row[2]) || 0;
        if (!team || !name) continue;

        const daily = {};
        for (let j = 3; j < row.length && (j - 3) < dates.length; j++) {
            const date = dates[j - 3];
            const attended = parseFloat(row[j]) || 0;
            if (date && attended > 0) {
                daily[date] = attended;
            }
        }

        members.push({ team, name, total, daily });
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
        // row[2] is tier (not used)
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

        members.push({ team, name, total, points: total * POINTS.CLASS_PER_ATTENDANCE, daily });
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

// API Handler
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
        // Check for force refresh query param
        const forceRefresh = req.query.refresh === 'true';

        // Try to get from cache first
        if (!forceRefresh) {
            const meta = await getCacheMeta();
            if (meta?.syncedAt) {
                const cacheAge = Date.now() - new Date(meta.syncedAt).getTime();
                // Cache is valid for 5 minutes
                if (cacheAge < 5 * 60 * 1000) {
                    const [meditation, practice, classData] = await Promise.all([
                        getCache(CACHE_KEYS.MEDITATION),
                        getCache(CACHE_KEYS.PRACTICE),
                        getCache(CACHE_KEYS.CLASS),
                    ]);

                    if (meditation && practice && classData) {
                        return res.status(200).json({
                            meditation,
                            practice,
                            class: classData,
                            recentActivity: meta.recentActivity || [],
                            syncedAt: meta.syncedAt,
                            fromCache: true,
                        });
                    }
                }
            }
        }

        // Cache miss or stale - fetch from Sheets
        console.log('Cache miss - fetching from Google Sheets');
        const data = await fetchFromSheets();

        // Store in cache
        await Promise.all([
            setCache(CACHE_KEYS.MEDITATION, data.meditation),
            setCache(CACHE_KEYS.PRACTICE, data.practice),
            setCache(CACHE_KEYS.CLASS, data.class),
            setCacheMeta({
                syncedAt: data.syncedAt,
                recentActivity: data.recentActivity,
            }),
        ]);

        return res.status(200).json({
            ...data,
            fromCache: false,
        });
    } catch (error) {
        console.error('Data API error:', error);
        return res.status(500).json({ error: 'Failed to fetch data', details: error.message });
    }
}
