import React, { useMemo } from "react";

const LANDFILL = { lat: 13.74787, lng: 121.16597, binId: "Batangas City Sanitary Landfill", zone: "Disposal" };

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

function optimizeRoute(bins, startPoint = LANDFILL) {
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
  return lastCompletedBin ? normalizePoint(lastCompletedBin) : LANDFILL;
}

function orderBinsByRouteIds(bins, routeBinIds = []) {
  const binById = new Map(bins.filter(hasValidCoordinates).map((bin) => [bin.binId, normalizePoint(bin)]));
  return routeBinIds.map((binId) => binById.get(binId)).filter(Boolean);
}

function attachSequentialDistances(routeBins, startPoint = LANDFILL) {
  let current = normalizePoint(startPoint);
  return routeBins.map((bin) => {
    const distanceFromPrev = Math.round(getDistance(current, bin));
    current = bin;
    return { ...bin, distanceFromPrev };
  });
}

const statusColors = {
  critical: { bg: "rgba(239,68,68,0.08)",  border: "#ef4444", text: "#f87171" },
  warning:  { bg: "rgba(245,158,11,0.08)", border: "#f59e0b", text: "#fbbf24" },
  normal:   { bg: "rgba(34,197,94,0.08)",  border: "#22c55e", text: "#4ade80" },
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
      LANDFILL
    );
  }, [bins, routeBinIds.join(",")]);

  const collectorStart = useMemo(() => getCollectorStart(bins, completedStops), [bins, completedStops]);
  const remainingRouteBins = routeBins.filter((bin) => !completedStops.includes(bin.binId));
  const orderedRoute = attachSequentialDistances(remainingRouteBins, collectorStart);
  const fullPlannedRoute = attachSequentialDistances(routeBins, LANDFILL);
  const scheduledCount = routeBins.length;
  const totalDistance = orderedRoute.reduce((sum, bin) => sum + bin.distanceFromPrev, 0) / 1000;
  const routeComplete = !routeStarted && scheduledCount > 0 && completedStops.length >= scheduledCount;

