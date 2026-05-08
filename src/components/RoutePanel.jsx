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

// Dark-theme status colors — rgba approach consistent with BinCard
const statusColors = {
  critical: { bg: "rgba(239,68,68,0.1)",   border: "var(--status-full)",  text: "#f87171" },
  warning:  { bg: "rgba(245,158,11,0.1)",  border: "var(--status-half)",  text: "#fbbf24" },
  normal:   { bg: "rgba(34,197,94,0.1)",   border: "var(--status-empty)", text: "#4ade80" },
};

function StepConnector({ distance, active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 20px", margin: "2px 0" }}>
      <div style={{
        width: "2px", height: "24px",
        background: active ? "var(--status-full)" : "var(--surface-border)",
        marginLeft: "11px", flexShrink: 0,
      }} />
      <span style={{ fontSize: "11px", color: active ? "#f87171" : "var(--text-muted)", fontWeight: active ? 700 : 400 }}>
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
    if (routeBinIds.length > 0) return orderBinsByRouteIds(bins, routeBinIds);
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

  const btnDisabled = Boolean(collectingBinId);

  return (
    <div>
      {/* Panel Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <div style={{
              width: 34, height: 34, borderRadius: "10px",
              background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px",
            }}>🚛</div>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "var(--text-main)", fontFamily: "'Syne', sans-serif", letterSpacing: "-0.01em" }}>
              Collection Route
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)", paddingLeft: "44px" }}>
            Shortest-path-first order from Batangas City Sanitary Landfill.
          </p>
        </div>

        {scheduledCount > 0 && (
          <button
            onClick={routeStarted ? onCancelRoute : onStartRoute}
            disabled={btnDisabled}
            style={{
              background: btnDisabled
                ? "rgba(255,255,255,0.05)"
                : routeStarted
                ? "rgba(239,68,68,0.1)"
                : "var(--primary-color)",
              color: btnDisabled
                ? "var(--text-muted)"
                : routeStarted
                ? "#f87171"
                : "#0d1a12",
              border: routeStarted ? "1px solid rgba(239,68,68,0.3)" : "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "13px",
              cursor: btnDisabled ? "not-allowed" : "pointer",
              fontWeight: 700,
              flexShrink: 0,
              transition: "var(--transition)",
            }}
            onMouseOver={(e) => {
              if (btnDisabled) return;
              e.currentTarget.style.background = routeStarted ? "rgba(239,68,68,0.18)" : "var(--primary-hover)";
            }}
            onMouseOut={(e) => {
              if (btnDisabled) return;
              e.currentTarget.style.background = routeStarted ? "rgba(239,68,68,0.1)" : "var(--primary-color)";
            }}
          >
            {routeStarted ? "✕ Cancel Route" : "▶ Start Route"}
          </button>
        )}
      </div>

      {/* Empty state */}
      {scheduledCount === 0 && !routeComplete ? (
        <div style={{
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: "var(--border-radius-sm)",
          padding: "20px",
          display: "flex", alignItems: "center", gap: "14px",
        }}>
          <span style={{ fontSize: "24px" }}>✅</span>
          <div>
            <div style={{ fontWeight: 700, color: "var(--primary-color)", fontSize: "14px" }}>All bins are good</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              No bins are above 70% — no collection needed right now.
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats strip */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
            {[
              { label: "Scheduled stops",         value: scheduledCount },
              { label: "Remaining distance",       value: `${totalDistance.toFixed(2)} km` },
              { label: "Completed",                value: `${completedStops.length}/${scheduledCount}` },
              { label: "Status",                   value: collectingBinId ? "Collecting" : routeStarted ? "In transit" : routeComplete ? "Complete" : "Ready" },
            ].map((stat) => (
              <div key={stat.label} style={{
                flex: "1", minWidth: "120px",
                background: "var(--surface-color)",
                border: "1px solid var(--surface-border)",
                borderRadius: "var(--border-radius-sm)",
                padding: "12px 16px",
              }}>
                <div style={{ fontSize: stat.label === "Status" ? "15px" : "20px", fontWeight: 800, color: "var(--text-accent)", fontFamily: "'Syne', sans-serif" }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          <div>
            {/* Start station */}
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              background: "rgba(34,197,94,0.06)",
              borderRadius: "var(--border-radius-sm)",
              padding: "12px 16px",
              border: "1px solid rgba(34,197,94,0.18)",
            }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%",
                background: "rgba(34,197,94,0.15)",
                border: "2px solid var(--primary-color)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, fontSize: "14px",
              }}>
                {collectorStart.binId.includes("Landfill") ? "🏭" : "🚛"}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-main)" }}>
                  {collectorStart.binId}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {collectorStart.binId.includes("Landfill") ? "Landfill — start point" : "Last collected bin"}
                </div>
              </div>
            </div>

            {fullPlannedRoute.map((stop, index) => {
              const isCompleted   = completedStops.includes(stop.binId);
              const isCurrent     = stop.binId === orderedRoute[0]?.binId && !collectingBinId;
              const isCollecting  = stop.binId === collectingBinId;
              const isFacility    = stop.zone === "Disposal";

              const sc = statusColors[stop.status] || statusColors.normal;

              return (
                <React.Fragment key={stop.binId}>
                  <StepConnector distance={stop.distanceFromPrev} active={routeStarted && (isCurrent || isCollecting)} />

                  {isFacility ? (
                    /* Landfill stop */
                    <div style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      background: isCurrent || isCollecting
                        ? "rgba(245,158,11,0.1)"
                        : "rgba(142,68,173,0.1)",
                      borderRadius: "var(--border-radius-sm)",
                      padding: "14px 16px",
                      border: `1px solid ${isCurrent || isCollecting ? "rgba(245,158,11,0.35)" : "rgba(142,68,173,0.25)"}`,
                      opacity: isCompleted ? 0.55 : 1,
                      transition: "var(--transition)",
                    }}>
                      <div style={{
                        width: "32px", height: "32px", borderRadius: "8px",
                        background: isCompleted ? "rgba(34,197,94,0.2)" : "rgba(142,68,173,0.2)",
                        border: `2px solid ${isCompleted ? "var(--status-empty)" : "#8e44ad"}`,
                        color: isCompleted ? "#4ade80" : "#c39bd3",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "14px", fontWeight: 700, flexShrink: 0,
                      }}>
                        {isCompleted ? "✓" : "🏭"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-main)" }}>
                            {stop.binId}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Start/End Shift & Final Disposal
                          </span>
                          {(isCurrent || isCollecting || isCompleted) && (
                            <span style={{
                              background: isCompleted ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                              color: isCompleted ? "#4ade80" : "#fbbf24",
                              border: `1px solid ${isCompleted ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`,
                              borderRadius: "6px", padding: "2px 8px",
                              fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em",
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
                      background: isCompleted
                        ? "rgba(34,197,94,0.07)"
                        : isCurrent || isCollecting
                        ? "rgba(239,68,68,0.08)"
                        : sc.bg,
                      borderRadius: "var(--border-radius-sm)",
                      padding: "12px 16px",
                      border: `1px solid ${
                        isCompleted
                          ? "rgba(34,197,94,0.25)"
                          : isCurrent || isCollecting
                          ? "rgba(239,68,68,0.35)"
                          : sc.border + "55"
                      }`,
                      borderLeft: `4px solid ${
                        isCompleted
                          ? "var(--status-empty)"
                          : isCurrent || isCollecting
                          ? "var(--status-full)"
                          : sc.border
                      }`,
                      opacity: isCompleted ? 0.65 : 1,
                      transition: "var(--transition)",
                      boxShadow: isCurrent || isCollecting
                        ? "0 0 16px rgba(239,68,68,0.12)"
                        : "none",
                    }}>
                      <div style={{
                        width: "28px", height: "28px", borderRadius: "50%",
                        background: isCompleted
                          ? "rgba(34,197,94,0.15)"
                          : isCurrent || isCollecting
                          ? "rgba(239,68,68,0.15)"
                          : "rgba(255,255,255,0.05)",
                        border: `2px solid ${
                          isCompleted
                            ? "var(--status-empty)"
                            : isCurrent || isCollecting
                            ? "var(--status-full)"
                            : sc.border
                        }`,
                        color: isCompleted ? "#4ade80" : isCurrent || isCollecting ? "#f87171" : sc.text,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "12px", fontWeight: 800, flexShrink: 0,
                        fontFamily: "'Syne', sans-serif",
                      }}>
                        {index + 1}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                          <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-main)", fontFamily: "'Syne', sans-serif" }}>
                            {stop.binId}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
                            {stop.zone}
                          </span>
                          {(isCurrent || isCollecting || isCompleted) && (
                            <span style={{
                              background: isCompleted
                                ? "rgba(34,197,94,0.15)"
                                : "rgba(239,68,68,0.15)",
                              color: isCompleted ? "#4ade80" : "#f87171",
                              border: `1px solid ${isCompleted ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                              borderRadius: "6px", padding: "2px 8px",
                              fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em",
                            }}>
                              {isCompleted ? "COLLECTED" : isCollecting ? "COLLECTING" : routeStarted ? "NEXT STOP" : "FIRST STOP"}
                            </span>
                          )}
                        </div>

                        {/* Fill bar */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{
                            flex: 1, background: "rgba(255,255,255,0.06)",
                            borderRadius: "99px", height: "6px", maxWidth: "160px", overflow: "hidden",
                          }}>
                            <div style={{
                              width: `${Number(stop.fillLevel) || 0}%`,
                              background: isCompleted
                                ? "var(--status-empty)"
                                : isCollecting
                                ? "var(--status-full)"
                                : sc.border,
                              height: "6px", borderRadius: "99px",
                              transition: "width 0.12s linear",
                              boxShadow: `0 0 6px ${isCompleted ? "var(--status-empty)" : isCollecting ? "var(--status-full)" : sc.border}66`,
                            }} />
                          </div>
                          <span style={{
                            fontSize: "12px", fontWeight: 700,
                            color: isCompleted ? "#4ade80" : isCollecting ? "#f87171" : sc.text,
                          }}>
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
              <div style={{
                marginTop: "16px",
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.25)",
                borderRadius: "var(--border-radius-sm)",
                padding: "20px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: "28px", marginBottom: "8px" }}>🎉</div>
                <div style={{ fontWeight: 700, color: "var(--primary-color)", fontSize: "15px", fontFamily: "'Syne', sans-serif" }}>
                  Route Complete!
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>
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