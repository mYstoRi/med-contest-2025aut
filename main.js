// ========================================
// Configuration
// ========================================
const CONFIG = {
    // Published CSV URLs
    TOTALS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRziNeMKSXQhVUGcaUtS9VmGUhpWMiBDlo1H_U8p2pE5-0vx40TAZCTWjCZ9qy8rJTqjaDwp4od2WS2/pub?gid=288289321&single=true&output=csv',

    // Original form responses for activity feed
    SHEET_ID: '1b2kQ_9Ry0Eu-BoZ-EcSxZxkbjIzBAAjjPGQZU9v9f_s',
    FORM_RESPONSES_SHEET: '表單回應 1',
    MEDITATION_SHEET: '禪定登記',
    PRACTICE_SHEET: '共修',
    CLASS_SHEET: '會館課程',

    // Refresh interval in milliseconds (5 minutes)
    REFRESH_INTERVAL: 5 * 60 * 1000,

    // Team configuration (order matters for parsing totals sheet)
    // colIndex = score column, memberColIndex = member name column (for members section)
    TEAMS: [
        { name: '晨絜家中隊', id: 1, color: 'team-1', shortName: '晨絜', colIndex: 3, memberColIndex: 2 },
        { name: '明緯家中隊', id: 2, color: 'team-2', shortName: '明緯', colIndex: 6, memberColIndex: 5 },
        { name: '敬涵家中隊', id: 3, color: 'team-3', shortName: '敬涵', colIndex: 9, memberColIndex: 8 },
        { name: '宗翰家中隊', id: 4, color: 'team-4', shortName: '宗翰', colIndex: 12, memberColIndex: 11 },
    ],

    // Column indices in the form responses (0-indexed)
    // Based on actual CSV: timestamp, name, date, minutes, ...
    COLUMNS: {
        TIMESTAMP: 0,    // 時間戳記
        NAME: 1,         // 姓名
        DATE: 2,         // 這是哪一天的記錄呢？(日期)
        MINUTES: 3,      // 我坐了幾分鐘？
        TEAM: 4,         // 我屬於 (team) - may vary based on form
        BONUS: 5,        // 加成
        POINTS: 6,       // 積分
    }
};

// ========================================
// Utility Functions
// ========================================
function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const result = [];

    for (let i = 1; i < lines.length; i++) { // Skip header row
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV considering quoted values
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

        result.push(values);
    }

    return result;
}

function formatNumber(num) {
    return num.toLocaleString('zh-TW');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        // Handle yyyy/mm/dd format from Google Sheets
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const [year, month, day] = parts.map(Number);
                return `${month}月${day}日`;
            }
        }
        // Fallback: try native parsing
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
        }
        return dateStr;
    } catch {
        return dateStr;
    }
}

function cleanName(name) {
    if (!name) return '';
    // Remove common prefixes like "我叫" (My name is)
    return name.replace(/^我叫/, '').trim();
}

function getTeamConfig(teamName) {
    if (!teamName) return CONFIG.TEAMS[0];

    // Try exact match first
    const exactMatch = CONFIG.TEAMS.find(t => t.name === teamName);
    if (exactMatch) return exactMatch;

    // Try partial match (short name or contains)
    const partialMatch = CONFIG.TEAMS.find(t =>
        teamName.includes(t.shortName) || t.name.includes(teamName)
    );
    if (partialMatch) return partialMatch;

    // Default fallback
    return { name: teamName, id: 0, color: 'team-1', shortName: teamName.slice(0, 2) };
}

