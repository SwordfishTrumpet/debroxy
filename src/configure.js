/**
 * Configure page generator for Stremio addon
 * Provides an HTML landing page with status, stats, and settings in a tabbed interface
 * @module configure
 */

import config from './config.js';
import { VERSION } from './constants.js';

/**
 * Generate the configure page HTML
 * @param {Object} data - Page data
 * @param {Object} data.library - Library status from library.getStatus()
 * @param {Object} data.streams - Active streams info
 * @param {string} data.token - Auth token (masked) or null if auth disabled
 * @param {string} data.apiBase - Base URL for API calls
 * @param {boolean} data.lowBandwidthMode - Whether low bandwidth mode is enabled
 * @returns {string} HTML string
 */
export function generateConfigurePage(data) {
  const { library, streams, token, apiBase, lowBandwidthMode } = data;
  const stats = library.stats || { movies: 0, series: 0, torrents: 0, unmatched: 0, files: 0, subtitles: 0, watch_history: 0 };

  const syncStatus = library.isSyncing
    ? 'syncing'
    : library.isComplete
      ? 'complete'
      : 'pending';

  const syncStatusText = library.isSyncing
    ? 'Syncing'
    : library.isComplete
      ? 'Complete'
      : 'Pending';

  const lastSyncFormatted = library.lastSync
    ? new Date(Number(library.lastSync)).toLocaleString()
    : 'Never';

  // Calculate next sync time
  const nextSyncText = library.lastSync
    ? new Date(Number(library.lastSync) + (config.syncIntervalMin * 60 * 1000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'After sync';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Debroxy - Configuration</title>
  <style>
    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f8f9fa;
      --bg-hover: #f1f3f4;
      --bg-tertiary: #e8eaed;
      --text-primary: #202124;
      --text-secondary: #5f6368;
      --text-tertiary: #80868b;
      --text-muted: #9aa0a6;
      --border: #dadce0;
      --border-light: #e8eaed;
      --accent: #1a73e8;
      --accent-hover: #1557b0;
      --accent-light: #e8f0fe;
      --success: #188038;
      --success-light: #e6f4ea;
      --warning: #f9ab00;
      --warning-light: #fef3e8;
      --error: #d93025;
      --error-light: #fce8e6;
      --shadow-sm: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15);
      --shadow-md: 0 1px 2px 0 rgba(60,64,67,0.3), 0 2px 6px 2px rgba(60,64,67,0.15);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Google Sans', 'Roboto', 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: var(--bg-secondary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.5;
    }

    /* Header */
    .app-bar {
      background: var(--bg-primary);
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      height: 64px;
      display: flex;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .app-bar-content {
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .app-logo {
      font-size: 1.375rem;
      font-weight: 500;
      color: var(--text-primary);
      letter-spacing: -0.025em;
    }

    .app-divider {
      color: var(--border);
      font-weight: 300;
    }

    .app-title {
      font-size: 1.125rem;
      font-weight: 400;
      color: var(--text-secondary);
    }

    /* Main Container */
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px 24px;
    }

    /* Tab Navigation - Material Design style */
    .tabs-container {
      background: var(--bg-primary);
      border-bottom: 1px solid var(--border-light);
      position: sticky;
      top: 64px;
      z-index: 99;
      margin: 0 -24px;
      padding: 0 24px;
    }

    .tabs {
      display: flex;
      gap: 8px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .tab {
      position: relative;
      padding: 16px 24px;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
      background: none;
      border: none;
      cursor: pointer;
      transition: color 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 0.8125rem;
    }

    .tab:hover {
      color: var(--text-primary);
    }

    .tab.active {
      color: var(--accent);
    }

    .tab.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--accent);
      border-radius: 3px 3px 0 0;
    }

    .tab-icon {
      width: 18px;
      height: 18px;
    }

    /* Tab Content */
    .tab-content {
      display: none;
      padding-top: 24px;
      animation: fadeIn 0.3s ease;
    }

    .tab-content.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Cards - Material Design elevation */
    .card {
      background: var(--bg-primary);
      border-radius: 12px;
      box-shadow: var(--shadow-sm);
      margin-bottom: 16px;
      overflow: hidden;
      transition: box-shadow 0.2s ease;
    }

    .card:hover {
      box-shadow: var(--shadow-md);
    }

    .card-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-light);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-secondary);
    }

    .card-title {
      font-size: 1rem;
      font-weight: 500;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .card-icon {
      width: 20px;
      height: 20px;
      color: var(--text-secondary);
    }

    .card-body {
      padding: 24px;
    }

    /* Status Grid */
    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0;
    }

    .stat-item {
      padding: 32px 24px;
      text-align: center;
      border-right: 1px solid var(--border-light);
      position: relative;
    }

    .stat-item:last-child {
      border-right: none;
    }

    .stat-value {
      font-size: 2.5rem;
      font-weight: 400;
      color: var(--accent);
      line-height: 1;
      font-family: 'Google Sans', sans-serif;
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-top: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 500;
    }

    /* Info List */
    .info-list {
      display: flex;
      flex-direction: column;
    }

    .info-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-bottom: 1px solid var(--border-light);
    }

    .info-item:last-child {
      border-bottom: none;
    }

    .info-label {
      color: var(--text-secondary);
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .info-value {
      font-weight: 500;
      font-size: 0.9375rem;
      color: var(--text-primary);
      font-family: 'Roboto Mono', monospace;
    }

    .info-value.text {
      font-family: 'Google Sans', 'Roboto', sans-serif;
    }

    /* Status Chips - Material Design style */
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .chip::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .chip.syncing {
      background: var(--warning-light);
      color: #b06000;
    }
    .chip.syncing::before {
      background: var(--warning);
      animation: pulse 1.5s infinite;
    }

    .chip.complete {
      background: var(--success-light);
      color: var(--success);
    }
    .chip.complete::before {
      background: var(--success);
    }

    .chip.pending {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
    }
    .chip.pending::before {
      background: var(--text-tertiary);
    }

    .chip.connected {
      background: var(--success-light);
      color: var(--success);
    }
    .chip.connected::before {
      background: var(--success);
    }

    .chip.disconnected {
      background: var(--error-light);
      color: var(--error);
    }
    .chip.disconnected::before {
      background: var(--error);
    }

    .chip.unknown {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
    }
    .chip.unknown::before {
      background: var(--text-tertiary);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Progress Bar */
    .progress-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .progress-bar {
      width: 120px;
      height: 4px;
      background: var(--border-light);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    /* RD Status Card */
    .rd-status-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 40px;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .rd-status-error {
      padding: 20px;
      background: var(--error-light);
      border-radius: 8px;
      color: var(--error);
      font-size: 0.875rem;
    }

    .rd-user-grid {
      display: flex;
      flex-direction: column;
    }

    /* Circuit Breaker */
    .cb-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      padding: 4px 10px;
      border-radius: 12px;
      font-weight: 500;
    }

    .cb-indicator.closed { background: var(--success-light); color: var(--success); }
    .cb-indicator.open { background: var(--error-light); color: var(--error); }
    .cb-indicator.half-open { background: var(--warning-light); color: #b06000; }

    /* Buttons - Material Design style */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0 16px;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
      height: 36px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 0.8125rem;
    }

    .btn-primary {
      background: var(--accent);
      color: white;
    }

    .btn-primary:hover {
      background: var(--accent-hover);
      box-shadow: 0 1px 2px rgba(26,115,232,0.3);
    }

    .btn-primary:disabled {
      background: var(--border);
      cursor: not-allowed;
      box-shadow: none;
    }

    .btn-secondary {
      background: transparent;
      color: var(--accent);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: var(--bg-hover);
      border-color: var(--text-tertiary);
    }

    .btn-outline {
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }

    .btn-outline:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    /* Settings */
    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 0;
      border-bottom: 1px solid var(--border-light);
    }

    .setting-row:last-child {
      border-bottom: none;
    }

    .setting-info {
      flex: 1;
    }

    .setting-label {
      font-weight: 500;
      font-size: 1rem;
      margin-bottom: 4px;
      color: var(--text-primary);
    }

    .setting-description {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .setting-control {
      margin-left: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* Number input controls */
    .number-input {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .number-input .btn {
      width: 36px;
      padding: 0;
      font-weight: 600;
    }

    .setting-number {
      width: 60px;
      height: 36px;
      border: 1px solid var(--border);
      border-radius: 4px;
      text-align: center;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-primary);
      background: var(--bg-primary);
      font-family: 'Roboto Mono', monospace;
    }

    /* Select dropdown */
    .setting-select {
      height: 36px;
      padding: 0 32px 0 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-primary);
      background: var(--bg-primary);
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235f6368' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
    }

    .setting-select:focus {
      outline: none;
      border-color: var(--accent);
    }

    /* Slider control */
    .setting-slider {
      width: 150px;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: var(--border-light);
      border-radius: 2px;
      cursor: pointer;
    }

    .setting-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      background: var(--accent);
      border-radius: 50%;
      cursor: pointer;
      box-shadow: var(--shadow-sm);
      transition: transform 0.1s ease;
    }

    .setting-slider::-webkit-slider-thumb:hover {
      transform: scale(1.1);
    }

    .setting-slider::-moz-range-thumb {
      width: 18px;
      height: 18px;
      background: var(--accent);
      border-radius: 50%;
      cursor: pointer;
      border: none;
      box-shadow: var(--shadow-sm);
    }

    .slider-value {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
      min-width: 40px;
      text-align: right;
    }

    /* Unsaved changes indicator */
    .setting-control.saving {
      opacity: 0.7;
    }

    .setting-saved-indicator {
      color: var(--success);
      font-size: 0.75rem;
      margin-left: 8px;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .setting-saved-indicator.show {
      opacity: 1;
    }

    /* Responsive for settings */
    @media (max-width: 768px) {
      .setting-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }

      .setting-control {
        margin-left: 0;
        width: 100%;
      }

      .number-input,
      .setting-select,
      .setting-slider {
        width: 100%;
      }

      .setting-number {
        flex: 1;
      }
    }

    /* Info Cards Row */
    .info-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }

    .info-card {
      background: var(--bg-primary);
      border-radius: 12px;
      box-shadow: var(--shadow-sm);
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .info-card-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--accent-light);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
      flex-shrink: 0;
    }

    .info-card-content {
      flex: 1;
    }

    .info-card-title {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .info-card-value {
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--text-primary);
    }

    /* Note/Callout */
    .note {
      background: var(--accent-light);
      border-radius: 8px;
      padding: 16px 20px;
      margin-top: 16px;
    }

    .note-title {
      font-weight: 500;
      font-size: 0.875rem;
      margin-bottom: 8px;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .note p {
      color: var(--text-secondary);
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.5;
    }

    /* Code */
    code {
      font-family: 'Roboto Mono', 'Monaco', monospace;
      font-size: 0.8125rem;
      background: var(--bg-tertiary);
      padding: 4px 8px;
      border-radius: 4px;
      color: var(--text-primary);
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      padding: 14px 24px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      font-size: 0.875rem;
      opacity: 0;
      transition: all 0.3s ease;
      z-index: 1000;
      box-shadow: var(--shadow-md);
      min-width: 300px;
      text-align: center;
    }

    .toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .toast.success { background: var(--success); }
    .toast.error { background: var(--error); }
    .toast.info { background: var(--text-secondary); }

    /* Footer */
    footer {
      text-align: center;
      padding: 32px 24px;
      color: var(--text-tertiary);
      font-size: 0.75rem;
      margin-top: 24px;
    }

    footer a {
      color: var(--accent);
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }

    footer .footer-links {
      margin-bottom: 8px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .tabs {
        gap: 0;
      }

      .tab {
        padding: 16px 12px;
        font-size: 0.75rem;
      }

      .tab span {
        display: none;
      }

      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .stat-item {
        border-right: none;
        border-bottom: 1px solid var(--border-light);
        padding: 20px;
      }

      .stat-item:nth-child(3),
      .stat-item:nth-child(4) {
        border-bottom: none;
      }

      .rd-user-grid {
        flex-direction: column;
      }

      .info-cards {
        grid-template-columns: 1fr;
      }

      .setting-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }

      .setting-control {
        margin-left: 0;
        width: 100%;
      }

      .btn {
        width: 100%;
      }

      .actions {
        flex-direction: column;
      }
    }

    /* Spinner */
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .spinner {
      animation: spin 1s linear infinite;
    }
  </style>
