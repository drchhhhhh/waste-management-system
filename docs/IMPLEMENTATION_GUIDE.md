# Implementation Guide

Step-by-step guide to integrate the new waste management system modules into your application.

## Quick Start

### 1. Import Core Modules

```javascript
// src/App.js
import TelemetryAdapter from './telemetry/telemetryAdapter.js';
import RouteSessionManager from './firebase/routeSessionManager.js';
import CollectionEventLogger from './firebase/collectionEventLogger.js';
import RouteOptimizer from './routing/routeOptimizer.js';
import VehicleStateManager from './vehicle/vehicleStateManager.js';
import { globalAlertCenter } from './alerts/alertCenter.js';

// UI Components
import AlertDisplay from './components/AlertDisplay.jsx';
import RoutePanelEnhanced from './components/RoutePanelEnhanced.jsx';
import VehicleOpsPanel from './components/VehicleOpsPanel.jsx';
```

### 2. Initialize Managers

```javascript
const routeOptimizer = new RouteOptimizer();
const routeSessionManager = new RouteSessionManager(db, 'truck-1');
const collectionLogger = new CollectionEventLogger(db);
const vehicleStateManager = new VehicleStateManager(db, 'truck-1');
```

### 3. Add UI Components

```javascript
return (
  <div>
    {/* Real-time alerts */}
    <AlertDisplay maxAlerts={5} position="top-right" />
    
    {/* Vehicle operations */}
    <VehicleOpsPanel vehicleId="truck-1" bins={bins} />
    
    {/* Route management */}
    <RoutePanelEnhanced 
      bins={bins}
      currentPosition={truckLocation}
      onRouteStart={(session) => console.log('Route started:', session)}
    />
  </div>
);
```

---

## Integration Patterns

### Pattern 1: Complete Route Workflow

```javascript
// 1. Normalize bins
const normalizedBins = bins.map(b => 
  TelemetryAdapter.normalizeBin(b, 'simulator')
);

// 2. Check fleet health
const health = TelemetryAdapter.checkFleetHealth(normalizedBins);
if (health.criticalBins > 0) {
  globalAlertCenter.emit(
    ALERT_TYPES.CRITICAL_BIN,
    `${health.criticalBins} critical bins need collection`,
    ALERT_SEVERITY.CRITICAL
  );
}

// 3. Plan optimized route
const routePlan = routeOptimizer.planRoute(normalizedBins, currentPos, 50);

// 4. Create session
const session = await routeSessionManager.createSession(
  routePlan.stops,
  routePlan.totalEstimatedDistanceKm,
  routePlan.totalEstimatedDurationMin
);

// 5. Start route
await routeSessionManager.startSession(session.routeSessionId);
await vehicleStateManager.setState(VEHICLE_STATES.EN_ROUTE);

// 6. Process collections
for (const stop of routePlan.stops) {
  // Navigate to bin...
  
  // Record collection
  await routeSessionManager.completeStop(
    session.routeSessionId,
    stop.binId
  );
  
  // Log event
  await collectionLogger.logCollectionEvent({
    routeSessionId: session.routeSessionId,
    binId: stop.binId,
    zone: stop.zone,
    collectorLocation: currentTruckPos,
    previousFillLevel: 85,
    previousStatus: 'warning',
    collectionResult: 'success',
  });
}

// 7. Complete route
await routeSessionManager.completeSession(session.routeSessionId);
await vehicleStateManager.setState(VEHICLE_STATES.IDLE);
```

### Pattern 2: Session Recovery (Page Refresh)

```javascript
// On app initialization
useEffect(() => {
  const recoverSession = async () => {
    // Load vehicle state
    await vehicleStateManager.loadState();
    const vState = vehicleStateManager.getState();
    
    // Load active route session
    const activeSession = await routeSessionManager.loadLatestSession();
    
    if (activeSession && vState.vehicleState === VEHICLE_STATES.EN_ROUTE) {
      // Continue route
      displayRouteInfo(activeSession);
      globalAlertCenter.emit(
        ALERT_TYPES.API_FAILURE,
        'Route resumed after disconnect',
        ALERT_SEVERITY.INFO
      );
    }
  };
  
  recoverSession();
}, []);
```

