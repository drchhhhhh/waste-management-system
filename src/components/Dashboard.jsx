import React, { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "../firebase/config";
// ⭐ ADDED addDoc to save records to the new history database
import { collection, onSnapshot, doc, updateDoc, writeBatch, addDoc } from "firebase/firestore";
import BinCard from "./BinCard";
import Map from "./Map";
import RoutePanel from "./RoutePanel";
import CollectionLog from "./CollectionLog";
import { setSimulationPaused } from "../simulator/binSimulator";

const LANDFILL = { lat: 13.74787, lng: 121.16597, binId: "Batangas City Sanitary Landfill", zone: "Disposal", fillLevel: 0, status: "normal" };
const VOLUME_THRESHOLD = 4; 

function getUpdatedZoneName(oldZone) {
  if (oldZone === "Zone 1") return "Commercial Zone";
  if (oldZone === "Zone 2") return "Dense Residential Zone";
  if (oldZone === "Zone 3") return "Standard Residential Zone";
  if (oldZone === "Zone 4") return "Rural Zone";
  return oldZone; 
}

function getDailyGenerationRate(zone) {
  const currentZone = getUpdatedZoneName(zone);
  if (currentZone === "Commercial Zone") return 34; 
  if (currentZone === "Dense Residential Zone") return 25; 
  if (currentZone === "Standard Residential Zone") return 15; 
  return 10; 
}

function isPriority(bin) {
  if (!bin) return false;
  const currentFill = Number(bin.fillLevel) || 0;
  const nextDayFill = currentFill + getDailyGenerationRate(bin.zone);
  return currentFill >= 70 || nextDayFill >= 100;
}

function getStatusFromFillLevel(fillLevel) {
  if (fillLevel >= 90) return "critical";
  if (fillLevel >= 70) return "warning";
  return "normal";
}

function hasValidCoordinates(point) { return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)); }
function normalizePoint(point) { return { ...point, lat: Number(point.lat), lng: Number(point.lng) }; }

