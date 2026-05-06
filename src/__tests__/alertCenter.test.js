/**
 * Tests for Alert Center
 */

import AlertCenter, { ALERT_TYPES, ALERT_SEVERITY } from '../alerts/alertCenter.js';

describe('AlertCenter', () => {
  let alertCenter;

  beforeEach(() => {
    alertCenter = new AlertCenter();
  });

  describe('emit', () => {
    it('should emit an alert', () => {
      const alertId = alertCenter.emit(
        ALERT_TYPES.CRITICAL_BIN,
        'Bin is critical',
        ALERT_SEVERITY.CRITICAL
      );

      expect(alertId).toBeDefined();
      expect(alertCenter.getAll().length).toBe(1);
    });

    it('should auto-dismiss info alerts after 5 seconds', (done) => {
      alertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        'Info message',
        ALERT_SEVERITY.INFO
      );

      expect(alertCenter.getAll().length).toBe(1);

      setTimeout(() => {
        expect(alertCenter.getAll().length).toBe(0);
        done();
      }, 5100);
    });

    it('should not auto-dismiss critical or warning alerts', () => {
      alertCenter.emit(
        ALERT_TYPES.CRITICAL_BIN,
        'Critical message',
        ALERT_SEVERITY.CRITICAL
      );

      setTimeout(() => {
        expect(alertCenter.getAll().length).toBe(1);
      }, 5100);
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers on alert changes', (done) => {
      let callCount = 0;

      alertCenter.subscribe(() => {
        callCount++;
      });

      alertCenter.emit(ALERT_TYPES.CRITICAL_BIN, 'Test', ALERT_SEVERITY.CRITICAL);

      setTimeout(() => {
        expect(callCount).toBeGreaterThan(0);
        done();
      }, 100);
    });

    it('should unsubscribe when returned function is called', () => {
      let callCount = 0;

      const unsubscribe = alertCenter.subscribe(() => {
        callCount++;
      });

      alertCenter.emit(ALERT_TYPES.CRITICAL_BIN, 'Test', ALERT_SEVERITY.CRITICAL);
      unsubscribe();

      const initialCount = callCount;
      alertCenter.emit(ALERT_TYPES.CRITICAL_BIN, 'Test 2', ALERT_SEVERITY.CRITICAL);

      expect(callCount).toBe(initialCount);
    });
  });

  describe('dismiss', () => {
    it('should dismiss an alert', () => {
      const alertId = alertCenter.emit(
        ALERT_TYPES.CRITICAL_BIN,
        'Test',
        ALERT_SEVERITY.CRITICAL
      );

      expect(alertCenter.getAll().length).toBe(1);

      alertCenter.dismiss(alertId);

      expect(alertCenter.getAll().length).toBe(0);
    });
  });

  describe('dismissAllOfType', () => {
    it('should dismiss all alerts of a specific type', () => {
      alertCenter.emit(ALERT_TYPES.CRITICAL_BIN, 'Critical 1', ALERT_SEVERITY.CRITICAL);
      alertCenter.emit(ALERT_TYPES.CRITICAL_BIN, 'Critical 2', ALERT_SEVERITY.CRITICAL);
      alertCenter.emit(ALERT_TYPES.GPS_DENIED, 'GPS issue', ALERT_SEVERITY.WARNING);

      expect(alertCenter.getAll().length).toBe(3);

      alertCenter.dismissAllOfType(ALERT_TYPES.CRITICAL_BIN);

      expect(alertCenter.getAll().length).toBe(1);
      expect(alertCenter.getAll()[0].type).toBe(ALERT_TYPES.GPS_DENIED);
    });
  });

  describe('getByType', () => {
    it('should filter alerts by type', () => {
      alertCenter.emit(ALERT_TYPES.CRITICAL_BIN, 'Critical', ALERT_SEVERITY.CRITICAL);
      alertCenter.emit(ALERT_TYPES.GPS_DENIED, 'GPS issue', ALERT_SEVERITY.WARNING);

      const criticalAlerts = alertCenter.getByType(ALERT_TYPES.CRITICAL_BIN);

      expect(criticalAlerts.length).toBe(1);
      expect(criticalAlerts[0].type).toBe(ALERT_TYPES.CRITICAL_BIN);
    });
  });

  describe('getBySeverity', () => {
    it('should filter alerts by severity', () => {
      alertCenter.emit(ALERT_TYPES.CRITICAL_BIN, 'Critical', ALERT_SEVERITY.CRITICAL);
      alertCenter.emit(ALERT_TYPES.GPS_DENIED, 'Warning', ALERT_SEVERITY.WARNING);
      alertCenter.emit(ALERT_TYPES.API_FAILURE, 'Info', ALERT_SEVERITY.INFO);

      const criticalAlerts = alertCenter.getBySeverity(ALERT_SEVERITY.CRITICAL);

      expect(criticalAlerts.length).toBe(1);
      expect(criticalAlerts[0].severity).toBe(ALERT_SEVERITY.CRITICAL);
    });
  });

  describe('getCritical', () => {
    it('should return only critical alerts', () => {
      alertCenter.emit(ALERT_TYPES.CRITICAL_BIN, 'Critical', ALERT_SEVERITY.CRITICAL);
      alertCenter.emit(ALERT_TYPES.GPS_DENIED, 'Warning', ALERT_SEVERITY.WARNING);

      const critical = alertCenter.getCritical();

      expect(critical.length).toBe(1);
      expect(critical[0].severity).toBe(ALERT_SEVERITY.CRITICAL);
    });
  });

  describe('clear', () => {
    it('should clear all alerts', () => {
      alertCenter.emit(ALERT_TYPES.CRITICAL_BIN, 'Critical', ALERT_SEVERITY.CRITICAL);
      alertCenter.emit(ALERT_TYPES.GPS_DENIED, 'Warning', ALERT_SEVERITY.WARNING);

      expect(alertCenter.getAll().length).toBe(2);

      alertCenter.clear();

      expect(alertCenter.getAll().length).toBe(0);
    });
  });
});
