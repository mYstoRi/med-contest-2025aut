// ========================================
// Team Page Configuration
// ========================================
const CONFIG = {
    // Published CSV URLs - Base spreadsheet ID
    SPREADSHEET_ID: '1b2kQ_9Ry0Eu-BoZ-EcSxZxkbjIzBAAjjPGQZU9v9f_s',

    // Sheet names for different score sources
    SHEETS: {
        MEDITATION: '禪定登記',    // 禪定 - meditation minutes
        PRACTICE: '共修登記',      // 共修 - practice sessions  
        CLASS: '會館課登記',       // 會館課 - classes
    },

    // Points configuration
    POINTS: {
        CLASS_PER_ATTENDANCE: 50,  // 50 points per class
    },

    // Published totals CSV URL (for existing team data)
    TOTALS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRziNeMKSXQhVUGcaUtS9VmGUhpWMiBDlo1H_U8p2pE5-0vx40TAZCTWjCZ9qy8rJTqjaDwp4od2WS2/pub?gid=288289321&single=true&output=csv',

    // Team configuration
    TEAMS: [
        { name: '晨絜家中隊', id: 1, color: 'team-1', shortName: '晨絜', colIndex: 3, memberColIndex: 2 },
        { name: '明緯家中隊', id: 2, color: 'team-2', shortName: '明緯', colIndex: 6, memberColIndex: 5 },
        { name: '敬涵家中隊', id: 3, color: 'team-3', shortName: '敬涵', colIndex: 9, memberColIndex: 8 },
        { name: '宗翰家中隊', id: 4, color: 'team-4', shortName: '宗翰', colIndex: 12, memberColIndex: 11 },
    ],

    // Score source colors (for stacked bar)
    SOURCE_COLORS: {
        meditation: '#8b5cf6',  // Purple - 禪定
        practice: '#10b981',   // Green - 共修
        class: '#f59e0b',      // Amber - 會館課
    }
};

// ========================================
// CSV Helper
// ========================================
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

function getSheetCSVUrl(sheetName) {
    return `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

// ========================================
// Data Fetching
// ========================================
async function fetchSheetData(sheetName) {
    try {
        const url = getSheetCSVUrl(sheetName);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Error fetching ${sheetName}:`, error);
        return null;
    }
}

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

async function fetchAllScoreData() {
    // Fetch all score sheets in parallel
    const [meditationCSV, practiceCSV, classCSV] = await Promise.all([
        fetchSheetData(CONFIG.SHEETS.MEDITATION),
        fetchSheetData(CONFIG.SHEETS.PRACTICE),
        fetchSheetData(CONFIG.SHEETS.CLASS),
    ]);

    return {
        meditation: meditationCSV ? parseMeditationSheet(meditationCSV) : {},
        practice: practiceCSV ? parsePracticeSheet(practiceCSV) : {},
        class: classCSV ? parseClassSheet(classCSV) : {},
    };
}

// ========================================
// Sheet Parsing
// ========================================
function parseTotalsCSV(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);

    const result = { teams: {} };

    for (const team of CONFIG.TEAMS) {
        const teamData = {
            name: team.name,
            shortName: team.shortName,
            color: team.color,
            id: team.id,
            level: 1,
            totalScore: 0,
            members: []
        };

        if (lines[1]) {
            teamData.level = parseInt(lines[1][team.colIndex]) || 1;
        }

        if (lines[3]) {
            teamData.totalScore = parseFloat(lines[3][team.colIndex]) || 0;
        }

        for (let i = 6; i < lines.length; i++) {
            const row = lines[i];
            if (!row || row.length < 12) continue;

            const name = row[team.memberColIndex];
            const points = parseFloat(row[team.memberColIndex + 1]) || 0;

            if (name && name.trim()) {
                teamData.members.push({ name: name.trim(), points });
            }
        }

        teamData.members.sort((a, b) => b.points - a.points);
        result.teams[team.name] = teamData;
    }

    return result;
}

// Parse meditation sheet - sum all daily minutes per member
function parseMeditationSheet(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const teamScores = {};

    // Skip first 2 rows (header rows), start from row 3
    for (let i = 2; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 4) continue;

        const teamName = row[0];
        const memberName = row[1];

        if (!teamName || !memberName) continue;

        // Sum all daily values (columns 3 onwards)
        let totalMinutes = 0;
        for (let j = 3; j < row.length; j++) {
            totalMinutes += parseFloat(row[j]) || 0;
        }

        if (!teamScores[teamName]) {
            teamScores[teamName] = { total: 0, members: {} };
        }
        teamScores[teamName].total += totalMinutes;
        teamScores[teamName].members[memberName] = (teamScores[teamName].members[memberName] || 0) + totalMinutes;
    }

    return teamScores;
}

