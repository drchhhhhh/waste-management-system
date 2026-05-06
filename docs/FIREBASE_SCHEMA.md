# Firebase Firestore Schema Documentation

This document describes the new and enhanced Firestore collections for the waste management system.

## Collections Overview

### 1. `routeSessions` Collection

Stores persistent route plans and session metadata. Each document represents a single collection route session.

**Document ID:** Auto-generated (e.g., `session-1716523200000-abc123def`)

**Schema:**
```json
{
  "routeSessionId": "string",           // Unique session identifier
  "vehicleId": "string",                // Vehicle performing the collection (e.g., "truck-1")
  "plannedStops": [
    {
      "binId": "string",                // Unique bin identifier
      "zone": "string",                 // Zone/area name (e.g., "Zone A")
      "order": "number",                // Order in route (0-indexed)
      "estimatedDistance": "number"     // Estimated distance in km from previous stop
    }
  ],
  "status": "string",                   // Enum: "draft", "active", "paused", "completed", "cancelled"
  "startedAt": "timestamp",             // When the route was started (nullable)
  "endedAt": "timestamp",               // When the route was completed (nullable)
  "completedStopIds": ["string"],       // Array of binIds that have been collected
  "skippedStopIds": [
    {
      "binId": "string",
      "reason": "string",
      "skippedAt": "timestamp"
    }
  ],
  "currentStopId": "string",            // Current stop being worked on (nullable)
  "estimatedDistanceKm": "number",      // Total estimated distance in km
  "estimatedDurationMin": "number",     // Total estimated duration in minutes
  "lastKnownTruckPosition": {           // Last recorded GPS position
    "lat": "number",
    "lng": "number",
    "accuracy": "number",               // Accuracy in meters
    "timestamp": "timestamp"
  },
  "createdAt": "timestamp",             // When the session was created
  "updatedAt": "timestamp"              // Last update timestamp
}
```

**Indexes:** 
- `vehicleId, status, createdAt` (composite, descending createdAt)
- `status, createdAt` (composite, descending createdAt)

---

### 2. `collectionEvents` Collection

Immutable event log of every collection action. Each document represents a single collection attempt.

**Document ID:** Auto-generated

**Schema:**
```json
{
  "routeSessionId": "string",              // Reference to the parent route session
  "binId": "string",                       // Which bin was collected
  "zone": "string",                        // Zone name for quick reference
  "collectedAt": "timestamp",              // When collection occurred
  "collectedFillLevelBeforeReset": "number", // Fill % before emptying (0-100)
  "collectorLocation": {                   // GPS location at time of collection
    "lat": "number",
    "lng": "number",
    "accuracy": "number"
  },
  "previousStatus": "string",              // Enum: "normal", "warning", "critical", "offline"
  "collectionResult": "string",            // Enum: "success", "failed", "skipped"
  "notes": "string",                       // Optional operator notes
  "createdAt": "timestamp"                 // When this event was logged
}
```

**Indexes:**
- `routeSessionId, collectedAt` (composite)
- `binId, collectedAt` (composite, descending collectedAt)
- `collectedAt` (descending, for time-based queries)

**Immutability Notes:**
- These records MUST NOT be updated after creation
- Use field-level RLS to prevent modifications
- Only allow deletes via admin API after retention period (e.g., 2 years)

---

### 3. `bins` Collection (Enhanced)

Updates to the existing bins collection to support telemetry and health tracking.

**New Fields to Add:**
```json
{
  // ... existing fields ...
  "sourceMode": "string",                 // Enum: "simulator", "live-sensor", "fallback"
  "sensorHealth": "string",               // Enum: "ok", "degraded", "critical", "offline"
  "lastSeenAt": "timestamp",              // Last time data was received from sensor
  "dataAgeMinutes": "number",             // How old the current reading is
  "isStale": "boolean",                   // Whether data is considered stale (>30 min)
  "lastCollectionAttemptAt": "timestamp", // When we last tried to collect this bin
  "notes": "string"                       // Operator or system notes
}
```

**Index Updates:**
- Add index on `isStale` (for quick filtering of stale sensors)
- Add composite index `status, lastSeenAt` (for monitoring)

---

### 4. `vehicles` Subcollection

New subcollection under a vehicle document to track state history.

**Path:** `vehicles/{vehicleId}/state/current`

