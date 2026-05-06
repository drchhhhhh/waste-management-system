/**
 * Tests for Route Optimizer
 */

import RouteOptimizer from '../routing/routeOptimizer.js';

describe('RouteOptimizer', () => {
  let optimizer;

  beforeEach(() => {
    optimizer = new RouteOptimizer();
  });

  describe('optimizeRoute', () => {
    it('should return empty array for empty input', () => {
      const result = optimizer.optimizeRoute([]);
      expect(result).toEqual([]);
    });

    it('should sort bins by optimization score', () => {
      const bins = [
        {
          binId: 'bin-1',
          zone: 'A',
          fillLevel: 30,
          isStale: false,
          isPriority: false,
          dataAgeMinutes: 5,
        },
        {
          binId: 'bin-2',
          zone: 'B',
          fillLevel: 90,
          isStale: false,
          isPriority: false,
          dataAgeMinutes: 5,
        },
      ];

      const result = optimizer.optimizeRoute(bins);

      expect(result[0].binId).toBe('bin-2'); // Higher fill level = higher priority
      expect(result[0].optimizationScore).toBeGreaterThan(result[1].optimizationScore);
    });

    it('should prioritize critical bins', () => {
      const bins = [
        {
          binId: 'bin-1',
          zone: 'A',
          fillLevel: 50,
          isStale: false,
          isPriority: false,
          dataAgeMinutes: 5,
        },
        {
          binId: 'bin-2',
          zone: 'B',
          fillLevel: 95,
          isStale: false,
          isPriority: false,
          dataAgeMinutes: 5,
        },
        {
          binId: 'bin-3',
          zone: 'C',
          fillLevel: 75,
          isStale: false,
          isPriority: false,
          dataAgeMinutes: 5,
        },
      ];

      const result = optimizer.optimizeRoute(bins);

      expect(result[0].binId).toBe('bin-2'); // Critical bin first
      expect(result[1].binId).toBe('bin-3'); // Warning bin second
      expect(result[2].binId).toBe('bin-1'); // Normal bin last
    });

    it('should prioritize marked priority bins', () => {
      const bins = [
        {
          binId: 'bin-1',
          zone: 'A',
          fillLevel: 50,
          isStale: false,
          isPriority: true,
          dataAgeMinutes: 5,
        },
        {
          binId: 'bin-2',
          zone: 'B',
          fillLevel: 45,
          isStale: false,
          isPriority: false,
          dataAgeMinutes: 5,
        },
      ];

      const result = optimizer.optimizeRoute(bins);

      expect(result[0].binId).toBe('bin-1'); // Priority flag matters
    });

    it('should deprioritize stale bins', () => {
      const bins = [
        {
          binId: 'bin-1',
          zone: 'A',
          fillLevel: 50,
          isStale: true,
          isPriority: false,
          dataAgeMinutes: 35,
        },
        {
          binId: 'bin-2',
          zone: 'B',
          fillLevel: 60,
          isStale: false,
          isPriority: false,
          dataAgeMinutes: 5,
        },
      ];

      const result = optimizer.optimizeRoute(bins);

      expect(result[0].binId).toBe('bin-2'); // Fresh bin prioritized
    });
  });

  describe('planRoute', () => {
    it('should plan a route with distance estimates', () => {
      const bins = [
        {
          binId: 'bin-1',
          zone: 'A',
          fillLevel: 90,
          isStale: false,
          isPriority: false,
          dataAgeMinutes: 5,
          estimatedDistance: 0.5,
        },
        {
          binId: 'bin-2',
          zone: 'B',
          fillLevel: 75,
          isStale: false,
          isPriority: false,
          dataAgeMinutes: 5,
          estimatedDistance: 0.7,
        },
      ];

      const plan = optimizer.planRoute(bins);

      expect(plan.stops.length).toBe(2);
      expect(plan.totalEstimatedDistanceKm).toBeGreaterThan(0);
      expect(plan.totalEstimatedDurationMin).toBeGreaterThan(0);
      expect(plan.binCount).toBe(2);
    });

    it('should respect max stops limit', () => {
      const bins = Array.from({ length: 100 }, (_, i) => ({
        binId: `bin-${i}`,
        zone: 'A',
        fillLevel: 50,
        isStale: false,
        isPriority: false,
        dataAgeMinutes: 5,
        estimatedDistance: 0.5,
      }));

      const plan = optimizer.planRoute(bins, null, 10);

      expect(plan.stops.length).toBeLessThanOrEqual(10);
    });

    it('should calculate total distance and duration', () => {
      const bins = [
        {
          binId: 'bin-1',
          zone: 'A',
          fillLevel: 80,
          isStale: false,
          isPriority: false,
          dataAgeMinutes: 5,
          estimatedDistance: 1.0,
        },
        {
          binId: 'bin-2',
          zone: 'B',
          fillLevel: 70,
          isStale: false,
          isPriority: false,
          dataAgeMinutes: 5,
          estimatedDistance: 0.5,
        },
      ];

      const plan = optimizer.planRoute(bins);

      expect(plan.totalEstimatedDistanceKm).toBe(1.5);
      // Duration = 2 base + (1.0 * 2) + 2 base + (0.5 * 2) = 2 + 2 + 2 + 1 = 7 minutes
      expect(plan.totalEstimatedDurationMin).toBeGreaterThanOrEqual(7);
    });
  });

  describe('compareRoutes', () => {
    it('should compare two routes and identify better one', () => {
      const route1 = {
        totalEstimatedDistanceKm: 5.0,
        totalEstimatedDurationMin: 20,
        binCount: 10,
      };

      const route2 = {
        totalEstimatedDistanceKm: 8.0,
        totalEstimatedDurationMin: 30,
        binCount: 10,
      };

      const comparison = optimizer.compareRoutes(route1, route2);

      expect(comparison.isBetter).toBe(true);
      expect(comparison.distanceDifference).toBe(-3.0);
      expect(comparison.durationDifference).toBe(-10);
    });
  });

  describe('setWeights', () => {
    it('should allow custom weight configuration', () => {
      const customWeights = {
        fillLevel: 0.5,
        distance: 0.2,
      };

      optimizer.setWeights(customWeights);

      expect(optimizer.weights.fillLevel).toBe(0.5);
      expect(optimizer.weights.distance).toBe(0.2);
    });
  });
});
