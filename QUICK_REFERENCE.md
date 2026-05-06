# Quick Reference Card

Quick lookup for the most common operations in the waste management system.

## Imports

```javascript
// Modules
import TelemetryAdapter from './telemetry/telemetryAdapter.js';
import RouteSessionManager from './firebase/routeSessionManager.js';
import CollectionEventLogger from './firebase/collectionEventLogger.js';
import RouteOptimizer from './routing/routeOptimizer.js';
import VehicleStateManager, { VEHICLE_STATES, GPS_STATES } from './vehicle/vehicleStateManager.js';
import { globalAlertCenter, ALERT_TYPES, ALERT_SEVERITY } from './alerts/alertCenter.js';
import CONFIG from './config/settings.js';

// Components
import AlertDisplay from './components/AlertDisplay.jsx';
import RoutePanelEnhanced from './components/RoutePanelEnhanced.jsx';
import VehicleOpsPanel from './components/VehicleOpsPanel.jsx';
```

---

## Normalize Bins

```javascript
const normalized = bins.map(b => TelemetryAdapter.normalizeBin(b, 'simulator'));
```

**Returns:** Array with properties:
- `status` - 'normal', 'warning', 'critical', 'offline'
- `isStale` - boolean (true if > 30 min old)
- `collectionPriority` - 0-1 score

---

## Check Fleet Health

```javascript
const health = TelemetryAdapter.checkFleetHealth(normalizedBins);
// { totalBins, criticalBins, warningBins, offlineSensors, overallHealth }
```

---

## Plan a Route

```javascript
const optimizer = new RouteOptimizer();
const plan = optimizer.planRoute(normalizedBins, currentPosition, 50);
// { stops: [...], totalEstimatedDistanceKm, totalEstimatedDurationMin, binCount }
```

---

## Create & Manage Route Session

```javascript
const manager = new RouteSessionManager(db, 'truck-1');

// Create
const session = await manager.createSession(
  plan.stops,
  plan.totalEstimatedDistanceKm,
  plan.totalEstimatedDurationMin
);

// Start
await manager.startSession(session.routeSessionId);

// Record collection
await manager.completeStop(session.routeSessionId, 'bin-123');

// Skip bin
await manager.skipStop(session.routeSessionId, 'bin-456', 'Access denied');

// Pause/Resume
await manager.pauseSession(session.routeSessionId);
await manager.resumeSession(session.routeSessionId);

// Complete
await manager.completeSession(session.routeSessionId);

// Recover on page refresh
const active = await manager.loadLatestSession();
```

---

## Log Collection Event

```javascript
const logger = new CollectionEventLogger(db);

await logger.logCollectionEvent({
  routeSessionId: session.routeSessionId,
  binId: 'bin-123',
  zone: 'Zone A',
  collectorLocation: { lat: 13.7572, lng: 121.0588 },
  previousFillLevel: 85,
  previousStatus: 'warning',
  collectionResult: 'success',  // 'success' | 'failed' | 'skipped'
  notes: 'No issues'
});
```

---

## Manage Vehicle State

```javascript
const vehicle = new VehicleStateManager(db, 'truck-1');

// Load from Firestore
await vehicle.loadState();

// Update state
await vehicle.setState(VEHICLE_STATES.EN_ROUTE);

// Update GPS
await vehicle.setGpsState(GPS_STATES.OK, {lat: 13.7572, lng: 121.0588}, 25);

// Offline mode
await vehicle.setOfflineMode(true, 'Location denied');

// Get current state
const state = vehicle.getState();
```

---

## Emit Alerts

```javascript
// Critical alert
globalAlertCenter.emit(
  ALERT_TYPES.CRITICAL_BIN,
  'Bin A-123 is critical',
  ALERT_SEVERITY.CRITICAL
);

// Warning
globalAlertCenter.emit(
  ALERT_TYPES.STALE_SENSOR,
  '3 sensors offline',
  ALERT_SEVERITY.WARNING
);

// Info (auto-dismisses after 5s)
globalAlertCenter.emit(
  ALERT_TYPES.API_FAILURE,
  'Route started',
  ALERT_SEVERITY.INFO
);
```