### Pattern 3: GPS Permission Handling

```javascript
function useGpsPermissions() {
  useEffect(() => {
    navigator.geolocation.watchPosition(
      (position) => {
        // GPS working
        vehicleStateManager.setGpsState(
          GPS_STATES.OK,
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          position.coords.accuracy
        );
      },
      (error) => {
        // GPS failed
        if (error.code === error.PERMISSION_DENIED) {
          vehicleStateManager.setGpsState(GPS_STATES.DENIED);
          vehicleStateManager.setOfflineMode(true, 'Location permission denied');
          
          globalAlertCenter.emit(
            ALERT_TYPES.LOCATION_REQUIRED,
            'Please enable location to continue',
            ALERT_SEVERITY.CRITICAL
          );
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          vehicleStateManager.setGpsState(GPS_STATES.UNAVAILABLE);
        }
      }
    );
  }, []);
}
```

### Pattern 4: Real-time Bin Monitoring

```javascript
useEffect(() => {
  const unsubscribe = db.collection('bins').onSnapshot((snapshot) => {
    const normalizedBins = snapshot.docs.map(doc =>
      TelemetryAdapter.normalizeBin(doc.data(), 'live-sensor')
    );
    
    // Check for stale sensors
    const stale = normalizedBins.filter(b => b.isStale);
    if (stale.length > 0) {
      globalAlertCenter.emit(
        ALERT_TYPES.STALE_SENSOR,
        `${stale.length} sensors offline`,
        ALERT_SEVERITY.WARNING
      );
    }
    
    // Check for critical bins
    const critical = normalizedBins.filter(b => b.status === 'critical');
    if (critical.length > 0) {
      globalAlertCenter.emit(
        ALERT_TYPES.CRITICAL_BIN,
        `${critical.length} bins critical`,
        ALERT_SEVERITY.CRITICAL
      );
    }
    
    setBins(normalizedBins);
  });
  
  return () => unsubscribe();
}, []);
```

### Pattern 5: Analytics & Reporting

```javascript
async function generateDailyReport() {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  
  // Get stats
  const stats = await collectionLogger.getCollectionStats(startDate, endDate);
  const successRate = await collectionLogger.getSuccessRate(startDate, endDate);
  
  return {
    date: startDate.toISOString().split('T')[0],
    totalCollections: stats.totalCollections,
    successful: stats.successfulCollections,
    failed: stats.failedCollections,
    skipped: stats.skippedCollections,
    successRate: `${successRate?.toFixed(1) || 0}%`,
    avgFillLevel: stats.averageFillLevel?.toFixed(1),
  };
}
```

---

## Testing Your Integration

### Unit Tests

```bash
# Run the test suite
npm test -- src/__tests__/

# Run specific test
npm test -- src/__tests__/telemetryAdapter.test.js
```

### Integration Tests

```javascript
describe('Full Route Workflow', () => {
  it('should plan and execute a route', async () => {
    // Create test bins
    const bins = [
      { binId: 'bin-1', zone: 'A', fillLevel: 95 },
      { binId: 'bin-2', zone: 'B', fillLevel: 75 },
    ];
    
    // Normalize
    const normalized = bins.map(b => 
      TelemetryAdapter.normalizeBin(b, 'simulator')
    );
    
    // Plan route
    const plan = routeOptimizer.planRoute(normalized);
    expect(plan.stops.length).toBe(2);
    
    // Create session
    const session = await routeSessionManager.createSession(
      plan.stops,
      plan.totalEstimatedDistanceKm,
      plan.totalEstimatedDurationMin
    );
    expect(session.status).toBe('draft');
    
    // Start route
    await routeSessionManager.startSession(session.routeSessionId);
    const updated = await routeSessionManager.getSession(session.routeSessionId);
    expect(updated.status).toBe('active');
  });
});
```

---

## Common Issues & Solutions

### Issue: Alerts Not Appearing

**Solution:** Ensure `AlertDisplay` component is mounted:
```javascript
<AlertDisplay position="top-right" />
```

