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

    // Debug: show first 2 rows to understand structure
    console.log(`📋 Meditation sheet row 0 (first 10): ${JSON.stringify(lines[0]?.slice(0, 10))}`);
    console.log(`📋 Meditation sheet row 1 (first 10): ${JSON.stringify(lines[1]?.slice(0, 10))}`);
    console.log(`📅 Meditation sheet dates (${dates.length}): ${dates.slice(-5).join(', ')} (showing last 5)`);

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
        // Columns: 0=Timestamp, 1=Name, 2=Date, 3=Minutes, 4=Thoughts, 5=TimeOfDay, 6=ShareConsent
        const thoughts = row[4] || '';
        const timeOfDay = row[5] || '';
        const shareConsent = row[6] || '';
        const team = ''; // No team column in form - will be looked up from member data later

        // Generate a unique ID for this submission
        const id = 'sub_sync_' + Date.now().toString(36) + '_' + i;

        // Debug log first 3 entries with thoughts
        if (i <= 5) {
            console.log(`📋 Row ${i}: name="${name}", date="${date}", min=${minutes}, thoughts="${thoughts?.substring(0, 50) || '(empty)'}", timeOfDay="${timeOfDay}", row.length=${row.length}`);
        }

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

    // Log summary
    const withThoughts = submissions.filter(s => s.thoughts && s.thoughts.trim()).length;
    console.log(`📊 Form responses: ${submissions.length} total, ${withThoughts} with thoughts`);

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

