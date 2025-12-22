import { requireAuth } from '../_lib/auth.js';
import { getCache, setDataPermanent, setCacheMeta, deleteCache, DATA_KEYS } from '../_lib/kv.js';

// Google Sheets configuration
const SHEET_ID = '1b2kQ_9Ry0Eu-BoZ-EcSxZxkbjIzBAAjjPGQZU9v9f_s';
const SHEETS = {
    MEDITATION: '禪定登記',
    PRACTICE: '共修登記',
    CLASS: '會館課登記',
    FORM_RESPONSES: '表單回應 1',
};

const POINTS = {
    CLASS_PER_ATTENDANCE: 50,
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

function parseMeditationSheet(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const dates = lines[0]?.slice(3) || [];
    const members = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 3) continue;

        const team = row[0];
        const name = row[1];
        if (!team || !name) continue;

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
            const sessionPoints = parseFloat(pointsRow[j]) || 0;
            if (date && attended > 0 && sessionPoints > 0) {
                daily[date] = sessionPoints;
                total += sessionPoints;
            }
        }

        members.push({ team, name, total, daily });
    }

    return { dates, members };
}

function parseClassSheet(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const dates = lines[0]?.slice(4) || [];
    const members = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 4) continue;

        const team = row[0];
        const name = row[1];
        const tier = row[2] || '';
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

