/**
 * Vehicle Operations Panel
 * Displays vehicle state, GPS status, and operational metrics
 */

import React, { useState, useEffect } from 'react';
import VehicleStateManager, { VEHICLE_STATES, GPS_STATES } from '../vehicle/vehicleStateManager.js';
import TelemetryAdapter from '../telemetry/telemetryAdapter.js';

const stateColors = {
  idle: '#95a5a6',
  'en-route': '#3498db',
  collecting: '#f39c12',
  paused: '#e74c3c',
  returning: '#9b59b6',
  offline: '#e67e22',
};

const gpsStateColors = {
  ok: '#27ae60',
  'low-accuracy': '#f39c12',
  denied: '#e74c3c',
  unavailable: '#95a5a6',
};

export function VehicleOpsPanel({ vehicleId = 'truck-1', bins = [] }) {
  const [vehicleState, setVehicleState] = useState({
    vehicleState: VEHICLE_STATES.IDLE,
    gpsState: GPS_STATES.OK,
    lastKnownPosition: null,
    gpsAccuracy: null,
    offlineMode: false,
    lastStateChangeAt: Date.now(),
  });

  const [fleetHealth, setFleetHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  const vehicleStateManager = new VehicleStateManager(undefined, vehicleId);

  // Load vehicle state on mount
  useEffect(() => {
    const loadState = async () => {
      await vehicleStateManager.loadState();
      setVehicleState(vehicleStateManager.getState());
      console.log('[v0] Vehicle state loaded');
    };
    loadState();
  }, []);

  // Update fleet health whenever bins change
  useEffect(() => {
    if (bins.length > 0) {
      const normalizedBins = bins.map((bin) =>
        TelemetryAdapter.normalizeBin(bin, 'simulator')
      );
      const health = TelemetryAdapter.checkFleetHealth(normalizedBins);
      setFleetHealth(health);
    }
  }, [bins]);

  const handleUpdateGpsState = async (gpsState) => {
    setLoading(true);
    try {
      await vehicleStateManager.setGpsState(
        gpsState,
        vehicleState.lastKnownPosition,
        vehicleState.gpsAccuracy
      );
      setVehicleState(vehicleStateManager.getState());
      console.log('[v0] GPS state updated:', gpsState);
    } catch (error) {
      console.error('[v0] Failed to update GPS state:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOfflineMode = async () => {
    setLoading(true);
    try {
      const newOfflineMode = !vehicleState.offlineMode;
      await vehicleStateManager.setOfflineMode(
        newOfflineMode,
        newOfflineMode ? 'Manual offline mode' : null
      );
      setVehicleState(vehicleStateManager.getState());
      console.log('[v0] Offline mode toggled:', newOfflineMode);
    } catch (error) {
      console.error('[v0] Failed to toggle offline mode:', error);
    } finally {
      setLoading(false);
    }
  };

  const stateColor = stateColors[vehicleState.vehicleState] || '#95a5a6';
  const gpsColor = gpsStateColors[vehicleState.gpsState] || '#95a5a6';

  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        marginTop: '20px',
      }}
    >
      <h2 style={{ margin: '0 0 20px 0' }}>Vehicle Operations</h2>

      {/* Vehicle State Section */}
      <div
        style={{
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '6px',
          marginBottom: '20px',
          border: `2px solid ${stateColor}`,
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#333' }}>
          Operational State
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '15px',
          }}
        >
          <div>
            <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
              Vehicle State
            </label>
            <div
              style={{
                padding: '10px 12px',
                backgroundColor: stateColor,
                color: 'white',
                borderRadius: '4px',
                fontWeight: 'bold',
                textAlign: 'center',
                fontSize: '14px',
              }}
            >
              {vehicleState.vehicleState.toUpperCase()}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
              GPS State
            </label>
            <div
              style={{
                padding: '10px 12px',
                backgroundColor: gpsColor,
                color: 'white',
                borderRadius: '4px',
                fontWeight: 'bold',
                textAlign: 'center',
                fontSize: '14px',
              }}
            >
              {vehicleState.gpsState.toUpperCase()}
            </div>
          </div>

          {vehicleState.lastKnownPosition && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
                Last Known Position
              </label>
              <p style={{ margin: '0', fontSize: '13px', color: '#333' }}>
                Lat: {vehicleState.lastKnownPosition.lat.toFixed(4)}, Lng:{' '}
                {vehicleState.lastKnownPosition.lng.toFixed(4)}
              </p>
              {vehicleState.gpsAccuracy && (
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>
                  Accuracy: ±{vehicleState.gpsAccuracy.toFixed(0)}m
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* GPS Controls */}
      <div
        style={{
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '6px',
          marginBottom: '20px',
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#333' }}>
          GPS Controls
        </h3>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <button
            onClick={() => handleUpdateGpsState(GPS_STATES.OK)}
            disabled={loading}
            style={{
              padding: '8px 12px',
              background: vehicleState.gpsState === GPS_STATES.OK ? '#27ae60' : '#ecf0f1',
              color: vehicleState.gpsState === GPS_STATES.OK ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              opacity: loading ? 0.6 : 1,
            }}
          >
            GPS OK
          </button>
          <button
            onClick={() => handleUpdateGpsState(GPS_STATES.LOW_ACCURACY)}
            disabled={loading}
            style={{
              padding: '8px 12px',
              background: vehicleState.gpsState === GPS_STATES.LOW_ACCURACY ? '#f39c12' : '#ecf0f1',
              color: vehicleState.gpsState === GPS_STATES.LOW_ACCURACY ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Low Accuracy
          </button>
          <button
            onClick={() => handleUpdateGpsState(GPS_STATES.DENIED)}
            disabled={loading}
            style={{
              padding: '8px 12px',
              background: vehicleState.gpsState === GPS_STATES.DENIED ? '#e74c3c' : '#ecf0f1',
              color: vehicleState.gpsState === GPS_STATES.DENIED ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Denied
          </button>
        </div>

        <button
          onClick={handleToggleOfflineMode}
          disabled={loading}
          style={{
            padding: '8px 12px',
            background: vehicleState.offlineMode ? '#e67e22' : '#95a5a6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {vehicleState.offlineMode ? '🔴 Offline Mode ON' : '⚪ Offline Mode OFF'}
        </button>
      </div>

      {/* Fleet Health Section */}
      {fleetHealth && (
        <div
          style={{
            padding: '16px',
            backgroundColor: 'white',
            borderRadius: '6px',
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#333' }}>
            Fleet Health
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            <div style={{ padding: '12px', backgroundColor: '#ecf0f1', borderRadius: '4px' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
                Total Bins
              </p>
              <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold', color: '#333' }}>
                {fleetHealth.totalBins}
              </p>
            </div>

            <div
              style={{
                padding: '12px',
                backgroundColor: '#fadbd8',
                borderRadius: '4px',
              }}
            >
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
                Critical
              </p>
              <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold', color: '#c0392b' }}>
                {fleetHealth.criticalBins}
              </p>
            </div>

            <div
              style={{
                padding: '12px',
                backgroundColor: '#fdebd0',
                borderRadius: '4px',
              }}
            >
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
                Warning
              </p>
              <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold', color: '#d35400' }}>
                {fleetHealth.warningBins}
              </p>
            </div>

            <div
              style={{
                padding: '12px',
                backgroundColor: '#e5e7eb',
                borderRadius: '4px',
              }}
            >
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
                Offline Sensors
              </p>
              <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold', color: '#6b7280' }}>
                {fleetHealth.offlineSensors}
              </p>
            </div>
          </div>

          <div
            style={{
              padding: '10px 12px',
              backgroundColor: '#ecf0f1',
              borderRadius: '4px',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: '0', fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
              Overall Health: <span style={{ color: gpsColor }}>{fleetHealth.overallHealth.toUpperCase()}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default VehicleOpsPanel;
