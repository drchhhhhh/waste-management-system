import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebase/config";
import { doc, updateDoc } from "firebase/firestore";
import {
  BARANGAY_HALL,
  nearestNeighborRoute,
  calculateDistance,
  isAtBinLocation,
} from "../utils/routingUtils";

const DEPOT = BARANGAY_HALL;

const statusColors = {
  critical: { bg: "#fadbd8", border: "#c0392b", text: "#c0392b", badge: "#c0392b" },
  warning:  { bg: "#fdebd0", border: "#d35400", text: "#d35400", badge: "#d35400" },
  normal:   { bg: "#d5f5e3", border: "#1e8449", text: "#1e8449", badge: "#1e8449" },
};

function StepConnector({ distance }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 20px", margin: "2px 0" }}>
      <div style={{ width: "2px", height: "24px", background: "#ddd", marginLeft: "11px", flexShrink: 0 }} />
      <span style={{ fontSize: "11px", color: "#aaa" }}>{distance}m</span>
    </div>
  );
}

function RoutePanel({ bins, completedStops, setCompletedStops, onRouteChange, truckPosition, setTruckPosition }) {
  const [routeStarted, setRouteStarted] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState([]);
  const [animatingBins, setAnimatingBins] = useState({}); // Track bins being collected
  const collectionIntervalRef = useRef(null);

  const priorityBins = bins.filter((b) => b.fillLevel >= 70);

  // Build route once and keep it until manually randomized
  useEffect(() => {
    if (priorityBins.length > 0 && optimizedRoute.length === 0) {
      const newRoute = nearestNeighborRoute(priorityBins, BARANGAY_HALL);
      const routeWithDistances = newRoute.map((bin, idx) => {
        const prevLocation = idx === 0 ? BARANGAY_HALL : newRoute[idx - 1];
        const distance = calculateDistance(
          prevLocation.lat,
          prevLocation.lng,
          bin.lat,
          bin.lng
        ) * 1000; // Convert to meters
        return { ...bin, distanceFromPrev: Math.round(distance) };
      });
      setOptimizedRoute(routeWithDistances);
    }
  }, [priorityBins.length]);

  // Manual randomize button - regenerate route
  const handleRandomizeRoute = () => {
    const newRoute = nearestNeighborRoute(priorityBins, BARANGAY_HALL);
    const routeWithDistances = newRoute.map((bin, idx) => {
      const prevLocation = idx === 0 ? BARANGAY_HALL : newRoute[idx - 1];
      const distance = calculateDistance(
        prevLocation.lat,
        prevLocation.lng,
        bin.lat,
        bin.lng
      ) * 1000;
      return { ...bin, distanceFromPrev: Math.round(distance) };
    });
    setOptimizedRoute(routeWithDistances);
    setCompletedStops([]);
  };

  // Start route - initialize truck position at barangay hall
  const handleStartRoute = () => {
    setRouteStarted(true);
    setTruckPosition({ ...BARANGAY_HALL });
    setCompletedStops([]);
    // Don't clear route - keep the optimized route
  };

  // Calculate return distance
  const returnDist = optimizedRoute.length > 0
    ? Math.round(calculateDistance(
        optimizedRoute[optimizedRoute.length - 1].lat,
        optimizedRoute[optimizedRoute.length - 1].lng,
        DEPOT.lat,
        DEPOT.lng
      ) * 1000)
    : 0;

  // Calculate total distance
  const totalDistance = (
    optimizedRoute.reduce((s, b) => s + b.distanceFromPrev, 0) + returnDist
  ) / 1000;

  const currentStopIndex = completedStops.length;
  const allDone = routeStarted && completedStops.length === optimizedRoute.length;

  // Auto bin collection when truck reaches location
  useEffect(() => {
    if (!routeStarted || completedStops.length >= optimizedRoute.length || !truckPosition) {
      return;
    }

    const currentBin = optimizedRoute[currentStopIndex];
    if (!currentBin) return;

    // Check if truck is at current bin location
    if (isAtBinLocation(truckPosition, currentBin, 0.02)) {
      if (!animatingBins[currentBin.binId]) {
        // Start collection animation
        setAnimatingBins(prev => ({ ...prev, [currentBin.binId]: true }));

        // Animate fill level down over 10 seconds
        let steps = 0;
        const maxSteps = 20;
        collectionIntervalRef.current = setInterval(async () => {
          steps++;
          const newFillLevel = Math.max(0, currentBin.fillLevel * (1 - steps / maxSteps));
          
          // Update local state
          bins.find(b => b.binId === currentBin.binId).fillLevel = newFillLevel;

          if (steps >= maxSteps) {
            clearInterval(collectionIntervalRef.current);
            // Mark collection complete
            await updateDoc(doc(db, "bins", currentBin.binId), {
              fillLevel: 0,
              status: "normal",
              lastUpdated: new Date().toISOString(),
              lastCollected: new Date().toISOString(),
            });
            setCompletedStops(prev => [...prev, currentBin.binId]);
            setAnimatingBins(prev => ({ ...prev, [currentBin.binId]: false }));
          }
        }, 500); // Update every 500ms = 10s total for 20 steps
      }
    }
  }, [routeStarted, truckPosition, currentStopIndex, optimizedRoute, completedStops, animatingBins]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (collectionIntervalRef.current) {
        clearInterval(collectionIntervalRef.current);
      }
    };
  }, []);

  return (
    <div style={{
      background: "white",
      borderRadius: "12px",
      padding: "20px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
      marginBottom: "20px"
    }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "18px" }}>🚛</span>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1a5276" }}>
              AI-Optimized Collection Route
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "#888" }}>
            Nearest Neighbor Algorithm — minimizes total travel distance
          </p>
        </div>

        {priorityBins.length > 0 && !allDone && (
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={handleStartRoute}
              disabled={routeStarted}
              style={{
                background: routeStarted ? "#ccc" : "#1a5276",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "13px",
                cursor: routeStarted ? "default" : "pointer",
                fontWeight: 700,
                opacity: routeStarted ? 0.5 : 1
              }}
            >
              {routeStarted ? "✓ Route Active" : "▶ Start Route"}
            </button>
            <button
              onClick={handleRandomizeRoute}
              disabled={routeStarted}
              style={{
                background: routeStarted ? "#ccc" : "#d35400",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "13px",
                cursor: routeStarted ? "default" : "pointer",
                fontWeight: 700,
                opacity: routeStarted ? 0.5 : 1
              }}
            >
              🔄 Randomize
            </button>
          </div>
        )}
      </div>

      {priorityBins.length === 0 ? (
        <div style={{
          background: "#d5f5e3",
          borderRadius: "10px",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: "12px"
        }}>
          <span style={{ fontSize: "22px" }}>✅</span>
          <div>
            <div style={{ fontWeight: 700, color: "#1e8449", fontSize: "14px" }}>All bins are good</div>
            <div style={{ fontSize: "12px", color: "#555" }}>No bins are above 70% — no collection needed right now.</div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
            {[
              { label: "Priority bins", value: priorityBins.length },
              { label: "Total distance", value: `${totalDistance.toFixed(2)} km` },
              { label: "Completed", value: `${completedStops.length}/${priorityBins.length}` },
            ].map(stat => (
              <div key={stat.label} style={{
                flex: "1", minWidth: "100px",
                background: "#f0f4f8",
                borderRadius: "10px",
                padding: "10px 14px"
              }}>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a5276" }}>{stat.value}</div>
                <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Route Timeline */}
          <div>

            {/* Depot Start */}
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              background: "#eaf4fb", borderRadius: "10px",
              padding: "12px 16px", border: "1px solid #d6eaf8"
            }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%",
                background: "#2e86c1", display: "flex", alignItems: "center",
                justifyContent: "center", flexShrink: 0, fontSize: "14px"
              }}>🏠</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "#1a5276" }}>Barangay Hall</div>
                <div style={{ fontSize: "11px", color: "#5d8aa8" }}>Depot — start point</div>
              </div>
            </div>

            {/* Stops */}
            {optimizedRoute.map((stop, index) => {
              const isCompleted = completedStops.includes(stop.binId);
              const isCurrent = routeStarted && index === completedStops.length && !allDone;
              const colors = isCompleted ? statusColors.normal : statusColors[stop.status] || statusColors.normal;

              return (
                <React.Fragment key={stop.binId}>
                  <StepConnector distance={stop.distanceFromPrev} />

                  <div style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    background: isCompleted ? "#f0faf5" : isCurrent ? "#fef9e7" : colors.bg,
                    borderRadius: "10px", padding: "12px 16px",
                    border: `1.5px solid ${isCurrent ? "#f39c12" : isCompleted ? "#a9dfbf" : colors.border}`,
                    transition: "all 0.3s",
                    opacity: isCompleted ? 0.75 : 1
                  }}>
                    {/* Step badge */}
                    <div style={{
                      width: "28px", height: "28px", borderRadius: "50%",
                      background: isCompleted ? "#1e8449" : isCurrent ? "#f39c12" : colors.border,
                      color: "white", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: "12px", fontWeight: 700,
                      flexShrink: 0
                    }}>
                      {isCompleted ? "✓" : index + 1}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: "14px", color: "#1a1a1a" }}>{stop.binId}</span>
                        <span style={{ fontSize: "11px", color: "#888" }}>{stop.zone}</span>
                        {isCurrent && (
                          <span style={{
                            background: "#f39c12", color: "white",
                            borderRadius: "6px", padding: "2px 8px",
                            fontSize: "10px", fontWeight: 700
                          }}>CURRENT STOP</span>
                        )}
                        {isCompleted && (
                          <span style={{
                            background: "#1e8449", color: "white",
                            borderRadius: "6px", padding: "2px 8px",
                            fontSize: "10px", fontWeight: 700
                          }}>COLLECTED</span>
                        )}
                      </div>

                      {/* Fill bar */}
                      <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, background: "#eee", borderRadius: "4px", height: "6px", maxWidth: "160px" }}>
                          <div style={{
                            width: `${stop.fillLevel}%`,
                            background: isCompleted ? "#1e8449" : colors.border,
                            height: "6px", borderRadius: "4px",
                            transition: "width 0.4s"
                          }} />
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: isCompleted ? "#1e8449" : colors.text }}>
                          {stop.fillLevel}%
                        </span>
                      </div>
                    </div>

                    {/* Auto-collecting indicator */}
                    {isCurrent && (
                      <div style={{
                        fontSize: "12px", fontWeight: 700, color: "#f39c12",
                        whiteSpace: "nowrap", flexShrink: 0, padding: "4px 8px",
                        background: "#fff9e6", borderRadius: "6px"
                      }}>
                        🔄 Collecting...
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}

            {/* Return connector */}
            <StepConnector distance={returnDist} />

            {/* Return to Depot */}
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              background: "#eaf4fb", borderRadius: "10px",
              padding: "12px 16px", border: "1px solid #d6eaf8"
            }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%",
                background: "#2e86c1", display: "flex", alignItems: "center",
                justifyContent: "center", flexShrink: 0, fontSize: "14px"
              }}>🏠</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "#1a5276" }}>Barangay Hall</div>
                <div style={{ fontSize: "11px", color: "#5d8aa8" }}>Return to depot</div>
              </div>
            </div>

            {/* Completion */}
            {allDone && (
              <div style={{
                marginTop: "16px", background: "#d5f5e3",
                border: "1px solid #1e8449", borderRadius: "10px",
                padding: "16px", textAlign: "center"
              }}>
                <div style={{ fontSize: "28px", marginBottom: "6px" }}>🎉</div>
                <div style={{ fontWeight: 700, color: "#1e8449", fontSize: "15px" }}>Route Complete!</div>
                <div style={{ color: "#555", fontSize: "13px", margin: "4px 0 12px" }}>
                  All {priorityBins.length} priority bins collected • {totalDistance.toFixed(2)} km total
                </div>
                <button
                  onClick={() => { setRouteStarted(false); setCompletedStops([]); }}
                  style={{
                    background: "#1e8449", color: "white",
                    border: "none", borderRadius: "8px",
                    padding: "8px 24px", fontSize: "13px",
                    cursor: "pointer", fontWeight: 700
                  }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default RoutePanel;
