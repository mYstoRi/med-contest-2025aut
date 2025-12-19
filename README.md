# Meditation Competition Dashboard

A real-time visualization dashboard for tracking meditation competition progress across teams.

This repo is built for NTHU leader club meditation competition.
If you want to use it, you will also need to set up a Google Sheet and form.
There is a chance I will build them all on the website, it is just not the case yet.

## Features
- 🏆 Team score visualization with animated bars
- 📊 Live leaderboard with rankings
- ✨ Recent activity feed
- 🔄 Auto-refresh every 5 minutes

## Setup

```bash
npm install
npm run dev
```

## Deployment

This project is configured for Vercel deployment. Just push to GitHub and connect to Vercel.

## Data Source

Data is fetched from Google Sheets published CSVs:
- Team totals from the totals sheet
- Activity feed from form responses