function getDistance(a, b) {
  if (!hasValidCoordinates(a) || !hasValidCoordinates(b)) return Infinity;
  const pointA = normalizePoint(a); const pointB = normalizePoint(b);
  const R = 6371000;
  const dLat = ((pointB.lat - pointA.lat) * Math.PI) / 180;
  const dLng = ((pointB.lng - pointA.lng) * Math.PI) / 180;
  const lat1 = (pointA.lat * Math.PI) / 180; const lat2 = (pointB.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatDistance(meters) {
  if (!meters) return "--";
  return (meters / 1000).toFixed(1) + " km";
}

function fallbackOptimizeRoute(bins, startPoint = LANDFILL) {
  const unvisited = bins.filter(hasValidCoordinates).map(normalizePoint);
  const route = [];
  let current = normalizePoint(startPoint);
  while (unvisited.length > 0) {
    let nearestIndex = 0; let nearestDistance = Infinity;
    unvisited.forEach((bin, index) => {
      const distance = getDistance(current, bin);
      if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
    });
    const nearest = unvisited.splice(nearestIndex, 1)[0];
    route.push({ ...nearest, distanceFromPrev: nearestDistance });
    current = nearest;
  }
  return route;
}

async function optimizeRouteByRoad(bins, startPoint = LANDFILL) {
  const unvisited = bins.filter(hasValidCoordinates).map(normalizePoint);
  if (unvisited.length === 0) return [];
  const allPoints = [normalizePoint(startPoint), ...unvisited];
  const coordsString = allPoints.map(p => `${p.lng},${p.lat}`).join(";");

  try {
    const response = await fetch(`https://router.project-osrm.org/table/v1/driving/${coordsString}?annotations=distance`);
    const data = await response.json();
    if (data.code !== "Ok") throw new Error("OSRM Table API failed");

    const distanceMatrix = data.distances; 
    const route = [];
    let currentIndex = 0; 
    let unvisitedIndices = unvisited.map((_, i) => i + 1);

    while (unvisitedIndices.length > 0) {
      let nearestIndexInArray = -1;
      let nearestDistance = Infinity;
      for (let i = 0; i < unvisitedIndices.length; i++) {
        const targetIndex = unvisitedIndices[i];
        const dist = distanceMatrix[currentIndex][targetIndex];
        if (dist < nearestDistance) { nearestDistance = dist; nearestIndexInArray = i; }
      }
      const chosenIndex = unvisitedIndices.splice(nearestIndexInArray, 1)[0];
      route.push({ ...allPoints[chosenIndex], distanceFromPrev: nearestDistance });
      currentIndex = chosenIndex;
    }
    return route;
  } catch (error) {
    console.error("Road routing failed! Falling back to straight-line distance.", error);
    return fallbackOptimizeRoute(bins, startPoint);
  }
}

function Dashboard() {
  const [bins, setBins] = useState([]);
  const [selectedZone, setSelectedZone] = useState("All");
  const [completedStops, setCompletedStops] = useState([]);
  const [routeVersion, setRouteVersion] = useState(0);
  const [routeStarted, setRouteStarted] = useState(false);
  const [routeBinIds, setRouteBinIds] = useState([]);
  const [previewRouteBinIds, setPreviewRouteBinIds] = useState([]);
  const [collectingBinId, setCollectingBinId] = useState(null);
  
  const [totalRouteDistance, setTotalRouteDistance] = useState(0);
  const [showDispatchPrompt, setShowDispatchPrompt] = useState(false);
  const [hasIgnoredDispatch, setHasIgnoredDispatch] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bins"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setBins(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setSimulationPaused(routeStarted);
  }, [routeStarted]);

  const extendedBins = useMemo(() => [...bins, LANDFILL], [bins]);
  const priorityBinsCount = bins.filter(isPriority).length;
  const priorityBinIdsStr = useMemo(() => {
    return bins.filter((bin) => isPriority(bin) && hasValidCoordinates(bin)).map(b => b.binId).sort().join(",");
  }, [bins]);

  useEffect(() => {
    let isMounted = true;
    const calculateRoadPreview = async () => {
      const priorityBins = bins.filter((bin) => isPriority(bin) && hasValidCoordinates(bin));
      
      if (priorityBins.length === 0) {
        if (isMounted) {
            setPreviewRouteBinIds([]);
            setTotalRouteDistance(0);
        }
        return;
      }

      const shortestRoadPath = await optimizeRouteByRoad(priorityBins, LANDFILL);
      
      const fullSequenceIds = [...shortestRoadPath.map(b => b.binId), LANDFILL.binId];
      if (isMounted) setPreviewRouteBinIds(fullSequenceIds);

      const sequencePoints = [LANDFILL, ...shortestRoadPath, LANDFILL];
      const coordsString = sequencePoints.map(p => `${p.lng},${p.lat}`).join(";");
      
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=false`);
        const data = await res.json();
        if (isMounted && data.routes && data.routes.length > 0) {
            setTotalRouteDistance(data.routes[0].distance);
        }
      } catch (e) {
        console.error("Failed to get total distance", e);
      }
    };
    
    calculateRoadPreview();
    return () => { isMounted = false; };
  }, [priorityBinIdsStr]);

  const resetRouteState = () => {
    setRouteStarted(false);
    setCompletedStops([]);
    setRouteBinIds([]);
    setCollectingBinId(null);
    setRouteVersion((version) => version + 1);
  };

  const handleAdvanceOneDay = async () => {
    const batch = writeBatch(db);
    bins.forEach((bin) => {
      const dailyGenerationRate = getDailyGenerationRate(bin.zone);
      const currentFill = Number(bin.fillLevel) || 0;
      const newFill = Math.min(100, currentFill + dailyGenerationRate); 
      const binRef = doc(db, "bins", bin.id);
      batch.update(binRef, { fillLevel: newFill, status: getStatusFromFillLevel(newFill), isCollecting: false, zone: getUpdatedZoneName(bin.zone) });
    });
    await batch.commit();
    setHasIgnoredDispatch(false); 
    resetRouteState();
  };

  const handleRandomizeBins = async () => {
    setShowDispatchPrompt(false);
    setHasIgnoredDispatch(true); 
    const batch = writeBatch(db);
    bins.forEach((bin) => {
      const fillLevel = Math.floor(Math.random() * 81) + 20; 
      const binRef = doc(db, "bins", bin.id);
      batch.update(binRef, { fillLevel, status: getStatusFromFillLevel(fillLevel), isCollecting: false, zone: getUpdatedZoneName(bin.zone) });
    });
    await batch.commit();
    setHasIgnoredDispatch(false);
    resetRouteState();
  };

  const handleResetSimulation = async () => {
    const batch = writeBatch(db);
    bins.forEach((bin) => {
      const binRef = doc(db, "bins", bin.id);
      batch.update(binRef, { fillLevel: 0, status: "normal", isCollecting: false, zone: getUpdatedZoneName(bin.zone) });
    });
    await batch.commit();
    setHasIgnoredDispatch(false);
    setShowDispatchPrompt(false);
    resetRouteState();
  };

  const handleStartRoute = useCallback(() => {
    if (previewRouteBinIds.length === 0) return;
    setRouteBinIds(previewRouteBinIds);
    setCompletedStops([]);
    setCollectingBinId(null);
    setRouteStarted(true);
    setShowDispatchPrompt(false);
    setRouteVersion((version) => version + 1);
  }, [previewRouteBinIds]);

  useEffect(() => {
    if (priorityBinsCount >= VOLUME_THRESHOLD && !routeStarted && previewRouteBinIds.length > 0 && !hasIgnoredDispatch) {
      const promptTimer = setTimeout(() => setShowDispatchPrompt(true), 500);
      return () => clearTimeout(promptTimer);
    } else if (priorityBinsCount < VOLUME_THRESHOLD) {
      setShowDispatchPrompt(false);
    }
  }, [priorityBinsCount, routeStarted, previewRouteBinIds, hasIgnoredDispatch]);

  const handleCancelRoute = () => resetRouteState();

  const handleArriveAtStop = useCallback((bin) => {
    if (!routeStarted || collectingBinId || !bin?.binId) return;

    if (bin.binId === LANDFILL.binId) {
      setRouteStarted(false);
      setCompletedStops([]);
      setCollectingBinId(null);
      alert("✅ Shift Complete! Truck has collected all bins, returned to the Landfill, and unloaded.");
      return;
    }

    if (completedStops.includes(bin.binId)) return;

    // ⭐ NEW: Log to history collection exactly when the truck arrives at the bin
    const activeBin = bins.find((b) => b.binId === bin.binId);
    if (activeBin) {
      addDoc(collection(db, "collectionHistory"), {
        binId: activeBin.binId,
        zone: activeBin.zone,
        fillLevel: activeBin.fillLevel,
        timestamp: new Date().toISOString()
      }).catch(console.error);
    }

    setCollectingBinId(bin.binId);
  }, [routeStarted, collectingBinId, completedStops, bins]);

  useEffect(() => {
    if (!routeStarted || !collectingBinId) return;

    if (collectingBinId === LANDFILL.binId) return;

    const activeBin = bins.find((bin) => bin.binId === collectingBinId);
    if (!activeBin) return;

    const currentLevel = Number(activeBin.fillLevel) || 0;

    if (currentLevel <= 0) {
      setCompletedStops((prev) => (prev.includes(collectingBinId) ? prev : [...prev, collectingBinId]));
      setCollectingBinId(null);
      setRouteVersion((version) => version + 1);
      updateDoc(doc(db, "bins", activeBin.id), { fillLevel: 0, status: "normal", isCollecting: false, lastCollected: new Date().toISOString() }).catch(console.error);
      return;
    }

    const drainTimer = setTimeout(() => {
      const newLevel = Math.max(0, currentLevel - 15);
      updateDoc(doc(db, "bins", activeBin.id), { fillLevel: newLevel, status: getStatusFromFillLevel(newLevel), isCollecting: true }).catch(console.error);
    }, 250);
    return () => clearTimeout(drainTimer);
  }, [routeStarted, collectingBinId, bins, completedStops]);

  useEffect(() => {
    let isMounted = true;
    if (!routeStarted) return;
    const currentPriorityBins = bins.filter(b => isPriority(b) && hasValidCoordinates(b) && !completedStops.includes(b.binId));
    const unroutedBins = currentPriorityBins.filter(b => !routeBinIds.includes(b.binId));

    if (unroutedBins.length > 0) {
      const recalculateContinuous = async () => {
        const remainingRouteIds = routeBinIds.filter(id => !completedStops.includes(id));
        const currentDestinationId = remainingRouteIds[0];
        const isHeadingHome = currentDestinationId === LANDFILL.binId;

        let newRouteIds = [];
        if (currentDestinationId && !isHeadingHome) {
            const destBin = bins.find(b => b.binId === currentDestinationId);
            const otherBins = currentPriorityBins.filter(b => b.binId !== currentDestinationId);
            const optimalTail = await optimizeRouteByRoad(otherBins, destBin);
            newRouteIds = [currentDestinationId, ...optimalTail.map(b => b.binId), LANDFILL.binId];
        } else if (currentDestinationId && isHeadingHome) {
            newRouteIds = remainingRouteIds;
        }

        if (isMounted && newRouteIds.length > 0) {
          setRouteBinIds(prev => {
              const completed = prev.filter(id => completedStops.includes(id));
              return [...completed, ...newRouteIds];
          });
        }
      };
      recalculateContinuous();
    }
    return () => { isMounted = false; };
  }, [bins, routeStarted, routeBinIds, completedStops]);

  const zones = ["All", "Commercial Zone", "Dense Residential Zone", "Standard Residential Zone", "Rural Zone"];
  const filteredBins = selectedZone === "All" ? bins : bins.filter((bin) => getUpdatedZoneName(bin.zone) === selectedZone);
  const critical = bins.filter((bin) => bin.status === "critical").length;
  const warning = bins.filter((bin) => bin.status === "warning").length;
  const normal = bins.filter((bin) => bin.status === "normal").length;

  const activeRouteBinIds = routeStarted && routeBinIds.length > 0 ? routeBinIds : previewRouteBinIds;

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
  <div style={{ minHeight: "100vh", background: "var(--bg-color)", position: "relative" }}>
    {showDispatchPrompt && (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
        <div style={{ background: "var(--surface-raised)", border: "1px solid var(--surface-border)", padding: "30px", borderRadius: "var(--border-radius)", maxWidth: "420px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: "50px", marginBottom: "15px" }}>🚨</div>
          <h2 style={{ margin: "0 0 10px 0", color: "#f87171", fontSize: "22px", fontFamily: "'Syne', sans-serif" }}>Dispatch Recommended</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "25px", fontSize: "15px", lineHeight: "1.5" }}>
            The system predicts <strong style={{ color: "var(--text-main)" }}>{priorityBinsCount} bins</strong> require attention, reaching the operational threshold. Do you want to dispatch the collection truck now?
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button onClick={handleStartRoute} style={{ background: "var(--primary-color)", color: "white", border: "none", padding: "12px 20px", borderRadius: "var(--border-radius-sm)", fontWeight: 700, cursor: "pointer", fontSize: "14px", transition: "var(--transition)" }} onMouseOver={(e) => e.currentTarget.style.background = "var(--primary-hover)"} onMouseOut={(e) => e.currentTarget.style.background = "var(--primary-color)"}>
              ✅ Yes, Dispatch Route
            </button>
            <button onClick={() => { setShowDispatchPrompt(false); setHasIgnoredDispatch(true); }} style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", padding: "12px 20px", borderRadius: "var(--border-radius-sm)", fontWeight: 700, cursor: "pointer", fontSize: "14px", transition: "var(--transition)" }} onMouseOver={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.2)"} onMouseOut={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.12)"}>
              ❌ No, Ignore for Now
            </button>
          </div>
        </div>
      </div>
    )}

    <div style={{ background: "var(--surface-raised)", borderBottom: "1px solid var(--surface-border)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "var(--box-shadow)", gap: "16px", flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: "30px", fontWeight: 700, color: "var(--text-main)", fontFamily: "'Syne', sans-serif" }}>🗑️ EcoRoute</h1>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>Brgy. Palloocan West, Batangas City </p>
      </div>
    </div>

    <div style={{ padding: "20px 24px" }}>

      {/* Smart Advisor Banner */}
      {(() => {
        const isCritical = priorityBinsCount >= VOLUME_THRESHOLD && !hasIgnoredDispatch;
        const isPaused = hasIgnoredDispatch;
        const bannerColor = isCritical ? "#ef4444" : isPaused ? "#f59e0b" : "#22c55e";
        const bannerBg = isCritical ? "rgba(239,68,68,0.08)" : isPaused ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)";
        return (
          <div style={{ background: bannerBg, border: `1px solid ${bannerColor}33`, borderLeft: `4px solid ${bannerColor}`, borderRadius: "var(--border-radius-sm)", padding: "12px 20px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700, color: bannerColor, fontSize: "15px" }}>
                {isPaused ? "⏸️ Dispatch Paused by Admin" : "📊 Smart Advisor Volume Monitor"}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "2px" }}>
                {isPaused
                  ? "You ignored the prompt. The system will prompt again when the next day is simulated or data changes."
                  : `System advises dispatch when ${VOLUME_THRESHOLD} bins require collection.`}
              </div>
            </div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: bannerColor, fontFamily: "'Syne', sans-serif", flexShrink: 0 }}>
              {priorityBinsCount} / {VOLUME_THRESHOLD}
            </div>
          </div>
        );
      })()}

      {/* Stat Cards */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "Total Bins", value: bins.length, color: "var(--text-accent)", bg: "var(--surface-raised)" },
          { label: "Critical", value: critical, color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
          { label: "Warning", value: warning, color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
          { label: "Normal", value: normal, color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
          ].map((card) => (
          <div key={card.label} style={{ background: card.bg, borderLeft: `4px solid ${card.color}`, borderRadius: "var(--border-radius-sm)", padding: "14px 20px", flex: "1", minWidth: "140px", boxShadow: "var(--box-shadow)" }}>
            <div style={{ fontSize: "28px", fontWeight: 700, color: card.color, fontFamily: "'Syne', sans-serif" }}>{card.value}</div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Predictive Controls */}
      <div style={{ background: "var(--surface-raised)", border: "1px solid var(--surface-border)", borderRadius: "var(--border-radius-sm)", padding: "14px 16px", boxShadow: "var(--box-shadow)", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text-main)", fontSize: "14px", fontFamily: "'Syne', sans-serif" }}>Predictive Controls</div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>Simulate time passing to predict waste generation rates.</div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={handleAdvanceOneDay} disabled={routeStarted || Boolean(collectingBinId)} style={{ background: routeStarted || collectingBinId ? "rgba(255,255,255,0.05)" : "var(--primary-color)", color: routeStarted || collectingBinId ? "var(--text-muted)" : "white", border: "none", borderRadius: "var(--border-radius-sm)", padding: "9px 16px", cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 700, transition: "var(--transition)" }}>📅 Advance Time (1 Day)</button>
          <button onClick={handleRandomizeBins} disabled={routeStarted || Boolean(collectingBinId)} style={{ background: "transparent", color: routeStarted || collectingBinId ? "var(--text-muted)" : "var(--primary-color)", border: `1px solid ${routeStarted || collectingBinId ? "var(--surface-border)" : "var(--primary-color)"}`, borderRadius: "var(--border-radius-sm)", padding: "9px 16px", cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 700, transition: "var(--transition)" }}>🔀 Seed Random Bins</button>
          <button onClick={handleResetSimulation} disabled={routeStarted || Boolean(collectingBinId)} style={{ background: "transparent", color: routeStarted || collectingBinId ? "var(--text-muted)" : "var(--text-muted)", border: `1px solid var(--surface-border)`, borderRadius: "var(--border-radius-sm)", padding: "9px 16px", cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 700, transition: "var(--transition)" }}>Reset all to 0%</button>
        </div>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <Map bins={extendedBins} completedStops={completedStops} routeVersion={routeVersion} routeStarted={routeStarted} collectingBinId={collectingBinId} routeBinIds={activeRouteBinIds} onArriveAtStop={handleArriveAtStop} />
      </div>

      <div style={{ marginBottom: "20px" }}>
        <RoutePanel bins={extendedBins} completedStops={completedStops} routeStarted={routeStarted} routeBinIds={activeRouteBinIds} collectingBinId={collectingBinId} onStartRoute={handleStartRoute} onCancelRoute={handleCancelRoute} />
      </div>

      <CollectionLog />

      {/* Zone Filter */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", marginTop: "24px", flexWrap: "wrap" }}>
        {zones.map((zone) => (
          <button key={zone} onClick={() => setSelectedZone(zone)} style={{ padding: "8px 18px", borderRadius: "99px", border: `1px solid ${selectedZone === zone ? "var(--primary-color)" : "var(--surface-border)"}`, cursor: "pointer", background: selectedZone === zone ? "var(--primary-color)" : "transparent", color: selectedZone === zone ? "white" : "var(--text-muted)", fontWeight: 600, fontSize: "13px", transition: "var(--transition)" }}>{zone}</button>
        ))}
      </div>

      {/* Bin Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}>
        {filteredBins.map((bin) => {
          const routeData = routeLookup[bin.binId] || {};
          const isPredictiveCatch = isPriority(bin) && Number(bin.fillLevel) < 70;
          return (
            <div key={bin.binId} style={{ position: "relative" }}>
              {isPredictiveCatch && (
                <div style={{ position: "absolute", top: -8, right: -8, background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.35)", fontSize: "10px", padding: "3px 8px", borderRadius: "99px", fontWeight: 700, zIndex: 10 }}>
                  ⚠️ Overflow Predicted
                </div>
              )}
              <BinCard bin={bin} routeOrder={routeData.routeOrder} isCurrentDestination={routeData.isCurrentDestination} isCollecting={routeData.isCollecting} isCompleted={completedStops.includes(bin.binId)} />
            </div>
          );
        })}
      </div>
    </div>
  </div>
);
}

export default Dashboard;