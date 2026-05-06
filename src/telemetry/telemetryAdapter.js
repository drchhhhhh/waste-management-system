/**
 * Telemetry Adapter - Normalizes bin data from simulator and future live sensor modes
 * Provides health checks, staleness detection, and data age tracking
 */

const DATA_FRESHNESS_THRESHOLD_MINUTES = 30; // Bins older than this are "stale"
const CRITICAL_FILL_THRESHOLD = 90; // % full
const WARNING_FILL_THRESHOLD = 70; // % full

export class TelemetryAdapter {
  /**
   * Normalize bin data from any source (simulator, live sensor, fallback)
   * @param {Object} rawBin - Raw bin object from Firestore
   * @param {string} sourceMode - 'simulator', 'live-sensor', or 'fallback'
   * @returns {Object} Normalized bin with health metadata
   */
  static normalizeBin(rawBin, sourceMode = 'simulator') {
    const now = Date.now();
    const lastSeenAt = rawBin.lastSeenAt?.toMillis?.() || rawBin.lastSeenAt || now;
    const dataAgeMs = now - lastSeenAt;
    const dataAgeMinutes = Math.floor(dataAgeMs / 60000);
    const isStale = dataAgeMinutes > DATA_FRESHNESS_THRESHOLD_MINUTES;

    const fillLevel = rawBin.fillLevel || 0;
    let sensorHealth = 'ok';
    if (isStale) {
      sensorHealth = 'offline';
    } else if (dataAgeMinutes > 15) {
      sensorHealth = 'degraded';
    }

    const status = this._computeStatus(fillLevel, isStale);

    return {
      ...rawBin,
      sourceMode,
      sensorHealth,
      lastSeenAt,
      dataAgeMinutes,
      isStale,
      fillLevel,
      status,
      collectionPriority: this._computePriority(fillLevel, isStale, rawBin.isPriority),
    };
  }

  /**
   * Compute bin status based on fill level and staleness
   * @private
   */
  static _computeStatus(fillLevel, isStale) {
    if (isStale) return 'offline';
    if (fillLevel >= CRITICAL_FILL_THRESHOLD) return 'critical';
    if (fillLevel >= WARNING_FILL_THRESHOLD) return 'warning';
    return 'normal';
  }

  /**
   * Compute collection priority (1 = highest, 0 = lowest)
   * @private
   */
  static _computePriority(fillLevel, isStale, isPriority) {
    let priority = 0;
    if (isPriority) priority += 0.5;
    if (fillLevel >= CRITICAL_FILL_THRESHOLD) priority += 0.3;
    if (isStale) priority += 0.2;
    return Math.min(priority, 1);
  }

  /**
   * Check overall fleet health
   * @param {Array<Object>} normalizedBins - Array of normalized bins
   * @returns {Object} Fleet health summary
   */
  static checkFleetHealth(normalizedBins) {
    const critical = normalizedBins.filter(b => b.status === 'critical').length;
    const warning = normalizedBins.filter(b => b.status === 'warning').length;
    const offline = normalizedBins.filter(b => b.sensorHealth === 'offline').length;
    const degraded = normalizedBins.filter(b => b.sensorHealth === 'degraded').length;

    return {
      totalBins: normalizedBins.length,
      criticalBins: critical,
      warningBins: warning,
      offlineSensors: offline,
      degradedSensors: degraded,
      overallHealth: offline === 0 && degraded === 0 ? 'good' : degraded > 0 ? 'degraded' : 'critical',
    };
  }

  /**
   * Get bins that need collection (critical, warning, or stale)
   * @param {Array<Object>} normalizedBins
   * @returns {Array<Object>} Filtered and sorted bins
   */
  static getBinsNeedingCollection(normalizedBins) {
    return normalizedBins
      .filter(b => b.status === 'critical' || b.status === 'warning' || b.isStale)
      .sort((a, b) => b.collectionPriority - a.collectionPriority);
  }
}

export default TelemetryAdapter;
