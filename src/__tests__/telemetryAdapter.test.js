/**
 * Tests for Telemetry Adapter
 */

import TelemetryAdapter from '../telemetry/telemetryAdapter.js';

describe('TelemetryAdapter', () => {
  describe('normalizeBin', () => {
    it('should normalize a fresh bin correctly', () => {
      const now = Date.now();
      const bin = {
        binId: 'bin-1',
        zone: 'Zone A',
        fillLevel: 45,
        lastSeenAt: now,
        isPriority: false,
      };

      const normalized = TelemetryAdapter.normalizeBin(bin, 'simulator');

      expect(normalized.binId).toBe('bin-1');
      expect(normalized.fillLevel).toBe(45);
      expect(normalized.sourceMode).toBe('simulator');
      expect(normalized.sensorHealth).toBe('ok');
      expect(normalized.status).toBe('normal');
      expect(normalized.isStale).toBe(false);
    });

    it('should mark bins with high fill as critical', () => {
      const now = Date.now();
      const bin = {
        binId: 'bin-2',
        zone: 'Zone B',
        fillLevel: 95,
        lastSeenAt: now,
      };

      const normalized = TelemetryAdapter.normalizeBin(bin);

      expect(normalized.status).toBe('critical');
    });

    it('should mark bins with warning fill level as warning', () => {
      const now = Date.now();
      const bin = {
        binId: 'bin-3',
        zone: 'Zone C',
        fillLevel: 75,
        lastSeenAt: now,
      };

      const normalized = TelemetryAdapter.normalizeBin(bin);

      expect(normalized.status).toBe('warning');
    });

    it('should mark old bins as stale', () => {
      const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
      const bin = {
        binId: 'bin-4',
        zone: 'Zone D',
        fillLevel: 50,
        lastSeenAt: thirtyOneMinutesAgo,
      };

      const normalized = TelemetryAdapter.normalizeBin(bin);

      expect(normalized.isStale).toBe(true);
      expect(normalized.sensorHealth).toBe('offline');
    });

    it('should compute priority correctly', () => {
      const now = Date.now();
      
      const critical = TelemetryAdapter.normalizeBin({
        binId: 'bin-5',
        fillLevel: 95,
        lastSeenAt: now,
        isPriority: true,
      });

      expect(critical.collectionPriority).toBeGreaterThan(0.5);

      const normal = TelemetryAdapter.normalizeBin({
        binId: 'bin-6',
        fillLevel: 20,
        lastSeenAt: now,
        isPriority: false,
      });

      expect(normal.collectionPriority).toBeLessThan(critical.collectionPriority);
    });
  });

  describe('checkFleetHealth', () => {
    it('should summarize fleet health correctly', () => {
      const now = Date.now();
      const bins = [
        TelemetryAdapter.normalizeBin({
          binId: 'bin-1',
          fillLevel: 95,
          lastSeenAt: now,
        }),
        TelemetryAdapter.normalizeBin({
          binId: 'bin-2',
          fillLevel: 75,
          lastSeenAt: now,
        }),
        TelemetryAdapter.normalizeBin({
          binId: 'bin-3',
          fillLevel: 30,
          lastSeenAt: now,
        }),
      ];

      const health = TelemetryAdapter.checkFleetHealth(bins);

      expect(health.totalBins).toBe(3);
      expect(health.criticalBins).toBe(1);
      expect(health.warningBins).toBe(1);
    });

    it('should detect offline sensors', () => {
      const now = Date.now();
      const thirtyOneMinutesAgo = now - 31 * 60 * 1000;

      const bins = [
        TelemetryAdapter.normalizeBin({
          binId: 'bin-1',
          fillLevel: 50,
          lastSeenAt: now,
        }),
        TelemetryAdapter.normalizeBin({
          binId: 'bin-2',
          fillLevel: 40,
          lastSeenAt: thirtyOneMinutesAgo,
        }),
      ];

      const health = TelemetryAdapter.checkFleetHealth(bins);

      expect(health.offlineSensors).toBe(1);
      expect(health.overallHealth).toBe('critical');
    });
  });

  describe('getBinsNeedingCollection', () => {
    it('should return critical and warning bins only', () => {
      const now = Date.now();
      const bins = [
        TelemetryAdapter.normalizeBin({
          binId: 'bin-1',
          fillLevel: 95,
          lastSeenAt: now,
        }),
        TelemetryAdapter.normalizeBin({
          binId: 'bin-2',
          fillLevel: 75,
          lastSeenAt: now,
        }),
        TelemetryAdapter.normalizeBin({
          binId: 'bin-3',
          fillLevel: 20,
          lastSeenAt: now,
        }),
      ];

      const needed = TelemetryAdapter.getBinsNeedingCollection(bins);

      expect(needed.length).toBe(2);
      expect(needed[0].binId).toBe('bin-1'); // Critical has highest priority
    });

    it('should sort by priority', () => {
      const now = Date.now();
      const bins = [
        TelemetryAdapter.normalizeBin({
          binId: 'bin-1',
          fillLevel: 85,
          lastSeenAt: now,
          isPriority: false,
        }),
        TelemetryAdapter.normalizeBin({
          binId: 'bin-2',
          fillLevel: 75,
          lastSeenAt: now,
          isPriority: true,
        }),
      ];

      const needed = TelemetryAdapter.getBinsNeedingCollection(bins);

      expect(needed[0].binId).toBe('bin-2'); // Priority bin first
    });
  });
});
