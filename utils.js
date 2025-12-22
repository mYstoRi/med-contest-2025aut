import { CONFIG } from './config.js';

// ========================================
// CSV Parsing
// ========================================

/**
 * Parse a CSV line, handling quoted values correctly
 */
export function parseCSVLine(line) {
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

/**
 * Clean a member name by removing parentheses content and trimming
 */
export function cleanName(name) {
    if (!name) return '';
    return name.replace(/\([^)]*\)/g, '').trim();
}

// ========================================
// Date Parsing
// ========================================

/**
 * Parse a date string in M/D format to a Date object
 * Handles year wrap for competition period (Dec 2025 - Jan 2026)
 */
export function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');

    // Handle YYYY/MM/DD
    if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);
        return new Date(year, month - 1, day);
    }

    // Handle M/D (legacy)
    const month = parseInt(parts[0]) || 1;
    const day = parseInt(parts[1]) || 1;
    // Handle year wrap: months 1-5 are in 2026, months 6-12 are in 2025
    const year = month < 6 ? 2026 : 2025;
    return new Date(year, month - 1, day);
}

/**
 * Format a date for display
 */
export function formatDate(dateStr) {
    if (!dateStr) return '';
    return dateStr;
}

/**
 * Format a number with locale-aware thousand separators
 */
export function formatNumber(num) {
    return num.toLocaleString();
}

// ========================================
// Streak Calculation
// ========================================

/**
 * Calculate current streak from an array of date strings
 * Returns 0 if the last activity was before yesterday
 */
export function calculateCurrentStreak(dateStrs) {
    if (dateStrs.length === 0) return 0;

    const sorted = dateStrs
        .map(d => ({ str: d, date: parseDate(d) }))
        .filter(x => x.date !== null)
        .sort((a, b) => a.date - b.date);

    if (sorted.length === 0) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const last = new Date(sorted[sorted.length - 1].date);
    last.setHours(0, 0, 0, 0);

    if (last < yesterday) return 0;

    let streak = 1;
    for (let i = sorted.length - 2; i >= 0; i--) {
        const curr = new Date(sorted[i + 1].date);
        curr.setHours(0, 0, 0, 0);
        const prev = new Date(sorted[i].date);
        prev.setHours(0, 0, 0, 0);
        if ((curr - prev) / (1000 * 60 * 60 * 24) === 1) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

/**
 * Calculate both current and longest streak
 */
export function calculateStreakStats(dateStrs) {
    if (dateStrs.length === 0) return { current: 0, longest: 0 };

    const sorted = dateStrs
        .map(d => ({ str: d, date: parseDate(d) }))
        .filter(x => x.date !== null)
        .sort((a, b) => a.date - b.date);

    if (sorted.length === 0) return { current: 0, longest: 0 };

    // Calculate longest streak
    let longest = 1, temp = 1;
    for (let i = 1; i < sorted.length; i++) {
        const diff = (sorted[i].date - sorted[i - 1].date) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
            temp++;
        } else {
            longest = Math.max(longest, temp);
            temp = 1;
        }
    }
    longest = Math.max(longest, temp);

    // Calculate current streak
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const last = new Date(sorted[sorted.length - 1].date);
    last.setHours(0, 0, 0, 0);

    let current = 0;
    if (last >= yesterday) {
        current = 1;
        for (let i = sorted.length - 2; i >= 0; i--) {
            const curr = new Date(sorted[i + 1].date);
            curr.setHours(0, 0, 0, 0);
            const prev = new Date(sorted[i].date);
            prev.setHours(0, 0, 0, 0);
            if ((curr - prev) / (1000 * 60 * 60 * 24) === 1) {
                current++;
            } else {
                break;
            }
        }
    }

    return { current, longest };
}

/**
 * Calculate dual streaks (solo and activity)
 * @param meditationDates - array of date strings for meditation
 * @param practiceDates - array of date strings for practice
 * @param classDates - array of date strings for class
 */
export function calculateDualStreaks(meditationDates, practiceDates = [], classDates = []) {
    const solo = calculateStreakStats(meditationDates);
    const allDates = [...new Set([...meditationDates, ...practiceDates, ...classDates])];
    const activity = calculateStreakStats(allDates);

    return {
        solo: { current: solo.current, longest: solo.longest },
        activity: { current: activity.current, longest: activity.longest }
    };
}

// ========================================
// Theme & Settings
// ========================================

/**
 * Initialize theme from localStorage
 */
export function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    console.log('🎨 Theme initialized:', savedTheme);
}

/**
 * Toggle between light and dark theme
 */
export function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    console.log('🎨 Theme toggled to:', newTheme);
}

/**
 * Initialize settings panel
 */
export function initSettings() {
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