// ========================================
// Data Fetching
// ========================================
async function fetchTotalsData() {
    try {
        const response = await fetch(CONFIG.TOTALS_CSV_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        return parseTotalsCSV(csvText);
    } catch (error) {
        console.error('Error fetching totals data:', error);
        throw error;
    }
}

function parseTotalsCSV(csvText) {
    const lines = csvText.split('\n').map(line => {
        // Parse CSV line
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
    });

    const result = {
        teamScores: {},
        teamMembers: {},
        topMeditator: { name: '--', points: 0 }
    };

    // Initialize
    for (const team of CONFIG.TEAMS) {
        result.teamScores[team.name] = 0;
        result.teamMembers[team.name] = [];
    }

    // Parse team totals (row 4: 累計總分)
    if (lines[3]) {
        for (const team of CONFIG.TEAMS) {
            const score = parseFloat(lines[3][team.colIndex]) || 0;
            result.teamScores[team.name] = score;
        }
    }

    // Parse team members (rows 7+: 領航員 data)
    for (let i = 6; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 12) continue;

        for (const team of CONFIG.TEAMS) {
            const name = row[team.memberColIndex];
            const points = parseFloat(row[team.memberColIndex + 1]) || 0;

            if (name && name.trim()) {
                result.teamMembers[team.name].push({ name: name.trim(), points });

                // Track top meditator
                if (points > result.topMeditator.points) {
                    result.topMeditator = { name: name.trim(), points, team: team.name };
                }
            }
        }
    }

    return result;
}

async function fetchFormResponsesData() {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CONFIG.FORM_RESPONSES_SHEET)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        return parseCSV(csvText);
    } catch (error) {
        console.error('Error fetching form responses:', error);
        throw error;
    }
}

// Fetch meditation sheet to build name -> team mapping
async function fetchMemberTeams() {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CONFIG.MEDITATION_SHEET)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        const lines = csvText.split('\n');
        const memberTeams = {}; // name -> team

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Parse CSV line
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

            // Column 0 = team, Column 1 = name
            const teamName = values[0];
            const memberName = values[1];

            if (teamName && memberName) {
                memberTeams[memberName] = teamName;
            }
        }

        console.log('Member teams mapping:', Object.keys(memberTeams).length, 'members');
        return memberTeams;
    } catch (error) {
        console.error('Error fetching member teams:', error);
        return {};
    }
}

