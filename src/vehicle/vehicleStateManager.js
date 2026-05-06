/**
 * Vehicle Operations State Manager
 * Tracks truck operational state, GPS status, and fallback modes
 * Persists state to Firestore for session recovery
 */

import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config.js';

export const VEHICLE_STATES = {
  IDLE: 'idle',
  EN_ROUTE: 'en-route',
  COLLECTING: 'collecting',
  PAUSED: 'paused',
  RETURNING: 'returning',
  OFFLINE: 'offline',
};

export const GPS_STATES = {
  OK: 'ok',
  LOW_ACCURACY: 'low-accuracy',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
};

const VEHICLE_STATE_DOC_ID = 'current';

export class VehicleStateManager {
  constructor(firebaseDb = db, vehicleId = 'truck-1') {
    this.db = firebaseDb;
    this.vehicleId = vehicleId;
    this.currentState = VEHICLE_STATES.IDLE;
    this.gpsState = GPS_STATES.OK;
    this.lastKnownPosition = null;
    this.gpsAccuracy = null;
    this.lastStateChangeAt = Date.now();
    this.offlineMode = false;
  }

  /**
   * Update vehicle state and persist to Firestore
   */
  async setState(newState) {
    if (!Object.values(VEHICLE_STATES).includes(newState)) {
      throw new Error(`Invalid state: ${newState}`);
    }

    const previousState = this.currentState;
    this.currentState = newState;
    this.lastStateChangeAt = Date.now();

    try {
      await setDoc(
        doc(this.db, 'vehicles', this.vehicleId, 'state', VEHICLE_STATE_DOC_ID),
        {
          state: newState,
          previousState,
          changedAt: Timestamp.fromDate(new Date()),
          gpsState: this.gpsState,
          lastKnownPosition: this.lastKnownPosition,
          gpsAccuracy: this.gpsAccuracy,
          offlineMode: this.offlineMode,
        },
        { merge: true }
      );
    } catch (error) {
      console.error('[v0] Failed to persist vehicle state:', error);
      // Fallback: keep local state even if Firestore fails
    }
  }

  /**
   * Update GPS state and position
   */
  async setGpsState(gpsState, position = null, accuracy = null) {
    if (!Object.values(GPS_STATES).includes(gpsState)) {
      throw new Error(`Invalid GPS state: ${gpsState}`);
    }

    this.gpsState = gpsState;
    if (position) {
      this.lastKnownPosition = position;
    }
    if (accuracy !== null) {
      this.gpsAccuracy = accuracy;
    }

    try {
      await setDoc(
        doc(this.db, 'vehicles', this.vehicleId, 'state', VEHICLE_STATE_DOC_ID),
        {
          gpsState,
          lastKnownPosition: position,
          gpsAccuracy: accuracy,
          gpsUpdatedAt: Timestamp.fromDate(new Date()),
        },
        { merge: true }
      );
    } catch (error) {
      console.error('[v0] Failed to persist GPS state:', error);
    }
  }

  /**
   * Enable offline mode (for location denied or connectivity issues)
   */
  async setOfflineMode(enabled, reason = null) {
    this.offlineMode = enabled;
    if (enabled) {
      this.gpsState = GPS_STATES.DENIED;
    }

    try {
      await setDoc(
        doc(this.db, 'vehicles', this.vehicleId, 'state', VEHICLE_STATE_DOC_ID),
        {
          offlineMode: enabled,
          offlineModeReason: reason,
          offlineModeStartedAt: enabled ? Timestamp.fromDate(new Date()) : null,
        },
        { merge: true }
      );
    } catch (error) {
      console.error('[v0] Failed to persist offline mode:', error);
    }
  }

  /**
   * Load state from Firestore (for session recovery)
   */
  async loadState() {
    try {
      const docRef = doc(this.db, 'vehicles', this.vehicleId, 'state', VEHICLE_STATE_DOC_ID);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        this.currentState = data.state || VEHICLE_STATES.IDLE;
        this.gpsState = data.gpsState || GPS_STATES.OK;
        this.lastKnownPosition = data.lastKnownPosition || null;
        this.gpsAccuracy = data.gpsAccuracy || null;
        this.offlineMode = data.offlineMode || false;
        this.lastStateChangeAt = data.changedAt?.toMillis?.() || Date.now();
      }
    } catch (error) {
      console.error('[v0] Failed to load vehicle state:', error);
    }
  }

  /**
   * Get current state summary
   */
  getState() {
    return {
      vehicleState: this.currentState,
      gpsState: this.gpsState,
      lastKnownPosition: this.lastKnownPosition,
      gpsAccuracy: this.gpsAccuracy,
      offlineMode: this.offlineMode,
      lastStateChangeAt: this.lastStateChangeAt,
    };
  }

  /**
   * Check if vehicle can perform operations based on current state
   */
  canStartRoute() {
    return (
      this.currentState === VEHICLE_STATES.IDLE ||
      this.currentState === VEHICLE_STATES.PAUSED ||
      this.currentState === VEHICLE_STATES.RETURNING
    );
  }

  canCollect() {
    return (
      this.gpsState === GPS_STATES.OK ||
      this.gpsState === GPS_STATES.LOW_ACCURACY ||
      this.offlineMode
    );
  }
}

export default VehicleStateManager;
