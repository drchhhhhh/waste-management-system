/**
 * Alert Center - Centralized alert management
 * Emits real-time alerts for critical events
 */

export const ALERT_TYPES = {
  CRITICAL_BIN: 'critical_bin',
  STALE_SENSOR: 'stale_sensor',
  GPS_DENIED: 'gps_denied',
  GPS_LOW_ACCURACY: 'gps_low_accuracy',
  API_FAILURE: 'api_failure',
  CONNECTIVITY_ISSUE: 'connectivity_issue',
  OFFLINE_MODE_ACTIVE: 'offline_mode_active',
  LOCATION_REQUIRED: 'location_required',
};

export const ALERT_SEVERITY = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
};

export class AlertCenter {
  constructor() {
    this.alerts = new Map(); // Map<alertId, alertObject>
    this.subscribers = new Set();
    this.alertCounter = 0;
  }

  /**
   * Subscribe to alert changes
   * @param {Function} callback - Called with (alerts: Map) whenever alerts change
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Emit an alert
   */
  emit(type, message, severity = ALERT_SEVERITY.WARNING, metadata = {}) {
    const alertId = `alert-${++this.alertCounter}`;
    const alert = {
      id: alertId,
      type,
      message,
      severity,
      metadata,
      createdAt: Date.now(),
      dismissed: false,
    };

    this.alerts.set(alertId, alert);
    this._notifySubscribers();

    // Auto-dismiss info alerts after 5 seconds
    if (severity === ALERT_SEVERITY.INFO) {
      setTimeout(() => this.dismiss(alertId), 5000);
    }

    return alertId;
  }

  /**
   * Dismiss an alert
   */
  dismiss(alertId) {
    if (this.alerts.has(alertId)) {
      this.alerts.delete(alertId);
      this._notifySubscribers();
    }
  }

  /**
   * Dismiss all alerts of a certain type
   */
  dismissAllOfType(type) {
    for (const [id, alert] of this.alerts) {
      if (alert.type === type) {
        this.alerts.delete(id);
      }
    }
    this._notifySubscribers();
  }

  /**
   * Get all current alerts
   */
  getAll() {
    return Array.from(this.alerts.values());
  }

  /**
   * Get alerts by type
   */
  getByType(type) {
    return Array.from(this.alerts.values()).filter(a => a.type === type);
  }

  /**
   * Get alerts by severity
   */
  getBySeverity(severity) {
    return Array.from(this.alerts.values()).filter(a => a.severity === severity);
  }

  /**
   * Clear all alerts
   */
  clear() {
    this.alerts.clear();
    this._notifySubscribers();
  }

  /**
   * Get critical alerts (highest priority)
   */
  getCritical() {
    return this.getBySeverity(ALERT_SEVERITY.CRITICAL);
  }

  /**
   * @private
   */
  _notifySubscribers() {
    for (const callback of this.subscribers) {
      try {
        callback(this.alerts);
      } catch (error) {
        console.error('[v0] Alert subscriber error:', error);
      }
    }
  }
}

// Global singleton instance
export const globalAlertCenter = new AlertCenter();

export default AlertCenter;