</head>
<body>
  <header class="app-bar">
    <div class="app-bar-content">
      <span class="app-logo">Debroxy</span>
      <span class="app-divider">/</span>
      <span class="app-title">Configuration</span>
    </div>
  </header>

  <div class="tabs-container">
    <div class="tabs">
      <button class="tab active" onclick="showTab('status')" data-tab="status">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>Status</span>
      </button>
      <button class="tab" onclick="showTab('stats')" data-tab="stats">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
        <span>Statistics</span>
      </button>
      <button class="tab" onclick="showTab('settings')" data-tab="settings">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span>Settings</span>
      </button>
    </div>
  </div>

  <div class="container">

    <!-- ==================== STATUS TAB ==================== -->
    <div id="tab-status" class="tab-content active">

      <!-- Quick Info Cards -->
      <div class="info-cards">
        <div class="info-card">
          <div class="info-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div class="info-card-content">
            <div class="info-card-title">Real-Debrid</div>
            <div class="info-card-value" id="rd-quick-status">Checking...</div>
          </div>
        </div>

        <div class="info-card">
          <div class="info-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
            </svg>
          </div>
          <div class="info-card-content">
            <div class="info-card-title">Library Sync</div>
            <div class="info-card-value">
              <span class="chip ${syncStatus}">${syncStatusText}</span>
            </div>
          </div>
        </div>

        <div class="info-card">
          <div class="info-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <div class="info-card-content">
            <div class="info-card-title">Active Streams</div>
            <div class="info-card-value">${streams.active} / ${streams.max}</div>
          </div>
        </div>
      </div>

      <!-- Detailed Status Cards -->
      <div class="status-grid">
        <!-- Real-Debrid Connection -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">
              <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              Real-Debrid Connection
            </h3>
            <span class="chip unknown" id="rd-badge">Checking...</span>
          </div>
          <div class="card-body">
            <div id="rd-content">
              <div class="rd-status-loading">
                <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
                Loading connection status...
              </div>
            </div>
          </div>
        </div>

        <!-- Library Sync Details -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">
              <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
              </svg>
              Library Sync Details
            </h3>
          </div>
          <div class="card-body">
            <div class="info-list">
              <div class="info-item">
                <span class="info-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  Last Sync
                </span>
                <span class="info-value text" id="last-sync">${lastSyncFormatted}</span>
              </div>
              <div class="info-item">
                <span class="info-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 8 14"/>
                  </svg>
                  Next Sync
                </span>
                <span class="info-value text" id="next-sync">${nextSyncText}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Sync Interval</span>
                <span class="info-value text">${data.settings?.syncIntervalMin ?? config.syncIntervalMin} minutes</span>
              </div>
              <div class="info-item">
                <span class="info-label">Circuit Breaker</span>
                <span class="info-value text" id="cb-state">Checking...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Stream Status -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">
              <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Stream Status
            </h3>
          </div>
          <div class="card-body">
            <div class="info-list">
              <div class="info-item">
                <span class="info-label">Active Streams</span>
                <span class="info-value text">${streams.active} / ${streams.max}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Utilization</span>
                <div class="progress-container">
                  <span class="info-value text">${Math.round((streams.active / streams.max) * 100)}%</span>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(streams.active / streams.max) * 100}%"></div>
                  </div>
                </div>
              </div>
              <div class="info-item">
                <span class="info-label">Max Concurrent</span>
                <span class="info-value text">${data.settings?.maxConcurrentStreams ?? config.maxConcurrentStreams}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Transcoding</span>
                <span class="chip ${(data.settings?.transcodingEnabled ?? config.transcodingEnabled) ? 'complete' : 'pending'}">${(data.settings?.transcodingEnabled ?? config.transcodingEnabled) ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== STATS TAB ==================== -->
    <div id="tab-stats" class="tab-content">

      <!-- Library Overview -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            Library Overview
          </h3>
        </div>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value" id="stat-movies">${stats.movies}</div>
            <div class="stat-label">Movies</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="stat-series">${stats.series}</div>
            <div class="stat-label">Series</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="stat-torrents">${stats.torrents}</div>
            <div class="stat-label">Torrents</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="stat-unmatched">${stats.unmatched}</div>
            <div class="stat-label">Unmatched</div>
          </div>
        </div>
      </div>

      <!-- Watch History Stats -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polygon points="10 8 16 12 10 16 10 8"/>
            </svg>
            Watch History
          </h3>
        </div>
        <div class="card-body">
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value" id="watch-total">-</div>
              <div class="stat-label">Total Watched</div>
            </div>
            <div class="stat-item">
              <div class="stat-value" id="watch-movies">-</div>
              <div class="stat-label">Movies</div>
            </div>
            <div class="stat-item">
              <div class="stat-value" id="watch-series">-</div>
              <div class="stat-label">Episodes</div>
            </div>
            <div class="stat-item">
              <div class="stat-value" id="watch-time">-</div>
              <div class="stat-label">Hours Watched</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== SETTINGS TAB ==================== -->
    <div id="tab-settings" class="tab-content">

      <!-- Library Actions -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            Library Actions
          </h3>
        </div>
        <div class="card-body">
          <div class="actions">
            <button class="btn btn-primary" id="btn-sync" onclick="triggerSync()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
              </svg>
              Sync Now
            </button>
            <button class="btn btn-secondary" id="btn-resync" onclick="triggerResync()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Full Resync
            </button>
            <button class="btn btn-outline" id="btn-refresh" onclick="refreshAll()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Refresh Stats
            </button>
          </div>
          <div class="note">
            <div class="note-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
              Action Reference
            </div>
            <p><strong>Sync Now</strong> checks for new/removed torrents only.<br>
            <strong>Full Resync</strong> rebuilds the entire library from scratch - use sparingly.<br>
            <strong>Refresh Stats</strong> updates displayed statistics without syncing.</p>
          </div>
        </div>
      </div>

      <!-- Streaming Settings -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Streaming Settings
          </h3>
        </div>
        <div class="card-body">
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Low Bandwidth Mode</div>
              <div class="setting-description">Request 480p transcoding from Real-Debrid. Ideal for hotel WiFi or mobile data.</div>
            </div>
            <div class="setting-control">
              <button class="btn ${lowBandwidthMode ? 'btn-primary' : 'btn-secondary'}" id="btn-bandwidth" onclick="toggleBandwidthMode()">
                ${lowBandwidthMode ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Max Concurrent Streams</div>
              <div class="setting-description">Maximum simultaneous streaming connections allowed.</div>
            </div>
            <div class="setting-control">
              <div class="number-input">
                <button class="btn btn-secondary" onclick="adjustSetting('maxConcurrentStreams', -1)">-</button>
                <input type="number" id="setting-maxConcurrentStreams" class="setting-number" value="${data.settings?.maxConcurrentStreams ?? config.maxConcurrentStreams}" min="1" max="20" readonly>
                <button class="btn btn-secondary" onclick="adjustSetting('maxConcurrentStreams', 1)">+</button>
              </div>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Minimum Stream Quality</div>
              <div class="setting-description">Lowest quality stream to display in Stremio.</div>
            </div>
            <div class="setting-control">
              <select id="setting-minStreamQuality" class="setting-select" onchange="updateSetting('minStreamQuality', this.value)">
                <option value="" ${!(data.settings?.minStreamQuality ?? config.minStreamQuality) ? 'selected' : ''}>All qualities</option>
                <option value="2160p" ${(data.settings?.minStreamQuality ?? config.minStreamQuality) === '2160p' ? 'selected' : ''}>4K (2160p)</option>
                <option value="1440p" ${(data.settings?.minStreamQuality ?? config.minStreamQuality) === '1440p' ? 'selected' : ''}>1440p</option>
                <option value="1080p" ${(data.settings?.minStreamQuality ?? config.minStreamQuality) === '1080p' ? 'selected' : ''}>1080p</option>
                <option value="720p" ${(data.settings?.minStreamQuality ?? config.minStreamQuality) === '720p' ? 'selected' : ''}>720p</option>
                <option value="480p" ${(data.settings?.minStreamQuality ?? config.minStreamQuality) === '480p' ? 'selected' : ''}>480p</option>
                <option value="360p" ${(data.settings?.minStreamQuality ?? config.minStreamQuality) === '360p' ? 'selected' : ''}>360p</option>
              </select>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Server Transcoding</div>
              <div class="setting-description">Enable HLS transcoding for better compatibility.</div>
            </div>
            <div class="setting-control">
              <button class="btn ${(data.settings?.transcodingEnabled ?? config.transcodingEnabled) ? 'btn-primary' : 'btn-secondary'}" id="btn-transcoding" onclick="toggleSetting('transcodingEnabled')">
                ${(data.settings?.transcodingEnabled ?? config.transcodingEnabled) ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Prefer HLS Streams</div>
              <div class="setting-description">Prioritize HLS transcoding over direct streams.</div>
            </div>
            <div class="setting-control">
              <button class="btn ${(data.settings?.transcodingPreferHls ?? config.transcodingPreferHls) ? 'btn-primary' : 'btn-secondary'}" id="btn-preferHls" onclick="toggleSetting('transcodingPreferHls')">
                ${(data.settings?.transcodingPreferHls ?? config.transcodingPreferHls) ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Sync Interval</div>
              <div class="setting-description">How often to sync with Real-Debrid (in minutes).</div>
            </div>
            <div class="setting-control">
              <div class="number-input">
                <button class="btn btn-secondary" onclick="adjustSetting('syncIntervalMin', -5)">-</button>
                <input type="number" id="setting-syncIntervalMin" class="setting-number" value="${data.settings?.syncIntervalMin ?? config.syncIntervalMin}" min="1" max="1440" readonly>
                <button class="btn btn-secondary" onclick="adjustSetting('syncIntervalMin', 5)">+</button>
              </div>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Watch Completion Threshold</div>
              <div class="setting-description">Percentage watched to mark as completed (${Math.round((data.settings?.watchCompletionThreshold ?? config.watchCompletionThreshold) * 100)}%).</div>
            </div>
            <div class="setting-control">
              <input type="range" id="setting-watchCompletionThreshold" class="setting-slider"
                min="0.5" max="0.99" step="0.01" value="${data.settings?.watchCompletionThreshold ?? config.watchCompletionThreshold}"
                oninput="updateSliderDisplay(this.value)" onchange="updateSetting('watchCompletionThreshold', this.value)">
              <span class="slider-value" id="slider-value">${Math.round((data.settings?.watchCompletionThreshold ?? config.watchCompletionThreshold) * 100)}%</span>
            </div>
          </div>

          <div class="note" style="margin-top: 24px;">
            <div class="note-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
              About Settings
            </div>
            <p>These settings are saved in the database and persist across restarts. Some settings may require a page refresh to take full effect.</p>
          </div>
        </div>
      </div>

      <!-- Server Info -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Server Information
          </h3>
        </div>
        <div class="card-body">
          <div class="info-list">
            <div class="info-item">
              <span class="info-label">External URL</span>
              <span class="info-value text">${config.externalUrl}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Authentication</span>
              <span class="chip ${config.authEnabled ? 'complete' : 'pending'}">${config.authEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Debroxy Version</span>
              <span class="info-value">v${VERSION}</span>
            </div>
            ${token ? `
            <div class="info-item">
              <span class="info-label">Token Status</span>
              <span class="chip complete">Active</span>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>

    <footer>
      <div class="footer-links">
        Debroxy v${VERSION} · <a href="https://github.com/SwordfishTrumpet/debroxy" target="_blank">GitHub</a>
      </div>
    </footer>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const API_BASE = ${JSON.stringify(apiBase)};
    const AUTH_HEADER = ${token ? `{ 'Authorization': 'Bearer ' + ${JSON.stringify(token)} }` : '{}'};

    // Tab switching
    function showTab(tabName) {
      // Hide all tabs
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
      });
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });

      // Show selected tab
      document.getElementById('tab-' + tabName).classList.add('active');
      document.querySelector('.tab[data-tab="' + tabName + '"]').classList.add('active');

      // Load data if needed
      if (tabName === 'stats') {
        loadWatchStats();
      }
    }

    function showToast(message, type = 'info') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast ' + type + ' show';
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }

    // Fetch RD status
    async function loadRdStatus() {
      try {
        const res = await fetch(API_BASE + '/api/rd-status', { headers: AUTH_HEADER });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();

        const badge = document.getElementById('rd-badge');
        const content = document.getElementById('rd-content');
        const quickStatus = document.getElementById('rd-quick-status');

        if (data.connected) {
          badge.className = 'chip connected';
          badge.textContent = 'Connected';
          quickStatus.innerHTML = '<span style="color: var(--success);">●</span> Connected';

          const user = data.user;
          const expiration = user.expiration ? new Date(user.expiration).toLocaleDateString() : 'N/A';
          const premiumText = user.premium ? 'Premium' : 'Free';

          content.innerHTML = \`
            <div class="rd-user-grid">
              <div class="info-item">
                <span class="info-label">Username</span>
                <span class="info-value text">\${user.username || 'N/A'}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Status</span>
                <span class="chip \${user.premium ? 'complete' : 'pending'}">\${premiumText}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Expiration</span>
                <span class="info-value text">\${expiration}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Points</span>
                <span class="info-value">\${user.points || 0}</span>
              </div>
            </div>
          \`;
        } else {
          badge.className = 'chip disconnected';
          badge.textContent = 'Disconnected';
          quickStatus.innerHTML = '<span style="color: var(--error);">●</span> Disconnected';
          content.innerHTML = \`
            <div class="rd-status-error">
              <strong>Connection Failed</strong><br>
              \${data.error || 'Unable to connect to Real-Debrid API'}
            </div>
          \`;
        }

        // Update circuit breaker state
        const cbState = data.circuitBreaker;
        const cbEl = document.getElementById('cb-state');
        if (cbEl && cbState) {
          const cbClass = cbState.state === 'CLOSED' ? 'cb-indicator closed' :
                         cbState.state === 'OPEN' ? 'cb-indicator open' :
                         'cb-indicator half-open';
          const cbText = cbState.state === 'CLOSED' ? 'Healthy' :
                        cbState.state === 'OPEN' ? 'Open (failing)' :
                        'Half-Open';
          cbEl.innerHTML = \`<span class="\${cbClass}">\${cbText}</span>\`;
        }
      } catch (err) {
        console.error('Failed to load RD status:', err);
        document.getElementById('rd-badge').className = 'chip disconnected';
        document.getElementById('rd-badge').textContent = 'Error';
        document.getElementById('rd-quick-status').innerHTML = '<span style="color: var(--error);">●</span> Error';
        document.getElementById('rd-content').innerHTML = \`
          <div class="rd-status-error">Failed to load status: \${err.message}</div>
        \`;
      }
    }

    // Fetch watch stats
    async function loadWatchStats() {
      const totalEl = document.getElementById('watch-total');
      if (totalEl.textContent !== '-') return; // Already loaded

      try {
        const res = await fetch(API_BASE + '/api/history/stats', { headers: AUTH_HEADER });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();

        totalEl.textContent = data.totalWatched || 0;
        document.getElementById('watch-movies').textContent = data.totalMovies || 0;
        document.getElementById('watch-series').textContent = data.totalSeries || 0;

        const hours = Math.floor((data.totalTimeMinutes || 0) / 60);
        document.getElementById('watch-time').textContent = hours;
      } catch (err) {
        console.error('Failed to load watch stats:', err);
        totalEl.textContent = '?';
      }
    }

    async function triggerSync() {
      const btn = document.getElementById('btn-sync');
      btn.disabled = true;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg> Syncing...';

      try {
        const res = await fetch(API_BASE + '/api/library/sync', {
          method: 'POST',
          headers: AUTH_HEADER
        });

        if (res.ok) {
          const data = await res.json();
          showToast('Synchronization completed successfully', 'success');
          updateLibraryStats(data);
        } else {
          throw new Error('Sync failed');
        }
      } catch (err) {
        showToast('Synchronization failed: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg> Sync Now';
      }
    }

    async function triggerResync() {
      const btn = document.getElementById('btn-resync');

      if (!confirm('Full resynchronization will rebuild your entire library from scratch. This process may take several minutes to continue?')) {
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Resyncing...';

      try {
        const res = await fetch(API_BASE + '/api/library/resync', {
          method: 'POST',
          headers: AUTH_HEADER
        });

        if (res.ok) {
          const data = await res.json();
          showToast('Full resynchronization completed', 'success');
          updateLibraryStats(data);
        } else {
          throw new Error('Resync failed');
        }
      } catch (err) {
        showToast('Resynchronization failed: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Full Resync';
      }
    }

    async function refreshAll() {
      const btn = document.getElementById('btn-refresh');
      const originalContent = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refreshing...';

      try {
        await Promise.all([
          loadRdStatus(),
          loadWatchStats(),
          refreshLibraryStats()
        ]);
        showToast('All statistics refreshed', 'success');
      } catch (err) {
        showToast('Failed to refresh some statistics', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
      }
    }

    async function refreshLibraryStats() {
      try {
        const res = await fetch(API_BASE + '/api/library', { headers: AUTH_HEADER });
        if (res.ok) {
          const data = await res.json();
          updateLibraryStats(data);
        }
      } catch (err) {
        console.error('Failed to refresh library stats:', err);
      }
    }

    function updateLibraryStats(data) {
      if (data.stats) {
        document.getElementById('stat-movies').textContent = data.stats.movies || 0;
        document.getElementById('stat-series').textContent = data.stats.series || 0;
        document.getElementById('stat-torrents').textContent = data.stats.torrents || 0;
        document.getElementById('stat-unmatched').textContent = data.stats.unmatched || 0;
      }
      if (data.lastSync) {
        document.getElementById('last-sync').textContent = new Date(Number(data.lastSync)).toLocaleString();
      }
    }

    async function toggleBandwidthMode() {
      const btn = document.getElementById('btn-bandwidth');
      const isEnabled = btn.textContent.trim() === 'Enabled';
      const newState = !isEnabled;

      btn.disabled = true;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner" style="margin-right: 6px;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Updating...';

      try {
        const res = await fetch(API_BASE + '/api/bandwidth-mode', {
          method: 'POST',
          headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: newState })
        });

        if (res.ok) {
          const data = await res.json();
          const isOn = data.enabled;
          btn.textContent = isOn ? 'Enabled' : 'Disabled';
          btn.className = 'btn ' + (isOn ? 'btn-primary' : 'btn-secondary');
          showToast(isOn ? 'Low bandwidth mode enabled' : 'Low bandwidth mode disabled', isOn ? 'info' : 'success');
        } else {
          throw new Error('Failed to toggle');
        }
      } catch (err) {
        console.error('Bandwidth toggle error:', err);
        showToast('Failed to toggle bandwidth mode: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    }

    // Load initial data
    loadRdStatus();
    loadSettings();

    // Settings management
    let currentSettings = {};

    async function loadSettings() {
      try {
        const res = await fetch(API_BASE + '/api/settings', { headers: AUTH_HEADER });
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();

        currentSettings = data.settings || {};

        // Update UI to match loaded settings
        updateSettingsUI(currentSettings);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }

    function updateSettingsUI(settings) {
      // Update transcoding button
      const transcodingBtn = document.getElementById('btn-transcoding');
      if (transcodingBtn) {
        const enabled = settings.transcodingEnabled;
        transcodingBtn.textContent = enabled ? 'Enabled' : 'Disabled';
        transcodingBtn.className = 'btn ' + (enabled ? 'btn-primary' : 'btn-secondary');
      }

      // Update prefer HLS button
      const hlsBtn = document.getElementById('btn-preferHls');
      if (hlsBtn) {
        const enabled = settings.transcodingPreferHls;
        hlsBtn.textContent = enabled ? 'Enabled' : 'Disabled';
        hlsBtn.className = 'btn ' + (enabled ? 'btn-primary' : 'btn-secondary');
      }

      // Update number inputs
      const maxStreamsInput = document.getElementById('setting-maxConcurrentStreams');
      if (maxStreamsInput && settings.maxConcurrentStreams !== undefined) {
        maxStreamsInput.value = settings.maxConcurrentStreams;
      }

      const syncIntervalInput = document.getElementById('setting-syncIntervalMin');
      if (syncIntervalInput && settings.syncIntervalMin !== undefined) {
        syncIntervalInput.value = settings.syncIntervalMin;
      }

      // Update quality select
      const qualitySelect = document.getElementById('setting-minStreamQuality');
      if (qualitySelect && settings.minStreamQuality !== undefined) {
        qualitySelect.value = settings.minStreamQuality || '';
      }

      // Update slider
      const thresholdSlider = document.getElementById('setting-watchCompletionThreshold');
      if (thresholdSlider && settings.watchCompletionThreshold !== undefined) {
        thresholdSlider.value = settings.watchCompletionThreshold;
        updateSliderDisplay(settings.watchCompletionThreshold);
      }
    }

    function updateSliderDisplay(value) {
      const display = document.getElementById('slider-value');
      if (display) {
        display.textContent = Math.round(value * 100) + '%';
      }
    }

    async function updateSetting(key, value) {
      // For number inputs, convert to appropriate type
      if (key === 'maxConcurrentStreams' || key === 'syncIntervalMin') {
        value = parseInt(value, 10);
      } else if (key === 'watchCompletionThreshold') {
        value = parseFloat(value);
      }

      // Show saving state
      showToast('Saving...', 'info');

      try {
        const res = await fetch(API_BASE + '/api/settings', {
          method: 'POST',
          headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.updated && data.updated[key] !== undefined) {
            currentSettings[key] = data.updated[key];
            updateSettingsUI(currentSettings);
            showToast('Setting saved', 'success');
          } else if (data.errors && data.errors.length > 0) {
            showToast('Failed to save: ' + data.errors[0].error, 'error');
            // Revert UI
            updateSettingsUI(currentSettings);
          }
        } else {
          throw new Error('Save failed');
        }
      } catch (err) {
        console.error('Failed to save setting:', err);
        showToast('Failed to save setting', 'error');
        // Revert UI to known state
        updateSettingsUI(currentSettings);
      }
    }

    async function toggleSetting(key) {
      const currentValue = currentSettings[key];
      const newValue = !currentValue;
      await updateSetting(key, newValue);
    }

    function adjustSetting(key, delta) {
      const input = document.getElementById('setting-' + key);
      if (!input) return;

      const currentValue = parseInt(input.value, 10);
      const min = parseInt(input.min, 10) || 1;
      const max = parseInt(input.max, 10) || 9999;

      let newValue = currentValue + delta;
      newValue = Math.max(min, Math.min(max, newValue));

      input.value = newValue;
      updateSetting(key, newValue);
    }
  </script>
</body>
</html>`;
}

export default { generateConfigurePage };