// Helper to generate unique ID
function generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to normalize date to YYYY/MM/DD format
function normalizeDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        // Already YYYY/MM/DD or needs reordering
        if (parts[0].length === 4) return dateStr; // Already YYYY/MM/DD
        // Assume YYYY is first, pad month/day
        return `${parts[0]}/${parts[1].padStart(2, '0')}/${parts[2].padStart(2, '0')}`;
    } else if (parts.length === 2) {
        // MM/DD format - assume 2024 or current year
        const year = new Date().getFullYear();
        return `${year}/${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
    }
    return dateStr;
}

// Convert all synced data to unified activities array
function convertToUnifiedActivities(sheetData) {
    const activities = [];
    const now = new Date().toISOString();

    // Convert meditation data
    if (sheetData.meditation?.members) {
        for (const member of sheetData.meditation.members) {
            if (member.daily) {
                for (const [date, value] of Object.entries(member.daily)) {
                    if (value > 0) {
                        activities.push({
                            id: generateId(),
                            type: 'meditation',
                            team: member.team,
                            member: member.name,
                            date: normalizeDate(date),
                            value,
                            source: 'sync',
                            createdAt: now,
                        });
                    }
                }
            }
        }
    }

    // Convert practice data
    if (sheetData.practice?.members) {
        for (const member of sheetData.practice.members) {
            if (member.daily) {
                for (const [date, value] of Object.entries(member.daily)) {
                    if (value > 0) {
                        activities.push({
                            id: generateId(),
                            type: 'practice',
                            team: member.team,
                            member: member.name,
                            date: normalizeDate(date),
                            value,
                            source: 'sync',
                            createdAt: now,
                        });
                    }
                }
            }
        }
    }

    // Convert class data
    if (sheetData.class?.members) {
        for (const member of sheetData.class.members) {
            if (member.daily) {
                for (const [date, value] of Object.entries(member.daily)) {
                    if (value > 0) {
                        activities.push({
                            id: generateId(),
                            type: 'class',
                            team: member.team,
                            member: member.name,
                            date: normalizeDate(date),
                            value,
                            source: 'sync',
                            createdAt: now,
                        });
                    }
                }
            }
        }
    }

    // Build a map of member names to teams for lookup
    const memberTeamMap = new Map();
    // Helper to add members to map
    const addToMap = (members) => {
        if (members) {
            for (const m of members) {
                if (m.name && m.team) {
                    memberTeamMap.set(m.name, m.team);
                }
            }
        }
    };
    addToMap(sheetData.meditation?.members);
    addToMap(sheetData.practice?.members);
    addToMap(sheetData.class?.members);

    // Convert form submissions (these have thoughts, timeOfDay, etc.)
    if (sheetData.recentActivity) {
        for (const sub of sheetData.recentActivity) {
            if (sub.duration > 0 || sub.minutes > 0) {
                // Look up team if missing
                const team = sub.team || memberTeamMap.get(sub.name) || '';

                activities.push({
                    id: sub.id || generateId(),
                    type: sub.type || 'meditation',
                    team: team,
                    member: sub.name,
                    date: normalizeDate(sub.date),
                    value: sub.duration || sub.minutes,
                    thoughts: sub.thoughts || undefined,
                    timeOfDay: sub.timeOfDay || undefined,
                    shareConsent: sub.shareConsent || undefined,
                    source: 'submission',
                    createdAt: sub.submittedAt || now,
                });
            }
        }
    }

    console.log(`📊 Converted to ${activities.length} unified activities`);
    return activities;
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
                deleteCache('submissions:all'),
                deleteCache(DATA_KEYS.TEAMS),
            ]);
            console.log('✅ Manual caches cleared');

            // Convert to unified activities format
            const unifiedActivities = convertToUnifiedActivities(sheetData);

            // Extract all members from sheets (for comprehensive member list)
            const syncedMembers = [];
            const seenMembers = new Set();
            const addSyncedMember = (list) => {
                if (!list) return;
                for (const m of list) {
                    const key = `${m.team}:${m.name}`;
                    if (!seenMembers.has(key)) {
                        seenMembers.add(key);
                        syncedMembers.push({
                            id: `synced_${m.team}_${m.name}`,
                            name: m.name,
                            team: m.team || 'Unknown',
                            source: 'sync'
                        });
                    }
                }
            };
            addSyncedMember(sheetData.meditation?.members);
            addSyncedMember(sheetData.practice?.members);
            addSyncedMember(sheetData.class?.members);

            console.log(`💾 Saving sheet data to database... (${syncedMembers.length} members)`);
            await Promise.all([
                setDataPermanent(DATA_KEYS.MEDITATION, sheetData.meditation),
                setDataPermanent(DATA_KEYS.PRACTICE, sheetData.practice),
                setDataPermanent(DATA_KEYS.CLASS, sheetData.class),
                // Store unified activities
                setDataPermanent('activities:all', unifiedActivities),
                // Store synced members
                setDataPermanent('members:synced', syncedMembers),
                setCacheMeta({
                    syncedAt: sheetData.syncedAt,
                    recentActivity: sheetData.recentActivity.slice(0, 50),
                    lastSyncMode: 'overwrite',
                }),
            ]);

            // Verify data was saved
            console.log('🔍 Verifying save...');
            const verifyActivities = await getCache('activities:all');
            const verifiedCount = verifyActivities?.length || 0;
            console.log(`✅ Verified: ${verifiedCount} unified activities saved`);

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
                    unifiedActivities: verifiedCount,
                },
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

            // Convert new data to unified activities
            const newActivities = convertToUnifiedActivities(sheetData);

            // Merge with existing activities, dedupe by member+date+type
            const existingActivities = await getCache('activities:all') || [];
            const activityMap = new Map();

            // Add existing activities first
            for (const act of existingActivities) {
                const key = `${act.member}:${act.date}:${act.type}`;
                activityMap.set(key, act);
            }
            // Add new activities (overwrites existing with same key)
            for (const act of newActivities) {
                const key = `${act.member}:${act.date}:${act.type}`;
                activityMap.set(key, act);
            }
            const mergedActivities = Array.from(activityMap.values());

            console.log('💾 Saving merged data...');
            await Promise.all([
                setDataPermanent(DATA_KEYS.MEDITATION, mergedMed),
                setDataPermanent(DATA_KEYS.PRACTICE, mergedPrac),
                setDataPermanent(DATA_KEYS.CLASS, mergedClass),
                setDataPermanent('activities:all', mergedActivities),
                setCacheMeta({
                    syncedAt: sheetData.syncedAt,
                    recentActivity: sheetData.recentActivity.slice(0, 50),
                    lastSyncMode: 'merge',
                }),
            ]);

            // Verify data was saved
            console.log('🔍 Verifying merge save...');
            const verifyActivities = await getCache('activities:all');
            const verifiedCount = verifyActivities?.length || 0;
            console.log(`✅ Verified: ${verifiedCount} unified activities saved`);

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
                    unifiedActivities: verifiedCount,
                },
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
