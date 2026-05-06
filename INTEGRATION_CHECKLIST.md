# Integration Checklist: New Modules + Existing Features

This checklist ensures all existing features work correctly with the new modules.

## Pre-Integration Verification

- [ ] All existing tests pass: `npm test`
- [ ] App runs without errors: `npm start`
- [ ] Simulator starts and updates bins: Check console logs
- [ ] Dashboard displays with bins, map, and route panel
- [ ] Existing features work:
  - [ ] Route optimizes on "Start Route" click
  - [ ] Truck moves along route
  - [ ] Truck collects bins automatically
  - [ ] Fill level animates down to 0%
  - [ ] Next bin selected after collection
  - [ ] Completed bins remain visible
  - [ ] Manual Randomize button works
  - [ ] Reset to Live Data button works

## Integration Setup

- [ ] Create `src/integration/` directory
- [ ] Copy `dashboardIntegration.js` to `src/integration/`
- [ ] Create `src/hooks/` directory (if doesn't exist)
- [ ] Copy `useDashboardIntegration.js` to `src/hooks/`

## Phase 1: Add Integration Without Changes

```javascript
// In Dashboard.jsx, add:
import { useDashboardIntegration } from '../hooks/useDashboardIntegration';

// In Dashboard component:
const integration = useDashboardIntegration();

// No other changes needed
```

- [ ] App still starts without errors
- [ ] All existing features still work
- [ ] No console errors related to integration

## Phase 2: Enable Telemetry Enrichment

```javascript
// In Dashboard.jsx:
const enrichedBins = integration.processBinsWithTelemetry(bins);

// Use enrichedBins instead of bins in components:
<Map bins={enrichedBins} />
<RoutePanel bins={enrichedBins} />
```

- [ ] Map displays correctly with enriched bins
- [ ] Route panel works with enriched data
- [ ] Bin cards show all information
- [ ] No console errors
- [ ] Telemetry data added to console output

## Phase 3: Enable Fleet Health Checks

```javascript
// In Dashboard.jsx useEffect:
useEffect(() => {
  if (bins.length > 0) {
    integration.checkFleetHealth(bins);
  }
}, [bins]);

// Add alert display:
import AlertDisplay from './AlertDisplay';

return (
  <div>
    <AlertDisplay />
    {/* Rest of dashboard */}
  </div>
);
```

- [ ] AlertDisplay component renders without errors
- [ ] Alerts appear for stale sensors (if any)
- [ ] Alerts appear for critical bins
- [ ] Alerts auto-dismiss for info level
- [ ] No console errors related to alerts

## Phase 4: Enable Route Session Persistence

```javascript
// In RoutePanel.jsx or Dashboard.jsx:
const handleStartRoute = async () => {
  await integration.startRouteSession(optimizedRoute);
  // Existing route start logic
};

// Call on collect:
const handleCollect = async (bin) => {
  await integration.collectBin(bin.binId, bins);
  // Existing collect logic
};
```

- [ ] Route session created in Firestore on "Start Route"
- [ ] Collection events logged on collection
- [ ] No console errors
- [ ] Firestore shows new documents in routeSessions collection
- [ ] Firestore shows new documents in collectionEvents collection

## Phase 5: Enable Session Recovery

```javascript
// In Dashboard.jsx useEffect:
useEffect(() => {
  integration.recoverActiveSession('truck-001');
}, []);
```

- [ ] On page refresh, active route resumes
- [ ] completedStops restored from Firestore
- [ ] Route continues from where it left off
- [ ] No console errors

## Phase 6: Add Enhanced UI Components (Optional)

```javascript
// Replace components gradually:
import RoutePanelEnhanced from './components/RoutePanelEnhanced';
import VehicleOpsPanel from './components/VehicleOpsPanel';

// Use instead of original RoutePanel
return (
  <div>
    <AlertDisplay />
    <Map bins={enrichedBins} />
    <RoutePanelEnhanced bins={enrichedBins} />
    <VehicleOpsPanel />
  </div>
);
```

- [ ] RoutePanelEnhanced displays routes correctly
- [ ] VehicleOpsPanel shows vehicle state
- [ ] All controls work (start, pause, resume, complete)
- [ ] Existing collection logic still triggers

## Post-Integration Verification

- [ ] All 15 existing features still work:
  - [ ] Fixed starting location (Barangay Hall)
  - [ ] Route colors (grey/red)
  - [ ] Truck movement animation
  - [ ] Stop at destination behavior
  - [ ] Truck stays at collected bin
  - [ ] Movement only on "Start Route" click
  - [ ] Manual Randomize button
  - [ ] Reset to Live Data button
  - [ ] Dashboard/component consistency
  - [ ] Automatic collection
  - [ ] Fill level animation
  - [ ] Automatic next stop
  - [ ] Shortest-path routing
  - [ ] Locked route order
  - [ ] Completed bins remain visible

- [ ] New features working:
  - [ ] Session persistence (Firestore)
  - [ ] Session recovery on refresh
  - [ ] Real-time alerts
  - [ ] Fleet health monitoring
  - [ ] Immutable event log
  - [ ] Weighted route optimization (optional)
  - [ ] Vehicle state tracking (optional)

## Testing

### Run Existing Tests
```bash
npm test
```
- [ ] All existing tests pass
- [ ] No new failures introduced

### Run New Integration Tests
```bash
npm test -- dashboardIntegration.test.js
```
- [ ] All integration tests pass
- [ ] No errors in test output

### Manual Testing Scenarios

**Scenario 1: Normal Route Execution**
- [ ] Click "Start Route"
- [ ] Route session created
- [ ] Truck moves
- [ ] Bins collected automatically
- [ ] Events logged to Firestore
- [ ] Route completes

**Scenario 2: Page Refresh During Route**
- [ ] Start a route and let it progress
- [ ] Refresh page (Ctrl+R or Cmd+R)
- [ ] Route resumes automatically
- [ ] Same completed stops shown
- [ ] Can continue route

**Scenario 3: Stale Sensor Detection**
- [ ] Wait for bin data to not update for 31+ minutes (or mock in tests)
- [ ] Alert appears for stale sensor
- [ ] Alert shows correct bin ID
- [ ] Alert auto-dismisses or user dismisses

**Scenario 4: Critical Bin Alert**
- [ ] Fill level reaches 90%+
- [ ] Critical alert appears immediately
- [ ] Alert is red/prominent
- [ ] Alert shows bin ID and fill level

**Scenario 5: Collection Event Log**
- [ ] Complete a route
- [ ] Check Firestore collectionEvents collection
- [ ] Each collection has entry with:
  - [ ] binId
  - [ ] routeSessionId
  - [ ] collectedFillLevelBeforeReset
  - [ ] previousStatus
  - [ ] collectedAt timestamp
  - [ ] collectionResult: "success"

## Firestore Verification

- [ ] Check `routeSessions` collection:
  - [ ] New documents appear when routes start
  - [ ] Documents have correct fields (see FIREBASE_SCHEMA.md)
  - [ ] Status changes are recorded
  - [ ] Can query by vehicleId

- [ ] Check `collectionEvents` collection:
  - [ ] New documents appear on collection
  - [ ] Immutable (no updates after creation)
  - [ ] All required fields present
  - [ ] Can query by routeSessionId or binId

- [ ] Check `bins` collection:
  - [ ] New fields added: sourceMode, sensorHealth, lastSeenAt, etc.
  - [ ] Fields populated correctly
  - [ ] Existing data not lost

## Performance Verification

- [ ] App startup time acceptable (<3s)
- [ ] Map rendering smooth
- [ ] Route updates responsive
- [ ] No memory leaks (check DevTools)
- [ ] No excessive Firestore reads
- [ ] Alert system responsive

## Console Output Verification

- [ ] No error messages
- [ ] No 404s for missing files
- [ ] No import errors
- [ ] Expected initialization logs appear
- [ ] Firestore operations logged correctly

## Deployment Checklist

- [ ] All tests passing
- [ ] No console errors in development
- [ ] No console errors in production build
- [ ] Firestore rules updated (if needed)
- [ ] Firestore indexes created
- [ ] Environment variables configured
- [ ] Backup created before deploying

## Rollback Plan

If issues occur:

1. **Minor Issues (UI/UX)**
   - Revert component changes
   - Keep integration layer running
   - No Firestore changes needed

2. **Integration Issues**
   - Remove integration hook usage
   - Keep DashboardIntegration module loaded (no harm)
   - Firestore collections exist but unused

3. **Critical Issues**
   - Remove all integration code
   - Delete Firestore collections if needed
   - Redeploy with original components

## Sign-Off

- [ ] Team lead reviewed and approved
- [ ] QA tested all scenarios
- [ ] Deployment completed
- [ ] Production monitoring active
- [ ] No critical issues reported

---

## Notes

- Integration is non-breaking; existing code continues to work
- Firestore schema additions are backward compatible
- Can enable/disable new features without redeployment
- Recommend gradual rollout (phase 1-3 before phases 4-6)

## Support

See COMPATIBILITY_GUIDE.md for detailed explanations of how features work together.
See IMPLEMENTATION_GUIDE.md for step-by-step integration instructions.
See QUICK_REFERENCE.md for code examples.
