import React, { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "../firebase/config";
import { collection, onSnapshot, doc, updateDoc, writeBatch } from "firebase/firestore";
import BinCard from "./BinCard";
import Map from "./Map";
import RoutePanel from "./RoutePanel";
import CollectionLog from "./CollectionLog";
import { setSimulationPaused } from "../simulator/binSimulator"; // Import the pause switch

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
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
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
      const isTieButEarlierId = distance === nearestDistance && String(bin.binId).localeCompare(String(currentNearest?.binId || "")) < 0;

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

function Dashboard() {
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
      setBins(data);
    });
    return () => unsub();
  }, []);

  // MASTER PAUSE SYNC: Completely freezes the background simulator while driving
  useEffect(() => {
    setSimulationPaused(routeStarted);
  }, [routeStarted]);

  const resetRouteState = () => {
    setRouteStarted(false);
    setCompletedStops([]);
    setRouteBinIds([]);
    setCollectingBinId(null);
    setRouteVersion((version) => version + 1);
  };

  const handleRandomizeBins = async () => {
    const batch = writeBatch(db);
    bins.forEach((bin) => {
      const fillLevel = Math.floor(Math.random() * 81) + 20; 
      const binRef = doc(db, "bins", bin.id);
      batch.update(binRef, {
        fillLevel,
        status: getStatusFromFillLevel(fillLevel),
        isCollecting: false
      });
    });
    await batch.commit();
    resetRouteState();
  };

  const handleResetSimulation = async () => {
    const batch = writeBatch(db);
    bins.forEach((bin) => {
      const binRef = doc(db, "bins", bin.id);
      batch.update(binRef, { fillLevel: 0, status: "normal", isCollecting: false });
    });
    await batch.commit();
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

  const handleArriveAtStop = useCallback((bin) => {
    if (!routeStarted || collectingBinId || !bin?.binId) return;
    if (completedStops.includes(bin.binId)) return;
    setCollectingBinId(bin.binId);
  }, [routeStarted, collectingBinId, completedStops]);

  // DRAINING LOGIC
  useEffect(() => {
    if (!routeStarted || !collectingBinId) return;

    const activeBin = bins.find((bin) => bin.binId === collectingBinId);
    if (!activeBin) return;

    const currentLevel = Number(activeBin.fillLevel) || 0;

    // Stop and complete at 0%
    if (currentLevel <= 0) {
      setCompletedStops((prev) => (prev.includes(collectingBinId) ? prev : [...prev, collectingBinId]));
      setCollectingBinId(null);
      setRouteVersion((version) => version + 1);

      updateDoc(doc(db, "bins", activeBin.id), {
        fillLevel: 0,
        status: "normal",
        isCollecting: false, 
        lastCollected: new Date().toISOString()
      }).catch(console.error);
      return;
    }

    const drainTimer = setTimeout(() => {
      const newLevel = Math.max(0, currentLevel - 15);
      updateDoc(doc(db, "bins", activeBin.id), {
        fillLevel: newLevel,
        status: getStatusFromFillLevel(newLevel),
        isCollecting: true 
      }).catch(console.error);
    }, 250);

    return () => clearTimeout(drainTimer);
  }, [routeStarted, collectingBinId, bins, completedStops]);

  // CONTINUOUS PATH LOGIC
  useEffect(() => {
    if (!routeStarted) return;
    const currentPriorityBins = bins.filter(b => b.fillLevel >= 70 && hasValidCoordinates(b) && !completedStops.includes(b.binId));
    const unroutedBins = currentPriorityBins.filter(b => !routeBinIds.includes(b.binId));

    if (unroutedBins.length > 0) {
      const remainingRouteIds = routeBinIds.filter(id => !completedStops.includes(id));
      const currentDestinationId = remainingRouteIds[0];

      let newRouteIds = [];
      if (currentDestinationId) {
          const destBin = bins.find(b => b.binId === currentDestinationId);
          const otherBins = currentPriorityBins.filter(b => b.binId !== currentDestinationId);
          const optimalTail = optimizeRoute(otherBins, destBin);
          newRouteIds = [currentDestinationId, ...optimalTail.map(b => b.binId)];
      } else {
          const lastCompletedId = [...completedStops].reverse().find(Boolean);
          const lastCompletedBin = bins.find(b => b.binId === lastCompletedId && hasValidCoordinates(b));
          const startPoint = lastCompletedBin ? normalizePoint(lastCompletedBin) : DEPOT;
          const optimal = optimizeRoute(currentPriorityBins, startPoint);
          newRouteIds = optimal.map(b => b.binId);
      }

      setRouteBinIds(prev => {
          const completed = prev.filter(id => completedStops.includes(id));
          return [...completed, ...newRouteIds];
      });
    }
  }, [bins, routeStarted, routeBinIds, completedStops]);

  // AUTO-STOP AND UNPAUSE LOGIC
  useEffect(() => {
    const priorityBinsLeft = bins.filter(b => b.fillLevel >= 70 && !completedStops.includes(b.binId));
    
    // Once literally ZERO critical bins are left on the map, end the route and resume the simulation
    if (routeStarted && priorityBinsLeft.length === 0 && !collectingBinId) {
      setRouteStarted(false);
    }
  }, [routeStarted, bins, completedStops, collectingBinId]);

  const zones = ["All", "Zone 1", "Zone 2", "Zone 3", "Zone 4"];
  const filteredBins = selectedZone === "All" ? bins : bins.filter((bin) => bin.zone === selectedZone);
  const critical = bins.filter((bin) => bin.status === "critical").length;
  const warning = bins.filter((bin) => bin.status === "warning").length;
  const normal = bins.filter((bin) => bin.status === "normal").length;

  const previewRouteBinIds = useMemo(() => {
    return optimizeRoute(bins.filter((bin) => Number(bin.fillLevel) >= 70 && hasValidCoordinates(bin)), DEPOT).map((bin) => bin.binId);
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
      <div style={{ background: "linear-gradient(135deg, #1a5276, #2e86c1)", color: "white", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 8px rgba(0,0,0,0.2)", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700 }}>🗑️ Waste Collection Monitoring System</h1>
          <p style={{ fontSize: "13px", opacity: 0.85 }}>Brgy. Palloocan West, Batangas City</p>
        </div>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
          {[
            { label: "Total Bins", value: bins.length, color: "#2e86c1", bg: "#d6eaf8" },
            { label: "Critical", value: critical, color: "#c0392b", bg: "#fadbd8" },
            { label: "Warning", value: warning, color: "#d35400", bg: "#fdebd0" },
            { label: "Normal", value: normal, color: "#1e8449", bg: "#d5f5e3" },
          ].map((card) => (
            <div key={card.label} style={{ background: card.bg, borderLeft: `5px solid ${card.color}`, borderRadius: "10px", padding: "14px 20px", flex: "1", minWidth: "140px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: "28px", fontWeight: 700, color: card.color }}>{card.value}</div>
              <div style={{ fontSize: "13px", color: "#555", marginTop: "2px" }}>{card.label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "white", borderRadius: "12px", padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, color: "#1a5276", fontSize: "14px" }}>Simulation Controls</div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={handleRandomizeBins} disabled={routeStarted || Boolean(collectingBinId)} style={{ background: routeStarted || collectingBinId ? "#9aa7b0" : "#1a5276", color: "white", border: "none", borderRadius: "8px", padding: "9px 16px", cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 700 }}>🔀 Randomize</button>
            <button onClick={handleResetSimulation} disabled={routeStarted || Boolean(collectingBinId)} style={{ background: "#ffffff", color: routeStarted || collectingBinId ? "#9aa7b0" : "#1a5276", border: "1px solid #b7c9d8", borderRadius: "8px", padding: "9px 16px", cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 700 }}>Set all to 0%</button>
          </div>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <Map bins={bins} completedStops={completedStops} routeVersion={routeVersion} routeStarted={routeStarted} collectingBinId={collectingBinId} routeBinIds={activeRouteBinIds} onArriveAtStop={handleArriveAtStop} />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <RoutePanel bins={bins} completedStops={completedStops} routeStarted={routeStarted} routeBinIds={activeRouteBinIds} collectingBinId={collectingBinId} onStartRoute={handleStartRoute} onCancelRoute={handleCancelRoute} />
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          {zones.map((zone) => (
            <button key={zone} onClick={() => setSelectedZone(zone)} style={{ padding: "8px 18px", borderRadius: "20px", border: "none", cursor: "pointer", background: selectedZone === zone ? "#2e86c1" : "#dce9f5", color: selectedZone === zone ? "white" : "#2e86c1", fontWeight: 600, fontSize: "13px", transition: "all 0.2s" }}>{zone}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}>
          {filteredBins.map((bin) => {
            const routeData = routeLookup[bin.binId] || {};
            return <BinCard key={bin.binId} bin={bin} routeOrder={routeData.routeOrder} isCurrentDestination={routeData.isCurrentDestination} isCollecting={routeData.isCollecting} isCompleted={completedStops.includes(bin.binId)} />;
          })}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;