// Parse practice sheet - count attendance * points per session
function parsePracticeSheet(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const teamScores = {};

    // Row 1 has the points per session for each date column
    const pointsPerSession = lines[0] ? lines[0].slice(3).map(p => parseFloat(p) || 0) : [];

    // Skip first 2 rows (header rows), start from row 3
    for (let i = 2; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 4) continue;

        const teamName = row[0];
        const memberName = row[1];

        if (!teamName || !memberName) continue;

        // Calculate points based on attendance (1) * points per session
        let totalPoints = 0;
        for (let j = 3; j < row.length && (j - 3) < pointsPerSession.length; j++) {
            const attended = parseFloat(row[j]) || 0;
            if (attended > 0) {
                totalPoints += pointsPerSession[j - 3] || 0;
            }
        }

        if (!teamScores[teamName]) {
            teamScores[teamName] = { total: 0, members: {} };
        }
        teamScores[teamName].total += totalPoints;
        teamScores[teamName].members[memberName] = (teamScores[teamName].members[memberName] || 0) + totalPoints;
    }

    return teamScores;
}

// Parse class sheet - count total attendance * 50 points
function parseClassSheet(csvText) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const teamScores = {};

    // Skip first 2 rows (header rows), start from row 3
    for (let i = 2; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 4) continue;

        const teamName = row[0];
        const memberName = row[1];
        // Column 3 (index 3) has the 總計 (total count)
        const totalClasses = parseFloat(row[3]) || 0;

        if (!teamName || !memberName) continue;

        const totalPoints = totalClasses * CONFIG.POINTS.CLASS_PER_ATTENDANCE;

        if (!teamScores[teamName]) {
            teamScores[teamName] = { total: 0, members: {} };
        }
        teamScores[teamName].total += totalPoints;
        teamScores[teamName].members[memberName] = (teamScores[teamName].members[memberName] || 0) + totalPoints;
    }

    return teamScores;
}