---

## Subscribe to Alerts

```javascript
const unsubscribe = globalAlertCenter.subscribe((alertMap) => {
  const alerts = Array.from(alertMap.values());
  console.log('Current alerts:', alerts);
});

// Unsubscribe when done
unsubscribe();
```

---

## Alert Operations

```javascript
// Dismiss single
globalAlertCenter.dismiss('alert-id');

// Dismiss all of type
globalAlertCenter.dismissAllOfType(ALERT_TYPES.GPS_DENIED);

// Clear all
globalAlertCenter.clear();

// Query
const all = globalAlertCenter.getAll();
const critical = globalAlertCenter.getCritical();
const gpsAlerts = globalAlertCenter.getByType(ALERT_TYPES.GPS_DENIED);
```

---

## UI Components

```javascript
// In render()
<>
  {/* Real-time alerts at top-right */}
  <AlertDisplay maxAlerts={5} position="top-right" />
  
  {/* Vehicle operations */}
  <VehicleOpsPanel vehicleId="truck-1" bins={bins} />
  
  {/* Route management */}
  <RoutePanelEnhanced 
    bins={bins}
    currentPosition={{lat: 13.7572, lng: 121.0588}}
    onRouteStart={(session) => handleRouteStart(session)}
  />
</>
```

---

## Query Collection History

```javascript
const logger = new CollectionEventLogger(db);

// By session
const events = await logger.getSessionEvents(sessionId);

// By bin (last 50)
const history = await logger.getBinHistory('bin-123', 50);

// Statistics
const stats = await logger.getCollectionStats(startDate, endDate);
// { totalCollections, successfulCollections, failedCollections, skippedCollections, averageFillLevel }

// Success rate %
const rate = await logger.getSuccessRate(startDate, endDate);
```

---

## Configuration

```javascript
import CONFIG, { setConfig, getConfigValue } from './config/settings.js';

// Read
console.log(CONFIG.CRITICAL_FILL_THRESHOLD); // 90

// Override
setConfig({ CRITICAL_FILL_THRESHOLD: 85 });

// Get nested value
const maxStops = getConfigValue('ROUTE_OPTIMIZATION.MAX_STOPS_PER_ROUTE');
```

---

## States & Constants

```javascript
// Vehicle States
VEHICLE_STATES.IDLE           // At depot
VEHICLE_STATES.EN_ROUTE       // Driving
VEHICLE_STATES.COLLECTING     // At stop
VEHICLE_STATES.PAUSED         // Paused
VEHICLE_STATES.RETURNING      // Back to depot
VEHICLE_STATES.OFFLINE        // Disconnected

// GPS States
GPS_STATES.OK                 // Normal
GPS_STATES.LOW_ACCURACY       // Degraded
GPS_STATES.DENIED             // Permission denied
GPS_STATES.UNAVAILABLE        // Not available

// Route Session States
ROUTE_SESSION_STATES.DRAFT    // Planning
ROUTE_SESSION_STATES.ACTIVE   // In progress
ROUTE_SESSION_STATES.PAUSED   // Paused
ROUTE_SESSION_STATES.COMPLETED // Done
ROUTE_SESSION_STATES.CANCELLED // Cancelled

// Collection Results
COLLECTION_RESULTS.SUCCESS    // Successful
COLLECTION_RESULTS.FAILED     // Failed
COLLECTION_RESULTS.SKIPPED    // Skipped

// Alert Types
ALERT_TYPES.CRITICAL_BIN
ALERT_TYPES.STALE_SENSOR
ALERT_TYPES.GPS_DENIED
ALERT_TYPES.GPS_LOW_ACCURACY
ALERT_TYPES.API_FAILURE
ALERT_TYPES.CONNECTIVITY_ISSUE
ALERT_TYPES.OFFLINE_MODE_ACTIVE
ALERT_TYPES.LOCATION_REQUIRED

// Alert Severity
ALERT_SEVERITY.CRITICAL
ALERT_SEVERITY.WARNING
ALERT_SEVERITY.INFO
```

