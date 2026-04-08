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
    ? 'Syncing...' 
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

  // Quality options for the dropdown
  const qualityOptions = ['None', '360p', '480p', '720p', '1080p', '1440p', '2160p'];
  const currentQuality = config.minStreamQuality || 'None';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Debroxy - Configure</title>
  <style>
    :root {
      --bg-primary: #0f0f0f;
      --bg-secondary: #1a1a1a;
      --bg-card: #242424;
      --text-primary: #ffffff;
      --text-secondary: #a0a0a0;
      --accent: #7b5bf5;
      --accent-hover: #6a4de0;
      --success: #4caf50;
      --warning: #ff9800;
      --error: #f44336;
      --border: #333;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    
    header {
      text-align: center;
      margin-bottom: 40px;
    }
    
    .logo {
      font-size: 2.5rem;
      font-weight: bold;
      margin-bottom: 8px;
    }
    
    .logo-icon {
      margin-right: 10px;
    }
    
    .tagline {
      color: var(--text-secondary);
      font-size: 1rem;
    }
    
    .card {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
    }
    
    .card-title {
      font-size: 1.25rem;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 16px;
    }
    
    .stat-item {
      text-align: center;
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
    }
    
    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      color: var(--accent);
    }
    
    .stat-label {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-top: 4px;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.875rem;
      font-weight: 500;
    }
    
    .status-badge.syncing {
      background: rgba(255, 152, 0, 0.2);
      color: var(--warning);
    }
    
    .status-badge.complete {
      background: rgba(76, 175, 80, 0.2);
      color: var(--success);
    }
    
    .status-badge.pending {
      background: rgba(244, 67, 54, 0.2);
      color: var(--error);
    }
    
    .status-badge::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
    }
    
    .status-badge.syncing::before {
      background: var(--warning);
      animation: pulse 1.5s infinite;
    }
    
    .status-badge.complete::before {
      background: var(--success);
    }
    
    .status-badge.pending::before {
      background: var(--error);
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    
    .info-row:last-child {
      border-bottom: none;
    }
    
    .info-label {
      color: var(--text-secondary);
    }
    
    .info-value {
      font-weight: 500;
    }
    
    .instructions {
      line-height: 1.8;
    }
    
    .instructions ol {
      margin-left: 20px;
    }
    
    .instructions li {
      margin-bottom: 12px;
    }
    
    .instructions strong {
      color: var(--accent);
    }
    
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      gap: 8px;
    }
    
    .btn-primary {
      background: var(--accent);
      color: white;
    }
    
    .btn-primary:hover {
      background: var(--accent-hover);
    }
    
    .btn-primary:disabled {
      background: var(--border);
      cursor: not-allowed;
    }
    
    .btn-secondary {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    
    .btn-secondary:hover {
      background: var(--border);
    }
    
    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    
    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-bottom: 1px solid var(--border);
    }
    
    .setting-row:last-child {
      border-bottom: none;
    }
    
    .setting-info {
      flex: 1;
    }
    
    .setting-label {
      font-weight: 500;
      margin-bottom: 4px;
    }
    
    .setting-description {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
    
    .setting-control {
      margin-left: 20px;
    }
    
    select {
      padding: 10px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 1rem;
      cursor: pointer;
    }
    
    select:focus {
      outline: none;
      border-color: var(--accent);
    }
    
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 16px 24px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s;
      z-index: 1000;
    }
    
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    
    .toast.success {
      background: var(--success);
    }
    
    .toast.error {
      background: var(--error);
    }
    
    .toast.info {
      background: var(--accent);
    }
    
    .note {
      background: rgba(123, 91, 245, 0.1);
      border-left: 4px solid var(--accent);
      padding: 16px;
      border-radius: 0 8px 8px 0;
      margin-top: 16px;
    }
    
    .note-title {
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--accent);
    }
    
    .note p {
      color: var(--text-secondary);
      font-size: 0.9rem;
    }
    
    footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    
    footer a {
      color: var(--accent);
      text-decoration: none;
    }
    
    footer a:hover {
      text-decoration: underline;
    }
    
    .streams-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .streams-bar {
      flex: 1;
      height: 8px;
      background: var(--bg-secondary);
      border-radius: 4px;
      overflow: hidden;
    }
    
    .streams-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 4px;
      transition: width 0.3s;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        <span class="logo-icon">&#128193;</span>Debroxy
      </div>
      <p class="tagline">Your Real-Debrid Library in Stremio</p>
    </header>
    
    <!-- Library Stats -->
    <div class="card">
      <h2 class="card-title">
        <span>&#128202;</span> Library Stats
        <span class="status-badge ${syncStatusClass}">${syncStatus}</span>
      </h2>
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
      
      <div style="margin-top: 20px;">
        <div class="info-row">
          <span class="info-label">Last Sync</span>
          <span class="info-value" id="last-sync">${lastSyncFormatted}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Active Streams</span>
          <div class="streams-info">
            <span class="info-value">${streams.active} / ${streams.max}</span>
            <div class="streams-bar">
              <div class="streams-fill" style="width: ${(streams.active / streams.max) * 100}%"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- How to Find Content -->
    <div class="card">
      <h2 class="card-title"><span>&#128269;</span> How to Find Your Content</h2>
      <div class="instructions">
        <p style="margin-bottom: 16px;">Your Real-Debrid library appears in Stremio under the <strong>Debroxy</strong> catalogs. Here's how to find it:</p>
        <ol>
          <li>Go to the <strong>Home</strong> or <strong>Board</strong> tab in Stremio</li>
          <li>Scroll down to find the <strong>"Debroxy Movies"</strong> and <strong>"Debroxy Series"</strong> sections</li>
          <li>Alternatively, use the <strong>Search</strong> feature - your Debroxy content will appear in search results</li>
          <li>When viewing any movie or series, Debroxy streams will appear in the <strong>Streams</strong> list</li>
        </ol>
        
        <div class="note">
          <div class="note-title">&#128161; Tip</div>
          <p>Debroxy catalogs may appear below other addon catalogs. The order is controlled by Stremio, not the addon. Consider removing unused addons to reduce clutter.</p>
        </div>
      </div>
    </div>
    
    <!-- Quick Actions -->
    <div class="card">
      <h2 class="card-title"><span>&#9889;</span> Quick Actions</h2>
      <div class="actions">
        <button class="btn btn-primary" id="btn-sync" onclick="triggerSync()">
          <span>&#128260;</span> Sync Now
        </button>
        <button class="btn btn-secondary" id="btn-resync" onclick="triggerResync()">
          <span>&#128257;</span> Full Resync
        </button>
        <button class="btn btn-secondary" onclick="refreshStats()">
          <span>&#128472;</span> Refresh Stats
        </button>
      </div>
      <p style="margin-top: 12px; color: var(--text-secondary); font-size: 0.875rem;">
        <strong>Sync Now</strong> checks for new torrents. <strong>Full Resync</strong> rebuilds the entire library (takes longer).
      </p>
    </div>
    
    <!-- Settings -->
    <div class="card">
      <h2 class="card-title"><span>&#9881;</span> Settings</h2>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Minimum Stream Quality</div>
          <div class="setting-description">Only show streams at or above this quality level</div>
        </div>
        <div class="setting-control">
          <select id="quality-select" onchange="showQualityNote()">
            ${qualityOptions.map(q => `<option value="${q}" ${q === currentQuality ? 'selected' : ''}>${q}</option>`).join('')}
          </select>
        </div>
      </div>
      
      <div class="note" id="quality-note" style="display: none;">
        <div class="note-title">&#9888; Environment Variable Required</div>
        <p>Quality filtering is set via environment variable. To change it, set <code>MIN_STREAM_QUALITY=${currentQuality}</code> in your .env file and restart Debroxy.</p>
      </div>
    </div>
    
    <footer>
      <p>Debroxy v${VERSION} &middot; <a href="https://github.com/SwordfishTrumpet/debroxy" target="_blank">GitHub</a></p>
      <p style="margin-top: 8px;">Authentication: ${token ? 'Enabled' : 'Disabled'}</p>
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
      btn.innerHTML = '<span>&#8987;</span> Syncing...';
      
      try {
        const res = await fetch(API_BASE + '/api/library/sync', {
          method: 'POST',
          headers: AUTH_HEADER
        });
        
        if (res.ok) {
          const data = await res.json();
          showToast('Sync completed successfully!', 'success');
          updateStats(data);
        } else {
          throw new Error('Sync failed');
        }
      } catch (err) {
        showToast('Sync failed: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>&#128260;</span> Sync Now';
      }
    }
    
    async function triggerResync() {
      const btn = document.getElementById('btn-resync');
      
      if (!confirm('Full resync will rebuild your entire library. This may take several minutes. Continue?')) {
        return;
      }
      
      btn.disabled = true;
      btn.innerHTML = '<span>&#8987;</span> Resyncing...';
      
      try {
        const res = await fetch(API_BASE + '/api/library/resync', {
          method: 'POST',
          headers: AUTH_HEADER
        });
        
        if (res.ok) {
          const data = await res.json();
          showToast('Full resync completed!', 'success');
          updateStats(data);
        } else {
          throw new Error('Resync failed');
        }
      } catch (err) {
        showToast('Resync failed: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>&#128257;</span> Full Resync';
      }
    }
    
    async function refreshStats() {
      try {
        const res = await fetch(API_BASE + '/api/library', {
          headers: AUTH_HEADER
        });
        
        if (res.ok) {
          const data = await res.json();
          updateStats(data);
          showToast('Stats refreshed', 'success');
        }
      } catch (err) {
        showToast('Failed to refresh stats', 'error');
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
    
    function showQualityNote() {
      document.getElementById('quality-note').style.display = 'block';
    }
  </script>
</body>
</html>`;
}

export default { generateConfigurePage };