### Issue: Route Session Not Persisting

**Solution:** Check Firebase rules allow your user to write to `routeSessions`:
```javascript
// In firestore.rules
match /routeSessions/{sessionId} {
  allow create: if request.auth != null;
}
```

### Issue: GPS State Not Updating

**Solution:** Ensure location permissions are granted in browser:
```javascript
// Check permissions
const permission = await navigator.permissions.query({
  name: 'geolocation'
});
console.log(permission.state); // 'granted', 'denied', or 'prompt'
```

### Issue: Old Data Showing as "Not Stale"

**Solution:** Verify `lastSeenAt` field is being updated:
```javascript
// In bin update
await db.collection('bins').doc(binId).update({
  fillLevel: newLevel,
  lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
});
```

### Issue: Tests Failing with Firebase Errors

**Solution:** Use Firebase emulator for testing:
```javascript
// In test setup
import { connectAuthEmulator, connectFirestoreEmulator } from 'firebase/firestore';

const db = getFirestore();
if (process.env.NODE_ENV === 'test') {
  connectFirestoreEmulator(db, 'localhost', 8080);
}
```

---

## Performance Optimization

### 1. Limit Real-time Listeners

```javascript
// Bad: Creates many listeners
bins.forEach(bin => {
  db.collection('bins').doc(bin.id).onSnapshot(...);
});

// Good: Single listener
db.collection('bins').onSnapshot(snapshot => {
  const normalizedBins = snapshot.docs.map(doc =>
    TelemetryAdapter.normalizeBin(doc.data())
  );
});
```

### 2. Batch Updates

```javascript
// Instead of individual updates:
const batch = db.batch();
bins.forEach(bin => {
  batch.update(db.collection('bins').doc(bin.id), {
    status: 'normal',
  });
});
await batch.commit();
```

### 3. Pagination for Events

```javascript
let lastEvent = null;

async function getMoreEvents(binId) {
  let query = db.collection('collectionEvents')
    .where('binId', '==', binId)
    .orderBy('collectedAt', 'desc')
    .limit(20);
  
  if (lastEvent) {
    query = query.startAfter(lastEvent);
  }
  
  const snapshot = await query.get();
  const events = snapshot.docs.map(d => d.data());
  
  lastEvent = snapshot.docs[snapshot.docs.length - 1];
  return events;
}
```

---

## Deployment Checklist

- [ ] All environment variables configured in `.env.production`
- [ ] Firebase security rules deployed and tested
- [ ] Composite indexes created in Firestore
- [ ] AlertDisplay component added to root layout
- [ ] Error boundaries added around new components
- [ ] Performance tested with realistic data volume
- [ ] Offline mode fallbacks working
- [ ] Tests passing (npm test)
- [ ] Build succeeds (npm run build)
- [ ] Deployed to staging and verified
- [ ] Monitoring alerts configured

---

## Support & Debugging

### Enable Debug Logging

```javascript
// src/config/settings.js
setConfig({
  DEBUG: true,
});

// Check logs
console.log('[v0]'); // All v0 logs use this prefix
```

### Verify Module Imports

```bash
# Check if modules are being imported correctly
grep -r "import.*telemetryAdapter" src/
```

### Monitor Firestore Usage

Open Firestore console and check:
- Document counts in each collection
- Storage usage
- Composite index performance

### Debug Route Optimization

```javascript
const plan = routeOptimizer.planRoute(normalizedBins);
console.log(JSON.stringify(plan, null, 2));

// Compare two routes
const comparison = routeOptimizer.compareRoutes(route1, route2);
console.log('Is route1 better?', comparison.isBetter);
```

---

## Next Steps

1. **Phase 1:** Integrate telemetry and alerts (1-2 days)
2. **Phase 2:** Add route optimization and session management (2-3 days)
3. **Phase 3:** Implement vehicle state tracking (1 day)
4. **Phase 4:** Add analytics and reporting (1-2 days)
5. **Phase 5:** Hardening, testing, and deployment (2-3 days)

See `ROADMAP.md` for detailed timeline and milestones.
