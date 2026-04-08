/**
 * Configure page generator for Stremio addon
 * Provides an HTML landing page with library stats and settings
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
 * @returns {string} HTML string
 */
export function generateConfigurePage(data) {
  const { library, streams, token, apiBase } = data;
  const stats = library.stats || { movies: 0, series: 0, torrents: 0, unmatched: 0 };
  
  const syncStatus = library.isSyncing 
    ? 'Syncing' 
    : library.isComplete 
      ? 'Complete' 
      : 'Pending';
  
  const syncStatusClass = library.isSyncing 
    ? 'syncing' 
    : library.isComplete 
      ? 'complete' 
      : 'pending';

  const lastSyncFormatted = library.lastSync 
    ? new Date(Number(library.lastSync)).toLocaleString() 
    : 'Never';

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
      --text-primary: #202124;
      --text-secondary: #5f6368;
      --text-tertiary: #80868b;
      --border: #dadce0;
      --border-light: #e8eaed;
      --accent: #1a73e8;
      --accent-hover: #1557b0;
      --success: #188038;
      --warning: #f9ab00;
      --error: #d93025;
      --shadow-sm: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15);
      --shadow-md: 0 1px 2px 0 rgba(60,64,67,0.3), 0 2px 6px 2px rgba(60,64,67,0.15);
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Roboto', 'Segoe UI', system-ui, -apple-system, sans-serif;
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
      padding: 24px;
    }
    
    /* Cards */
    .card {
      background: var(--bg-primary);
      border-radius: 8px;
      box-shadow: var(--shadow-sm);
      margin-bottom: 16px;
      overflow: hidden;
    }
    
    .card-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-light);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .card-title {
      font-size: 1.125rem;
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
    
    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0;
      border-bottom: 1px solid var(--border-light);
    }
    
    .stat-item {
      padding: 24px;
      text-align: center;
      border-right: 1px solid var(--border-light);
    }
    
    .stat-item:last-child {
      border-right: none;
    }
    
    .stat-value {
      font-size: 2.25rem;
      font-weight: 400;
      color: var(--accent);
      line-height: 1.2;
    }
    
    .stat-label {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }
    
    /* Status Badge */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }
    
    .status-badge::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    
    .status-badge.syncing {
      background: #fef3e8;
      color: #b06000;
    }
    .status-badge.syncing::before {
      background: var(--warning);
      animation: pulse 1.5s infinite;
    }
    
    .status-badge.complete {
      background: #e6f4ea;
      color: var(--success);
    }
    .status-badge.complete::before {
      background: var(--success);
    }
    
    .status-badge.pending {
      background: #fce8e6;
      color: var(--error);
    }
    .status-badge.pending::before {
      background: var(--error);
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    
    /* Info Rows */
    .info-section {
      padding: 16px 24px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-light);
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
    }
    
    .info-row + .info-row {
      border-top: 1px solid var(--border-light);
    }
    
    .info-label {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    
    .info-value {
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    /* Progress Bar */
    .progress-container {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      justify-content: flex-end;
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
    
    /* Instructions */
    .instructions {
      color: var(--text-primary);
      line-height: 1.6;
    }
    
    .instructions p {
      margin-bottom: 16px;
      color: var(--text-secondary);
    }
    
    .instructions ol {
      margin-left: 24px;
      color: var(--text-primary);
    }
    
    .instructions li {
      margin-bottom: 12px;
      padding-left: 8px;
    }
    
    .instructions strong {
      font-weight: 500;
      color: var(--text-primary);
    }
    
    /* Note/Callout */
    .note {
      background: var(--bg-secondary);
      border-left: 3px solid var(--accent);
      padding: 16px 20px;
      margin-top: 20px;
      border-radius: 0 4px 4px 0;
    }
    
    .note-title {
      font-weight: 500;
      font-size: 0.875rem;
      margin-bottom: 6px;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .note p {
      color: var(--text-secondary);
      font-size: 0.875rem;
      margin: 0;
    }
    
    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      border: none;
      height: 36px;
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
    
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    
    .action-note {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-light);
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    
    /* Settings */
    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
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
      font-size: 0.875rem;
      margin-bottom: 4px;
      color: var(--text-primary);
    }
    
    .setting-description {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    
    .setting-control {
      margin-left: 24px;
    }
    
    /* Select/Dropdown */
    select {
      padding: 8px 32px 8px 12px;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 0.875rem;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='%235f6368'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 4px center;
      background-size: 18px;
      min-width: 100px;
    }
    
    select:focus {
      outline: none;
      border-color: var(--accent);
    }
    
    select:hover {
      background-color: var(--bg-hover);
    }
    
    /* Code */
    code {
      font-family: 'Roboto Mono', 'Monaco', monospace;
      font-size: 0.8125rem;
      background: var(--bg-hover);
      padding: 2px 6px;
      border-radius: 3px;
      color: var(--text-primary);
    }
    
    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      padding: 12px 24px;
      border-radius: 4px;
      color: white;
      font-weight: 500;
      font-size: 0.875rem;
      opacity: 0;
      transition: all 0.3s ease;
      z-index: 1000;
      box-shadow: var(--shadow-md);
      min-width: 280px;
      text-align: center;
    }
    
    .toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    
    .toast.success {
      background: var(--success);
    }
    
    .toast.error {
      background: var(--error);
    }
    
    .toast.info {
      background: var(--text-secondary);
    }
    
    /* Footer */
    footer {
      text-align: center;
      padding: 32px 24px;
      color: var(--text-tertiary);
      font-size: 0.75rem;
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
    
    footer .footer-meta {
      color: var(--text-tertiary);
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      
      .stat-item {
        border-right: none;
        border-bottom: 1px solid var(--border-light);
      }
      
      .stat-item:nth-child(2) {
        border-right: none;
      }
      
      .stat-item:nth-child(3),
      .stat-item:nth-child(4) {
        border-bottom: none;
      }
      
      .setting-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }
      
      .setting-control {
        margin-left: 0;
        width: 100%;
      }
      
      select {
        width: 100%;
      }
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
  
  <div class="container">
    <!-- Library Stats -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
          Library Overview
        </h2>
        <span class="status-badge ${syncStatusClass}">${syncStatus}</span>
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
      
      <div class="info-section">
        <div class="info-row">
          <span class="info-label">Last Synchronization</span>
          <span class="info-value" id="last-sync">${lastSyncFormatted}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Active Streams</span>
          <div class="progress-container">
            <span class="info-value">${streams.active} of ${streams.max}</span>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${(streams.active / streams.max) * 100}%"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- How to Find Content -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          Finding Your Content
        </h2>
      </div>
      <div class="card-body">
        <div class="instructions">
          <p>Your Real-Debrid library is available in Stremio through the Debroxy catalogs. Follow these steps to access your content:</p>
          <ol>
            <li>Navigate to the <strong>Home</strong> or <strong>Board</strong> section in Stremio</li>
            <li>Locate the <strong>Debroxy Movies</strong> and <strong>Debroxy Series</strong> catalog sections</li>
            <li>Use the <strong>Search</strong> function to find specific titles from your library</li>
            <li>When viewing content details, Debroxy streams will appear in the stream selection list</li>
          </ol>
          
          <div class="note">
            <div class="note-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
              Note
            </div>
            <p>Debroxy catalogs may appear below other addon catalogs in Stremio. The display order is controlled by Stremio and cannot be modified by the addon.</p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Quick Actions -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          Actions
        </h2>
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
          <button class="btn btn-secondary" id="btn-refresh" onclick="refreshStats()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
        </div>
        <p class="action-note">
          <strong>Sync Now</strong> checks for new torrents only. <strong>Full Resync</strong> rebuilds the entire library from scratch and may take several minutes. <strong>Refresh</strong> updates the displayed statistics without syncing.
        </p>
      </div>
    </div>
    
    <!-- Settings -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Settings
        </h2>
      </div>
      <div class="card-body">
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Low Bandwidth Mode</div>
            <div class="setting-description">Limit stream quality to 480p for slower connections</div>
          </div>
          <div class="setting-control">
            <button class="btn ${data.lowBandwidthMode ? 'btn-primary' : 'btn-secondary'}" id="btn-bandwidth" onclick="toggleBandwidthMode()">
              ${data.lowBandwidthMode ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>

        <div class="note" id="bandwidth-note" style="display: ${data.lowBandwidthMode ? 'block' : 'none'}; margin-top: 16px;">
          <div class="note-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            Low Bandwidth Mode ${data.lowBandwidthMode ? 'Enabled' : 'Disabled'}
          </div>
          <p>${data.lowBandwidthMode ? 'Streams are limited to 480p quality to conserve bandwidth. Toggle to disable.' : 'Enable this feature to limit stream quality to 480p on slow connections such as hotel WiFi or mobile data.'}</p>
        </div>
      </div>
    </div>
    
    <footer>
      <div class="footer-links">
        Debroxy v${VERSION} · <a href="https://github.com/SwordfishTrumpet/debroxy" target="_blank">GitHub</a>
      </div>
      <div class="footer-meta">
        Authentication ${token ? 'enabled' : 'disabled'}
      </div>
    </footer>
  </div>
  
  <div class="toast" id="toast"></div>
  
  <script>
    const API_BASE = ${JSON.stringify(apiBase)};
    const AUTH_HEADER = ${token ? `{ 'Authorization': 'Bearer ' + ${JSON.stringify(token)} }` : '{}'};
    
    function showToast(message, type = 'info') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast ' + type + ' show';
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }
    
    async function triggerSync() {
      const btn = document.getElementById('btn-sync');
      btn.disabled = true;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg> Syncing...';
      
      try {
        const res = await fetch(API_BASE + '/api/library/sync', {
          method: 'POST',
          headers: AUTH_HEADER
        });
        
        if (res.ok) {
          const data = await res.json();
          showToast('Synchronization completed successfully', 'success');
          updateStats(data);
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
      
      if (!confirm('Full resynchronization will rebuild your entire library from scratch. This process may take several minutes to complete. Continue?')) {
        return;
      }
      
      btn.disabled = true;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Resyncing...';
      
      try {
        const res = await fetch(API_BASE + '/api/library/resync', {
          method: 'POST',
          headers: AUTH_HEADER
        });
        
        if (res.ok) {
          const data = await res.json();
          showToast('Full resynchronization completed', 'success');
          updateStats(data);
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
    
    async function refreshStats() {
      const btn = document.getElementById('btn-refresh');
      const originalContent = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refreshing...';
      
      try {
        const res = await fetch(API_BASE + '/api/library', {
          headers: AUTH_HEADER
        });
        
        if (res.ok) {
          const data = await res.json();
          updateStats(data);
          showToast('Statistics refreshed', 'success');
        }
      } catch (err) {
        showToast('Failed to refresh statistics', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
      }
    }
    
    function updateStats(data) {
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
      
      const originalText = isEnabled ? 'Enabled' : 'Disabled';
      btn.disabled = true;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; margin-right: 6px;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Updating...';

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

          const note = document.getElementById('bandwidth-note');
          note.style.display = 'block';
          note.querySelector('.note-title').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg> Low Bandwidth Mode ' + (isOn ? 'Enabled' : 'Disabled');
          note.querySelector('p').textContent = isOn ? 'Streams are limited to 480p quality to conserve bandwidth. Toggle to disable.' : 'Enable this feature to limit stream quality to 480p on slow connections such as hotel WiFi or mobile data.';
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

    // Show bandwidth note on page load if enabled
    ${data.lowBandwidthMode ? "document.getElementById('bandwidth-note').style.display = 'block';" : ''}
  </script>
  <style>
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  </style>
</body>
</html>`;
}

export default { generateConfigurePage };