// ========================================
// Rendering
// ========================================
function renderTeamPage(teamData, scoreBreakdown) {
    const container = document.getElementById('teamContent');
    if (!container) return;

    const maxMemberScore = Math.max(...teamData.members.map(m => m.points), 1);

    // Calculate score breakdown for this team
    const teamName = teamData.name;
    const meditationScore = scoreBreakdown.meditation[teamName]?.total || 0;
    const practiceScore = scoreBreakdown.practice[teamName]?.total || 0;
    const classScore = scoreBreakdown.class[teamName]?.total || 0;
    const totalFromSources = meditationScore + practiceScore + classScore;

    // Calculate percentages
    const meditationPct = totalFromSources > 0 ? (meditationScore / totalFromSources * 100) : 0;
    const practicePct = totalFromSources > 0 ? (practiceScore / totalFromSources * 100) : 0;
    const classPct = totalFromSources > 0 ? (classScore / totalFromSources * 100) : 0;

    // Get member breakdowns
    const memberBreakdowns = getMemberBreakdowns(teamData.members, scoreBreakdown, teamName);

    container.innerHTML = `
        <div class="${teamData.color}">
            <header class="team-header">
                <h1 class="team-title">${teamData.name}</h1>
                <div class="team-level">🎯 等級 Level ${teamData.level}</div>
                <div class="team-score-big">${teamData.totalScore.toLocaleString()}</div>
                <div class="team-score-label">累計總分 Total Score</div>
            </header>
            
            <!-- Score Breakdown Section -->
            <section class="breakdown-section">
                <h2 class="section-title">
                    <span class="section-icon">📊</span>
                    積分來源 Score Breakdown
                </h2>
                
                <div class="stacked-bar-container">
                    <div class="stacked-bar">
                        <div class="stacked-segment meditation" style="width: ${meditationPct}%" title="禪定 ${meditationScore}"></div>
                        <div class="stacked-segment practice" style="width: ${practicePct}%" title="共修 ${practiceScore}"></div>
                        <div class="stacked-segment class" style="width: ${classPct}%" title="會館課 ${classScore}"></div>
                    </div>
                </div>
                
                <div class="breakdown-legend">
                    <div class="legend-item">
                        <span class="legend-color meditation"></span>
                        <span class="legend-label">🧘 禪定 Meditation</span>
                        <span class="legend-value">${meditationScore.toLocaleString()} (${meditationPct.toFixed(1)}%)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color practice"></span>
                        <span class="legend-label">🙏 共修 Practice</span>
                        <span class="legend-value">${practiceScore.toLocaleString()} (${practicePct.toFixed(1)}%)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color class"></span>
                        <span class="legend-label">📚 會館課 Classes</span>
                        <span class="legend-value">${classScore.toLocaleString()} (${classPct.toFixed(1)}%)</span>
                    </div>
                </div>
            </section>
            
            <!-- Member Scores Section with Stacked Bars -->
            <section class="members-section">
                <h2 class="section-title">
                    <span class="section-icon">👥</span>
                    隊員積分 Member Scores
                </h2>
                
                ${memberBreakdowns.map((member, index) => {
        const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
        const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
        const maxScore = memberBreakdowns[0].total;
        const barWidth = maxScore > 0 ? (member.total / maxScore * 100) : 0;

        // Calculate segment widths within the bar
        const memberTotal = member.total || 1;
        const mPct = member.meditation / memberTotal * barWidth;
        const pPct = member.practice / memberTotal * barWidth;
        const cPct = member.class / memberTotal * barWidth;

        return `
                        <div class="member-card">
                            <div class="member-rank ${rankClass}">${rankEmoji}</div>
                            <div class="member-info">
                                <div class="member-name">${member.name}</div>
                                <div class="member-bar-container stacked">
                                    <div class="member-bar-segment meditation" style="width: ${mPct}%"></div>
                                    <div class="member-bar-segment practice" style="width: ${pPct}%"></div>
                                    <div class="member-bar-segment class" style="width: ${cPct}%"></div>
                                </div>
                                <div class="member-breakdown-debug">
                                    <span class="debug-item meditation">🧘 ${member.meditation}</span>
                                    <span class="debug-item practice">🙏 ${member.practice}</span>
                                    <span class="debug-item class">📚 ${member.class}</span>
                                    <span class="debug-item sum">= ${member.meditation + member.practice + member.class}</span>
                                </div>
                            </div>
                            <div class="member-score">${member.total.toLocaleString()}</div>
                        </div>
                    `;
    }).join('')}
            </section>
        </div>
    `;
}

function getMemberBreakdowns(members, scoreBreakdown, teamName) {
    const meditationMembers = scoreBreakdown.meditation[teamName]?.members || {};
    const practiceMembers = scoreBreakdown.practice[teamName]?.members || {};
    const classMembers = scoreBreakdown.class[teamName]?.members || {};

    return members.map(member => {
        const meditation = meditationMembers[member.name] || 0;
        const practice = practiceMembers[member.name] || 0;
        const classScore = classMembers[member.name] || 0;

        return {
            name: member.name,
            meditation,
            practice,
            class: classScore,
            total: member.points // Use the official total from totals sheet
        };
    });
}

function showError(message) {
    const container = document.getElementById('teamContent');
    if (container) {
        container.innerHTML = `
            <div class="no-team-msg">
                <p style="font-size: 3rem; margin-bottom: 1rem;">😕</p>
                <p>${message}</p>
                <a href="./index.html" class="back-btn" style="margin-top: 1rem; display: inline-block;">
                    ← 返回主頁 Back to Dashboard
                </a>
            </div>
        `;
    }
}

// ========================================
// Theme Support
// ========================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Apply saved theme
    initTheme();

    // Get team name from URL
    const urlParams = new URLSearchParams(window.location.search);
    const teamName = urlParams.get('team');

    if (!teamName) {
        showError('請選擇一個隊伍 Please select a team');
        return;
    }

    try {
        // Fetch all data in parallel
        const [totalsData, scoreBreakdown] = await Promise.all([
            fetchTotalsData(),
            fetchAllScoreData()
        ]);

        const teamData = totalsData.teams[teamName];

        if (!teamData) {
            showError(`找不到隊伍: ${teamName}<br>Team not found`);
            return;
        }

        // Update page title
        document.title = `${teamData.name} | 隊伍詳情`;

        // Log score breakdown for debugging
        console.log('Score breakdown:', scoreBreakdown);

        // Render team page with breakdown
        renderTeamPage(teamData, scoreBreakdown);

    } catch (error) {
        console.error('Failed to load team data:', error);
        showError('無法載入資料 Failed to load data');
    }
});
