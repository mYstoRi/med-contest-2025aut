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

    // Parse member totals
    const meditation = meditationCSV ? parseMeditationSheet(meditationCSV) : {};
    const practice = practiceCSV ? parsePracticeSheet(practiceCSV) : {};
    const classData = classCSV ? parseClassSheet(classCSV) : {};

    // Parse daily data for charts
    const dailyData = parseDailyScores(meditationCSV, practiceCSV, classCSV);

    return {
        meditation,
        practice,
        class: classData,
        daily: dailyData
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

// Parse daily scores from all sheets for time-series chart
function parseDailyScores(meditationCSV, practiceCSV, classCSV) {
    const teamDailyScores = {};

    // Get all unique dates from meditation sheet (row 0 has dates, starting at col 3)
    let allDates = [];
    if (meditationCSV) {
        const lines = meditationCSV.split('\n').map(parseCSVLine);
        const dates = lines[0]?.slice(3) || []; // Row 0 has dates
        allDates = dates.filter(d => d && d.trim());
    }

    // Initialize all teams with all dates
    function initTeamDates(teamName) {
        if (!teamDailyScores[teamName]) {
            teamDailyScores[teamName] = { dates: [...allDates], daily: {} };
            for (const date of allDates) {
                teamDailyScores[teamName].daily[date] = { meditation: 0, practice: 0, class: 0 };
            }
        }
    }

    // Parse meditation daily scores
    if (meditationCSV) {
        const lines = meditationCSV.split('\n').map(parseCSVLine);
        const dates = lines[0]?.slice(3) || []; // Row 0 has dates

        for (let i = 1; i < lines.length; i++) { // Data starts at row 1
            const row = lines[i];
            if (!row || row.length < 4) continue;

            const teamName = row[0];
            if (!teamName) continue;

            initTeamDates(teamName);

            // Add each day's score
            for (let j = 3; j < row.length && (j - 3) < dates.length; j++) {
                const date = dates[j - 3];
                if (!date) continue;

                const score = parseFloat(row[j]) || 0;
                if (teamDailyScores[teamName].daily[date]) {
                    teamDailyScores[teamName].daily[date].meditation += score;
                }
            }
        }
    }

    // Parse practice daily scores  
    if (practiceCSV) {
        const lines = practiceCSV.split('\n').map(parseCSVLine);
        // For practice sheet, row 0 might have point values, row 1 has dates
        // Let's use same logic as meditation - row 0 for dates
        const dates = lines[0]?.slice(3) || [];
        console.log('Practice dates from row 0:', dates.slice(0, 5));

        for (let i = 1; i < lines.length; i++) { // Data starts at row 1
            const row = lines[i];
            if (!row || row.length < 4) continue;

            const teamName = row[0];
            if (!teamName) continue;

            initTeamDates(teamName);

            for (let j = 3; j < row.length && (j - 3) < dates.length; j++) {
                const date = dates[j - 3];
                if (!date) continue;

                const attended = parseFloat(row[j]) || 0;
                // Fixed 40 points per practice session attended
                const score = attended > 0 ? 40 : 0;

                if (score > 0) {
                    console.log(`Practice: ${teamName} ${date} +${score}`);
                }

                if (teamDailyScores[teamName].daily[date]) {
                    teamDailyScores[teamName].daily[date].practice += score;
                } else {
                    // Date not in meditation sheet, add it
                    teamDailyScores[teamName].dates.push(date);
                    teamDailyScores[teamName].daily[date] = { meditation: 0, practice: score, class: 0 };
                }
            }
        }
    }

    // Parse class daily scores (weekly dates)
    if (classCSV) {
        const lines = classCSV.split('\n').map(parseCSVLine);
        const dates = lines[0]?.slice(4) || []; // Row 0 has dates, skip 總計 column

        for (let i = 1; i < lines.length; i++) { // Data starts at row 1
            const row = lines[i];
            if (!row || row.length < 5) continue;

            const teamName = row[0];
            if (!teamName) continue;

            initTeamDates(teamName);

            for (let j = 4; j < row.length && (j - 4) < dates.length; j++) {
                const date = dates[j - 4];
                if (!date) continue;

                const attended = parseFloat(row[j]) || 0;
                const score = attended * CONFIG.POINTS.CLASS_PER_ATTENDANCE;

                if (score > 0) {
                    if (teamDailyScores[teamName].daily[date]) {
                        teamDailyScores[teamName].daily[date].class += score;
                    } else {
                        // Date not in meditation sheet, add it
                        teamDailyScores[teamName].dates.push(date);
                        teamDailyScores[teamName].daily[date] = { meditation: 0, practice: 0, class: score };
                    }
                }
            }
        }
    }

    // Sort dates and calculate cumulative totals for each team
    // Get current date for filtering
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const currentVal = (currentMonth < 6 ? currentMonth + 12 : currentMonth) * 100 + currentDay;

    for (const teamName of Object.keys(teamDailyScores)) {
        const team = teamDailyScores[teamName];

        // Simple date sort (MM/DD format) and filter to current date
        team.dates = team.dates
            .map(d => {
                const [m, day] = d.split('/').map(Number);
                const val = (m < 6 ? m + 12 : m) * 100 + day;
                return { date: d, val };
            })
            .filter(d => d.val <= currentVal) // Only past/current dates
            .sort((a, b) => a.val - b.val)
            .map(d => d.date);

        // Calculate cumulative scores
        team.cumulative = [];
        let runningMed = 0, runningPrac = 0, runningClass = 0;

        for (const date of team.dates) {
            const dayData = team.daily[date];
            runningMed += dayData?.meditation || 0;
            runningPrac += dayData?.practice || 0;
            runningClass += dayData?.class || 0;

            team.cumulative.push({
                date,
                daily: (dayData?.meditation || 0) + (dayData?.practice || 0) + (dayData?.class || 0),
                cumulative: runningMed + runningPrac + runningClass,
                meditation: dayData?.meditation || 0,
                practice: dayData?.practice || 0,
                class: dayData?.class || 0
            });
        }

        // Debug logging
        console.log(`Team: ${teamName}, Dates: ${team.dates.length}, Cumulative points:`,
            team.cumulative.map(c => ({ date: c.date, cum: c.cumulative })));
    }

    console.log('All dates from header:', allDates);
    return teamDailyScores;
}

// ========================================
// Chart Rendering
// ========================================
function renderChart(data) {
    if (!data || data.length === 0) {
        return '<div class="chart-empty">暫無數據 No data yet</div>';
    }

    // Chart dimensions
    const width = 600;
    const height = 250;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Calculate cumulative totals for each category
    let runningMed = 0, runningPrac = 0, runningClass = 0;
    const stackedData = data.map(d => {
        runningMed += d.meditation;
        runningPrac += d.practice;
        runningClass += d.class;
        return {
            date: d.date,
            meditation: runningMed,
            practice: runningPrac,
            class: runningClass,
            total: runningMed + runningPrac + runningClass
        };
    });

    // Get max cumulative value for y-axis (minimum 2500 so bars don't reach top)
    const maxValue = Math.max(...stackedData.map(d => d.total), 2500);

    // Scale functions
    const xScale = (i) => padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
    const yScale = (v) => padding.top + chartHeight - (v / maxValue) * chartHeight;

    // Helper to create an area path between two lines
    function createAreaPath(topValues, bottomValues) {
        if (topValues.length === 0) return '';

        // Draw top line left to right
        let path = topValues.map((v, i) =>
            `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`
        ).join(' ');

        // Draw bottom line right to left
        for (let i = bottomValues.length - 1; i >= 0; i--) {
            path += ` L ${xScale(i)} ${yScale(bottomValues[i])}`;
        }

        path += ' Z';
        return path;
    }

    // Create stacked areas (bottom to top: meditation, practice, class)
    const meditationTopLine = stackedData.map(d => d.meditation);
    const practiceTopLine = stackedData.map(d => d.meditation + d.practice);
    const classTopLine = stackedData.map(d => d.total);
    const baseline = stackedData.map(() => 0);

    const meditationAreaPath = createAreaPath(meditationTopLine, baseline);
    const practiceAreaPath = createAreaPath(practiceTopLine, meditationTopLine);
    const classAreaPath = createAreaPath(classTopLine, practiceTopLine);

    // Create main line path (total)
    const linePath = stackedData.map((d, i) =>
        `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.total)}`
    ).join(' ');

    // Create Y-axis labels
    const yAxisLabels = [0, maxValue / 2, maxValue].map(v => ({
        y: yScale(v),
        label: Math.round(v).toLocaleString()
    }));

    // Create X-axis labels (show first, middle, last)
    const xLabels = [];
    if (data.length > 0) {
        xLabels.push({ x: xScale(0), label: data[0].date });
        if (data.length > 2) {
            const mid = Math.floor(data.length / 2);
            xLabels.push({ x: xScale(mid), label: data[mid].date });
        }
        if (data.length > 1) {
            xLabels.push({ x: xScale(data.length - 1), label: data[data.length - 1].date });
        }
    }

    // Create data point dots
    const dots = stackedData.map((d, i) => ({
        x: xScale(i),
        y: yScale(d.total),
        value: d.total,
        date: d.date
    }));

    return `
        <svg viewBox="0 0 ${width} ${height}" class="score-chart">
            <!-- Grid lines -->
            <g class="grid-lines">
                ${yAxisLabels.map(l => `<line x1="${padding.left}" y1="${l.y}" x2="${width - padding.right}" y2="${l.y}" />`).join('')}
            </g>
            
            <!-- Stacked areas (draw bottom to top) -->
            <path class="area-meditation" d="${meditationAreaPath}" />
            <path class="area-practice" d="${practiceAreaPath}" />
            <path class="area-class" d="${classAreaPath}" />
            
            <!-- Main line -->
            <path class="chart-line" d="${linePath}" />
            
            <!-- Data points -->
            <g class="data-points">
                ${dots.map(d => `<circle cx="${d.x}" cy="${d.y}" r="4" />`).join('')}
            </g>
            
            <!-- Y-axis labels -->
            <g class="y-labels">
                ${yAxisLabels.map(l => `<text x="${padding.left - 10}" y="${l.y + 4}">${l.label}</text>`).join('')}
            </g>
            
            <!-- X-axis labels -->
            <g class="x-labels">
                ${xLabels.map(l => `<text x="${l.x}" y="${height - 10}">${l.label}</text>`).join('')}
            </g>
        </svg>
    `;
}

// ========================================
// Rendering
// ========================================
function renderTeamPage(teamData, scoreBreakdown) {
    const container = document.getElementById('teamContent');
    if (!container) return;

    // Get member breakdowns from score sheets (not totals sheet)
    const teamName = teamData.name;
    const memberBreakdowns = getMemberBreakdowns(scoreBreakdown, teamName);

    // Get daily data for chart
    const dailyData = scoreBreakdown.daily?.[teamName]?.cumulative || [];

    const maxMemberScore = memberBreakdowns.length > 0 ? memberBreakdowns[0].total : 1;

    // Calculate team totals by summing member breakdowns (more accurate)
    const meditationScore = memberBreakdowns.reduce((sum, m) => sum + m.meditation, 0);
    const practiceScore = memberBreakdowns.reduce((sum, m) => sum + m.practice, 0);
    const classScore = memberBreakdowns.reduce((sum, m) => sum + m.class, 0);
    const totalFromSources = meditationScore + practiceScore + classScore;

    // Calculate percentages
    const meditationPct = totalFromSources > 0 ? (meditationScore / totalFromSources * 100) : 0;
    const practicePct = totalFromSources > 0 ? (practiceScore / totalFromSources * 100) : 0;
    const classPct = totalFromSources > 0 ? (classScore / totalFromSources * 100) : 0;

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
            
            <!-- Time vs Score Chart -->
            <section class="chart-section">
                <h2 class="section-title">
                    <span class="section-icon">📈</span>
                    積分趨勢 Score Trend
                </h2>
                
                <div id="scoreChart" class="chart-container">
                    ${renderChart(dailyData)}
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

function getMemberBreakdowns(scoreBreakdown, teamName) {
    // Get member lists from all three score sheets
    const meditationMembers = scoreBreakdown.meditation[teamName]?.members || {};
    const practiceMembers = scoreBreakdown.practice[teamName]?.members || {};
    const classMembers = scoreBreakdown.class[teamName]?.members || {};

    // Build a complete member list from all sources
    const allMemberNames = new Set([
        ...Object.keys(meditationMembers),
        ...Object.keys(practiceMembers),
        ...Object.keys(classMembers)
    ]);

    // Calculate breakdown for each member
    const memberBreakdowns = Array.from(allMemberNames).map(name => {
        const meditation = meditationMembers[name] || 0;
        const practice = practiceMembers[name] || 0;
        const classScore = classMembers[name] || 0;
        const total = meditation + practice + classScore;

        return {
            name,
            meditation,
            practice,
            class: classScore,
            total
        };
    });

    // Sort by total points (descending) and filter out members with 0 contribution
    memberBreakdowns.sort((a, b) => b.total - a.total);

    return memberBreakdowns.filter(m => m.total > 0);
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
