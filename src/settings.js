/**
 * Runtime settings module for user-configurable settings
 * Provides settings management with database persistence and fallback to config defaults
 * @module settings
 */

import * as db from './db.js';
import config from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('settings');

/**
 * Default values for user settings (matches config.js defaults)
 * @const {Object}
 */
const DEFAULTS = {
  // Streaming settings
  maxConcurrentStreams: String(config.maxConcurrentStreams),
  minStreamQuality: config.minStreamQuality || '',
  transcodingEnabled: String(config.transcodingEnabled),
  transcodingPreferHls: String(config.transcodingPreferHls),

  // Library settings
  syncIntervalMin: String(config.syncIntervalMin),
  watchCompletionThreshold: String(config.watchCompletionThreshold),
};

/**
 * Valid setting keys
 * @const {Array<string>}
 */
export const VALID_SETTINGS = [
  'maxConcurrentStreams',
  'minStreamQuality',
  'transcodingEnabled',
  'transcodingPreferHls',
  'syncIntervalMin',
  'watchCompletionThreshold',
];

/**
 * Validation rules for settings
 * @const {Object}
 */
const VALIDATION = {
  maxConcurrentStreams: {
    type: 'integer',
    min: 1,
    max: 20,
    parse: (v) => parseInt(v, 10),
  },
  minStreamQuality: {
    type: 'enum',
    values: ['', '2160p', '1440p', '1080p', '720p', '480p', '360p'],
  },
  transcodingEnabled: {
    type: 'boolean',
    parse: (v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return v.toLowerCase() === 'true';
      return false;
    },
  },
  transcodingPreferHls: {
    type: 'boolean',
    parse: (v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return v.toLowerCase() === 'true';
      return false;
    },
  },
  syncIntervalMin: {
    type: 'integer',
    min: 1,
    max: 1440, // 24 hours max
    parse: (v) => parseInt(v, 10),
  },
  watchCompletionThreshold: {
    type: 'number',
    min: 0.5,
    max: 0.99,
    precision: 2,
    parse: (v) => parseFloat(v),
  },
};

/**
 * Get a setting value with fallback to defaults
 * @param {string} key - Setting key
 * @returns {string|number|boolean} Setting value
 */
export function get(key) {
  if (!VALID_SETTINGS.includes(key)) {
    log.warn({ key }, 'Invalid setting key requested');
    return null;
  }

  const dbValue = db.getUserSetting(key);
  if (dbValue !== null) {
    return parseValue(key, dbValue);
  }

  // Fall back to config/default
  const defaultValue = DEFAULTS[key];
  return parseValue(key, defaultValue);
}

/**
 * Set a setting value after validation
 * @param {string} key - Setting key
 * @param {string|number|boolean} value - Setting value
 * @returns {Object} Result object with success flag and optional error
 */
export function set(key, value) {
  if (!VALID_SETTINGS.includes(key)) {
    return { success: false, error: `Invalid setting key: ${key}` };
  }

  const validation = validateSetting(key, value);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const stringValue = String(value);
  db.setUserSetting(key, stringValue);
  log.info({ key, value: stringValue }, 'Setting updated');

  return { success: true, value: parseValue(key, stringValue) };
}

/**
 * Get all settings as an object
 * @returns {Object} All settings with their current values
 */
export function getAll() {
  const dbSettings = db.getAllUserSettings();
  const result = {};

  for (const key of VALID_SETTINGS) {
    const value = dbSettings[key] !== undefined ? dbSettings[key] : DEFAULTS[key];
    result[key] = parseValue(key, value);
  }

  return result;
}

/**
 * Update multiple settings at once
 * @param {Object} settings - Object with key-value pairs
 * @returns {Object} Result with updated values and any errors
 */
export function updateMany(settings) {
  const result = {
    updated: {},
    errors: [],
  };

  // Limit to prevent abuse (max 10 settings per request)
  const entries = Object.entries(settings);
  if (entries.length > 10) {
    result.errors.push({ key: '*', error: 'Too many settings in request (max 10)' });
    return result;
  }

  for (const [key, value] of entries) {
    const setResult = set(key, value);
    if (setResult.success) {
      result.updated[key] = setResult.value;
    } else {
      result.errors.push({ key, error: setResult.error });
    }
  }

  return result;
}

/**
 * Reset a setting to its default value
 * @param {string} key - Setting key
 * @returns {Object} Result object
 */
export function reset(key) {
  if (!VALID_SETTINGS.includes(key)) {
    return { success: false, error: `Invalid setting key: ${key}` };
  }

  db.setUserSetting(key, DEFAULTS[key]);
  log.info({ key, defaultValue: DEFAULTS[key] }, 'Setting reset to default');

  return { success: true, value: parseValue(key, DEFAULTS[key]) };
}

/**
 * Reset all settings to defaults
 * @returns {Object} Result with all default values
 */
export function resetAll() {
  for (const key of VALID_SETTINGS) {
    db.setUserSetting(key, DEFAULTS[key]);
  }
  log.info('All settings reset to defaults');
  return getAll();
}

