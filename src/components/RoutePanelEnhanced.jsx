/**
 * Enhanced Route Panel
 * Integrates route planning, session management, and optimization
 */

import React, { useState, useEffect } from 'react';
import { globalAlertCenter, ALERT_TYPES, ALERT_SEVERITY } from '../alerts/alertCenter.js';
import RouteOptimizer from '../routing/routeOptimizer.js';
import RouteSessionManager, { ROUTE_SESSION_STATES } from '../firebase/routeSessionManager.js';
import CollectionEventLogger, { COLLECTION_RESULTS } from '../firebase/collectionEventLogger.js';
import TelemetryAdapter from '../telemetry/telemetryAdapter.js';
import VehicleStateManager, { VEHICLE_STATES } from '../vehicle/vehicleStateManager.js';

const DEPOT = { lat: 13.7572, lng: 121.0588, label: 'Barangay Hall' };

function getDistance(a, b) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const statusColors = {
  critical: { bg: '#fadbd8', border: '#c0392b', text: '#c0392b', badge: '#c0392b' },
  warning: { bg: '#fdebd0', border: '#d35400', text: '#d35400', badge: '#d35400' },
  normal: { bg: '#d5f5e3', border: '#1e8449', text: '#1e8449', badge: '#1e8449' },
  offline: { bg: '#e5e7eb', border: '#6b7280', text: '#6b7280', badge: '#6b7280' },
};

function StepConnector({ distance }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 20px',
        margin: '2px 0',
      }}
    >
      <div
        style={{
          width: '2px',
          height: '24px',
          background: '#ddd',
          marginLeft: '11px',
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: '11px', color: '#aaa' }}>{distance}m</span>
    </div>
  );
}