---

## Error Handling

```javascript
try {
  await routeSessionManager.startSession(sessionId);
} catch (error) {
  console.error('[v0] Failed to start session:', error);
  globalAlertCenter.emit(
    ALERT_TYPES.API_FAILURE,
    'Failed to start route',
    ALERT_SEVERITY.CRITICAL
  );
}
```

---

## Session Recovery Pattern

```javascript
useEffect(() => {
  const recover = async () => {
    // Load vehicle state
    await vehicleManager.loadState();
    const vState = vehicleManager.getState();
    
    // Load active session
    const session = await routeManager.loadLatestSession();
    
    if (session && vState.vehicleState === VEHICLE_STATES.EN_ROUTE) {
      // Resume route
      setCurrentSession(session);
    }
  };
  
  recover();
}, []);
```

---

## Real-time Monitoring Pattern

```javascript
useEffect(() => {
  const unsubscribe = db.collection('bins').onSnapshot((snapshot) => {
    const normalized = snapshot.docs.map(doc =>
      TelemetryAdapter.normalizeBin(doc.data())
    );
    
    const health = TelemetryAdapter.checkFleetHealth(normalized);
    if (health.criticalBins > 0) {
      globalAlertCenter.emit(
        ALERT_TYPES.CRITICAL_BIN,
        `${health.criticalBins} critical bins`,
        ALERT_SEVERITY.CRITICAL
      );
    }
    
    setBins(normalized);
  });
  
  return () => unsubscribe();
}, []);
```

---

## Testing Template

```javascript
import TelemetryAdapter from '../telemetry/telemetryAdapter.js';

describe('My Feature', () => {
  it('should work', () => {
    const bin = {
      binId: 'bin-1',
      zone: 'A',
      fillLevel: 50,
      lastSeenAt: Date.now(),
    };
    
    const normalized = TelemetryAdapter.normalizeBin(bin);
    
    expect(normalized.status).toBe('normal');
  });
});
```

---

## Run Tests

```bash
npm test                                    # Run all tests
npm test -- src/__tests__/telemetryAdapter  # Specific test
npm test -- --coverage                      # With coverage
```

---

## Firestore Rules Template

```javascript
match /routeSessions/{sessionId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if resource.data.vehicleId == request.auth.uid;
}

match /collectionEvents/{eventId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update, delete: if false;
}
```

---

## Debug Logging

All v0 modules use `console.log('[v0] ...')` prefix for easy filtering:

```bash
# Show only v0 logs
# In DevTools: filter = "[v0]"
```

Common log messages:
- `[v0] Route session created: session-id`
- `[v0] Route session started: session-id`
- `[v0] Stop completed: bin-id`
- `[v0] Collection event logged: event-id`
- `[v0] GPS state updated: ok`
- `[v0] Route optimized: {...}`

---

## Common Issues & Quick Fixes

| Issue | Fix |
|-------|-----|
| Alerts not showing | Check `<AlertDisplay />` mounted in root layout |
| Session not persisting | Verify Firestore rules allow writes |
| Route optimization slow | Reduce number of bins or increase maxStops |
| GPS state stuck | Check browser permissions: Settings > Privacy |
| Tests failing | Run `npm install` and check Firebase emulator |

---

## Documentation Links

- **Full API:** `docs/API_REFERENCE.md`
- **Schema:** `docs/FIREBASE_SCHEMA.md`
- **Integration:** `docs/IMPLEMENTATION_GUIDE.md`
- **Summary:** `IMPLEMENTATION_SUMMARY.md`

---

**Tip:** Bookmark this page for quick reference during development!