/**
 * Validate a setting value
 * @param {string} key - Setting key
 * @param {string|number|boolean} value - Value to validate
 * @returns {Object} Validation result with valid flag and optional error
 */
function validateSetting(key, value) {
  const rules = VALIDATION[key];
  if (!rules) {
    return { valid: false, error: `No validation rules for ${key}` };
  }

  // Reject null, undefined
  if (value === null || value === undefined) {
    return { valid: false, error: `${key} cannot be empty` };
  }

  // Reject empty strings unless explicitly allowed in enum values
  if (value === '' && !(rules.type === 'enum' && rules.values.includes(''))) {
    return { valid: false, error: `${key} cannot be empty` };
  }

  // Reject arrays and objects (type confusion attacks)
  if (typeof value === 'object') {
    return { valid: false, error: `${key} must be a primitive value` };
  }

  if (rules.type === 'integer') {
    const num = rules.parse ? rules.parse(value) : parseInt(value, 10);
    if (isNaN(num)) {
      return { valid: false, error: `${key} must be an integer` };
    }
    if (!Number.isInteger(num)) {
      return { valid: false, error: `${key} must be a whole number` };
    }
    if (rules.min !== undefined && num < rules.min) {
      return { valid: false, error: `${key} must be at least ${rules.min}` };
    }
    if (rules.max !== undefined && num > rules.max) {
      return { valid: false, error: `${key} must be at most ${rules.max}` };
    }
  }

  if (rules.type === 'number') {
    const num = rules.parse ? rules.parse(value) : parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, error: `${key} must be a number` };
    }
    if (rules.min !== undefined && num < rules.min) {
      return { valid: false, error: `${key} must be at least ${rules.min}` };
    }
    if (rules.max !== undefined && num > rules.max) {
      return { valid: false, error: `${key} must be at most ${rules.max}` };
    }
    // Check precision if specified
    if (rules.precision !== undefined) {
      const decimals = (num.toString().split('.')[1] || '').length;
      if (decimals > rules.precision) {
        return { valid: false, error: `${key} must have at most ${rules.precision} decimal places` };
      }
    }
  }

  if (rules.type === 'enum') {
    const strValue = String(value);
    if (!rules.values.includes(strValue)) {
      return { valid: false, error: `${key} must be one of: ${rules.values.join(', ')}` };
    }
  }

  if (rules.type === 'boolean') {
    if (typeof value !== 'boolean' && typeof value !== 'string') {
      return { valid: false, error: `${key} must be a boolean` };
    }
  }

  return { valid: true };
}

/**
 * Parse a setting value to its proper type
 * @param {string} key - Setting key
 * @param {string} value - Raw value from DB
 * @returns {string|number|boolean} Parsed value
 */
function parseValue(key, value) {
  const rules = VALIDATION[key];
  if (!rules) return value;

  if ((rules.type === 'number' || rules.type === 'integer') && rules.parse) {
    return rules.parse(value);
  }

  if (rules.type === 'boolean') {
    return value === 'true' || value === true;
  }

  return value;
}

/**
 * Get setting metadata for UI (defaults, ranges, descriptions)
 * @returns {Object} Setting metadata
 */
export function getMetadata() {
  return {
    maxConcurrentStreams: {
      label: 'Max Concurrent Streams',
      description: 'Maximum simultaneous streaming connections allowed',
      type: 'number',
      min: 1,
      max: 20,
      default: DEFAULTS.maxConcurrentStreams,
    },
    minStreamQuality: {
      label: 'Minimum Stream Quality',
      description: 'Lowest quality stream to display in Stremio',
      type: 'enum',
      options: [
        { value: '', label: 'All qualities' },
        { value: '2160p', label: '4K (2160p)' },
        { value: '1440p', label: '1440p' },
        { value: '1080p', label: '1080p' },
        { value: '720p', label: '720p' },
        { value: '480p', label: '480p' },
        { value: '360p', label: '360p' },
      ],
      default: DEFAULTS.minStreamQuality,
    },
    transcodingEnabled: {
      label: 'Server Transcoding',
      description: 'Enable HLS transcoding for better compatibility',
      type: 'boolean',
      default: DEFAULTS.transcodingEnabled === 'true',
    },
    transcodingPreferHls: {
      label: 'Prefer HLS Streams',
      description: 'Prioritize HLS transcoding over direct streams',
      type: 'boolean',
      default: DEFAULTS.transcodingPreferHls === 'true',
    },
    syncIntervalMin: {
      label: 'Library Sync Interval',
      description: 'How often to sync with Real-Debrid (in minutes)',
      type: 'number',
      min: 1,
      max: 1440,
      default: parseInt(DEFAULTS.syncIntervalMin, 10),
    },
    watchCompletionThreshold: {
      label: 'Watch Completion Threshold',
      description: 'Percentage watched to mark as completed (0.5 - 0.99)',
      type: 'number',
      min: 0.5,
      max: 0.99,
      step: 0.01,
      default: parseFloat(DEFAULTS.watchCompletionThreshold),
    },
  };
}

export default {
  get,
  set,
  getAll,
  updateMany,
  reset,
  resetAll,
  getMetadata,
  VALID_SETTINGS,
};