// Fetch all sheets and calculate dual streaks: solo (meditation only) and activity (any)
async function fetchMemberStreaks() {
    const getSheetUrl = (sheetName) =>
        `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

    try {
        const [medResp, pracResp, classResp] = await Promise.all([
            fetch(getSheetUrl(CONFIG.MEDITATION_SHEET)),
            fetch(getSheetUrl(CONFIG.PRACTICE_SHEET)),
            fetch(getSheetUrl(CONFIG.CLASS_SHEET))
        ]);

        const [medCSV, pracCSV, classCSV] = await Promise.all([
            medResp.ok ? medResp.text() : '',
            pracResp.ok ? pracResp.text() : '',
            classResp.ok ? classResp.text() : ''
        ]);

        // Parse CSV line helper
        const parseCSVLine = (line) => {
            const values = [];
            let current = '';
            let inQuotes = false;
            for (const char of line) {
                if (char === '"') inQuotes = !inQuotes;
                else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
                else current += char;
            }
            values.push(current.trim());
            return values;
        };

        // Parse date helper
        const parseDate = (dateStr) => {
            const parts = dateStr.split('/');
            const month = parseInt(parts[0]) || 1;
            const day = parseInt(parts[1]) || 1;
            const year = month < 6 ? 2026 : 2025;
            return new Date(year, month - 1, day);
        };

        // Build member activity data
        const memberActivity = {}; // name -> { dateStr -> { meditation, practice, class } }

        const ensureMember = (name, dateStr) => {
            if (!memberActivity[name]) memberActivity[name] = {};
            if (!memberActivity[name][dateStr]) memberActivity[name][dateStr] = {};
        };

        // Parse meditation
        if (medCSV) {
            const lines = medCSV.split('\n').map(parseCSVLine);
            const dates = lines[0]?.slice(3) || [];
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i];
                if (!row || row.length < 4) continue;
                const name = row[1];
                if (!name) continue;
                for (let j = 3; j < row.length && (j - 3) < dates.length; j++) {
                    const dateStr = dates[j - 3];
                    if (!dateStr || !dateStr.includes('/')) continue; // Skip empty/invalid dates
                    if ((parseFloat(row[j]) || 0) > 0) {
                        ensureMember(name, dateStr);
                        memberActivity[name][dateStr].meditation = true;
                    }
                }
            }
        }

        // Parse practice
        let practiceCount = 0;
        if (pracCSV) {
            const lines = pracCSV.split('\n').map(parseCSVLine);
            const dates = lines[1]?.slice(3) || [];
            console.log('Practice dates header:', dates.slice(0, 5));
            for (let i = 2; i < lines.length; i++) {
                const row = lines[i];
                if (!row || row.length < 4) continue;
                const name = row[1];
                if (!name) continue;
                for (let j = 3; j < row.length && (j - 3) < dates.length; j++) {
                    const dateStr = dates[j - 3];
                    if (!dateStr || !dateStr.includes('/')) continue;
                    if ((parseFloat(row[j]) || 0) > 0) {
                        ensureMember(name, dateStr);
                        memberActivity[name][dateStr].practice = true;
                        practiceCount++;
                    }
                }
            }
        }

        // Parse class
        let classCount = 0;
        if (classCSV) {
            const lines = classCSV.split('\n').map(parseCSVLine);
            const dates = lines[0]?.slice(4) || [];
            console.log('Class dates header:', dates.slice(0, 5));
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i];
                if (!row || row.length < 5) continue;
                const name = row[1];
                if (!name) continue;
                for (let j = 4; j < row.length && (j - 4) < dates.length; j++) {
                    const dateStr = dates[j - 4];
                    if (!dateStr || !dateStr.includes('/')) continue;
                    if ((parseFloat(row[j]) || 0) > 0) {
                        ensureMember(name, dateStr);
                        memberActivity[name][dateStr].class = true;
                        classCount++;
                    }
                }
            }
        }
        console.log('Parsed entries - Practice:', practiceCount, 'Class:', classCount);

        // Calculate streaks
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

        let debugFirst = true;
        const calcStreak = (dateStrs) => {
            if (dateStrs.length === 0) return 0;
            const sorted = dateStrs.map(d => ({ str: d, date: parseDate(d) })).sort((a, b) => a.date - b.date);
            const last = new Date(sorted[sorted.length - 1].date); last.setHours(0, 0, 0, 0);
            if (debugFirst && dateStrs.length > 0) {
                // Show all sorted dates
                console.log('calcStreak debug:', {
                    inputLength: dateStrs.length,
                    sortedDates: sorted.map(x => x.str),
                    sortedLast: sorted[sorted.length - 1].str,
                    lastVsYesterday: { last: last.getTime(), yesterday: yesterday.getTime(), isLessThan: last < yesterday }
                });
                // Calculate day differences for the last 5 dates
                if (sorted.length >= 2) {
                    const diffs = [];
                    for (let i = sorted.length - 1; i >= Math.max(0, sorted.length - 5); i--) {
                        if (i > 0) {
                            const curr = new Date(sorted[i].date); curr.setHours(0, 0, 0, 0);
                            const prev = new Date(sorted[i - 1].date); prev.setHours(0, 0, 0, 0);
                            const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
                            diffs.push({ from: sorted[i - 1].str, to: sorted[i].str, diffDays });
                        }
                    }
                    console.log('Day diffs:', diffs);
                }
                debugFirst = false;
            }
            if (last < yesterday) return 0;
            let streak = 1;
            for (let i = sorted.length - 2; i >= 0; i--) {
                const curr = new Date(sorted[i + 1].date); curr.setHours(0, 0, 0, 0);
                const prev = new Date(sorted[i].date); prev.setHours(0, 0, 0, 0);
                if ((curr - prev) / (1000 * 60 * 60 * 24) === 1) streak++;
                else break;
            }
            return streak;
        };

        const streaks = {};
        for (const [name, days] of Object.entries(memberActivity)) {
            const soloD = Object.keys(days).filter(d => days[d].meditation);
            const actD = Object.keys(days).filter(d => days[d].meditation || days[d].practice || days[d].class);
            streaks[name] = { solo: calcStreak(soloD), activity: calcStreak(actD) };
        }

        console.log('Member streaks calculated:', Object.keys(streaks).length);
        console.log('Today:', today.toISOString(), 'Yesterday:', yesterday.toISOString());
        // Debug: log a sample member's activity data
        const sampleNames = Object.keys(memberActivity).slice(0, 3);
        for (const name of sampleNames) {
            const actDates = Object.keys(memberActivity[name]).filter(d =>
                memberActivity[name][d].meditation || memberActivity[name][d].practice || memberActivity[name][d].class
            );
            console.log(`Debug ${name}:`, {
                allDates: Object.keys(memberActivity[name]),
                activityDates: actDates,
                parsedLast: actDates.length > 0 ? parseDate(actDates[actDates.length - 1]).toISOString() : 'none',
                streak: streaks[name]
            });
        }
        return streaks;
    } catch (error) {
        console.error('Error fetching member streaks:', error);
        return {};
    }
}

// ========================================
// Data Processing
// ========================================
function processFormResponses(rows, memberTeams = {}, memberStreaks = {}) {
    let totalMinutes = 0;
    let totalSessions = 0;
    let longestSession = { minutes: 0, name: '' };
    const recentActivities = [];

    // Process each row for activity feed and stats
    for (const row of rows) {
        const rawName = row[CONFIG.COLUMNS.NAME] || '';
        const name = cleanName(rawName);
        // Use memberTeams mapping from meditation sheet (more accurate)
        const team = memberTeams[name] || row[CONFIG.COLUMNS.TEAM] || '';
        const minutes = parseFloat(row[CONFIG.COLUMNS.MINUTES]) || 0;
        // Points = minutes (1 minute = 1 point)
        const points = minutes;
        const date = row[CONFIG.COLUMNS.DATE] || '';
        const timestamp = row[CONFIG.COLUMNS.TIMESTAMP] || '';

        if (!name) continue;

        // Find matching team config
        const teamConfig = getTeamConfig(team);

        // Stats
        totalMinutes += minutes;
        totalSessions++;

        if (minutes > longestSession.minutes) {
            longestSession = { minutes, name };
        }

        // Get streaks from pre-calculated data
        const streakData = memberStreaks[name] || { solo: 0, activity: 0 };

        // Debug: log first few activity lookups
        if (recentActivities.length < 5) {
            console.log(`Activity streak lookup: "${name}" found:`, memberStreaks[name] !== undefined, 'streak:', streakData);
        }

        // Recent activity
        recentActivities.push({
            name,
            team: teamConfig.name,
            minutes,
            points,
            date,
            timestamp,
            soloStreak: streakData.solo,
            activityStreak: streakData.activity
        });
    }

    // Sort activities by timestamp (newest first)
    recentActivities.sort((a, b) => {
        // Parse Chinese timestamp format: "2025/11/3 下午3:18:21"
        const parseTimestamp = (ts) => {
            if (!ts) return 0;
            try {
                // Format: "2025/11/3 下午3:18:21" or "2025/11/3 上午10:18:21"
                const parts = ts.split(' ');
                if (parts.length < 2) return 0;

                const datePart = parts[0]; // "2025/11/3"
                let timePart = parts[1];   // "下午3:18:21" or "上午10:18:21"

                // Extract AM/PM and time
                const isPM = timePart.includes('下午');
                timePart = timePart.replace('下午', '').replace('上午', '');

                const [hours, minutes, seconds] = timePart.split(':').map(Number);
                let hour24 = hours;

                if (isPM && hours < 12) hour24 = hours + 12;
                if (!isPM && hours === 12) hour24 = 0;

                const [year, month, day] = datePart.split('/').map(Number);

                return new Date(year, month - 1, day, hour24, minutes || 0, seconds || 0).getTime();
            } catch (e) {
                return 0;
            }
        };
        return parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp);
    });

    return {
        totalMinutes,
        totalSessions,
        longestSession,
        recentActivities: recentActivities.slice(0, 20), // Last 20 activities
    };
}

// ========================================
// Rendering Functions
// ========================================
function renderTeamBars(teamScores) {
    const container = document.getElementById('teamBars');
    if (!container) return;

    // Find max score for percentage calculation (minimum 2500 so bars don't reach top)
    const scores = Object.values(teamScores);
    const maxScore = Math.max(...scores, 2500);

    // Sort teams by score (descending)
    const sortedTeams = Object.entries(teamScores)
        .sort((a, b) => b[1] - a[1]);

    container.innerHTML = sortedTeams.map(([teamName, score]) => {
        const config = getTeamConfig(teamName);
        const percentage = Math.max((score / maxScore) * 100, 5); // Minimum 5% for visibility
        const teamUrl = `./team.html?team=${encodeURIComponent(teamName)}`;

        return `
      <div class="team-bar-container">
        <div class="team-bar-wrapper">
          <div class="particles" id="particles-${config.id}"></div>
          <div class="team-bar ${config.color}" style="height: ${percentage}%">
            <span class="team-bar-score">${formatNumber(Math.round(score))}</span>
          </div>
        </div>
        <a href="${teamUrl}" class="team-name ${config.color}" style="text-decoration: none; cursor: pointer;">
          ${teamName}
        </a>
      </div>
    `;
    }).join('');

    // Add particle effects
    setTimeout(() => {
        sortedTeams.forEach(([teamName]) => {
            const config = getTeamConfig(teamName);
            addParticles(`particles-${config.id}`);
        });
    }, 100);
}

function addParticles(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Add 5 particles per bar
    for (let i = 0; i < 5; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = `${Math.random() * 80 + 10}%`;
        particle.style.animationDelay = `${Math.random() * 3}s`;
        particle.style.animationDuration = `${2 + Math.random() * 2}s`;
        container.appendChild(particle);
    }
}

function renderStats(data) {
    // Total minutes
    const totalMinutesEl = document.getElementById('totalMinutes');
    if (totalMinutesEl) {
        totalMinutesEl.textContent = formatNumber(Math.round(data.totalMinutes));
    }

    // Total sessions
    const totalSessionsEl = document.getElementById('totalSessions');
    if (totalSessionsEl) {
        totalSessionsEl.textContent = formatNumber(data.totalSessions);
    }

    // Top meditator
    const topMeditatorEl = document.getElementById('topMeditator');
    if (topMeditatorEl) {
        const name = data.topMeditator.name || '--';
        // Truncate long names
        topMeditatorEl.textContent = name.length > 8 ? name.slice(0, 8) + '…' : name;
        topMeditatorEl.title = `${name} - ${formatNumber(Math.round(data.topMeditator.points))} 分`;
    }

    // Longest session
    const longestSessionEl = document.getElementById('longestSession');
    if (longestSessionEl) {
        longestSessionEl.textContent = `${data.longestSession.minutes} 分`;
        longestSessionEl.title = data.longestSession.name;
    }
}

function renderLeaderboard(teamScores) {
    const container = document.getElementById('leaderboard');
    if (!container) return;

    // Sort teams by score (descending)
    const sortedTeams = Object.entries(teamScores)
        .sort((a, b) => b[1] - a[1]);

    const topScore = sortedTeams[0]?.[1] || 0;

    const medals = ['🥇', '🥈', '🥉', ''];

    container.innerHTML = sortedTeams.map(([teamName, score], index) => {
        const config = getTeamConfig(teamName);
        const rank = index + 1;
        const diff = topScore - score;
        const diffText = rank === 1 ? '領先中 Leading!' : `落後 ${formatNumber(Math.round(diff))} 分`;
        const teamUrl = `./team.html?team=${encodeURIComponent(teamName)}`;

        return `
      <a href="${teamUrl}" class="leaderboard-item" style="text-decoration: none; color: inherit;">
        <div class="rank rank-${rank}">
          ${medals[index] ? `<span class="rank-medal">${medals[index]}</span>` : rank}
        </div>
        <div class="team-info">
          <div class="team-info-name ${config.color}-text">${teamName}</div>
          <div class="team-info-diff">${diffText}</div>
        </div>
        <div class="team-score ${config.color}-text">${formatNumber(Math.round(score))}</div>
      </a>
    `;
    }).join('');
}

function renderActivityFeed(activities) {
    const container = document.getElementById('activityFeed');
    if (!container) return;

    if (activities.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">暫無活動記錄 No activities yet</p>';
        return;
    }

    container.innerHTML = activities.map(activity => {
        const config = getTeamConfig(activity.team);
        // Dual streak badges
        const activityBadge = activity.activityStreak > 0 ? `<span class="activity-streak act" title="${activity.activityStreak} 天精進連續">🔥${activity.activityStreak}</span>` : '';
        const soloBadge = activity.soloStreak > 0 ? `<span class="activity-streak solo" title="${activity.soloStreak} 天獨修連續">🧘${activity.soloStreak}</span>` : '';
        const streakBadges = activityBadge + soloBadge;
        const memberUrl = `./member.html?name=${encodeURIComponent(activity.name)}&team=${encodeURIComponent(activity.team)}`;
        const nameDisplay = activity.name
            ? `<a href="${memberUrl}" class="activity-name-link">${activity.name}</a>`
            : '匿名';
        return `
      <div class="activity-item ${config.color}">
        <div class="activity-icon">🧘</div>
        <div class="activity-content">
          <div class="activity-name">${nameDisplay}${streakBadges}</div>
          <div class="activity-details">${activity.minutes} 分鐘 · ${formatDate(activity.date)}</div>
        </div>
        <div class="activity-points ${config.color}">+${Math.round(activity.points)}</div>
      </div>
    `;
    }).join('');
}

function updateLastUpdated() {
    const el = document.getElementById('lastUpdate');
    if (el) {
        el.textContent = new Date().toLocaleString('zh-TW');
    }
}

function showError(message) {
    const containers = ['teamBars', 'leaderboard', 'activityFeed'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = `
        <div class="error-message">
          <p>❌ ${message}</p>
          <p style="margin-top: 0.5rem; font-size: 0.9rem;">請確認 Google Sheets 已發布到網路<br>Please ensure the Google Sheet is published to the web</p>
        </div>
      `;
        }
    });
}

// ========================================
// Main App
// ========================================
async function loadData() {
    try {
        console.log('Fetching data from Google Sheets...');

        // Fetch all data sources in parallel
        const [totalsData, formRows, memberTeams, memberStreaks] = await Promise.all([
            fetchTotalsData(),
            fetchFormResponsesData(),
            fetchMemberTeams(),
            fetchMemberStreaks()
        ]);

        console.log('Totals data:', totalsData);
        console.log(`Form responses: ${formRows.length} rows`);

        // Process form responses for activity feed and stats
        const formData = processFormResponses(formRows, memberTeams, memberStreaks);

        // Combine data
        const data = {
            teamScores: totalsData.teamScores,
            topMeditator: totalsData.topMeditator,
            teamMembers: totalsData.teamMembers,
            totalMinutes: formData.totalMinutes,
            totalSessions: formData.totalSessions,
            longestSession: formData.longestSession,
            recentActivities: formData.recentActivities,
        };

        console.log('Combined data:', data);

        renderTeamBars(data.teamScores);
        renderStats(data);
        renderLeaderboard(data.teamScores);
        renderActivityFeed(data.recentActivities);
        updateLastUpdated();

    } catch (error) {
        console.error('Failed to load data:', error);
        showError('無法載入資料 Failed to load data');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Initial load
    loadData();

    // Auto-refresh every 5 minutes
    setInterval(loadData, CONFIG.REFRESH_INTERVAL);

    // Initialize theme from localStorage or default to light
    initTheme();

    // Initialize settings panel
    initSettings();

    console.log('🧘 Meditation Dashboard initialized');
    console.log(`Auto-refresh interval: ${CONFIG.REFRESH_INTERVAL / 1000 / 60} minutes`);
});

// ========================================
// Theme & Settings
// ========================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

function initSettings() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const themeToggle = document.getElementById('themeToggle');

    if (settingsBtn && settingsPanel) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsPanel.classList.toggle('open');
        });

        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
                settingsPanel.classList.remove('open');
            }
        });
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
}