function BinStop({ bin, index, isSelected, onCollect, onSkip, onSelect }) {
  const binColors = statusColors[bin.status] || statusColors.normal;

  return (
    <div
      style={{
        borderLeft: `4px solid ${binColors.border}`,
        borderRadius: '4px',
        padding: '12px',
        margin: '8px 0',
        backgroundColor: binColors.bg,
        cursor: 'pointer',
        opacity: isSelected ? 1 : 0.7,
        transition: 'opacity 0.2s',
      }}
      onClick={() => onSelect && onSelect(bin)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', color: binColors.text }}>
            Stop {index + 1}: Zone {bin.zone}
          </h4>
          <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>
            ID: {bin.binId}
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: binColors.text, fontWeight: 'bold' }}>
            Fill: {bin.fillLevel}% | Status: {bin.status}
          </p>
          {bin.isStale && (
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#e67e22' }}>
              ⚠️ Data is {bin.dataAgeMinutes}min old
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCollect && onCollect(bin);
            }}
            style={{
              padding: '6px 12px',
              background: binColors.badge,
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            ✓ Collect
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSkip && onSkip(bin);
            }}
            style={{
              padding: '6px 12px',
              background: '#95a5a6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoutePanelEnhanced({ bins = [], currentPosition = null, onRouteStart = null }) {
  const [routeSession, setRouteSession] = useState(null);
  const [optimizedRoute, setOptimizedRoute] = useState([]);
  const [sessionState, setSessionState] = useState(ROUTE_SESSION_STATES.DRAFT);
  const [selectedStop, setSelectedStop] = useState(null);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState(new Map());

  const routeOptimizer = new RouteOptimizer();
  const routeSessionManager = new RouteSessionManager();
  const collectionLogger = new CollectionEventLogger();
  const vehicleStateManager = new VehicleStateManager();

  // Subscribe to alerts
  useEffect(() => {
    const unsubscribe = globalAlertCenter.subscribe((alertMap) => {
      setAlerts(new Map(alertMap));
    });
    return unsubscribe;
  }, []);

  // Normalize bins and optimize route whenever bins change
  useEffect(() => {
    if (bins.length > 0) {
      const normalizedBins = bins.map((bin) => TelemetryAdapter.normalizeBin(bin, 'simulator'));
      const planned = routeOptimizer.planRoute(normalizedBins, currentPosition);
      setOptimizedRoute(planned.stops);
      console.log('[v0] Route optimized:', planned);
    }
  }, [bins, currentPosition]);

  const handlePlanRoute = async () => {
    if (optimizedRoute.length === 0) {
      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        'No bins available for collection',
        ALERT_SEVERITY.WARNING
      );
      return;
    }

    setLoading(true);
    try {
      const session = await routeSessionManager.createSession(
        optimizedRoute,
        optimizedRoute.reduce((sum, stop) => sum + stop.estimatedDistance, 0),
        optimizedRoute.reduce((sum, stop) => sum + stop.estimatedDuration, 0)
      );

      setRouteSession(session);
      setSessionState(ROUTE_SESSION_STATES.DRAFT);
      console.log('[v0] Route session created:', session);

      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        `Route planned: ${optimizedRoute.length} stops, ${session.estimatedDurationMin}min`,
        ALERT_SEVERITY.INFO
      );
    } catch (error) {
      console.error('[v0] Failed to plan route:', error);
      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        'Failed to plan route',
        ALERT_SEVERITY.CRITICAL
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStartRoute = async () => {
    if (!routeSession) return;

    setLoading(true);
    try {
      await routeSessionManager.startSession(routeSession.routeSessionId);
      await vehicleStateManager.setState(VEHICLE_STATES.EN_ROUTE);
      setSessionState(ROUTE_SESSION_STATES.ACTIVE);

      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        'Route started',
        ALERT_SEVERITY.INFO
      );

      onRouteStart?.(routeSession);
    } catch (error) {
      console.error('[v0] Failed to start route:', error);
      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        'Failed to start route',
        ALERT_SEVERITY.CRITICAL
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCollect = async (bin) => {
    if (!routeSession) return;

    setLoading(true);
    try {
      // Complete the stop in the session
      await routeSessionManager.completeStop(routeSession.routeSessionId, bin.binId);

      // Log collection event
      await collectionLogger.logCollectionEvent({
        routeSessionId: routeSession.routeSessionId,
        binId: bin.binId,
        zone: bin.zone,
        collectorLocation: currentPosition,
        previousFillLevel: bin.fillLevel,
        previousStatus: bin.status,
        collectionResult: COLLECTION_RESULTS.SUCCESS,
        notes: 'Collected via mobile app',
      });

      // Update selected stop
      setSelectedStop(null);

      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        `${bin.binId} collected`,
        ALERT_SEVERITY.INFO
      );
    } catch (error) {
      console.error('[v0] Failed to collect:', error);
      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        'Failed to record collection',
        ALERT_SEVERITY.WARNING
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async (bin) => {
    if (!routeSession) return;

    setLoading(true);
    try {
      await routeSessionManager.skipStop(routeSession.routeSessionId, bin.binId, 'Skipped by operator');

      await collectionLogger.logCollectionEvent({
        routeSessionId: routeSession.routeSessionId,
        binId: bin.binId,
        zone: bin.zone,
        collectorLocation: currentPosition,
        previousFillLevel: bin.fillLevel,
        previousStatus: bin.status,
        collectionResult: COLLECTION_RESULTS.SKIPPED,
        notes: 'Skipped by operator',
      });

      setSelectedStop(null);

      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        `${bin.binId} skipped`,
        ALERT_SEVERITY.INFO
      );
    } catch (error) {
      console.error('[v0] Failed to skip:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePauseRoute = async () => {
    if (!routeSession) return;

    try {
      await routeSessionManager.pauseSession(routeSession.routeSessionId);
      await vehicleStateManager.setState(VEHICLE_STATES.PAUSED);
      setSessionState(ROUTE_SESSION_STATES.PAUSED);

      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        'Route paused',
        ALERT_SEVERITY.INFO
      );
    } catch (error) {
      console.error('[v0] Failed to pause route:', error);
    }
  };

  const handleResumeRoute = async () => {
    if (!routeSession) return;

    try {
      await routeSessionManager.resumeSession(routeSession.routeSessionId);
      await vehicleStateManager.setState(VEHICLE_STATES.EN_ROUTE);
      setSessionState(ROUTE_SESSION_STATES.ACTIVE);

      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        'Route resumed',
        ALERT_SEVERITY.INFO
      );
    } catch (error) {
      console.error('[v0] Failed to resume route:', error);
    }
  };

  const handleCompleteRoute = async () => {
    if (!routeSession) return;

    try {
      await routeSessionManager.completeSession(routeSession.routeSessionId);
      await vehicleStateManager.setState(VEHICLE_STATES.IDLE);
      setSessionState(ROUTE_SESSION_STATES.COMPLETED);

      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        'Route completed',
        ALERT_SEVERITY.INFO
      );

      setRouteSession(null);
      setOptimizedRoute([]);
      setSelectedStop(null);
    } catch (error) {
      console.error('[v0] Failed to complete route:', error);
    }
  };

  const isRouteActive = sessionState === ROUTE_SESSION_STATES.ACTIVE;
  const isRoutePaused = sessionState === ROUTE_SESSION_STATES.PAUSED;
  const routeComplete = sessionState === ROUTE_SESSION_STATES.COMPLETED;

  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        marginTop: '20px',
      }}
    >
      <h2 style={{ margin: '0 0 20px 0' }}>Route Management</h2>

      {/* Alert Display */}
      {alerts.size > 0 && (
        <div style={{ marginBottom: '15px' }}>
          {Array.from(alerts.values()).map((alert) => (
            <div
              key={alert.id}
              style={{
                padding: '10px 15px',
                marginBottom: '8px',
                borderRadius: '4px',
                backgroundColor:
                  alert.severity === ALERT_SEVERITY.CRITICAL ? '#fadbd8' : '#fdebd0',
                color:
                  alert.severity === ALERT_SEVERITY.CRITICAL ? '#c0392b' : '#d35400',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{alert.message}</span>
              <button
                onClick={() => globalAlertCenter.dismiss(alert.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Route Status */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>
          Status: <strong>{sessionState}</strong>
        </p>
        {routeSession && (
          <>
            <p style={{ margin: '4px 0', fontSize: '13px', color: '#666' }}>
              Stops: {routeSession.plannedStops.length} | Distance: {routeSession.estimatedDistanceKm}km | Duration: {routeSession.estimatedDurationMin}min
            </p>
            <p style={{ margin: '4px 0', fontSize: '13px', color: '#666' }}>
              Completed: {routeSession.completedStopIds.length} | Skipped: {routeSession.skippedStopIds.length}
            </p>
          </>
        )}
      </div>

      {/* Control Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {!routeSession && (
          <button
            onClick={handlePlanRoute}
            disabled={loading || optimizedRoute.length === 0}
            style={{
              padding: '10px 16px',
              background: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Planning...' : 'Plan Route'}
          </button>
        )}

        {routeSession && !isRouteActive && !isRoutePaused && (
          <button
            onClick={handleStartRoute}
            disabled={loading}
            style={{
              padding: '10px 16px',
              background: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Starting...' : 'Start Route'}
          </button>
        )}

        {isRouteActive && (
          <button
            onClick={handlePauseRoute}
            style={{
              padding: '10px 16px',
              background: '#f39c12',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Pause Route
          </button>
        )}

        {isRoutePaused && (
          <button
            onClick={handleResumeRoute}
            style={{
              padding: '10px 16px',
              background: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Resume Route
          </button>
        )}

        {(isRouteActive || isRoutePaused) && (
          <button
            onClick={handleCompleteRoute}
            style={{
              padding: '10px 16px',
              background: '#8e44ad',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Complete Route
          </button>
        )}
      </div>

      {/* Optimized Route Steps */}
      {optimizedRoute.length > 0 && (
        <div>
          <h3 style={{ margin: '20px 0 15px 0', fontSize: '16px' }}>
            Optimized Route ({optimizedRoute.length} stops)
          </h3>
          <div style={{ maxHeight: '500px', overflow: 'auto' }}>
            {optimizedRoute.map((stop, index) => {
              const bin = bins.find((b) => b.binId === stop.binId);
              if (!bin) return null;

              const normalizedBin = TelemetryAdapter.normalizeBin(bin, 'simulator');

              return (
                <div key={bin.binId}>
                  {index > 0 && <StepConnector distance={Math.round(optimizedRoute[index - 1].estimatedDistance * 1000)} />}
                  <BinStop
                    bin={normalizedBin}
                    index={index}
                    isSelected={selectedStop?.binId === bin.binId}
                    onSelect={setSelectedStop}
                    onCollect={isRouteActive ? handleCollect : null}
                    onSkip={isRouteActive ? handleSkip : null}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default RoutePanelEnhanced;
