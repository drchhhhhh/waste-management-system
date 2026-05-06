import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase/config";
import { collection, onSnapshot } from "firebase/firestore";
import BinCard from "./BinCard";
import Map from "./Map";
import RoutePanel from "./RoutePanel";
import CollectionLog from "./CollectionLog";

const DEPOT = { lat: 13.7572, lng: 121.0588, binId: "Barangay Hall", zone: "Depot" };

function getStatusFromFillLevel(fillLevel) {
  if (fillLevel >= 90) return "critical";
  if (fillLevel >= 70) return "warning";
  return "normal";
}

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
    route.push({ ...nearest, distanceFromPrev: nearestDistance });
    current = nearest;
  }

  return route;
}

function getCollectorStart(bins, completedStops) {
  const lastCompletedId = [...completedStops].reverse().find(Boolean);
  const lastCompletedBin = bins.find((bin) => bin.binId === lastCompletedId && hasValidCoordinates(bin));
  return lastCompletedBin ? normalizePoint(lastCompletedBin) : DEPOT;
}

function Dashboard() {
  const [rawBins, setRawBins] = useState([]);
  const [bins, setBins] = useState([]);
  const [selectedZone, setSelectedZone] = useState("All");
  const [completedStops, setCompletedStops] = useState([]);
  const [routeVersion, setRouteVersion] = useState(0);
  const [routeStarted, setRouteStarted] = useState(false);
  const [routeBinIds, setRouteBinIds] = useState([]);
  const [collectingBinId, setCollectingBinId] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bins"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setRawBins(data);
      setBins(data);
    });
    return () => unsub();
  }, []);

  const resetRouteState = () => {
    setRouteStarted(false);
    setCompletedStops([]);
    setRouteBinIds([]);
    setCollectingBinId(null);
    setRouteVersion((version) => version + 1);
  };

  const handleRandomizeBins = () => {
    setBins((currentBins) =>
      currentBins.map((bin) => {
        const fillLevel = Math.floor(Math.random() * 101);
        return {
          ...bin,
          fillLevel,
          status: getStatusFromFillLevel(fillLevel),
          lastUpdated: new Date().toISOString(),
        };
      })
    );
    resetRouteState();
  };

  const handleResetSimulation = () => {
    setBins(rawBins);
    resetRouteState();
  };

  const handleStartRoute = () => {
    const priorityBins = bins.filter((bin) => Number(bin.fillLevel) >= 70 && hasValidCoordinates(bin));
    const shortestPathRoute = optimizeRoute(priorityBins, DEPOT);
    const orderedRouteIds = shortestPathRoute.map((bin) => bin.binId);

    if (orderedRouteIds.length === 0) return;

    setRouteBinIds(orderedRouteIds);
    setCompletedStops([]);
    setCollectingBinId(null);
    setRouteStarted(true);
    setRouteVersion((version) => version + 1);
  };

  const handleCancelRoute = () => {
    resetRouteState();
  };

  const handleArriveAtStop = (bin) => {
    if (!routeStarted || collectingBinId || !bin?.binId) return;
    if (completedStops.includes(bin.binId)) return;
    setCollectingBinId(bin.binId);
  };

  useEffect(() => {
    if (!routeStarted || !collectingBinId) return;

    const activeBin = bins.find((bin) => bin.binId === collectingBinId);
    if (!activeBin) return;

    const currentLevel = Number(activeBin.fillLevel) || 0;

    if (currentLevel <= 0) {
      setCompletedStops((prev) => (prev.includes(collectingBinId) ? prev : [...prev, collectingBinId]));
      setCollectingBinId(null);
      setRouteVersion((version) => version + 1);
      return;
    }

    const drainTimer = setTimeout(() => {
      setBins((currentBins) =>
        currentBins.map((bin) => {
          if (bin.binId !== collectingBinId) return bin;
          const fillLevel = Math.max(0, Number(bin.fillLevel || 0) - 2);
          return {
            ...bin,
            fillLevel,
            status: getStatusFromFillLevel(fillLevel),
            lastUpdated: new Date().toISOString(),
            lastCollected: fillLevel === 0 ? new Date().toISOString() : bin.lastCollected,
          };
        })
      );
    }, 120);

    return () => clearTimeout(drainTimer);
  }, [routeStarted, collectingBinId, bins, completedStops]);

  useEffect(() => {
    const allScheduledBinsCollected =
      routeBinIds.length > 0 && routeBinIds.every((binId) => completedStops.includes(binId));

    if (routeStarted && allScheduledBinsCollected && !collectingBinId) {
      setRouteStarted(false);
    }
  }, [routeStarted, routeBinIds, completedStops, collectingBinId]);

  const zones = ["All", "Zone 1", "Zone 2", "Zone 3", "Zone 4"];
  const filteredBins = selectedZone === "All" ? bins : bins.filter((bin) => bin.zone === selectedZone);

  const critical = bins.filter((bin) => bin.status === "critical").length;
  const warning = bins.filter((bin) => bin.status === "warning").length;
  const normal = bins.filter((bin) => bin.status === "normal").length;

  const previewRouteBinIds = useMemo(() => {
    return optimizeRoute(
      bins.filter((bin) => Number(bin.fillLevel) >= 70 && hasValidCoordinates(bin)),
      DEPOT
    ).map((bin) => bin.binId);
  }, [bins]);

  const activeRouteBinIds = routeBinIds.length > 0 ? routeBinIds : previewRouteBinIds;

  const routeLookup = useMemo(() => {
    const remainingRouteIds = activeRouteBinIds.filter((binId) => !completedStops.includes(binId));
    const currentDestinationId = remainingRouteIds[0] || null;
    const lookup = {};

    activeRouteBinIds.forEach((binId, index) => {
      lookup[binId] = {
        routeOrder: index + 1,
        isCurrentDestination: binId === currentDestinationId && !collectingBinId,
        isCollecting: binId === collectingBinId,
      };
    });

    return lookup;
  }, [activeRouteBinIds, completedStops, collectingBinId]);

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #1a5276, #2e86c1)",
          color: "white",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700 }}>🗑️ Waste Collection Monitoring System</h1>
          <p style={{ fontSize: "13px", opacity: 0.85 }}>Brgy. Palloocan West, Batangas City</p>
        </div>
        <div style={{ fontSize: "13px", opacity: 0.85 }}>Live Firestore data • Manual route simulation</div>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
          {[
            { label: "Total Bins", value: bins.length, color: "#2e86c1", bg: "#d6eaf8" },
            { label: "Critical", value: critical, color: "#c0392b", bg: "#fadbd8" },
            { label: "Warning", value: warning, color: "#d35400", bg: "#fdebd0" },
            { label: "Normal", value: normal, color: "#1e8449", bg: "#d5f5e3" },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: card.bg,
                borderLeft: `5px solid ${card.color}`,
                borderRadius: "10px",
                padding: "14px 20px",
                flex: "1",
                minWidth: "140px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              }}
            >
              <div style={{ fontSize: "28px", fontWeight: 700, color: card.color }}>{card.value}</div>
              <div style={{ fontSize: "13px", color: "#555", marginTop: "2px" }}>{card.label}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "14px 16px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: "#1a5276", fontSize: "14px" }}>Simulation Controls</div>
            <div style={{ color: "#777", fontSize: "12px" }}>
              Bin levels randomize only when clicked. Collection starts only from the Start Route button below.
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleRandomizeBins}
              disabled={routeStarted || Boolean(collectingBinId)}
              style={{
                background: routeStarted || collectingBinId ? "#9aa7b0" : "#1a5276",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "9px 16px",
                cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              🔀 Randomize
            </button>
            <button
              type="button"
              onClick={handleResetSimulation}
              disabled={routeStarted || Boolean(collectingBinId)}
              style={{
                background: "#ffffff",
                color: routeStarted || collectingBinId ? "#9aa7b0" : "#1a5276",
                border: "1px solid #b7c9d8",
                borderRadius: "8px",
                padding: "9px 16px",
                cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Reset to Live Data
            </button>
          </div>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <Map
            bins={bins}
            completedStops={completedStops}
            routeVersion={routeVersion}
            routeStarted={routeStarted}
            collectingBinId={collectingBinId}
            routeBinIds={activeRouteBinIds}
            onArriveAtStop={handleArriveAtStop}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <RoutePanel
            bins={bins}
            completedStops={completedStops}
            routeStarted={routeStarted}
            routeBinIds={activeRouteBinIds}
            collectingBinId={collectingBinId}
            onStartRoute={handleStartRoute}
            onCancelRoute={handleCancelRoute}
          />
        </div>

        <CollectionLog />

        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          {zones.map((zone) => (
            <button
              key={zone}
              onClick={() => setSelectedZone(zone)}
              style={{
                padding: "8px 18px",
                borderRadius: "20px",
                border: "none",
                cursor: "pointer",
                background: selectedZone === zone ? "#2e86c1" : "#dce9f5",
                color: selectedZone === zone ? "white" : "#2e86c1",
                fontWeight: 600,
                fontSize: "13px",
                transition: "all 0.2s",
              }}
            >
              {zone}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          {filteredBins.map((bin) => {
            const routeData = routeLookup[bin.binId] || {};
            return (
              <BinCard
                key={bin.binId}
                bin={bin}
                routeOrder={routeData.routeOrder}
                isCurrentDestination={routeData.isCurrentDestination}
                isCollecting={routeData.isCollecting}
                isCompleted={completedStops.includes(bin.binId)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
