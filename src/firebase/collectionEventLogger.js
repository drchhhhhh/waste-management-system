/**
 * Collection Event Logger - Immutable event-sourced collection history
 * Creates permanent records of every collection action with pre-collection state
 */

import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config.js';

export const COLLECTION_RESULTS = {
  SUCCESS: 'success',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

export class CollectionEventLogger {
  constructor(firebaseDb = db) {
    this.db = firebaseDb;
  }

  /**
   * Log a collection event
   * Captures pre-collection state, sensor readings, and outcome
   */
  async logCollectionEvent(eventData) {
    const {
      routeSessionId,
      binId,
      zone,
      collectorLocation,
      previousFillLevel,
      previousStatus,
      collectionResult,
      notes = null,
    } = eventData;

    if (!binId || !routeSessionId) {
      throw new Error('binId and routeSessionId are required');
    }

    if (!Object.values(COLLECTION_RESULTS).includes(collectionResult)) {
      throw new Error(`Invalid collection result: ${collectionResult}`);
    }

    const event = {
      routeSessionId,
      binId,
      zone,
      collectedAt: Timestamp.fromDate(new Date()),
      collectedFillLevelBeforeReset: previousFillLevel || 0,
      collectorLocation: collectorLocation || null,
      previousStatus: previousStatus || 'unknown',
      collectionResult,
      notes,
      createdAt: Timestamp.fromDate(new Date()),
    };

    try {
      const docRef = await addDoc(
        collection(this.db, 'collectionEvents'),
        event
      );

      console.log('[v0] Collection event logged:', docRef.id);
      return {
        eventId: docRef.id,
        ...event,
      };
    } catch (error) {
      console.error('[v0] Failed to log collection event:', error);
      throw error;
    }
  }

  /**
   * Get all collection events for a session
   */
  async getSessionEvents(routeSessionId) {
    try {
      const q = query(
        collection(this.db, 'collectionEvents'),
        where('routeSessionId', '==', routeSessionId),
        orderBy('collectedAt', 'asc')
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        eventId: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('[v0] Failed to get session events:', error);
      return [];
    }
  }

  /**
   * Get all collection events for a specific bin
   */
  async getBinHistory(binId, limit = 50) {
    try {
      const q = query(
        collection(this.db, 'collectionEvents'),
        where('binId', '==', binId),
        orderBy('collectedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const events = querySnapshot.docs.map(doc => ({
        eventId: doc.id,
        ...doc.data(),
      }));

      return events.slice(0, limit);
    } catch (error) {
      console.error('[v0] Failed to get bin history:', error);
      return [];
    }
  }

  /**
   * Get collection statistics for a time period
   */
  async getCollectionStats(startDate, endDate) {
    try {
      const q = query(
        collection(this.db, 'collectionEvents'),
        where('collectedAt', '>=', Timestamp.fromDate(startDate)),
        where('collectedAt', '<=', Timestamp.fromDate(endDate)),
        orderBy('collectedAt', 'asc')
      );

      const querySnapshot = await getDocs(q);
      const events = querySnapshot.docs.map(doc => doc.data());

      const stats = {
        totalCollections: events.length,
        successfulCollections: events.filter(e => e.collectionResult === COLLECTION_RESULTS.SUCCESS).length,
        failedCollections: events.filter(e => e.collectionResult === COLLECTION_RESULTS.FAILED).length,
        skippedCollections: events.filter(e => e.collectionResult === COLLECTION_RESULTS.SKIPPED).length,
        averageFillLevel: events.length > 0
          ? events.reduce((sum, e) => sum + (e.collectedFillLevelBeforeReset || 0), 0) / events.length
          : 0,
      };

      return stats;
    } catch (error) {
      console.error('[v0] Failed to get collection stats:', error);
      return {};
    }
  }

  /**
   * Get collection success rate
   */
  async getSuccessRate(startDate, endDate) {
    const stats = await this.getCollectionStats(startDate, endDate);
    if (stats.totalCollections === 0) return null;

    return (stats.successfulCollections / stats.totalCollections) * 100;
  }
}

export default CollectionEventLogger;
