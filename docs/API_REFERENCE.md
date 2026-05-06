# API Reference

Complete documentation for the waste management system modules.

## Table of Contents

1. [Telemetry Adapter](#telemetry-adapter)
2. [Route Session Manager](#route-session-manager)
3. [Collection Event Logger](#collection-event-logger)
4. [Route Optimizer](#route-optimizer)
5. [Vehicle State Manager](#vehicle-state-manager)
6. [Alert Center](#alert-center)

---

## Telemetry Adapter

**File:** `src/telemetry/telemetryAdapter.js`

Normalizes bin data from any source and provides health monitoring.

### `TelemetryAdapter.normalizeBin(rawBin, sourceMode)`

Converts raw bin data into normalized format with health metadata.

**Parameters:**
- `rawBin` (Object): Raw bin from Firestore
  - `binId` (string): Bin identifier
  - `zone` (string): Zone name
  - `fillLevel` (number): Fill percentage (0-100)
  - `lastSeenAt` (timestamp): Last sensor reading time
  - `isPriority` (boolean, optional): User-marked priority flag
- `sourceMode` (string, optional): Data source - 'simulator', 'live-sensor', 'fallback'. Default: 'simulator'

**Returns:** Normalized bin object with:
- `fillLevel` (number)
- `status` (string): 'normal', 'warning', 'critical', 'offline'
- `sensorHealth` (string): 'ok', 'degraded', 'critical', 'offline'
- `isStale` (boolean): True if data > 30 minutes old
- `dataAgeMinutes` (number)
- `collectionPriority` (number): 0-1 score

**Example:**
```javascript
import TelemetryAdapter from './telemetry/telemetryAdapter.js';

const rawBin = {
  binId: 'bin-123',
  zone: 'Zone A',
  fillLevel: 85,
  lastSeenAt: Date.now(),
  isPriority: true,
};

const normalized = TelemetryAdapter.normalizeBin(rawBin, 'simulator');
console.log(normalized.status); // "warning"
console.log(normalized.collectionPriority); // 0.75 (high priority)
```

### `TelemetryAdapter.checkFleetHealth(normalizedBins)`

Analyzes overall fleet health.

**Parameters:**
- `normalizedBins` (Array): Array of normalized bin objects

**Returns:** Health summary object:
```javascript
{
  totalBins: number,
  criticalBins: number,
  warningBins: number,
  offlineSensors: number,
  degradedSensors: number,
  overallHealth: 'good' | 'degraded' | 'critical'
}
```

**Example:**
```javascript
const health = TelemetryAdapter.checkFleetHealth(normalizedBins);
if (health.criticalBins > 0) {
  alertCenter.emit(ALERT_TYPES.CRITICAL_BIN, 
    `${health.criticalBins} critical bins`);
}
```

### `TelemetryAdapter.getBinsNeedingCollection(normalizedBins)`

Filters and sorts bins that need collection (critical, warning, or stale).

**Returns:** Sorted array of bins, highest priority first

---

## Route Session Manager

**File:** `src/firebase/routeSessionManager.js`

Manages route planning sessions with persistence and state transitions.

### Constructor

```javascript
import RouteSessionManager from './firebase/routeSessionManager.js';

const manager = new RouteSessionManager(db, 'truck-1');
```

### `createSession(plannedStops, estimatedDistanceKm, estimatedDurationMin)`

Creates a new route session.

**Parameters:**
- `plannedStops` (Array): Array of stop objects with `binId`, `zone`, `estimatedDistance`
- `estimatedDistanceKm` (number): Total route distance
- `estimatedDurationMin` (number): Total estimated time

**Returns:** Session object (Promise)

**Example:**
```javascript
const session = await manager.createSession(
  [
    { binId: 'bin-1', zone: 'Zone A', estimatedDistance: 0.5 },
    { binId: 'bin-2', zone: 'Zone B', estimatedDistance: 0.7 },
  ],
  1.2,  // km
  15    // minutes
);
console.log(session.routeSessionId); // "session-1716523200000-abc123"
```

### `startSession(sessionId)`

Transitions session from DRAFT to ACTIVE.

```javascript
await manager.startSession(session.routeSessionId);
```

### `completeStop(sessionId, binId)`

Marks a bin as successfully collected.

```javascript
await manager.completeStop(sessionId, 'bin-123');
```

### `skipStop(sessionId, binId, reason)`

Marks a bin as skipped with reason.

```javascript
await manager.skipStop(sessionId, 'bin-123', 'Access denied');
```

### `pauseSession(sessionId)` / `resumeSession(sessionId)`

Pauses and resumes a route.

```javascript
await manager.pauseSession(sessionId);
// ... do something ...
await manager.resumeSession(sessionId);
```

### `completeSession(sessionId)`

Marks session as completed.

```javascript
await manager.completeSession(sessionId);
```

### `loadLatestSession()`

Recovers the most recent active or paused session (for page refresh recovery).

```javascript
const session = await manager.loadLatestSession();
if (session) {
  console.log(`Continuing session ${session.routeSessionId}`);
}
```

### `updateTruckPosition(lat, lng, accuracy)`

Updates vehicle GPS position in current session.

```javascript
await manager.updateTruckPosition(13.7572, 121.0588, 25);
```

---

## Collection Event Logger

**File:** `src/firebase/collectionEventLogger.js`

Immutable event log for all collection actions.

### Constructor

```javascript
import CollectionEventLogger from './firebase/collectionEventLogger.js';

const logger = new CollectionEventLogger(db);
```

### `logCollectionEvent(eventData)`

Records a collection event.

**Parameters:**
```javascript
{
  routeSessionId: string,          // Required
  binId: string,                   // Required
  zone: string,                    // Required
  collectorLocation: {lat, lng},   // Optional
  previousFillLevel: number,       // Optional
  previousStatus: string,          // Optional
  collectionResult: string,        // Required: "success" | "failed" | "skipped"
  notes: string                    // Optional
}
```

**Returns:** Event object with generated `eventId`

**Example:**
```javascript
const event = await logger.logCollectionEvent({
  routeSessionId: session.routeSessionId,
  binId: 'bin-123',
  zone: 'Zone A',
  collectorLocation: { lat: 13.7572, lng: 121.0588 },
  previousFillLevel: 85,
  previousStatus: 'warning',
  collectionResult: 'success',
  notes: 'Normal collection, no issues'
});
```

### `getSessionEvents(routeSessionId)`

Retrieves all collection events for a route session.

```javascript
const events = await logger.getSessionEvents(sessionId);
// Returns: Array of event objects, sorted by time
```

### `getBinHistory(binId, limit)`

Gets collection history for a specific bin.

```javascript
const history = await logger.getBinHistory('bin-123', 50);
// Returns: Last 50 collection events for this bin
```

### `getCollectionStats(startDate, endDate)`

Calculates collection statistics for a time period.

**Returns:**
```javascript
{
  totalCollections: number,
  successfulCollections: number,
  failedCollections: number,
  skippedCollections: number,
  averageFillLevel: number
}
```

---

## Route Optimizer

**File:** `src/routing/routeOptimizer.js`

Intelligent route planning with weighted scoring.

### Constructor & Weights

```javascript
import RouteOptimizer from './routing/routeOptimizer.js';

const optimizer = new RouteOptimizer();

// Customize weights (default shown)
optimizer.setWeights({
  fillLevel: 0.4,      // 40% - how full the bin is
  stale: 0.2,          // 20% - data freshness
  priority: 0.15,      // 15% - user-marked priority
  distance: 0.15,      // 15% - distance from previous stop
  lastCollection: 0.1  // 10% - time since last collection
});
```

### `optimizeRoute(normalizedBins, startPosition)`

Optimizes bins into priority-sorted array.

**Parameters:**
- `normalizedBins` (Array): Output from `TelemetryAdapter.normalizeBin()`
- `startPosition` (Object, optional): `{lat, lng}` for distance calculation

**Returns:** Array sorted by optimization score (highest priority first)

**Example:**
```javascript
const normalized = bins.map(b => TelemetryAdapter.normalizeBin(b));
const optimized = optimizer.optimizeRoute(normalized, {lat: 13.7572, lng: 121.0588});
console.log(optimized[0].binId); // Most urgent bin
```

### `planRoute(normalizedBins, startPosition, maxStops)`

Creates a complete route plan with distance estimates.

**Returns:**
```javascript
{
  stops: [
    {
      binId: string,
      zone: string,
      order: number,
      estimatedDistance: number,  // km
      estimatedDuration: number,  // minutes
      score: number
    }
  ],
  totalEstimatedDistanceKm: number,
  totalEstimatedDurationMin: number,
  binCount: number
}
```

**Example:**
```javascript
const plan = optimizer.planRoute(normalized, startPos, 50);
console.log(`Route: ${plan.binCount} stops, ${plan.totalEstimatedDurationMin}min`);
```

### `getNextOptimalStop(normalizedBins, currentPosition)`

Gets the single most urgent next stop.

```javascript
const nextBin = optimizer.getNextOptimalStop(normalized, truckLocation);
```

### `compareRoutes(route1, route2)`

Compares two route plans.

**Returns:**
```javascript
{
  distanceDifference: number,
  durationDifference: number,
  stopCountDifference: number,
  isBetter: boolean  // true if route1 is better
}
```

---

## Vehicle State Manager

**File:** `src/vehicle/vehicleStateManager.js`

Tracks vehicle operational state and GPS status.

### Constructor

```javascript
import VehicleStateManager, { 
  VEHICLE_STATES, 
  GPS_STATES 
} from './vehicle/vehicleStateManager.js';

const vehicle = new VehicleStateManager(db, 'truck-1');
```

### States

**Vehicle States:**
- `IDLE` - Vehicle at depot, not on route
- `EN_ROUTE` - Actively driving to next stop
- `COLLECTING` - Stopped at bin, collecting
- `PAUSED` - Route paused by operator
- `RETURNING` - Returning to depot
- `OFFLINE` - Vehicle offline/disconnected

**GPS States:**
- `OK` - GPS functional, high accuracy
- `LOW_ACCURACY` - GPS working but degraded
- `DENIED` - Location permission denied
- `UNAVAILABLE` - GPS not available

### `setState(newState)`

Updates vehicle operational state.

```javascript
await vehicle.setState(VEHICLE_STATES.EN_ROUTE);
```

### `setGpsState(gpsState, position, accuracy)`

Updates GPS status and position.

```javascript
await vehicle.setGpsState(GPS_STATES.OK, {lat: 13.7572, lng: 121.0588}, 25);
```

### `setOfflineMode(enabled, reason)`

Toggles offline mode for location-denied scenarios.

```javascript
await vehicle.setOfflineMode(true, 'Location permission denied');
```

### `loadState()`

Recovers state from Firestore (session recovery).

```javascript
await vehicle.loadState();
const state = vehicle.getState();
```

### `getState()`

Returns current state object:

```javascript
{
  vehicleState: string,
  gpsState: string,
  lastKnownPosition: {lat, lng},
  gpsAccuracy: number,
  offlineMode: boolean,
  lastStateChangeAt: timestamp
}
```

### `canStartRoute()` / `canCollect()`

Checks if vehicle is ready for operations.

```javascript
if (vehicle.canStartRoute()) {
  // Start the route
}

if (vehicle.canCollect()) {
  // Collect at current stop
}
```

---

## Alert Center

**File:** `src/alerts/alertCenter.js`

Centralized real-time alert management.

### Alert Types

```javascript
ALERT_TYPES = {
  CRITICAL_BIN: 'critical_bin',
  STALE_SENSOR: 'stale_sensor',
  GPS_DENIED: 'gps_denied',
  GPS_LOW_ACCURACY: 'gps_low_accuracy',
  API_FAILURE: 'api_failure',
  CONNECTIVITY_ISSUE: 'connectivity_issue',
  OFFLINE_MODE_ACTIVE: 'offline_mode_active',
  LOCATION_REQUIRED: 'location_required',
}
```

### Severity Levels

```javascript
ALERT_SEVERITY = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
}
```

### Global Instance

```javascript
import { globalAlertCenter } from './alerts/alertCenter.js';
```

### `emit(type, message, severity, metadata)`

Creates a new alert.

```javascript
globalAlertCenter.emit(
  ALERT_TYPES.CRITICAL_BIN,
  'Bin A-123 is critical (95% full)',
  ALERT_SEVERITY.CRITICAL,
  { binId: 'bin-123', fillLevel: 95 }
);
```

**Returns:** alertId string

**Auto-dismiss:** INFO alerts auto-dismiss after 5 seconds

### `subscribe(callback)`

Subscribes to alert changes.

```javascript
const unsubscribe = globalAlertCenter.subscribe((alertMap) => {
  console.log('Current alerts:', Array.from(alertMap.values()));
});

// Unsubscribe
unsubscribe();
```

### `dismiss(alertId)` / `dismissAllOfType(type)` / `clear()`

Dismiss alerts.

```javascript
globalAlertCenter.dismiss('alert-1');
globalAlertCenter.dismissAllOfType(ALERT_TYPES.CRITICAL_BIN);
globalAlertCenter.clear(); // Clear all
```

### `getAll()` / `getByType(type)` / `getBySeverity(severity)` / `getCritical()`

Query alerts.

```javascript
const critical = globalAlertCenter.getCritical();
const gpsAlerts = globalAlertCenter.getByType(ALERT_TYPES.GPS_DENIED);
```

---

## Configuration

**File:** `src/config/settings.js`

Centralized configuration for all thresholds.

```javascript
import CONFIG from './config/settings.js';

// Access config
console.log(CONFIG.CRITICAL_FILL_THRESHOLD); // 90
console.log(CONFIG.DATA_FRESHNESS_THRESHOLD_MINUTES); // 30

// Override at runtime
import { setConfig } from './config/settings.js';
setConfig({ CRITICAL_FILL_THRESHOLD: 85 });
```

---

## Environment Variables

Required environment variables (set in `.env.local`):

```
REACT_APP_FIREBASE_API_KEY=<key>
REACT_APP_FIREBASE_AUTH_DOMAIN=<domain>
REACT_APP_FIREBASE_PROJECT_ID=<id>
REACT_APP_FIREBASE_STORAGE_BUCKET=<bucket>
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=<id>
REACT_APP_FIREBASE_APP_ID=<id>
```

See `src/firebase/config.js` for details.
