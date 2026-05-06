/**
 * Hook for using DashboardIntegration in React components
 * Ensures initialization happens once and provides access to all integration methods
 */

import { useEffect, useRef, useCallback } from 'react';
import { dashboardIntegration } from '../integration/dashboardIntegration';

export function useDashboardIntegration() {
  const initRef = useRef(false);

  // Initialize integration on first mount
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      dashboardIntegration.initialize().catch((err) => {
        console.error('[useDashboardIntegration] Initialization failed:', err);
      });
    }
  }, []);

  // Wrapped methods to ensure integration is ready
  const processBinsWithTelemetry = useCallback((bins) => {
    return dashboardIntegration.processBinsWithTelemetry(bins);
  }, []);

  const startRouteSession = useCallback((route, vehicleId) => {
    return dashboardIntegration.startRouteSession(route, vehicleId);
  }, []);

  const collectBin = useCallback((binId, bins) => {
    return dashboardIntegration.collectBin(binId, bins);
  }, []);

  const skipBin = useCallback((binId, reason) => {
    return dashboardIntegration.skipBin(binId, reason);
  }, []);

  const pauseRoute = useCallback(() => {
    return dashboardIntegration.pauseRoute();
  }, []);

  const resumeRoute = useCallback(() => {
    return dashboardIntegration.resumeRoute();
  }, []);

  const completeRoute = useCallback(() => {
    return dashboardIntegration.completeRoute();
  }, []);

  const getOptimizedRoute = useCallback((bins) => {
    return dashboardIntegration.getOptimizedRoute(bins);
  }, []);

  const updateVehiclePosition = useCallback((vehicleId, position) => {
    return dashboardIntegration.updateVehiclePosition(vehicleId, position);
  }, []);

  const emitAlert = useCallback((type, severity, data) => {
    return dashboardIntegration.emitAlert(type, severity, data);
  }, []);

  const checkFleetHealth = useCallback((bins) => {
    return dashboardIntegration.checkFleetHealth(bins);
  }, []);

  const calculateRouteDistance = useCallback((route) => {
    return dashboardIntegration.calculateRouteDistance(route);
  }, []);

  const recoverActiveSession = useCallback((vehicleId) => {
    return dashboardIntegration.recoverActiveSession(vehicleId);
  }, []);

  const onSessionUpdate = useCallback((callback) => {
    return dashboardIntegration.onSessionUpdate(callback);
  }, []);

  const onAlert = useCallback((callback) => {
    return dashboardIntegration.onAlert(callback);
  }, []);

  const getCurrentSession = useCallback(() => {
    return dashboardIntegration.getCurrentSession();
  }, []);

  const getVehicleState = useCallback((vehicleId) => {
    return dashboardIntegration.getVehicleState(vehicleId);
  }, []);

  const getCollectionHistory = useCallback((routeSessionId) => {
    return dashboardIntegration.getCollectionHistory(routeSessionId);
  }, []);

  return {
    // Data transformation
    processBinsWithTelemetry,
    getOptimizedRoute,
    calculateRouteDistance,

    // Route session management
    startRouteSession,
    pauseRoute,
    resumeRoute,
    completeRoute,
    getCurrentSession,
    recoverActiveSession,
    onSessionUpdate,

    // Collection operations
    collectBin,
    skipBin,
    getCollectionHistory,

    // Vehicle operations
    updateVehiclePosition,
    getVehicleState,

    // Alerts
    emitAlert,
    checkFleetHealth,
    onAlert,
  };
}