function parseFormResponses(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const submissions = [];

    // Expected columns from Google Form:
    // 0: Timestamp, 1: Name, 2: Date, 3: Duration/Minutes, 4: TimeOfDay, 5: Thoughts, 6: ShareConsent, 7: Team (optional)
    // But the actual order may vary - check the header row
    const header = lines[0] || [];
    console.log('Form response headers:', header);

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 4) continue;

        const timestamp = row[0];
        const name = row[1];
        const date = row[2];
        const minutes = parseFloat(row[3]) || 0;

        if (!name || !date || minutes <= 0) continue;

        // Try to get additional columns if they exist
        // Columns: 0=Timestamp, 1=Name, 2=Date, 3=Minutes, 4=TimeOfDay, 5=Thoughts, 6=ShareConsent
        const timeOfDay = row[4] || '';
        const thoughts = row[5] || '';
        const shareConsent = row[6] || '';
        const team = ''; // No team column in form - will be looked up from member data later

        // Generate a unique ID for this submission
        const id = 'sub_sync_' + Date.now().toString(36) + '_' + i;

        submissions.push({
            id,
            type: 'meditation',
            name,
            team,
            date,
            duration: minutes,
            minutes,
            points: minutes,
            timeOfDay,
            thoughts,
            shareConsent,
            timestamp,
            submittedAt: timestamp,
            source: 'sheets'
        });
    }

    submissions.sort((a, b) => {
        const parseTs = (ts) => {
            if (!ts) return 0;
            try {
                const [datePart, timePart] = ts.split(' ');
                if (!timePart) return new Date(datePart).getTime();
                const [time, period] = timePart.split(' ');
                const [hours, minutes, seconds] = time.split(':').map(Number);
                const isPM = period?.toUpperCase() === '下午' || period?.toUpperCase() === 'PM';
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

    return submissions;
}

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

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    // Require admin authentication
    const isAuthed = await requireAuth(req, res);
    if (!isAuthed) return;

    try {
        const { mode = 'merge' } = req.body || {};

        // Validate mode
        if (!['merge', 'overwrite'].includes(mode)) {
            return res.status(400).json({
                error: 'Invalid mode. Use "merge" or "overwrite".',
                modes: {
                    merge: 'Add new data, preserve existing database entries',
                    overwrite: 'Replace all database data with sheet data'
                }
            });
        }

        console.log(`📥 Starting sync from Google Sheets (mode: ${mode})`);

        // Fetch data from sheets
        const sheetData = await fetchFromSheets();
        console.log(`📊 Fetched: ${sheetData.meditation.members.length} meditation, ${sheetData.practice.members.length} practice, ${sheetData.class.members.length} class`);

        if (mode === 'overwrite') {
            // Overwrite: Clear everything first, then replace with sheet data
            console.log('🗑️ Clearing all manual data caches...');
            await Promise.all([
                deleteCache('members:all'),
                deleteCache('activities:all'),
                deleteCache(DATA_KEYS.TEAMS),
            ]);
            console.log('✅ Manual caches cleared');

            console.log('💾 Saving sheet data to database...');
            await Promise.all([
                setDataPermanent(DATA_KEYS.MEDITATION, sheetData.meditation),
                setDataPermanent(DATA_KEYS.PRACTICE, sheetData.practice),
                setDataPermanent(DATA_KEYS.CLASS, sheetData.class),
                // Store form responses with thoughts to submissions:all
                setDataPermanent('submissions:all', sheetData.recentActivity),
                setCacheMeta({
                    syncedAt: sheetData.syncedAt,
                    recentActivity: sheetData.recentActivity.slice(0, 50), // Keep recent 50 for display
                    lastSyncMode: 'overwrite',
                }),
            ]);

            // Verify data was saved by reading it back
            console.log('🔍 Verifying save...');
            const verifyMed = await getCache(DATA_KEYS.MEDITATION);
            const verified = verifyMed?.members?.length || 0;
            console.log(`✅ Verified: ${verified} meditation members saved`);

            return res.status(200).json({
                success: true,
                mode: 'overwrite',
                message: 'Database overwritten with Google Sheets data',
                syncedAt: sheetData.syncedAt,
                stats: {
                    meditation: sheetData.meditation.members.length,
                    practice: sheetData.practice.members.length,
                    class: sheetData.class.members.length,
                    recentActivity: sheetData.recentActivity.length,
                },
                verified: verified,
            });
        } else {
            // Merge: Get existing data first
            const [existingMed, existingPrac, existingClass, existingMeta] = await Promise.all([
                getCache(DATA_KEYS.MEDITATION),
                getCache(DATA_KEYS.PRACTICE),
                getCache(DATA_KEYS.CLASS),
                getCache(DATA_KEYS.META),
            ]);

            // Merge function: combine members, prefer sheet data for same name+team
            const mergeMembers = (existing, newData) => {
                if (!existing?.members) return newData;

                const merged = { ...newData };
                const existingMap = new Map();

                // Index existing by name+team
                for (const m of existing.members) {
                    existingMap.set(`${m.team}:${m.name}`, m);
                }

                // Add sheet members (overwrites existing with same key)
                for (const m of newData.members) {
                    existingMap.set(`${m.team}:${m.name}`, m);
                }

                merged.members = Array.from(existingMap.values());
                return merged;
            };

            const mergedMed = mergeMembers(existingMed, sheetData.meditation);
            const mergedPrac = mergeMembers(existingPrac, sheetData.practice);
            const mergedClass = mergeMembers(existingClass, sheetData.class);

            // Merge submissions: combine existing with new, dedupe by timestamp+name
            const existingSubmissions = await getCache('submissions:all') || [];
            const existingSubMap = new Map();
            for (const sub of existingSubmissions) {
                const key = `${sub.name}:${sub.timestamp || sub.submittedAt}`;
                existingSubMap.set(key, sub);
            }
            for (const sub of sheetData.recentActivity) {
                const key = `${sub.name}:${sub.timestamp || sub.submittedAt}`;
                existingSubMap.set(key, sub);
            }
            const mergedSubmissions = Array.from(existingSubMap.values())
                .sort((a, b) => new Date(b.submittedAt || b.timestamp) - new Date(a.submittedAt || a.timestamp))
                .slice(0, 500); // Keep max 500

            console.log('💾 Saving merged data...');
            await Promise.all([
                setDataPermanent(DATA_KEYS.MEDITATION, mergedMed),
                setDataPermanent(DATA_KEYS.PRACTICE, mergedPrac),
                setDataPermanent(DATA_KEYS.CLASS, mergedClass),
                setDataPermanent('submissions:all', mergedSubmissions),
                setCacheMeta({
                    syncedAt: sheetData.syncedAt,
                    recentActivity: mergedSubmissions.slice(0, 50),
                    lastSyncMode: 'merge',
                }),
            ]);

            // Verify data was saved by reading it back
            console.log('🔍 Verifying merge save...');
            const verifyMed = await getCache(DATA_KEYS.MEDITATION);
            const verified = verifyMed?.members?.length || 0;
            console.log(`✅ Verified: ${verified} meditation members saved`);

            return res.status(200).json({
                success: true,
                mode: 'merge',
                message: 'Database merged with Google Sheets data',
                syncedAt: sheetData.syncedAt,
                stats: {
                    meditation: mergedMed.members.length,
                    practice: mergedPrac.members.length,
                    class: mergedClass.members.length,
                    recentActivity: sheetData.recentActivity.length,
                },
                verified: verified,
            });
        }
    } catch (error) {
        console.error('Sync error:', error);
        console.error('Error stack:', error.stack);
        return res.status(500).json({
            error: 'Sync failed',
            details: error.message,
            stack: error.stack,
            kvConfigured: !!process.env.KV_REST_API_URL,
        });
    }
}
