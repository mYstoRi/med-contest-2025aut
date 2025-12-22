// ========================================
// Imports from Shared Modules
// ========================================
import { CONFIG } from './config.js';
import {
    parseCSVLine,
    getSheetUrl,
    fetchSheetData,
    initTheme,
    initSettings,
    parseDate
} from './utils.js';

// ========================================
// Streak Calculation
// ========================================
function calculateStreaks(meditationDaily, practiceSessions, classSessions) {
    // Parse date helper
    // Parse date helper - use imported parseDate


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
    // 1. Collect all dates to find the earliest one
    const allDates = new Set();

    // Add meditation dates (YYYY/MM/DD or M/D)
    Object.keys(dailyData).forEach(d => allDates.add(d));

    // Add practice dates
    practiceSessions.forEach(s => allDates.add(s.date));

    // Add class dates
    classSessions.forEach(s => allDates.add(s.date));

    // Find min date
    let minDate = new Date(2025, 11, 8); // Default Dec 8, 2025

    if (allDates.size > 0) {
        const sortedDates = Array.from(allDates)
            .map(d => parseDate(d))
            .filter(d => d !== null)
            .sort((a, b) => a - b);

        if (sortedDates.length > 0) {
            minDate = new Date(sortedDates[0]);
        }
    }

    // Adjust to Monday of that week
    // Day: 0 (Sun) to 6 (Sat). We want Monday (1) as start.
    const day = minDate.getDay(); // 0-6
    const diff = minDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    // Wait, if Sunday (0), we want previous Monday (-6).
    // If Monday (1), diff = 1 - 1 + 1 = 1 (No change? No, getDate - 0).
    // If Monday (1): current - 1 + 1 = current.
    // If Tuesday (2): current - 2 + 1 = current - 1 (Monday).
    // If Sunday (0): current - 0 + (-6) = current - 6. 
    // Example: Sunday Dec 14. Prev Monday is Dec 8. 14 - 6 = 8. Correct.

    const startDate = new Date(minDate);
    startDate.setDate(diff);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(2026, 0, 25);   // Jan 25, 2026 (Constant end date? Or dynamic? Keep constant for contest end)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Safety check: ensure start date isn't way too early (e.g. bad data)
    // cap at Dec 1, 2025 maybe? Or just trust data.
    // Let's trust data but ensure it's not before Nov 2025 or something weird.
    if (startDate < new Date(2025, 10, 1)) startDate.setMonth(11, 8); // Fallback if too weird

    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

    // Build weeks array
    const weeks = [];
    let currentWeekStart = new Date(startDate);
    let weekNum = 1;

    while (currentWeekStart <= endDate) {
        const weekDays = [];
        // ... (rest of loop logic)
        // Check "Skip weeks entirely in the future"
        if (currentWeekStart > today && weeks.length > 0) break; // Allow at least one week? or if future, stop.

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(currentWeekStart);
            dayDate.setDate(dayDate.getDate() + i);

            if (dayDate > endDate) break; // Don't break loop, just stop adding days?
            // Actually usually we show full week even if partial? 
            // Existing logic: "if (dayDate > endDate) break;"

            // Format keys for lookup
            const y = dayDate.getFullYear();
            const m = dayDate.getMonth() + 1;
            const d = dayDate.getDate();
            const dateKeyFull = `${y}/${m}/${d}`;         // 2025/12/8
            const dateKeyFullPad = `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`; // 2025/12/08
            const dateKeyShort = `${m}/${d}`;             // 12/8 (Legacy)

            const dateStr = `${m}/${d}`; // Display format

            // value lookup (try all formats)
            const minutes = dailyData[dateKeyFull] || dailyData[dateKeyFullPad] || dailyData[dateKeyShort] || 0;

            // Get practice points for this day
            // Session dates from API are likely YYYY/MM/DD or M/D. 
            // We should match robustly? 
            // existing code: s.date === dateStr. (using Short format).
            // But sessions might have Full date.
            const practiceSession = practiceSessions.find(s => s.date === dateKeyFull || s.date === dateKeyFullPad || s.date === dateKeyShort);
            const practicePoints = practiceSession ? practiceSession.points : 0;

            // Get class count for this day
            const classSession = classSessions.find(s => s.date === dateKeyFull || s.date === dateKeyFullPad || s.date === dateKeyShort);
            const classPoints = classSession ? classSession.count * 50 : 0;

            weekDays.push({
                date: dayDate,
                dateStr, // Display purpose
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

    return weeks.reverse().map(week => `
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
// Get global rank from API data (comparable to getMemberRankFromAPI but for all teams)
function getGlobalRankFromAPI(apiData, memberName) {
    const memberTotals = {};

    // Collect all members from all sheets
    ['meditation', 'practice', 'class'].forEach(type => {
        if (apiData[type]?.members) {
            for (const m of apiData[type].members) {
                const key = `${m.team}:${m.name}`;
                if (!memberTotals[key]) memberTotals[key] = 0;
                memberTotals[key] += (type === 'class' ? (m.points || 0) : (m.total || 0));
            }
        }
    });

    // Sort all members by total points
    const allMembers = Object.entries(memberTotals)
        .map(([key, total]) => {
            const [team, name] = key.split(':');
            return { team, name, total };
        })
        .sort((a, b) => b.total - a.total);

    const rank = allMembers.findIndex(m => m.name === memberName) + 1;
    return { rank, total: allMembers.length, score: memberTotals[`${new URLSearchParams(window.location.search).get('team')}:${memberName}`] || 0 };
}

function calculatePrizes(dailyData, globalRank) {
    // 1. Atomic Habits Master (Perfect streak from Dec 22)
    const startDate = new Date(2025, 11, 22); // Dec 22, 2025
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let isAtomic = true;
    let checkDate = new Date(startDate);

    // If today is before start date, it's pending/active
    if (today >= startDate) {
        while (checkDate <= today) {
            const month = checkDate.getMonth() + 1;
            const day = checkDate.getDate();
            const dateStr = `${month}/${day}`;

            // Check if any activity exists for this day (meditation, practice, class)
            // Note: dailyData passed here is currently just meditation. 
            // We need ALL activity for "Atomic Habit"? 
            // User said "maintain perfect streak". Usually implies the main 'activity streak'.
            // However, calculatePrizes is called with what?
            // Existing dailyData in renderMemberPage is ONLY meditation. 
            // We should check 'activity streak' logic which uses all 3.
            // But here we might not have easy access to combined daily map unless we build it.
            // BUT: We calculated 'streaks' earlier. 
            // If current activity streak covers the period since Dec 22, we are good.
            // Dec 22 to Today is X days. If streak >= X, then good.

            // Let's use the simple logic: calculate days from Dec 22 to Today.
            // If current activity streak >= days_diff + 1, then ON TRACK.

            // Wait, "Perfect streak from 12/22".
            // If today is 12/25. Days: 22, 23, 24, 25. Total 4 days.
            // If streak is 4, then yes.
            checkDate.setDate(checkDate.getDate() + 1);
        }
    }

    // We will determine status based on passed-in 'streaks' object in render

    // 2. Rock Solid Ninja (60+ min meditation)
    let hasRockSolid = false;
    for (const mins of Object.values(dailyData)) {
        if (mins >= 60) {
            hasRockSolid = true;
            break;
        }
    }

    // 3. Grinder King (Global Rank 1)
    const isGrinder = globalRank.rank === 1;

    return {
        atomicStart: startDate,
        hasRockSolid,
        isGrinder,
        globalRank: globalRank.rank
    };
}

function renderPrizes(prizes, streaks) {
    // Check Atomic status
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = prizes.atomicStart;

    // Calculate days required
    const diffTime = Math.abs(today - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive

    // If start date is in future, it's "Ready"
    let atomicStatus = '🔥 持續中 On Track';
    let atomicClass = 'active';

    if (today < startDate) {
        atomicStatus = '⏳ 即將開始 Starting Soon';
        atomicClass = 'pending';
    } else {
        // If current activity streak >= required days, good.
        // Actually, streak logic handles "yesterday" gaps. 
        // If user did it today, current streak includes today.
        // If user didn't do it today yet, streak might be from yesterday, but "On Track" valid if they do it today?
        // Let's be strict: if streak < diffDays, and streak < diffDays - 1 (allowed skip today?), 
        // Actually, if they missed yesterday, streak resets to 0 or 1.
        // If streak < diffDays, it means they broke it at some point since Dec 22.
        // Assumption: Streak calculation is correct.

        if (streaks.activity.current < diffDays && streaks.activity.current < (today.getHours() < 5 ? diffDays - 1 : diffDays)) {
            // Allow late night entries or missed today? 
            // Simple check: if streak < diffDays, it's broken? 
            // Wait, if I start on Dec 22. Today Dec 22. Diff 1. Streak 1. OK.
            // If today Dec 23. Diff 2. Streak 2. OK.
            // If I missed Dec 22. Today Dec 23. Streak 1 (for today). 1 < 2. Broken.
            atomicStatus = '❌ 已中斷 Broken';
            atomicClass = 'broken';
        }
    }

    return `
        <section class="prizes-section">
            <h2 class="section-title">
                <span class="section-icon">🏆</span>
                獎項進度 Prizes Progress
            </h2>
            <div class="prize-cards">
                <!-- Atomic Habits -->
                <div class="prize-card ${atomicClass}">
                    <div class="prize-icon">⚛️</div>
                    <div class="prize-info">
                        <div class="prize-title">原子習慣大師</div>
                        <div class="prize-desc">Atomic Habits Master</div>
                        <div class="prize-status">${atomicStatus}</div>
                    </div>
                </div>

                <!-- Rock Solid -->
                <div class="prize-card ${prizes.hasRockSolid ? 'unlocked' : 'locked'}">
                    <div class="prize-icon">🪨</div>
                    <div class="prize-info">
                        <div class="prize-title">堅若磐石忍者</div>
                        <div class="prize-desc">Rock Solid Ninja</div>
                        <div class="prize-status">${prizes.hasRockSolid ? '✅ 已達成 Unlocked' : '💪 尚未達成 Locked'}</div>
                    </div>
                </div>

                <!-- Grinder King -->
                <div class="prize-card ${prizes.isGrinder ? 'gold-active' : 'locked'}">
                    <div class="prize-icon">👌</div>
                    <div class="prize-info">
                        <div class="prize-title">最強內捲王</div>
                        <div class="prize-desc">The Grinder King</div>
                        <div class="prize-status">${prizes.isGrinder ? '👑 目前第一 Current #1' : `📈 目前排位 Rank: #${prizes.globalRank}`}</div>
                    </div>
                </div>
            </div>
        </section>
    `;
}

// Render Member Page
function renderMemberPage(memberName, teamName, meditation, practice, classData, rank, streaks, prizes) {
    const container = document.getElementById('memberContent');
    if (!container) return;

    const totalScore = meditation.total + practice.total + classData.total;
    const meditationPct = totalScore > 0 ? (meditation.total / totalScore * 100) : 0;
    const practicePct = totalScore > 0 ? (practice.total / totalScore * 100) : 0;
    const classPct = totalScore > 0 ? (classData.total / totalScore * 100) : 0;

    const teamUrl = `./team.html?team=${encodeURIComponent(teamName)}`;
    const rankEmoji = rank.rank === 1 ? '🥇' : rank.rank === 2 ? '🥈' : rank.rank === 3 ? '🥉' : '🏅';

    container.innerHTML = `
        <a href="${teamUrl}" class="back-link">← 返回 ${teamName}</a>
        
        <header class="member-header">
            <div class="member-avatar">🧘</div>
            <h1 class="member-name-title">${memberName}</h1>
            <a href="${teamUrl}" class="member-team-link">${teamName}</a>
            <div class="member-rank-badge">${rankEmoji} 第 ${rank.rank} 名 / ${rank.total} 人 (隊內)</div>
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

        <!-- Prizes Progress -->
        ${renderPrizes(prizes, streaks)}
        
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
// API Data Extraction
// ========================================

// Extract member meditation data from API
function getMemberMeditationFromAPI(apiData, memberName, teamName) {
    const dailyData = {};
    let total = 0;

    if (apiData.meditation?.members) {
        const member = apiData.meditation.members.find(m =>
            m.name === memberName && m.team === teamName
        );
        if (member) {
            total = member.total || 0;
            if (member.daily) {
                Object.assign(dailyData, member.daily);
            }
        }
    }

    return { dailyData, total };
}

// Extract member practice data from API
function getMemberPracticeFromAPI(apiData, memberName, teamName) {
    const sessions = [];
    let total = 0;

    if (apiData.practice?.members) {
        const member = apiData.practice.members.find(m =>
            m.name === memberName && m.team === teamName
        );
        if (member) {
            total = member.total || 0;
            if (member.daily) {
                for (const [date, points] of Object.entries(member.daily)) {
                    sessions.push({ date, points });
                }
            }
        }
    }

    return { sessions, total };
}

// Extract member class data from API
function getMemberClassFromAPI(apiData, memberName, teamName) {
    const sessions = [];
    let totalPoints = 0;
    let count = 0;

    if (apiData.class?.members) {
        const member = apiData.class.members.find(m =>
            m.name === memberName && m.team === teamName
        );
        if (member) {
            totalPoints = member.points || 0;
            count = member.total || 0;
            if (member.daily) {
                for (const [date, attended] of Object.entries(member.daily)) {
                    if (attended > 0) {
                        sessions.push({ date, count: attended });
                    }
                }
            }
        }
    }

    return { sessions, total: totalPoints, count };
}

// Get member rank from API data
function getMemberRankFromAPI(apiData, memberName, teamName) {
    const memberTotals = {}; // { "team:name": { meditation, practice, class } }

    // Collect all members' totals
    if (apiData.meditation?.members) {
        for (const m of apiData.meditation.members) {
            const key = `${m.team}:${m.name}`;
            if (!memberTotals[key]) memberTotals[key] = { team: m.team, name: m.name, meditation: 0, practice: 0, class: 0 };
            memberTotals[key].meditation = m.total || 0;
        }
    }
    if (apiData.practice?.members) {
        for (const m of apiData.practice.members) {
            const key = `${m.team}:${m.name}`;
            if (!memberTotals[key]) memberTotals[key] = { team: m.team, name: m.name, meditation: 0, practice: 0, class: 0 };
            memberTotals[key].practice = m.total || 0;
        }
    }
    if (apiData.class?.members) {
        for (const m of apiData.class.members) {
            const key = `${m.team}:${m.name}`;
            if (!memberTotals[key]) memberTotals[key] = { team: m.team, name: m.name, meditation: 0, practice: 0, class: 0 };
            memberTotals[key].class = m.points || 0;
        }
    }

    // Filter by team and sort
    const teamMembers = Object.values(memberTotals)
        .filter(m => m.team === teamName)
        .map(m => ({ ...m, total: m.meditation + m.practice + m.class }))
        .sort((a, b) => b.total - a.total);

    const rank = teamMembers.findIndex(m => m.name === memberName) + 1;
    const totalMembers = teamMembers.length;

    return { rank, total: totalMembers };
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
        console.log('Fetching data from API...');

        // Single API call to get all data
        const response = await fetch('/api/data');
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        const apiData = await response.json();

        console.log('API data received:', apiData.fromCache ? 'from cache' : 'fresh');

        // Extract member data from API
        const meditation = getMemberMeditationFromAPI(apiData, memberName, teamName);
        const practice = getMemberPracticeFromAPI(apiData, memberName, teamName);
        const classData = getMemberClassFromAPI(apiData, memberName, teamName);

        // Get ranking
        const rank = getMemberRankFromAPI(apiData, memberName, teamName);
        const globalRank = getGlobalRankFromAPI(apiData, memberName);

        // Calculate streaks (solo and activity)
        const streaks = calculateStreaks(meditation.dailyData, practice.sessions, classData.sessions);

        // Calculate prizes
        const prizes = calculatePrizes(meditation.dailyData, globalRank);

        console.log('Member data:', { memberName, teamName, meditation, practice, classData, rank, streaks, prizes });

        // Render page
        renderMemberPage(memberName, teamName, meditation, practice, classData, rank, streaks, prizes);

    } catch (error) {
        console.error('Failed to load member data:', error);
        showError('無法載入資料 Failed to load data');
    }
});
