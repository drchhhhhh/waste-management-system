/**
 * Route Optimizer - Weighted scoring for intelligent pre-route optimization
 * Considers fill urgency, distance, stale bins, and priority flags
 */

import { CONFIG } from '../config/settings.js';
import TelemetryAdapter from '../telemetry/telemetryAdapter.js';

export class RouteOptimizer {
  constructor() {
    this.weights = {
      fillLevel: 0.4,        // How full the bin is
      stale: 0.2,            // Data freshness
      priority: 0.15,        // User-marked priority
      distance: 0.15,        // Distance from previous stop
      lastCollection: 0.1,   // Time since last collection
    };
  }

  /**
   * Set custom weight values
   */
  setWeights(newWeights) {
    Object.assign(this.weights, newWeights);
  }

  /**
   * Optimize a route given a list of normalized bins
   * Returns array of bins sorted by collection priority
   */
  optimizeRoute(normalizedBins, startPosition = null) {
    if (!Array.isArray(normalizedBins) || normalizedBins.length === 0) {
      return [];
    }

    // Calculate scores for each bin
    const binsWithScores = normalizedBins.map(bin => {
      const score = this._calculateScore(bin, startPosition);
      return {
        ...bin,
        optimizationScore: score,
      };
    });

    // Sort by score (descending - highest priority first)
    return binsWithScores.sort((a, b) => b.optimizationScore - a.optimizationScore);
  }

  /**
   * Calculate optimization score for a single bin
   * @private
   */
  _calculateScore(bin, startPosition) {
    let score = 0;

    // Fill level component (0-1, max 0.4)
    const fillComponent = Math.min(bin.fillLevel / 100, 1) * this.weights.fillLevel;
    score += fillComponent;

    // Staleness component (0-1, max 0.2)
    const staleComponent = (bin.isStale ? 1 : Math.max(0, 1 - bin.dataAgeMinutes / 30)) * this.weights.stale;
    score += staleComponent;

    // Priority flag component (0-1, max 0.15)
    const priorityComponent = (bin.isPriority ? 1 : 0) * this.weights.priority;
    score += priorityComponent;

    // Distance component (0-1, max 0.15) - inverted (closer is better)
    const distanceComponent = startPosition && bin.estimatedDistance
      ? Math.max(0, 1 - (bin.estimatedDistance / 100)) * this.weights.distance
      : 0;
    score += distanceComponent;

    // Last collection component (0-1, max 0.1)
    const timeSinceCollection = bin.lastCollectionAttemptAt
      ? Math.min((Date.now() - bin.lastCollectionAttemptAt) / (24 * 60 * 60 * 1000), 1)
      : 0;
    const collectionComponent = timeSinceCollection * this.weights.lastCollection;
    score += collectionComponent;

    return score;
  }

  /**
   * Get the next optimal stop from current position
   */
  getNextOptimalStop(normalizedBins, currentPosition) {
    if (!currentPosition) {
      return this.optimizeRoute(normalizedBins)[0] || null;
    }

    const optimized = this.optimizeRoute(normalizedBins, currentPosition);
    return optimized[0] || null;
  }

  /**
   * Create a full optimized route with estimated distances
   */
  planRoute(normalizedBins, startPosition = null, maxStops = null) {
    const maxStopsToUse = maxStops || CONFIG.ROUTE_OPTIMIZATION.MAX_STOPS_PER_ROUTE;
    const optimized = this.optimizeRoute(normalizedBins, startPosition);
    
    // Take top N stops
    const selectedStops = optimized.slice(0, maxStopsToUse);

    // Calculate estimated distances between stops
    let totalDistance = 0;
    let totalDuration = 0; // Rough estimate: 2 minutes per collection + travel time
    const routeWithDistances = selectedStops.map((bin, index) => {
      const estimatedDistance = bin.estimatedDistance || 0.5; // km
      const estimatedDuration = 2 + estimatedDistance * 2; // minutes
      
      totalDistance += estimatedDistance;
      totalDuration += estimatedDuration;

      return {
        binId: bin.binId,
        zone: bin.zone,
        order: index,
        estimatedDistance,
        estimatedDuration,
        score: bin.optimizationScore,
      };
    });

    return {
      stops: routeWithDistances,
      totalEstimatedDistanceKm: parseFloat(totalDistance.toFixed(2)),
      totalEstimatedDurationMin: Math.ceil(totalDuration),
      binCount: routeWithDistances.length,
    };
  }

  /**
   * Compare two route plans and return metrics
   */
  compareRoutes(route1, route2) {
    return {
      distanceDifference: route1.totalEstimatedDistanceKm - route2.totalEstimatedDistanceKm,
      durationDifference: route1.totalEstimatedDurationMin - route2.totalEstimatedDurationMin,
      stopCountDifference: route1.binCount - route2.binCount,
      isBetter: route1.totalEstimatedDistanceKm < route2.totalEstimatedDistanceKm &&
                route1.totalEstimatedDurationMin < route2.totalEstimatedDurationMin,
    };
  }

  /**
   * Get performance metrics on the optimizer
   */
  getMetrics() {
    return {
      weights: { ...this.weights },
      sumOfWeights: Object.values(this.weights).reduce((a, b) => a + b, 0),
    };
  }
}

export default RouteOptimizer;
