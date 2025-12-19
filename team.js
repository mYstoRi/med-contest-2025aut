// ========================================
// Imports from Shared Modules
// ========================================
import { CONFIG, getTeamConfig } from './config.js';
import {
    parseCSVLine,
    parseDate,
    getSheetUrl,
    calculateCurrentStreak,
    initTheme,
    initSettings
} from './utils.js';

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

        const memberUrl = `./member.html?name=${encodeURIComponent(member.name)}&team=${encodeURIComponent(teamName)}`;
        // Show activity streak (any activity) with fire, solo streak (meditation only) with lotus
        const activityBadge = member.activityStreak > 0 ? `<span class="member-streak activity" title="${member.activityStreak} 天精進連續">🔥${member.activityStreak}</span>` : '';
        const soloBadge = member.soloStreak > 0 ? `<span class="member-streak solo" title="${member.soloStreak} 天獨修連續">🧘${member.soloStreak}</span>` : '';
        const streakBadges = activityBadge + soloBadge;

        return `
                        <div class="member-card">
                            <div class="member-rank ${rankClass}">${rankEmoji}</div>
                            <div class="member-info">
                                <a href="${memberUrl}" class="member-name-link">${member.name}</a>${streakBadges}
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
    const memberStreaks = scoreBreakdown.streaks?.[teamName] || {};

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
        const streakData = memberStreaks[name] || { solo: 0, activity: 0 };

        return {
            name,
            meditation,
            practice,
            class: classScore,
            total,
            soloStreak: streakData.solo || 0,
            activityStreak: streakData.activity || 0
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
// API Data Processing
// ========================================

// Calculate team data from API response (includes ALL members, not just navigators)
function getTeamDataFromAPI(apiData, teamName) {
    const team = CONFIG.TEAMS.find(t => t.name === teamName);
    if (!team) return null;

    const teamData = {
        name: team.name,
        shortName: team.shortName,
        color: team.color,
        id: team.id,
        level: 1, // Default level
        totalScore: 0,
        members: []
    };

    // Collect all members for this team with their breakdowns
    const memberTotals = {}; // { name: { meditation, practice, class } }

    // Process meditation
    if (apiData.meditation?.members) {
        for (const m of apiData.meditation.members) {
            if (m.team === teamName) {
                if (!memberTotals[m.name]) memberTotals[m.name] = { meditation: 0, practice: 0, class: 0 };
                memberTotals[m.name].meditation = m.total || 0;
            }
        }
    }

    // Process practice
    if (apiData.practice?.members) {
        for (const m of apiData.practice.members) {
            if (m.team === teamName) {
                if (!memberTotals[m.name]) memberTotals[m.name] = { meditation: 0, practice: 0, class: 0 };
                memberTotals[m.name].practice = m.total || 0;
            }
        }
    }

    // Process class
    if (apiData.class?.members) {
        for (const m of apiData.class.members) {
            if (m.team === teamName) {
                if (!memberTotals[m.name]) memberTotals[m.name] = { meditation: 0, practice: 0, class: 0 };
                memberTotals[m.name].class = m.points || 0;
            }
        }
    }

    // Build members list and calculate team total
    for (const [name, scores] of Object.entries(memberTotals)) {
        const total = scores.meditation + scores.practice + scores.class;
        teamData.members.push({ name, points: total });
        teamData.totalScore += total;
    }

    // Sort by points descending
    teamData.members.sort((a, b) => b.points - a.points);

    return teamData;
}

// Build score breakdown from API data for chart/breakdown display
function getScoreBreakdownFromAPI(apiData) {
    const breakdown = {
        meditation: {},
        practice: {},
        class: {},
        daily: {}
    };

    // Process meditation
    if (apiData.meditation?.members) {
        for (const m of apiData.meditation.members) {
            if (!breakdown.meditation[m.team]) {
                breakdown.meditation[m.team] = { total: 0, members: {} };
            }
            breakdown.meditation[m.team].members[m.name] = m.total || 0;
            breakdown.meditation[m.team].total += m.total || 0;
        }
    }

    // Process practice
    if (apiData.practice?.members) {
        for (const m of apiData.practice.members) {
            if (!breakdown.practice[m.team]) {
                breakdown.practice[m.team] = { total: 0, members: {} };
            }
            breakdown.practice[m.team].members[m.name] = m.total || 0;
            breakdown.practice[m.team].total += m.total || 0;
        }
    }

    // Process class
    if (apiData.class?.members) {
        for (const m of apiData.class.members) {
            if (!breakdown.class[m.team]) {
                breakdown.class[m.team] = { total: 0, members: {} };
            }
            breakdown.class[m.team].members[m.name] = m.points || 0;
            breakdown.class[m.team].total += m.points || 0;
        }
    }

    // Build daily cumulative data for chart
    // Chart expects: { date, meditation, practice, class } per day
    const allDates = new Set();
    const teamDailyByCategory = {}; // { team: { date: { meditation, practice, class } } }

    // Collect all dates and daily scores by category
    for (const sheet of ['meditation', 'practice', 'class']) {
        const members = apiData[sheet]?.members || [];
        for (const m of members) {
            if (m.daily) {
                if (!teamDailyByCategory[m.team]) teamDailyByCategory[m.team] = {};
                for (const [date, value] of Object.entries(m.daily)) {
                    allDates.add(date);
                    if (!teamDailyByCategory[m.team][date]) {
                        teamDailyByCategory[m.team][date] = { meditation: 0, practice: 0, class: 0 };
                    }
                    if (sheet === 'class') {
                        teamDailyByCategory[m.team][date].class += value * 50;
                    } else if (sheet === 'meditation') {
                        teamDailyByCategory[m.team][date].meditation += value;
                    } else {
                        teamDailyByCategory[m.team][date].practice += value;
                    }
                }
            }
        }
    }

    // Sort dates
    const sortedDates = Array.from(allDates).sort((a, b) => {
        const [am, ad] = a.split('/').map(Number);
        const [bm, bd] = b.split('/').map(Number);
        if (am !== bm) return am - bm;
        return ad - bd;
    });

    // Build cumulative array with proper format for chart
    for (const team of Object.keys(teamDailyByCategory)) {
        breakdown.daily[team] = {
            dates: sortedDates,
            cumulative: sortedDates.map(date => {
                const day = teamDailyByCategory[team][date] || { meditation: 0, practice: 0, class: 0 };
                return {
                    date,
                    meditation: day.meditation,
                    practice: day.practice,
                    class: day.class
                };
            })
        };
    }

    return breakdown;
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
        console.log('Fetching data from API...');

        // Single API call to get all data
        const response = await fetch('/api/data');
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        const apiData = await response.json();

        console.log('API data received:', apiData.fromCache ? 'from cache' : 'fresh');

        // Get team data from API (includes ALL members)
        const teamData = getTeamDataFromAPI(apiData, teamName);

        if (!teamData) {
            showError(`找不到隊伍: ${teamName}<br>Team not found`);
            return;
        }

        // Build score breakdown from API
        const scoreBreakdown = getScoreBreakdownFromAPI(apiData);

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