return (
  <div
    style={{
      background: "var(--surface-raised)",
      border: "1px solid var(--surface-border)",
      borderRadius: "var(--border-radius)",
      padding: "20px",
      boxShadow: "var(--box-shadow)",
      marginBottom: "20px",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <span style={{ fontSize: "18px" }}>🚛</span>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-main)", fontFamily: "'Syne', sans-serif" }}>
            Shortest Path First Collection Route
          </h3>
        </div>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
          The route is locked using shortest-path-first order from Batangas City Sanitary Landfill when Start Route is clicked.
        </p>
      </div>

      {scheduledCount > 0 && (
        <button
          onClick={routeStarted ? onCancelRoute : onStartRoute}
          disabled={Boolean(collectingBinId)}
          style={{
            background: collectingBinId ? "rgba(255,255,255,0.05)" : routeStarted ? "rgba(239,68,68,0.12)" : "var(--primary-color)",
            color: collectingBinId ? "var(--text-muted)" : routeStarted ? "#f87171" : "white",
            border: collectingBinId ? "1px solid var(--surface-border)" : routeStarted ? "1px solid rgba(239,68,68,0.3)" : "none",
            borderRadius: "var(--border-radius-sm)",
            padding: "10px 20px",
            fontSize: "13px",
            cursor: collectingBinId ? "not-allowed" : "pointer",
            fontWeight: 700,
            flexShrink: 0,
            transition: "var(--transition)",
          }}
        >
          {routeStarted ? "✕ Cancel Route" : "▶ Start Route"}
        </button>
      )}
    </div>

    {scheduledCount === 0 && !routeComplete ? (
      <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "var(--border-radius-sm)", padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "22px" }}>✅</span>
        <div>
          <div style={{ fontWeight: 700, color: "#4ade80", fontSize: "14px" }}>All bins are good</div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No bins are above 70% — no collection needed right now.</div>
        </div>
      </div>
    ) : (
      <>
        {/* Route Stats */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
          {[
            { label: "Scheduled stops", value: scheduledCount },
            { label: "Remaining route distance", value: `${totalDistance.toFixed(2)} km` },
            { label: "Completed", value: `${completedStops.length}/${scheduledCount}` },
            { label: "Status", value: collectingBinId ? "Collecting" : routeStarted ? "In transit" : routeComplete ? "Complete" : "Ready" },
          ].map((stat) => (
            <div key={stat.label} style={{ flex: "1", minWidth: "120px", background: "var(--surface-color)", border: "1px solid var(--surface-border)", borderRadius: "var(--border-radius-sm)", padding: "10px 14px" }}>
              <div style={{ fontSize: stat.label === "Status" ? "16px" : "20px", fontWeight: 700, color: "var(--text-accent)", fontFamily: "'Syne', sans-serif" }}>{stat.value}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div>
          {/* Start Station */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--surface-color)", border: "1px solid var(--surface-border)", borderRadius: "var(--border-radius-sm)", padding: "12px 16px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--primary-color)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "14px" }}>
              {collectorStart.binId.includes("Landfill") ? "🏭" : "🚛"}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-main)", fontFamily: "'Syne', sans-serif" }}>{collectorStart.binId}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {collectorStart.binId.includes("Landfill") ? "Landfill — start point" : "Last collected bin"}
              </div>
            </div>
          </div>

          {fullPlannedRoute.map((stop, index) => {
            const isCompleted = completedStops.includes(stop.binId);
            const isCurrent = stop.binId === orderedRoute[0]?.binId && !collectingBinId;
            const isCollecting = stop.binId === collectingBinId;
            const isFacility = stop.zone === "Disposal";

            return (
              <React.Fragment key={stop.binId}>
                <StepConnector distance={stop.distanceFromPrev} active={routeStarted && (isCurrent || isCollecting)} />

                {isFacility ? (
                  /* Landfill stop */
                  <div style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    background: isCurrent || isCollecting ? "rgba(245,158,11,0.1)" : "var(--surface-color)",
                    borderRadius: "var(--border-radius-sm)",
                    padding: "14px 16px",
                    border: `1px solid ${isCurrent || isCollecting ? "rgba(245,158,11,0.35)" : "var(--surface-border)"}`,
                    opacity: isCompleted ? 0.6 : 1,
                    transition: "var(--transition)",
                  }}>
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "8px",
                      background: isCompleted ? "#22c55e" : "rgba(139,92,246,0.25)",
                      border: `1px solid ${isCompleted ? "#22c55e" : "rgba(139,92,246,0.4)"}`,
                      color: isCompleted ? "white" : "#a78bfa",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "14px", fontWeight: 700, flexShrink: 0,
                    }}>
                      {isCompleted ? "✓" : "🏭"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-main)", fontFamily: "'Syne', sans-serif" }}>{stop.binId}</span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Start/End Shift & Final Disposal</span>
                        {(isCurrent || isCollecting || isCompleted) && (
                          <span style={{
                            background: isCompleted ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
                            color: isCompleted ? "#4ade80" : "#fbbf24",
                            border: `1px solid ${isCompleted ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`,
                            borderRadius: "6px", padding: "2px 8px", fontSize: "10px", fontWeight: 700,
                          }}>
                            {isCompleted ? "COMPLETED" : "ARRIVING"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Bin stop */
                  <div style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    background: isCompleted ? "rgba(34,197,94,0.06)" : isCurrent || isCollecting ? "rgba(239,68,68,0.06)" : (statusColors[stop.status] || statusColors.normal).bg,
                    borderRadius: "var(--border-radius-sm)",
                    padding: "12px 16px",
                    border: `1px solid ${isCompleted ? "rgba(34,197,94,0.25)" : isCurrent || isCollecting ? "rgba(239,68,68,0.3)" : (statusColors[stop.status] || statusColors.normal).border + "55"}`,
                    opacity: isCompleted ? 0.7 : 1,
                    transition: "var(--transition)",
                  }}>
                    <div style={{
                      width: "28px", height: "28px", borderRadius: "50%",
                      background: isCompleted ? "#22c55e" : isCurrent || isCollecting ? "#ef4444" : (statusColors[stop.status] || statusColors.normal).border,
                      color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "12px", fontWeight: 700, flexShrink: 0,
                    }}>
                      {index + 1}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-main)", fontFamily: "'Syne', sans-serif" }}>{stop.binId}</span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{stop.zone}</span>
                        {(isCurrent || isCollecting || isCompleted) && (
                          <span style={{
                            background: isCompleted ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                            color: isCompleted ? "#4ade80" : "#f87171",
                            border: `1px solid ${isCompleted ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                            borderRadius: "6px", padding: "2px 8px", fontSize: "10px", fontWeight: 700,
                          }}>
                            {isCompleted ? "COLLECTED" : isCollecting ? "COLLECTING" : routeStarted ? "NEXT STOP" : "FIRST STOP"}
                          </span>
                        )}
                      </div>

                      <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: "99px", height: "6px", maxWidth: "160px" }}>
                          <div style={{
                            width: `${Number(stop.fillLevel) || 0}%`,
                            background: isCompleted ? "#22c55e" : isCollecting ? "#ef4444" : (statusColors[stop.status] || statusColors.normal).border,
                            height: "6px", borderRadius: "99px",
                            transition: "width 0.12s linear",
                          }} />
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: isCompleted ? "#4ade80" : isCollecting ? "#f87171" : (statusColors[stop.status] || statusColors.normal).text }}>
                          {Number(stop.fillLevel) || 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {routeComplete && (
            <div style={{ marginTop: "16px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "var(--border-radius-sm)", padding: "16px", textAlign: "center" }}>
              <div style={{ fontSize: "28px", marginBottom: "6px" }}>🎉</div>
              <div style={{ fontWeight: 700, color: "#4ade80", fontSize: "15px", fontFamily: "'Syne', sans-serif" }}>Route Complete!</div>
              <div style={{ color: "var(--text-muted)", fontSize: "13px", margin: "4px 0 0" }}>
                All scheduled priority bins have been collected and unloaded at the Landfill.
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