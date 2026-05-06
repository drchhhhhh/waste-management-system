/**
 * Route Session Manager - Persists route plans and sessions to Firestore
 * Manages session state transitions and survives page refresh
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config.js';

export const ROUTE_SESSION_STATES = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export class RouteSessionManager {
  constructor(firebaseDb = db, vehicleId = 'truck-1') {
    this.db = firebaseDb;
    this.vehicleId = vehicleId;
    this.currentSessionId = null;
    this.currentSession = null;
  }

  /**
   * Create a new route session
   */
  async createSession(plannedStops, estimatedDistanceKm, estimatedDurationMin) {
    const sessionId = this._generateSessionId();
    const now = Timestamp.fromDate(new Date());

    const session = {
      routeSessionId: sessionId,
      vehicleId: this.vehicleId,
      plannedStops: plannedStops.map((stop, index) => ({
        binId: stop.binId,
        zone: stop.zone,
        order: index,
        estimatedDistance: stop.estimatedDistance,
      })),
      startedAt: null,
      endedAt: null,
      status: ROUTE_SESSION_STATES.DRAFT,
      completedStopIds: [],
      skippedStopIds: [],
      currentStopId: null,
      estimatedDistanceKm,
      estimatedDurationMin,
      lastKnownTruckPosition: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(
        doc(this.db, 'routeSessions', sessionId),
        session
      );
      this.currentSessionId = sessionId;
      this.currentSession = session;
      console.log('[v0] Route session created:', sessionId);
      return session;
    } catch (error) {
      console.error('[v0] Failed to create route session:', error);
      throw error;
    }
  }

  /**
   * Start the current session
   */
  async startSession(sessionId = this.currentSessionId) {
    if (!sessionId) throw new Error('No session to start');

    try {
      const sessionRef = doc(this.db, 'routeSessions', sessionId);
      const now = Timestamp.fromDate(new Date());

      await updateDoc(sessionRef, {
        status: ROUTE_SESSION_STATES.ACTIVE,
        startedAt: now,
        updatedAt: now,
      });

      if (this.currentSession) {
        this.currentSession.status = ROUTE_SESSION_STATES.ACTIVE;
        this.currentSession.startedAt = now;
        this.currentSession.updatedAt = now;
      }

      console.log('[v0] Route session started:', sessionId);
    } catch (error) {
      console.error('[v0] Failed to start route session:', error);
      throw error;
    }
  }

  /**
   * Mark a stop as collected
   */
  async completeStop(sessionId, binId) {
    if (!sessionId) throw new Error('No session');

    try {
      const sessionRef = doc(this.db, 'routeSessions', sessionId);
      const sessionSnap = await getDoc(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error('Session not found');
      }

      const sessionData = sessionSnap.data();
      const completedStops = sessionData.completedStopIds || [];

      // Add binId if not already there
      if (!completedStops.includes(binId)) {
        completedStops.push(binId);
      }

      // Determine next stop
      const nextStop = sessionData.plannedStops.find(
        stop => !completedStops.includes(stop.binId) && 
               !sessionData.skippedStopIds.some(s => s.binId === stop.binId)
      );

      await updateDoc(sessionRef, {
        completedStopIds: completedStops,
        currentStopId: nextStop?.binId || null,
        updatedAt: Timestamp.fromDate(new Date()),
      });

      if (this.currentSession?.routeSessionId === sessionId) {
        this.currentSession.completedStopIds = completedStops;
        this.currentSession.currentStopId = nextStop?.binId || null;
      }

      console.log('[v0] Stop completed:', binId);
    } catch (error) {
      console.error('[v0] Failed to complete stop:', error);
      throw error;
    }
  }

  /**
   * Skip a stop with reason
   */
  async skipStop(sessionId, binId, reason = 'User skip') {
    if (!sessionId) throw new Error('No session');

    try {
      const sessionRef = doc(this.db, 'routeSessions', sessionId);
      const sessionSnap = await getDoc(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error('Session not found');
      }

      const sessionData = sessionSnap.data();
      const skippedStops = sessionData.skippedStopIds || [];

      // Add skip record if not already there
      if (!skippedStops.some(s => s.binId === binId)) {
        skippedStops.push({
          binId,
          reason,
          skippedAt: Timestamp.fromDate(new Date()),
        });
      }

      // Determine next stop
      const nextStop = sessionData.plannedStops.find(
        stop => !sessionData.completedStopIds.includes(stop.binId) && 
               !skippedStops.some(s => s.binId === stop.binId)
      );

      await updateDoc(sessionRef, {
        skippedStopIds: skippedStops,
        currentStopId: nextStop?.binId || null,
        updatedAt: Timestamp.fromDate(new Date()),
      });

      if (this.currentSession?.routeSessionId === sessionId) {
        this.currentSession.skippedStopIds = skippedStops;
        this.currentSession.currentStopId = nextStop?.binId || null;
      }

      console.log('[v0] Stop skipped:', binId, reason);
    } catch (error) {
      console.error('[v0] Failed to skip stop:', error);
      throw error;
    }
  }

  /**
   * Pause the session
   */
  async pauseSession(sessionId = this.currentSessionId) {
    if (!sessionId) throw new Error('No session to pause');

    try {
      const sessionRef = doc(this.db, 'routeSessions', sessionId);

      await updateDoc(sessionRef, {
        status: ROUTE_SESSION_STATES.PAUSED,
        updatedAt: Timestamp.fromDate(new Date()),
      });

      if (this.currentSession?.routeSessionId === sessionId) {
        this.currentSession.status = ROUTE_SESSION_STATES.PAUSED;
      }

      console.log('[v0] Route session paused:', sessionId);
    } catch (error) {
      console.error('[v0] Failed to pause route session:', error);
      throw error;
    }
  }

  /**
   * Resume a paused session
   */
  async resumeSession(sessionId = this.currentSessionId) {
    if (!sessionId) throw new Error('No session to resume');

    try {
      const sessionRef = doc(this.db, 'routeSessions', sessionId);

      await updateDoc(sessionRef, {
        status: ROUTE_SESSION_STATES.ACTIVE,
        updatedAt: Timestamp.fromDate(new Date()),
      });

      if (this.currentSession?.routeSessionId === sessionId) {
        this.currentSession.status = ROUTE_SESSION_STATES.ACTIVE;
      }

      console.log('[v0] Route session resumed:', sessionId);
    } catch (error) {
      console.error('[v0] Failed to resume route session:', error);
      throw error;
    }
  }

  /**
   * Complete the session
   */
  async completeSession(sessionId = this.currentSessionId) {
    if (!sessionId) throw new Error('No session to complete');

    try {
      const sessionRef = doc(this.db, 'routeSessions', sessionId);

      await updateDoc(sessionRef, {
        status: ROUTE_SESSION_STATES.COMPLETED,
        endedAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      if (this.currentSession?.routeSessionId === sessionId) {
        this.currentSession.status = ROUTE_SESSION_STATES.COMPLETED;
      }

      console.log('[v0] Route session completed:', sessionId);
    } catch (error) {
      console.error('[v0] Failed to complete route session:', error);
      throw error;
    }
  }

  /**
   * Load the most recent session (for recovery on page refresh)
   */
  async loadLatestSession() {
    try {
      const q = query(
        collection(this.db, 'routeSessions'),
        where('vehicleId', '==', this.vehicleId),
        where('status', 'in', [ROUTE_SESSION_STATES.ACTIVE, ROUTE_SESSION_STATES.PAUSED]),
        orderBy('createdAt', 'desc'),
        limit(1)
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        this.currentSession = doc.data();
        this.currentSessionId = this.currentSession.routeSessionId;
        console.log('[v0] Loaded session:', this.currentSessionId);
        return this.currentSession;
      }

      return null;
    } catch (error) {
      console.error('[v0] Failed to load latest session:', error);
      return null;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    try {
      const sessionSnap = await getDoc(
        doc(this.db, 'routeSessions', sessionId)
      );

      if (sessionSnap.exists()) {
        return sessionSnap.data();
      }

      return null;
    } catch (error) {
      console.error('[v0] Failed to get session:', error);
      return null;
    }
  }

  /**
   * Update truck location in current session
   */
  async updateTruckPosition(lat, lng, accuracy) {
    if (!this.currentSessionId) return;

    try {
      const sessionRef = doc(this.db, 'routeSessions', this.currentSessionId);

      await updateDoc(sessionRef, {
        lastKnownTruckPosition: {
          lat,
          lng,
          accuracy,
          timestamp: Timestamp.fromDate(new Date()),
        },
      });

      if (this.currentSession) {
        this.currentSession.lastKnownTruckPosition = {
          lat,
          lng,
          accuracy,
          timestamp: Timestamp.fromDate(new Date()),
        };
      }
    } catch (error) {
      console.error('[v0] Failed to update truck position:', error);
    }
  }

  /**
   * Get current session info
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * @private
   */
  _generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default RouteSessionManager;
