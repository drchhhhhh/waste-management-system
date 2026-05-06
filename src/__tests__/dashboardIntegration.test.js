/**
 * Integration Tests for DashboardIntegration
 * Verifies compatibility with existing features and new modules
 */

import { DashboardIntegration } from '../integration/dashboardIntegration';

describe('DashboardIntegration', () => {
  let integration;

  beforeEach(() => {
    integration = new DashboardIntegration();
  });

  describe('Initialization', () => {
    test('should initialize without errors', async () => {
      await expect(integration.initialize()).resolves.not.toThrow();
    });

    test('should have all modules after initialization', async () => {
      await integration.initialize();
      expect(integration.routeSessionManager).toBeDefined();
      expect(integration.collectionEventLogger).toBeDefined();
      expect(integration.telemetryAdapter).toBeDefined();
      expect(integration.vehicleStateManager).toBeDefined();
      expect(integration.routeOptimizer).toBeDefined();
      expect(integration.alertCenter).toBeDefined();
    });
  });

  describe('Telemetry Processing', () => {
    test('should process bins with telemetry data', async () => {
      await integration.initialize();

      const mockBins = [
        {
          binId: 'BIN-001',
          fillLevel: 75,
          status: 'warning',
          lat: 13.7565,
          lng: 121.0583,
        },
      ];

      const processed = integration.processBinsWithTelemetry(mockBins);
      expect(processed).toHaveLength(1);
      expect(processed[0].binId).toBe('BIN-001');
      expect(processed[0].sourceMode).toBeDefined();
      expect(processed[0].sensorHealth).toBeDefined();
    });

    test('should detect stale sensors', async () => {
      await integration.initialize();

      const oldTimestamp = new Date(Date.now() - 35 * 60 * 1000); // 35 minutes ago
      const mockBins = [
        {
          binId: 'BIN-STALE',
          fillLevel: 50,
          lastSeenAt: oldTimestamp.toISOString(),
        },
      ];

      const processed = integration.processBinsWithTelemetry(mockBins);
      expect(processed[0].isStale).toBe(true);
    });
  });

  describe('Route Session Management', () => {
    test('should create a new route session', async () => {
      await integration.initialize();

      const mockRoute = [
        { binId: 'BIN-001', lat: 13.7565, lng: 121.0583, distanceFromPrev: 100 },
        { binId: 'BIN-002', lat: 13.7570, lng: 121.0590, distanceFromPrev: 150 },
      ];

      const session = await integration.startRouteSession(mockRoute);
      expect(session).toBeDefined();
      expect(session.plannedStops).toHaveLength(2);
      expect(session.status).toBe('active');
    });

    test('should track completed stops', async () => {
      await integration.initialize();

      const mockRoute = [
        { binId: 'BIN-001', distanceFromPrev: 100 },
        { binId: 'BIN-002', distanceFromPrev: 150 },
      ];

      const session = await integration.startRouteSession(mockRoute);
      const mockBins = [
        { binId: 'BIN-001', fillLevel: 75, status: 'warning' },
      ];

      await integration.collectBin('BIN-001', mockBins);
      expect(session.completedStopIds).toContain('BIN-001');
    });

    test('should pause and resume route', async () => {
      await integration.initialize();

      const mockRoute = [
        { binId: 'BIN-001', distanceFromPrev: 100 },
      ];

      await integration.startRouteSession(mockRoute);
      await integration.pauseRoute();
      expect(integration.currentRouteSession.status).toBe('paused');

      await integration.resumeRoute();
      expect(integration.currentRouteSession.status).toBe('active');
    });

    test('should complete route', async () => {
      await integration.initialize();

      const mockRoute = [
        { binId: 'BIN-001', distanceFromPrev: 100 },
      ];

      await integration.startRouteSession(mockRoute);
      await integration.completeRoute();
      expect(integration.currentRouteSession).toBeNull();
    });
  });

  describe('Collection Event Logging', () => {
    test('should log collection event with pre-collection state', async () => {
      await integration.initialize();

      const mockRoute = [{ binId: 'BIN-001', distanceFromPrev: 100 }];
      await integration.startRouteSession(mockRoute);

      const mockBins = [
        { binId: 'BIN-001', fillLevel: 85, status: 'critical' },
      ];

      const event = await integration.collectBin('BIN-001', mockBins);
      expect(event).toBeDefined();
      expect(event.collectedFillLevelBeforeReset).toBe(85);
      expect(event.previousStatus).toBe('critical');
      expect(event.collectionResult).toBe('success');
    });

    test('should skip bin with reason', async () => {
      await integration.initialize();

      const mockRoute = [{ binId: 'BIN-001', distanceFromPrev: 100 }];
      await integration.startRouteSession(mockRoute);

      const event = await integration.skipBin('BIN-001', 'equipment-failure');
      expect(event).toBeDefined();
      expect(event.collectionResult).toBe('skipped');
    });

    test('should retrieve collection history', async () => {
      await integration.initialize();

      const mockRoute = [
        { binId: 'BIN-001', distanceFromPrev: 100 },
        { binId: 'BIN-002', distanceFromPrev: 150 },
      ];

      const session = await integration.startRouteSession(mockRoute);

      const mockBins = [
        { binId: 'BIN-001', fillLevel: 75, status: 'warning' },
        { binId: 'BIN-002', fillLevel: 90, status: 'critical' },
      ];

      await integration.collectBin('BIN-001', mockBins);
      await integration.collectBin('BIN-002', mockBins);

      const history = await integration.getCollectionHistory(
        session.routeSessionId
      );
      expect(history).toHaveLength(2);
      expect(history[0].binId).toBe('BIN-001');
      expect(history[1].binId).toBe('BIN-002');
    });
  });

  describe('Route Optimization', () => {
    test('should return optimized route', async () => {
      await integration.initialize();

      const mockBins = [
        {
          binId: 'BIN-001',
          fillLevel: 85,
          lat: 13.7565,
          lng: 121.0583,
          distanceFromPrev: 100,
        },
        {
          binId: 'BIN-002',
          fillLevel: 95,
          lat: 13.7570,
          lng: 121.0590,
          distanceFromPrev: 150,
        },
      ];

      const optimized = integration.getOptimizedRoute(mockBins);
      expect(optimized).toHaveLength(2);
      expect(Array.isArray(optimized)).toBe(true);
    });
  });

  describe('Vehicle State Management', () => {
    test('should update vehicle position', async () => {
      await integration.initialize();

      const mockRoute = [{ binId: 'BIN-001', distanceFromPrev: 100 }];
      await integration.startRouteSession(mockRoute);

      const position = {
        lat: 13.7565,
        lng: 121.0583,
        accuracy: 10,
      };

      await expect(
        integration.updateVehiclePosition('truck-001', position)
      ).resolves.not.toThrow();
    });

    test('should get vehicle state', async () => {
      await integration.initialize();

      const state = await integration.getVehicleState('truck-001');
      expect(state).toBeDefined();
    });
  });

  describe('Alert System', () => {
    test('should emit alert', async () => {
      await integration.initialize();

      const alertCallback = jest.fn();
      integration.onAlert(alertCallback);

      integration.emitAlert('critical-bin', 'critical', {
        binId: 'BIN-001',
        fillLevel: 95,
      });

      expect(alertCallback).toHaveBeenCalled();
    });

    test('should check fleet health and emit alerts', async () => {
      await integration.initialize();

      const alertCallback = jest.fn();
      integration.onAlert(alertCallback);

      const oldTimestamp = new Date(Date.now() - 35 * 60 * 1000);
      const mockBins = [
        {
          binId: 'BIN-STALE',
          fillLevel: 50,
          status: 'normal',
          lastSeenAt: oldTimestamp.toISOString(),
        },
        {
          binId: 'BIN-CRITICAL',
          fillLevel: 95,
          status: 'critical',
          lastSeenAt: new Date().toISOString(),
        },
      ];

      integration.checkFleetHealth(mockBins);

      // Should emit alerts for both stale sensor and critical bin
      expect(alertCallback).toHaveBeenCalled();
    });
  });

  describe('Distance Calculation', () => {
    test('should calculate route distance', async () => {
      await integration.initialize();

      const mockRoute = [
        { binId: 'BIN-001', distanceFromPrev: 1000 },
        { binId: 'BIN-002', distanceFromPrev: 2000 },
        { binId: 'BIN-003', distanceFromPrev: 1500 },
      ];

      const distance = integration.calculateRouteDistance(mockRoute);
      // 1000 + 2000 + 1500 = 4500 meters = 4.5 km
      expect(distance).toBe(4.5);
    });
  });

  describe('Session Recovery', () => {
    test('should recover active session', async () => {
      await integration.initialize();

      const mockRoute = [{ binId: 'BIN-001', distanceFromPrev: 100 }];
      await integration.startRouteSession(mockRoute);

      // Simulate page refresh by creating new integration instance
      const newIntegration = new DashboardIntegration();
      await newIntegration.initialize();

      const recovered = await newIntegration.recoverActiveSession('truck-001');
      expect(recovered).toBeDefined();
      expect(recovered.status).toBe('active');
    });
  });

  describe('Subscription Methods', () => {
    test('should subscribe to session updates', async () => {
      await integration.initialize();

      const callback = jest.fn();
      const unsubscribe = integration.onSessionUpdate(callback);

      const mockRoute = [{ binId: 'BIN-001', distanceFromPrev: 100 }];
      await integration.startRouteSession(mockRoute);

      // Callback should be called when session changes
      expect(typeof unsubscribe).toBe('function');
    });

    test('should subscribe to alerts', async () => {
      await integration.initialize();

      const callback = jest.fn();
      const unsubscribe = integration.onAlert(callback);

      integration.emitAlert('info', 'info', { message: 'test' });

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('State Retrieval', () => {
    test('should get current session', async () => {
      await integration.initialize();

      let session = integration.getCurrentSession();
      expect(session).toBeNull();

      const mockRoute = [{ binId: 'BIN-001', distanceFromPrev: 100 }];
      await integration.startRouteSession(mockRoute);

      session = integration.getCurrentSession();
      expect(session).toBeDefined();
      expect(session.status).toBe('active');
    });
  });

  describe('Backward Compatibility', () => {
    test('should work with existing bin data structure', async () => {
      await integration.initialize();

      // Simulate existing bin structure from Firestore
      const existingBins = [
        {
          binId: 'BIN-001',
          lat: 13.7565,
          lng: 121.0583,
          zone: 'Zone 1',
          fillLevel: 75,
          status: 'warning',
          lastUpdated: new Date().toISOString(),
        },
        {
          binId: 'BIN-002',
          lat: 13.7570,
          lng: 121.0590,
          zone: 'Zone 2',
          fillLevel: 90,
          status: 'critical',
          lastUpdated: new Date().toISOString(),
        },
      ];

      // Should process without errors
      const processed = integration.processBinsWithTelemetry(existingBins);
      expect(processed).toHaveLength(2);
      expect(processed[0].binId).toBe('BIN-001');
      expect(processed[1].binId).toBe('BIN-002');
    });

    test('should maintain all original bin fields', async () => {
      await integration.initialize();

      const originalBin = {
        binId: 'BIN-001',
        lat: 13.7565,
        lng: 121.0583,
        zone: 'Zone 1',
        fillLevel: 75,
        status: 'warning',
        lastUpdated: new Date().toISOString(),
      };

      const processed = integration.processBinsWithTelemetry([originalBin]);
      const result = processed[0];

      // All original fields should be preserved
      expect(result.binId).toBe(originalBin.binId);
      expect(result.lat).toBe(originalBin.lat);
      expect(result.lng).toBe(originalBin.lng);
      expect(result.zone).toBe(originalBin.zone);
      expect(result.fillLevel).toBe(originalBin.fillLevel);
      expect(result.status).toBe(originalBin.status);
    });
  });
});
