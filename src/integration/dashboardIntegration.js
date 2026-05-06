/**
 * Dashboard Integration Layer
 * Connects the new modules with existing Dashboard, RoutePanel, Map, and BinCard components
 * Ensures all existing features continue to work while enabling new capabilities
 */

import { RouteSessionManager } from '../firebase/routeSessionManager';
import { CollectionEventLogger } from '../firebase/collectionEventLogger';
import { TelemetryAdapter } from '../telemetry/telemetryAdapter';
import { VehicleStateManager } from '../vehicle/vehicleStateManager';
import { RouteOptimizer } from '../routing/routeOptimizer';
import { AlertCenter } from '../alerts/alertCenter';

class DashboardIntegration {
  constructor() {
    this.routeSessionManager = null;
    this.collectionEventLogger = null;
    this.telemetryAdapter = null;
    this.vehicleStateManager = null;
    this.routeOptimizer = null;
    this.alertCenter = null;
    this.currentRouteSession = null;
  }

  /**
   * Initialize all integration modules
   * Call this once in App.js or Dashboard.jsx useEffect
   */
  async initialize() {
    console.log('[DashboardIntegration] Initializing...');
    
    this.routeSessionManager = new RouteSessionManager();
    this.collectionEventLogger = new CollectionEventLogger();
    this.telemetryAdapter = new TelemetryAdapter();
    this.vehicleStateManager = new VehicleStateManager();
    this.routeOptimizer = new RouteOptimizer();
    this.alertCenter = new AlertCenter();

    // Listen for route session changes
    this.routeSessionManager.onSessionChange((session) => {
      this.currentRouteSession = session;
      console.log('[DashboardIntegration] Route session changed:', session);
    });

    // Listen for alerts
    this.alertCenter.onAlert((alert) => {
      console.log('[DashboardIntegration] Alert:', alert);
    });

    console.log('[DashboardIntegration] Initialized successfully');
  }

  /**
   * Process bins through telemetry adapter
   * Enriches bin data with health, staleness, and priority information
   * @param {Array} bins - Raw bin data from Firestore
   * @returns {Array} Enhanced bins with telemetry data
   */
  processBinsWithTelemetry(bins) {
    if (!this.telemetryAdapter) return bins;
    return bins.map((bin) =>
      this.telemetryAdapter.normalizeBinData(bin, 'simulator')
    );
  }

  /**
   * Start a new route session
   * Called when user clicks "Start Route" button
   * @param {Array} optimizedRoute - Route order [bin1, bin2, ...]
   * @param {string} vehicleId - Vehicle ID (default: 'truck-001')
   * @returns {Object} New route session
   */
  async startRouteSession(optimizedRoute, vehicleId = 'truck-001') {
    console.log('[DashboardIntegration] Starting route session');

    // Calculate route metrics
    const estimatedDistanceKm = this.calculateRouteDistance(optimizedRoute);
    const estimatedDurationMin = Math.round(estimatedDistanceKm * 3); // rough estimate

    // Create session in Firestore
    const session = await this.routeSessionManager.createRouteSession({
      vehicleId,
      plannedStops: optimizedRoute.map((bin, idx) => ({
        binId: bin.binId,
        order: idx + 1,
        estimatedDistance: bin.distanceFromPrev || 0,
      })),
      estimatedDistanceKm,
      estimatedDurationMin,
    });

    this.currentRouteSession = session;

    // Update vehicle state
    await this.vehicleStateManager.setState(vehicleId, {
      state: 'en-route',
      currentRouteSessionId: session.routeSessionId,
    });

    return session;
  }

  /**
   * Mark a bin as collected
   * Called when truck reaches a bin and collects it
   * @param {string} binId - Bin ID
   * @param {Array} bins - All bins (to get pre-collection state)
   * @returns {Object} Collection event
   */
  async collectBin(binId, bins) {
    if (!this.currentRouteSession) {
      console.warn('[DashboardIntegration] No active route session');
      return null;
    }

    const bin = bins.find((b) => b.binId === binId);
    if (!bin) {
      console.error('[DashboardIntegration] Bin not found:', binId);
      return null;
    }

    // Create immutable collection event
    const event = await this.collectionEventLogger.logCollectionEvent({
      routeSessionId: this.currentRouteSession.routeSessionId,
      binId,
      collectedFillLevelBeforeReset: bin.fillLevel,
      previousStatus: bin.status,
      collectionResult: 'success',
    });

    // Update route session with collected stop
    await this.routeSessionManager.markStopCollected(
      this.currentRouteSession.routeSessionId,
      binId
    );

    console.log('[DashboardIntegration] Bin collected:', binId);
    return event;
  }

