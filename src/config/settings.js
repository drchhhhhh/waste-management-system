/**
 * Centralized configuration and feature flags
 * All thresholds and settings in one place for easy tuning
 */

export const CONFIG = {
  // Data Freshness
  DATA_FRESHNESS_THRESHOLD_MINUTES: 30,
  
  // Fill Level Thresholds
  CRITICAL_FILL_THRESHOLD: 90,
  WARNING_FILL_THRESHOLD: 70,
  
  // Route Optimization
  ROUTE_OPTIMIZATION: {
    ENABLE_WEIGHTED_SCORING: true,
    MAX_STOPS_PER_ROUTE: 50,
    ENABLE_GEOSPATIAL_CLUSTERING: false, // Future enhancement
  },

  // Vehicle Operations
  VEHICLE: {
    DEFAULT_VEHICLE_ID: 'truck-1',
    SESSION_TIMEOUT_MINUTES: 480, // 8 hours
    GPS_ACCURACY_THRESHOLD_METERS: 50,
  },

  // Logging & Telemetry
  LOGGING: {
    ENABLE_COLLECTION_EVENTS: true,
    ENABLE_ROUTE_HISTORY: true,
    BATCH_WRITE_INTERVAL_MS: 5000,
  },

  // Feature Flags
  FEATURES: {
    ENABLE_SIMULATOR_MODE: true,
    ENABLE_OFFLINE_CACHE: true,
    ENABLE_ALERTS: true,
    ENABLE_ROUTE_OPTIMIZATION: true,
  },

  // Alerts
  ALERTS: {
    ENABLE_CRITICAL_BIN_ALERTS: true,
    ENABLE_STALE_SENSOR_ALERTS: true,
    ENABLE_GPS_ALERTS: true,
    ENABLE_OFFLINE_ALERTS: true,
  },

  // Firebase Config (can be overridden by environment variables)
  FIREBASE: {
    // These are set in src/firebase/config.js, but we reference the structure here
  },
};

/**
 * Override config settings (useful for testing and runtime configuration)
 */
export function setConfig(overrides) {
  Object.assign(CONFIG, overrides);
  console.log('[v0] Config updated:', CONFIG);
}

/**
 * Get a specific config value with dot notation
 * Example: getConfigValue('ROUTE_OPTIMIZATION.MAX_STOPS_PER_ROUTE')
 */
export function getConfigValue(path) {
  return path.split('.').reduce((obj, key) => obj?.[key], CONFIG);
}

export default CONFIG;
