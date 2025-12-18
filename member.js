// ========================================
// Configuration
// ========================================
const CONFIG = {
    SHEET_ID: '1b2kQ_9Ry0Eu-BoZ-EcSxZxkbjIzBAAjjPGQZU9v9f_s',
    SHEETS: {
        MEDITATION: '禪定登記',
        PRACTICE: '共修登記',
        CLASS: '會館課登記'
    },
    POINTS: {
        CLASS_PER_ATTENDANCE: 50
    }
};

// ========================================
// Data Fetching
// ========================================
function getSheetUrl(sheetName) {
    return `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

async function fetchSheetData(sheetName) {
    const response = await fetch(getSheetUrl(sheetName));
    if (!response.ok) throw new Error(`Failed to fetch ${sheetName}`);
    return response.text();
}

// ========================================
// CSV Parsing
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

// ========================================
// Member Data Parsing
// ========================================
function parseMemberMeditation(csvText, memberName, teamName) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const dates = lines[0]?.slice(3) || []; // Row 0 has dates

    const dailyData = {};
    let totalMinutes = 0;

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 4) continue;

        const rowTeam = row[0];
        const rowMember = row[1];

        if (rowTeam === teamName && rowMember === memberName) {
            for (let j = 3; j < row.length && (j - 3) < dates.length; j++) {
                const date = dates[j - 3];
                if (!date || !date.trim()) continue;

                const minutes = parseFloat(row[j]) || 0;
                if (minutes > 0) {
                    dailyData[date] = (dailyData[date] || 0) + minutes;
                    totalMinutes += minutes;
                }
            }
        }
    }

    return { dailyData, total: totalMinutes };
}

function parseMemberPractice(csvText, memberName, teamName) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const pointsPerSession = lines[0]?.slice(3).map(p => parseFloat(p) || 0) || [];
    const dates = lines[1]?.slice(3) || [];

    const sessions = [];
    let totalPoints = 0;

    for (let i = 2; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 4) continue;

        const rowTeam = row[0];
        const rowMember = row[1];

        if (rowTeam === teamName && rowMember === memberName) {
            for (let j = 3; j < row.length && (j - 3) < dates.length; j++) {
                const date = dates[j - 3];
                if (!date || !date.trim()) continue;

                const attended = parseFloat(row[j]) || 0;
                if (attended > 0) {
                    const points = pointsPerSession[j - 3] || 40;
                    sessions.push({ date, points });
                    totalPoints += points;
                }
            }
        }
    }

    return { sessions, total: totalPoints };
}

function parseMemberClass(csvText, memberName, teamName) {
    const lines = csvText.split('\n').map(parseCSVLine);
    const dates = lines[0]?.slice(4) || []; // Skip 總計 column

    const sessions = [];
    let totalCount = 0;

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 5) continue;

        const rowTeam = row[0];
        const rowMember = row[1];

        if (rowTeam === teamName && rowMember === memberName) {
            // Column 3 has total count
            totalCount = parseFloat(row[3]) || 0;

            // Get individual dates
            for (let j = 4; j < row.length && (j - 4) < dates.length; j++) {
                const date = dates[j - 4];
                if (!date || !date.trim()) continue;

                const attended = parseFloat(row[j]) || 0;
                if (attended > 0) {
                    sessions.push({ date, count: attended });
                }
            }
        }
    }

    return { sessions, total: totalCount * CONFIG.POINTS.CLASS_PER_ATTENDANCE, count: totalCount };
}

function getTeamMemberCount(meditationCSV, teamName) {
    const lines = meditationCSV.split('\n').map(parseCSVLine);
    const members = new Set();

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length < 2) continue;

        if (row[0] === teamName && row[1]) {
            members.add(row[1]);
        }
    }

    return members.size;
}

function getMemberRank(meditationCSV, practiceCSV, classCSV, memberName, teamName) {
    // Calculate all member scores for ranking
    const meditationLines = meditationCSV.split('\n').map(parseCSVLine);
    const practiceLines = practiceCSV.split('\n').map(parseCSVLine);
    const classLines = classCSV.split('\n').map(parseCSVLine);

    const memberScores = {};

    // Meditation scores
    for (let i = 1; i < meditationLines.length; i++) {
        const row = meditationLines[i];
        if (!row || row.length < 4 || row[0] !== teamName) continue;

        const name = row[1];
        if (!name) continue;

        let total = 0;
        for (let j = 3; j < row.length; j++) {
            total += parseFloat(row[j]) || 0;
        }
        memberScores[name] = (memberScores[name] || 0) + total;
    }

    // Practice scores
    const pointsPerSession = practiceLines[0]?.slice(3).map(p => parseFloat(p) || 0) || [];
    for (let i = 2; i < practiceLines.length; i++) {
        const row = practiceLines[i];
        if (!row || row.length < 4 || row[0] !== teamName) continue;

        const name = row[1];
        if (!name) continue;

        for (let j = 3; j < row.length && (j - 3) < pointsPerSession.length; j++) {
            const attended = parseFloat(row[j]) || 0;
            if (attended > 0) {
                memberScores[name] = (memberScores[name] || 0) + (pointsPerSession[j - 3] || 40);
            }
        }
    }

    // Class scores
    for (let i = 1; i < classLines.length; i++) {
        const row = classLines[i];
        if (!row || row.length < 4 || row[0] !== teamName) continue;

        const name = row[1];
        if (!name) continue;

        const totalCount = parseFloat(row[3]) || 0;
        memberScores[name] = (memberScores[name] || 0) + (totalCount * CONFIG.POINTS.CLASS_PER_ATTENDANCE);
    }

    // Sort and find rank
    const sorted = Object.entries(memberScores)
        .filter(([_, score]) => score > 0)
        .sort((a, b) => b[1] - a[1]);

    const rank = sorted.findIndex(([name]) => name === memberName) + 1;
    return { rank, total: sorted.length };
}

// ========================================
// Streak Calculation
// ========================================
function calculateStreaks(meditationDaily, practiceSessions, classSessions) {
    // Parse date helper
    const parseDate = (d) => {
        const parts = d.split('/');
        const month = parseInt(parts[0]) || 1;
        const day = parseInt(parts[1]) || 1;
        const year = month < 6 ? 2026 : 2025;
        return new Date(year, month - 1, day);
    };

    // Calculate streak from date strings
    const calcStreak = (dateStrs) => {
        if (dateStrs.length === 0) return { current: 0, longest: 0 };

        const sorted = dateStrs.map(d => ({ str: d, date: parseDate(d) })).sort((a, b) => a.date - b.date);

        // Calculate longest streak
        let longest = 1, temp = 1;
        for (let i = 1; i < sorted.length; i++) {
            const diff = (sorted[i].date - sorted[i - 1].date) / (1000 * 60 * 60 * 24);
            if (diff === 1) temp++;
            else { longest = Math.max(longest, temp); temp = 1; }
        }
        longest = Math.max(longest, temp);

        // Calculate current streak
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        const last = new Date(sorted[sorted.length - 1].date); last.setHours(0, 0, 0, 0);

        let current = 0;
        if (last >= yesterday) {
            current = 1;
            for (let i = sorted.length - 2; i >= 0; i--) {
                const curr = new Date(sorted[i + 1].date); curr.setHours(0, 0, 0, 0);
                const prev = new Date(sorted[i].date); prev.setHours(0, 0, 0, 0);
                if ((curr - prev) / (1000 * 60 * 60 * 24) === 1) current++;
                else break;
            }
        }

        return { current, longest };
    };

    // Get meditation dates
    const meditationDates = Object.keys(meditationDaily || {}).filter(d => meditationDaily[d] > 0);

    // Get practice dates
    const practiceDates = (practiceSessions || []).map(s => s.date);

    // Get class dates
    const classDates = (classSessions || []).map(s => s.date);

    // Solo streak: meditation only
    const solo = calcStreak(meditationDates);

    // Activity streak: any activity
    const allDates = [...new Set([...meditationDates, ...practiceDates, ...classDates])];
    const activity = calcStreak(allDates);

    return {
        solo: { current: solo.current, longest: solo.longest },
        activity: { current: activity.current, longest: activity.longest }
    };
}
// ========================================
// Weekly Summary Cards Rendering
// ========================================
function renderWeeklyCards(dailyData, practiceSessions, classSessions) {
    // Competition period: Dec 8, 2025 to Jan 25, 2026
    const startDate = new Date(2025, 11, 8); // Dec 8, 2025
    const endDate = new Date(2026, 0, 25);   // Jan 25, 2026
    const today = new Date();
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

    // Build weeks array
    const weeks = [];
    let currentWeekStart = new Date(startDate);
    let weekNum = 1;

    while (currentWeekStart <= endDate) {
        const weekDays = [];
        const weekEndDate = new Date(currentWeekStart);
        weekEndDate.setDate(weekEndDate.getDate() + 6);

        // Skip weeks entirely in the future
        if (currentWeekStart > today) break;

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(currentWeekStart);
            dayDate.setDate(dayDate.getDate() + i);

            if (dayDate > endDate) break;
            if (dayDate < startDate) continue;

            const month = dayDate.getMonth() + 1;
            const day = dayDate.getDate();
            const dateStr = `${month}/${day}`;
            const minutes = dailyData[dateStr] || 0;

            // Get practice points for this day
            const practiceSession = practiceSessions.find(s => s.date === dateStr);
            const practicePoints = practiceSession ? practiceSession.points : 0;

            // Get class count for this day
            const classSession = classSessions.find(s => s.date === dateStr);
            const classPoints = classSession ? classSession.count * 50 : 0;

            weekDays.push({
                date: dayDate,
                dateStr,
                dayName: dayNames[dayDate.getDay()],
                minutes,
                practicePoints,
                classPoints,
                isFuture: dayDate > today
            });
        }

        if (weekDays.length > 0) {
            const weekTotal = weekDays.reduce((sum, d) => sum + d.minutes + d.practicePoints + d.classPoints, 0);
            const daysWithActivity = weekDays.filter(d => d.minutes > 0 || d.practicePoints > 0 || d.classPoints > 0).length;

            weeks.push({
                num: weekNum,
                days: weekDays,
                total: weekTotal,
                activeDays: daysWithActivity,
                startDate: weekDays[0].dateStr,
                endDate: weekDays[weekDays.length - 1].dateStr
            });
            weekNum++;
        }

        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }

    return weeks.map(week => `
        <div class="week-card">
            <div class="week-header">
                <span class="week-title">第 ${week.num} 週</span>
                <span class="week-dates">${week.startDate} - ${week.endDate}</span>
            </div>
            <div class="week-days">
                ${week.days.map(day => {
        const isToday = day.date.toDateString() === new Date().toDateString();
        const hasActivity = day.minutes > 0 || day.practicePoints > 0 || day.classPoints > 0;

        return `
                        <div class="day-column ${isToday ? 'today' : ''} ${day.isFuture ? 'future' : ''}">
                            <div class="day-scores">
                                ${day.minutes > 0 ? `<div class="day-score meditation" title="禪定">🧘${day.minutes}</div>` : ''}
                                ${day.practicePoints > 0 ? `<div class="day-score practice" title="共修">🙏${day.practicePoints}</div>` : ''}
                                ${day.classPoints > 0 ? `<div class="day-score class" title="會館課">📚${day.classPoints}</div>` : ''}
                                ${!hasActivity && !day.isFuture ? '<div class="day-score empty">-</div>' : ''}
                                ${day.isFuture ? '<div class="day-score empty">...</div>' : ''}
                            </div>
                            <div class="day-label">${day.dayName}</div>
                            <div class="day-date">${day.dateStr.split('/')[1]}</div>
                        </div>
                    `;
    }).join('')}
            </div>
            <div class="week-summary">
                <span>💎 ${week.total} 分</span>
                <span>📅 ${week.activeDays}/${week.days.length} 天</span>
            </div>
        </div>
    `).join('');
}

// ========================================
// Rendering
// ========================================
function renderMemberPage(memberName, teamName, meditation, practice, classData, rank, streaks) {
    const container = document.getElementById('memberContent');
    if (!container) return;

    const totalScore = meditation.total + practice.total + classData.total;
    const meditationPct = totalScore > 0 ? (meditation.total / totalScore * 100) : 0;
    const practicePct = totalScore > 0 ? (practice.total / totalScore * 100) : 0;
    const classPct = totalScore > 0 ? (classData.total / totalScore * 100) : 0;

    // Build activity history
    const activities = [];

    // Add meditation days
    for (const [date, minutes] of Object.entries(meditation.dailyData)) {
        activities.push({ date, type: 'meditation', minutes, points: minutes });
    }

    // Add practice sessions
    for (const session of practice.sessions) {
        activities.push({ date: session.date, type: 'practice', points: session.points });
    }

    // Add class sessions
    for (const session of classData.sessions) {
        activities.push({ date: session.date, type: 'class', points: session.count * CONFIG.POINTS.CLASS_PER_ATTENDANCE });
    }

    // Sort by date (most recent first)
    const parseDate = (d) => {
        const parts = d.split('/');
        const month = parseInt(parts[0]) || 1;
        const day = parseInt(parts[1]) || 1;
        const val = (month < 6 ? month + 12 : month) * 100 + day;
        return val;
    };
    activities.sort((a, b) => parseDate(b.date) - parseDate(a.date));

    const teamUrl = `./team.html?team=${encodeURIComponent(teamName)}`;
    const rankEmoji = rank.rank === 1 ? '🥇' : rank.rank === 2 ? '🥈' : rank.rank === 3 ? '🥉' : '🏅';

    container.innerHTML = `
        <a href="${teamUrl}" class="back-link">← 返回 ${teamName}</a>
        
        <header class="member-header">
            <div class="member-avatar">🧘</div>
            <h1 class="member-name-title">${memberName}</h1>
            <a href="${teamUrl}" class="member-team-link">${teamName}</a>
            <div class="member-rank-badge">${rankEmoji} 第 ${rank.rank} 名 / ${rank.total} 人</div>
        </header>
        
        <!-- Stats Overview -->
        <div class="member-stats">
            <div class="member-stat-card">
                <div class="member-stat-icon">💎</div>
                <div class="member-stat-value">${totalScore.toLocaleString()}</div>
                <div class="member-stat-label">總積分 Total Points</div>
            </div>
            <div class="member-stat-card">
                <div class="member-stat-icon">🧘</div>
                <div class="member-stat-value">${Math.round(meditation.total).toLocaleString()}</div>
                <div class="member-stat-label">禪定分鐘 Meditation</div>
            </div>
            <div class="member-stat-card">
                <div class="member-stat-icon">📅</div>
                <div class="member-stat-value">${Object.keys(meditation.dailyData).length}</div>
                <div class="member-stat-label">禪定天數 Days</div>
            </div>
        </div>
        
        <!-- Streak Cards -->
        <div class="streak-container">
            <div class="streak-card ${streaks.activity.current > 0 ? 'current' : ''}">
                <div class="streak-value">🔥 ${streaks.activity.current}</div>
                <div class="streak-label">精進連續 Activity Streak</div>
            </div>
            <div class="streak-card ${streaks.solo.current > 0 ? 'solo-active' : ''}">
                <div class="streak-value">🧘 ${streaks.solo.current}</div>
                <div class="streak-label">獨修連續 Solo Streak</div>
            </div>
            <div class="streak-card">
                <div class="streak-value">⭐ ${streaks.activity.longest}</div>
                <div class="streak-label">最長精進 Longest Activity</div>
            </div>
            <div class="streak-card">
                <div class="streak-value">✨ ${streaks.solo.longest}</div>
                <div class="streak-label">最長獨修 Longest Solo</div>
            </div>
        </div>
        
        <!-- Score Breakdown -->
        <section class="breakdown-section">
            <h2 class="section-title">
                <span class="section-icon">📊</span>
                積分來源 Score Breakdown
            </h2>
            
            <div class="breakdown-bar">
                ${meditationPct > 0 ? `<div class="breakdown-segment meditation" style="width: ${meditationPct}%">${Math.round(meditation.total)}</div>` : ''}
                ${practicePct > 0 ? `<div class="breakdown-segment practice" style="width: ${practicePct}%">${Math.round(practice.total)}</div>` : ''}
                ${classPct > 0 ? `<div class="breakdown-segment class" style="width: ${classPct}%">${Math.round(classData.total)}</div>` : ''}
            </div>
            
            <div class="breakdown-legend">
                <div class="legend-item">
                    <span class="legend-color meditation"></span>
                    <span>🧘 禪定 ${Math.round(meditation.total)} (${meditationPct.toFixed(1)}%)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color practice"></span>
                    <span>🙏 共修 ${Math.round(practice.total)} (${practicePct.toFixed(1)}%)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color class"></span>
                    <span>📚 會館課 ${Math.round(classData.total)} (${classPct.toFixed(1)}%)</span>
                </div>
            </div>
        </section>
        
        <!-- Weekly Activity Cards -->
        <section class="weekly-section">
            <h2 class="section-title">
                <span class="section-icon">📅</span>
                每週活動 Weekly Activity
            </h2>
            <div class="weekly-cards">
                ${renderWeeklyCards(meditation.dailyData, practice.sessions, classData.sessions)}
            </div>
        </section>
    `;
}

function showError(message) {
    const container = document.getElementById('memberContent');
    if (container) {
        container.innerHTML = `
            <div class="error-message">
                <p>❌ ${message}</p>
            </div>
        `;
    }
}

// ========================================
// Theme Settings
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

// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initSettings();

    // Get member name and team from URL
    const urlParams = new URLSearchParams(window.location.search);
    const memberName = urlParams.get('name');
    const teamName = urlParams.get('team');

    if (!memberName || !teamName) {
        showError('請選擇一位成員 Please select a member');
        return;
    }

    document.title = `${memberName} | 個人詳情`;

    try {
        // Fetch all sheet data
        const [meditationCSV, practiceCSV, classCSV] = await Promise.all([
            fetchSheetData(CONFIG.SHEETS.MEDITATION),
            fetchSheetData(CONFIG.SHEETS.PRACTICE),
            fetchSheetData(CONFIG.SHEETS.CLASS)
        ]);

        // Parse member data
        const meditation = parseMemberMeditation(meditationCSV, memberName, teamName);
        const practice = parseMemberPractice(practiceCSV, memberName, teamName);
        const classData = parseMemberClass(classCSV, memberName, teamName);

        // Get ranking
        const rank = getMemberRank(meditationCSV, practiceCSV, classCSV, memberName, teamName);

        // Calculate streaks (solo and activity)
        const streaks = calculateStreaks(meditation.dailyData, practice.sessions, classData.sessions);

        console.log('Member data:', { memberName, teamName, meditation, practice, classData, rank, streaks });

        // Render page
        renderMemberPage(memberName, teamName, meditation, practice, classData, rank, streaks);

    } catch (error) {
        console.error('Failed to load member data:', error);
        showError('無法載入資料 Failed to load data');
    }
});