  /**
   * Skip a bin in the current route
   * @param {string} binId - Bin ID
   * @param {string} reason - Reason for skipping (e.g., 'equipment-failure', 'access-denied')
   */
  async skipBin(binId, reason = 'operator-skip') {
    if (!this.currentRouteSession) {
      console.warn('[DashboardIntegration] No active route session');
      return null;
    }

    // Log skip event
    const event = await this.collectionEventLogger.logCollectionEvent({
      routeSessionId: this.currentRouteSession.routeSessionId,
      binId,
      collectionResult: 'skipped',
      notes: reason,
    });

    // Update route session
    await this.routeSessionManager.markStopSkipped(
      this.currentRouteSession.routeSessionId,
      binId,
      reason
    );

    return event;
  }

  /**
   * Pause the current route
   */
  async pauseRoute() {
    if (!this.currentRouteSession) return;
    await this.routeSessionManager.pauseSession(
      this.currentRouteSession.routeSessionId
    );
  }

  /**
   * Resume a paused route
   */
  async resumeRoute() {
    if (!this.currentRouteSession) return;
    await this.routeSessionManager.resumeSession(
      this.currentRouteSession.routeSessionId
    );
  }

  /**
   * Complete the current route
   */
  async completeRoute() {
    if (!this.currentRouteSession) return;
    await this.routeSessionManager.completeSession(
      this.currentRouteSession.routeSessionId
    );
    this.currentRouteSession = null;
  }

  /**
   * Get optimized route using weighted scoring
   * Takes existing priority-sorted bins and optimizes with additional factors
   * @param {Array} bins - Priority bins (fill level >= 70%)
   * @returns {Array} Optimized route order
   */
  getOptimizedRoute(bins) {
    const scored = this.routeOptimizer.scoreRoute(bins);
    return scored.sortedBins;
  }

  /**
   * Update vehicle position during active route
   * @param {string} vehicleId - Vehicle ID
   * @param {Object} position - {lat, lng, accuracy}
   */
  async updateVehiclePosition(vehicleId, position) {
    if (!this.currentRouteSession) return;

    await this.routeSessionManager.updateTruckPosition(
      this.currentRouteSession.routeSessionId,
      position
    );
  }

  /**
   * Emit an alert
   * @param {string} type - Alert type (e.g., 'critical-bin', 'stale-sensor')
   * @param {string} severity - 'critical', 'warning', or 'info'
   * @param {Object} data - Alert data
   */
  emitAlert(type, severity, data) {
    this.alertCenter.emitAlert({
      type,
      severity,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  /**
   * Check fleet health and emit alerts for problematic bins
   * @param {Array} bins - All bins
   */
  checkFleetHealth(bins) {
    const enriched = this.processBinsWithTelemetry(bins);

    // Check for stale sensors
    enriched.forEach((bin) => {
      if (bin.isStale) {
        this.emitAlert(
          'stale-sensor',
          'warning',
          { binId: bin.binId, lastSeenMinutesAgo: bin.dataAgeMinutes }
        );
      }

      // Check for critical bins
      if (bin.status === 'critical') {
        this.emitAlert(
          'critical-bin',
          'critical',
          { binId: bin.binId, fillLevel: bin.fillLevel }
        );
      }
    });
  }

  /**
   * Calculate total distance for a route
   * @param {Array} route - Route bins with distanceFromPrev
   * @returns {number} Distance in kilometers
   */
  calculateRouteDistance(route) {
    return route.reduce((sum, bin) => sum + (bin.distanceFromPrev || 0), 0) / 1000;
  }

  /**
   * Recover previous session on page refresh
   * Restores route session from Firestore if one was active
   * @param {string} vehicleId - Vehicle ID
   * @returns {Object|null} Recovered session or null
   */
  async recoverActiveSession(vehicleId = 'truck-001') {
    const session = await this.routeSessionManager.getActiveSession(vehicleId);
    if (session) {
      this.currentRouteSession = session;
      console.log('[DashboardIntegration] Recovered active session:', session.routeSessionId);
    }
    return session;
  }

  /**
   * Subscribe to route session updates
   * Used in components to react to session state changes
   * @param {Function} callback - Function called when session changes
   * @returns {Function} Unsubscribe function
   */
  onSessionUpdate(callback) {
    return this.routeSessionManager.onSessionChange(callback);
  }

  /**
   * Subscribe to alert updates
   * Used in AlertDisplay component
   * @param {Function} callback - Function called when alert arrives
   * @returns {Function} Unsubscribe function
   */
  onAlert(callback) {
    return this.alertCenter.onAlert(callback);
  }

  /**
   * Get current session state
   * @returns {Object|null} Current route session or null
   */
  getCurrentSession() {
    return this.currentRouteSession;
  }

  /**
   * Get vehicle operational state
   * @param {string} vehicleId - Vehicle ID
   * @returns {Object} Vehicle state
   */
  async getVehicleState(vehicleId) {
    return this.vehicleStateManager.getState(vehicleId);
  }

  /**
   * Get all collection events for a route session
   * @param {string} routeSessionId - Route session ID
   * @returns {Array} Collection events
   */
  async getCollectionHistory(routeSessionId) {
    return this.collectionEventLogger.getSessionEvents(routeSessionId);
  }
}

// Export singleton instance
export const dashboardIntegration = new DashboardIntegration();