**Schema:**
```json
{
  "state": "string",                      // Enum: "idle", "en-route", "collecting", "paused", "returning", "offline"
  "previousState": "string",
  "gpsState": "string",                   // Enum: "ok", "low-accuracy", "denied", "unavailable"
  "lastKnownPosition": {
    "lat": "number",
    "lng": "number",
    "accuracy": "number"
  },
  "gpsAccuracy": "number",                // Meters
  "offlineMode": "boolean",               // Whether operator has toggled offline mode
  "offlineModeReason": "string",
  "offlineModeStartedAt": "timestamp",
  "changedAt": "timestamp",               // When state was last changed
  "gpsUpdatedAt": "timestamp"             // When GPS was last updated
}
```

---

## Migration Guide

### Step 1: Create New Collections

Run this in Firestore Console or via Cloud Functions:

```javascript
// Create empty collections
db.collection('routeSessions').doc('placeholder').set({
  placeholder: true,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

db.collection('collectionEvents').doc('placeholder').set({
  placeholder: true,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});
```

### Step 2: Update Bins Collection

Add the new fields to existing bin documents:

```javascript
const snapshot = await db.collection('bins').get();
const batch = db.batch();

snapshot.forEach((doc) => {
  batch.update(doc.ref, {
    sourceMode: 'simulator',
    sensorHealth: 'ok',
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
    dataAgeMinutes: 0,
    isStale: false,
    lastCollectionAttemptAt: null,
    notes: 'Migrated from old schema',
  });
});

await batch.commit();
```

### Step 3: Create Indexes

In Firestore Console, create these composite indexes:

1. **routeSessions:**
   - Collection: `routeSessions`
   - Fields: `vehicleId` (Asc), `status` (Asc), `createdAt` (Desc)

2. **collectionEvents (by session):**
   - Collection: `collectionEvents`
   - Fields: `routeSessionId` (Asc), `collectedAt` (Desc)

3. **collectionEvents (by bin):**
   - Collection: `collectionEvents`
   - Fields: `binId` (Asc), `collectedAt` (Desc)

---

## Security Rules (Row Level Security)

Add these rules to your `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Route Sessions - vehicle operators can read their own sessions
    match /routeSessions/{sessionId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && 
                       request.resource.data.vehicleId == request.auth.uid;
      allow update: if request.auth != null && 
                       resource.data.vehicleId == request.auth.uid;
      allow delete: if false; // Never allow deletion
    }

    // Collection Events - immutable event log
    match /collectionEvents/{eventId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if false; // Never allow updates to event log
      allow delete: if false; // Never allow deletion
    }

    // Bins - all operators can read, admins can write
    match /bins/{binId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth.token.admin == true;
      allow delete: if false;
    }

    // Vehicle State
    match /vehicles/{vehicleId}/state/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == vehicleId;
    }
  }
}
```

---

## Query Examples

### Get active routes for a vehicle
```javascript
const query = db.collection('routeSessions')
  .where('vehicleId', '==', 'truck-1')
  .where('status', 'in', ['active', 'paused'])
  .orderBy('createdAt', 'desc')
  .limit(1);
```

### Get collection history for a bin
```javascript
const query = db.collection('collectionEvents')
  .where('binId', '==', 'bin-123')
  .orderBy('collectedAt', 'desc')
  .limit(30);
```

### Get stale sensors
```javascript
const query = db.collection('bins')
  .where('isStale', '==', true)
  .where('status', 'in', ['warning', 'critical'])
  .orderBy('dataAgeMinutes', 'desc');
```

### Get collection stats for a time range
```javascript
const startDate = new Date('2024-01-01');
const endDate = new Date('2024-01-31');

const query = db.collection('collectionEvents')
  .where('collectedAt', '>=', startDate)
  .where('collectedAt', '<=', endDate)
  .orderBy('collectedAt', 'asc');
```

---

## Data Retention

- **routeSessions:** Keep for 6 months (for route history analysis)
- **collectionEvents:** Keep for 2 years (for audit trail)
- **bins:** Keep current (delete old entries as needed)
- **vehicles/state:** Keep current (can be archived quarterly)

---

## Performance Considerations

1. **Batch writes** for bulk updates (e.g., during migration)
2. **Pagination** when querying large result sets (use cursor-based pagination)
3. **Read-only replicas** for high-traffic analytics queries (enable Datastore mode)
4. **Cloud Firestore pricing:** Monitor document reads/writes, especially for collection events

---

## Debugging & Monitoring

Use Firestore console filters to monitor:
- Active route sessions: Filter `status == 'active'`
- Failed collections: Filter `collectionResult == 'failed'`
- Offline sensors: Filter `isStale == true && sensorHealth == 'offline'`
- GPS issues: Filter `gpsState != 'ok'`
