import React, { useMemo } from "react";

const DEPOT = { lat: 13.7572, lng: 121.0588, binId: "Barangay Hall", zone: "Depot" };

function hasValidCoordinates(point) {
  return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng));
}

function normalizePoint(point) {
  return { ...point, lat: Number(point.lat), lng: Number(point.lng) };
}

function getDistance(a, b) {
  if (!hasValidCoordinates(a) || !hasValidCoordinates(b)) return Infinity;

  const pointA = normalizePoint(a);
  const pointB = normalizePoint(b);
  const R = 6371000;
  const dLat = ((pointB.lat - pointA.lat) * Math.PI) / 180;
  const dLng = ((pointB.lng - pointA.lng) * Math.PI) / 180;
  const lat1 = (pointA.lat * Math.PI) / 180;
  const lat2 = (pointB.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function optimizeRoute(bins, startPoint = DEPOT) {
  const unvisited = bins.filter(hasValidCoordinates).map(normalizePoint);
  const route = [];
  let current = normalizePoint(startPoint);

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    unvisited.forEach((bin, index) => {
      const distance = getDistance(current, bin);
      const currentNearest = unvisited[nearestIndex];
      const isCloser = distance < nearestDistance;
      const isTieButEarlierId =
        distance === nearestDistance && String(bin.binId).localeCompare(String(currentNearest?.binId || "")) < 0;

      if (isCloser || isTieButEarlierId) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const nearest = unvisited.splice(nearestIndex, 1)[0];
    route.push({ ...nearest, distanceFromPrev: Math.round(nearestDistance) });
    current = nearest;
  }

  return route;
}

function getCollectorStart(bins, completedStops) {
  const lastCompletedId = [...completedStops].reverse().find(Boolean);
  const lastCompletedBin = bins.find((bin) => bin.binId === lastCompletedId && hasValidCoordinates(bin));
  return lastCompletedBin ? normalizePoint(lastCompletedBin) : DEPOT;
}

function orderBinsByRouteIds(bins, routeBinIds = []) {
  const binById = new Map(bins.filter(hasValidCoordinates).map((bin) => [bin.binId, normalizePoint(bin)]));
  return routeBinIds.map((binId) => binById.get(binId)).filter(Boolean);
}

function attachSequentialDistances(routeBins, startPoint = DEPOT) {
  let current = normalizePoint(startPoint);
  return routeBins.map((bin) => {
    const distanceFromPrev = Math.round(getDistance(current, bin));
    current = bin;
    return { ...bin, distanceFromPrev };
  });
}

const statusColors = {
  critical: { bg: "#fadbd8", border: "#c0392b", text: "#c0392b" },
  warning: { bg: "#fdebd0", border: "#d35400", text: "#d35400" },
  normal: { bg: "#d5f5e3", border: "#1e8449", text: "#1e8449" },
};

function StepConnector({ distance, active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 20px", margin: "2px 0" }}>
      <div style={{ width: "2px", height: "24px", background: active ? "#e74c3c" : "#bbb", marginLeft: "11px", flexShrink: 0 }} />
      <span style={{ fontSize: "11px", color: active ? "#e74c3c" : "#888", fontWeight: active ? 700 : 400 }}>
        {Number.isFinite(distance) ? `${distance}m` : "--"}
      </span>
    </div>
  );
}

function RoutePanel({
  bins,
  completedStops = [],
  routeStarted = false,
  routeBinIds = [],
  collectingBinId = null,
  onStartRoute,
  onCancelRoute,
}) {
  const routeBins = useMemo(() => {
    if (routeBinIds.length > 0) {
      return orderBinsByRouteIds(bins, routeBinIds);
    }

    return optimizeRoute(
      bins.filter((bin) => Number(bin.fillLevel) >= 70 && hasValidCoordinates(bin)),
      DEPOT
    );
  }, [bins, routeBinIds.join(",")]);

  const collectorStart = useMemo(() => getCollectorStart(bins, completedStops), [bins, completedStops]);
  const remainingRouteBins = routeBins.filter((bin) => !completedStops.includes(bin.binId));
  const orderedRoute = attachSequentialDistances(remainingRouteBins, collectorStart);
  const fullPlannedRoute = attachSequentialDistances(routeBins, DEPOT);
  const scheduledCount = routeBins.length;
  const totalDistance = orderedRoute.reduce((sum, bin) => sum + bin.distanceFromPrev, 0) / 1000;
  const routeComplete = !routeStarted && scheduledCount > 0 && completedStops.length >= scheduledCount;

  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        padding: "20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
        marginBottom: "20px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "18px" }}>🚛</span>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1a5276" }}>
              Shortest Path First Collection Route
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "#888" }}>
            The route is locked using shortest-path-first order from Barangay Hall when Start Route is clicked.
          </p>
        </div>

        {scheduledCount > 0 && (
          <button
            onClick={routeStarted ? onCancelRoute : onStartRoute}
            disabled={Boolean(collectingBinId)}
            style={{
              background: collectingBinId ? "#9aa7b0" : routeStarted ? "#888" : "#1a5276",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "13px",
              cursor: collectingBinId ? "not-allowed" : "pointer",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {routeStarted ? "✕ Cancel Route" : "▶ Start Route"}
          </button>
        )}
      </div>

      {scheduledCount === 0 && !routeComplete ? (
        <div
          style={{
            background: "#d5f5e3",
            borderRadius: "10px",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "22px" }}>✅</span>
          <div>
            <div style={{ fontWeight: 700, color: "#1e8449", fontSize: "14px" }}>All bins are good</div>
            <div style={{ fontSize: "12px", color: "#555" }}>No bins are above 70% — no collection needed right now.</div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
            {[
              { label: "Scheduled bins", value: scheduledCount },
              { label: "Remaining route distance", value: `${totalDistance.toFixed(2)} km` },
              { label: "Collected", value: `${completedStops.length}/${scheduledCount}` },
              { label: "Status", value: collectingBinId ? "Collecting" : routeStarted ? "In transit" : routeComplete ? "Complete" : "Ready" },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  flex: "1",
                  minWidth: "120px",
                  background: "#f0f4f8",
                  borderRadius: "10px",
                  padding: "10px 14px",
                }}
              >
                <div style={{ fontSize: stat.label === "Status" ? "16px" : "20px", fontWeight: 700, color: "#1a5276" }}>{stat.value}</div>
                <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                background: "#eaf4fb",
                borderRadius: "10px",
                padding: "12px 16px",
                border: "1px solid #d6eaf8",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: "#2e86c1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "14px",
                }}
              >
                {collectorStart.binId === "Barangay Hall" ? "🏠" : "🚛"}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "#1a5276" }}>{collectorStart.binId}</div>
                <div style={{ fontSize: "11px", color: "#5d8aa8" }}>
                  {collectorStart.binId === "Barangay Hall" ? "Depot — start point" : "Last collected bin"}
                </div>
              </div>
            </div>

            {fullPlannedRoute.map((stop, index) => {
              const isCompleted = completedStops.includes(stop.binId);
              const isCurrent = stop.binId === orderedRoute[0]?.binId && !collectingBinId;
              const isCollecting = stop.binId === collectingBinId;
              const colors = statusColors[stop.status] || statusColors.normal;

              return (
                <React.Fragment key={stop.binId}>
                  <StepConnector distance={stop.distanceFromPrev} active={routeStarted && (isCurrent || isCollecting)} />

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      background: isCompleted ? "#d5f5e3" : isCurrent || isCollecting ? "#fff5f5" : colors.bg,
                      borderRadius: "10px",
                      padding: "12px 16px",
                      border: `1.5px solid ${isCompleted ? "#1e8449" : isCurrent || isCollecting ? "#e74c3c" : colors.border}`,
                      opacity: isCompleted ? 0.8 : 1,
                      transition: "all 0.3s",
                    }}
                  >
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: isCompleted ? "#1e8449" : isCurrent || isCollecting ? "#e74c3c" : colors.border,
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: "14px", color: "#1a1a1a" }}>{stop.binId}</span>
                        <span style={{ fontSize: "11px", color: "#888" }}>{stop.zone}</span>
                        {(isCurrent || isCollecting || isCompleted) && (
                          <span
                            style={{
                              background: isCompleted ? "#1e8449" : "#e74c3c",
                              color: "white",
                              borderRadius: "6px",
                              padding: "2px 8px",
                              fontSize: "10px",
                              fontWeight: 700,
                            }}
                          >
                            {isCompleted ? "COLLECTED" : isCollecting ? "COLLECTING" : routeStarted ? "NEXT STOP" : "FIRST STOP"}
                          </span>
                        )}
                      </div>

                      <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, background: "#eee", borderRadius: "4px", height: "6px", maxWidth: "160px" }}>
                          <div
                            style={{
                              width: `${Number(stop.fillLevel) || 0}%`,
                              background: isCompleted ? "#1e8449" : isCollecting ? "#e74c3c" : colors.border,
                              height: "6px",
                              borderRadius: "4px",
                              transition: "width 0.12s linear",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: isCompleted ? "#1e8449" : isCollecting ? "#e74c3c" : colors.text }}>
                          {Number(stop.fillLevel) || 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}

            {routeComplete && (
              <div
                style={{
                  marginTop: "16px",
                  background: "#d5f5e3",
                  border: "1px solid #1e8449",
                  borderRadius: "10px",
                  padding: "16px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "28px", marginBottom: "6px" }}>🎉</div>
                <div style={{ fontWeight: 700, color: "#1e8449", fontSize: "15px" }}>Route Complete!</div>
                <div style={{ color: "#555", fontSize: "13px", margin: "4px 0 0" }}>
                  All scheduled priority bins have been collected and drained to 0%.
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default RoutePanel;
