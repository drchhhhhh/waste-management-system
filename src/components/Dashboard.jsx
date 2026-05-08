import React, { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "../firebase/config";
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
    <div className="App" style={{ position: "relative" }}>
      {/* Dispatch Modal */}
      {showDispatchPrompt && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
          <div className="modern-card" style={{ maxWidth: "420px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🚨</div>
            <h2 style={{ margin: "0 0 12px 0", color: "var(--status-full)", fontSize: "24px", fontWeight: 700 }}>Dispatch Recommended</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: "24px", fontSize: "16px", lineHeight: "1.5" }}>
              The system predicts <strong style={{color: "var(--text-main)"}}>{priorityBinsCount} bins</strong> require attention, reaching the operational threshold. Dispatch truck now?
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button onClick={handleStartRoute} style={{ background: "var(--primary-color)", color: "white", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: 600, cursor: "pointer", fontSize: "14px", transition: "var(--transition)" }} onMouseOver={(e) => e.target.style.background = "var(--primary-hover)"} onMouseOut={(e) => e.target.style.background = "var(--primary-color)"}>
                ✅ Yes, Dispatch
              </button>
              <button onClick={() => { setShowDispatchPrompt(false); setHasIgnoredDispatch(true); }} style={{ background: "var(--surface-color)", color: "var(--status-full)", border: "1px solid var(--status-full)", padding: "12px 20px", borderRadius: "8px", fontWeight: 600, cursor: "pointer", fontSize: "14px", transition: "var(--transition)" }} onMouseOver={(e) => e.target.style.background = "#fee2e2"} onMouseOut={(e) => e.target.style.background = "var(--surface-color)"}>
                ❌ Ignore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="modern-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", padding: "20px 24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>🗑️ Waste Collection Monitoring</h1>
          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>Brgy. Palloocan West, Batangas City (Smart Advisor Dispatch)</p>
        </div>
      </div>

      {/* Main Dashboard Grid Area */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        
        {/* Advisor Alert Banner */}
        <div style={{ background: priorityBinsCount >= VOLUME_THRESHOLD && !hasIgnoredDispatch ? "#fee2e2" : (hasIgnoredDispatch ? "#fef3c7" : "#d1fae5"), borderLeft: `6px solid ${priorityBinsCount >= VOLUME_THRESHOLD && !hasIgnoredDispatch ? "var(--status-full)" : (hasIgnoredDispatch ? "var(--status-half)" : "var(--status-empty)")}`, borderRadius: "8px", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "16px" }}>
              {hasIgnoredDispatch ? "⏸️ Dispatch Paused by Admin" : "📊 Smart Advisor Monitor"}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "4px" }}>
              {hasIgnoredDispatch 
                ? "You ignored the prompt. The system will prompt again when data changes." 
                : `System advises dispatch when ${VOLUME_THRESHOLD} bins require collection.`}
            </div>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: priorityBinsCount >= VOLUME_THRESHOLD && !hasIgnoredDispatch ? "var(--status-full)" : (hasIgnoredDispatch ? "var(--status-half)" : "var(--status-empty)") }}>
            {priorityBinsCount} / {VOLUME_THRESHOLD}
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px" }}>
          {[
            { label: "Total Bins", value: bins.length, color: "#3b82f6" },
            { label: "Critical", value: critical, color: "var(--status-full)" },
            { label: "Warning", value: warning, color: "var(--status-half)" },
            { label: "Normal", value: normal, color: "var(--status-empty)" },
            { label: "Est. Route", value: formatDistance(totalRouteDistance), color: "#8b5cf6" }
          ].map((card) => (
            <div key={card.label} className="modern-card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", borderTop: `4px solid ${card.color}` }}>
              <div style={{ fontSize: "32px", fontWeight: 700, color: "var(--text-main)", lineHeight: "1" }}>{card.value}</div>
              <div style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "8px", fontWeight: 500 }}>{card.label}</div>
            </div>
          ))}
        </div>

        {/* Controls Card */}
        <div className="modern-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "16px" }}>Predictive Controls</div>
            <div style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "4px" }}>Simulate time passing to predict waste generation rates.</div>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button onClick={handleAdvanceOneDay} disabled={routeStarted || Boolean(collectingBinId)} style={{ background: routeStarted || collectingBinId ? "#cbd5e1" : "var(--primary-color)", color: "white", border: "none", borderRadius: "8px", padding: "10px 16px", cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 600, transition: "var(--transition)" }}>📅 Advance 1 Day</button>
            <button onClick={handleRandomizeBins} disabled={routeStarted || Boolean(collectingBinId)} style={{ background: "var(--surface-color)", color: routeStarted || collectingBinId ? "#cbd5e1" : "var(--text-main)", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 16px", cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 600, transition: "var(--transition)" }}>🔀 Seed Random Bins</button>
            <button onClick={handleResetSimulation} disabled={routeStarted || Boolean(collectingBinId)} style={{ background: "var(--surface-color)", color: routeStarted || collectingBinId ? "#cbd5e1" : "var(--status-full)", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 16px", cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 600, transition: "var(--transition)" }}>Reset to 0%</button>
          </div>
        </div>

        {/* Map and Route Panel Wrappers */}
        <div className="modern-card" style={{ padding: "0", overflow: "hidden" }}>
          <Map bins={extendedBins} completedStops={completedStops} routeVersion={routeVersion} routeStarted={routeStarted} collectingBinId={collectingBinId} routeBinIds={activeRouteBinIds} onArriveAtStop={handleArriveAtStop} />
        </div>

        <div className="modern-card">
          <RoutePanel bins={extendedBins} completedStops={completedStops} routeStarted={routeStarted} routeBinIds={activeRouteBinIds} collectingBinId={collectingBinId} onStartRoute={handleStartRoute} onCancelRoute={handleCancelRoute} />
        </div>

        <div className="modern-card">
          <CollectionLog />
        </div>

        {/* Zone Filters */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "8px" }}>
          {zones.map((zone) => (
            <button key={zone} onClick={() => setSelectedZone(zone)} style={{ padding: "8px 20px", borderRadius: "20px", border: selectedZone === zone ? "none" : "1px solid #cbd5e1", cursor: "pointer", background: selectedZone === zone ? "var(--text-main)" : "var(--surface-color)", color: selectedZone === zone ? "white" : "var(--text-muted)", fontWeight: 500, fontSize: "14px", transition: "var(--transition)" }}>{zone}</button>
          ))}
        </div>

        {/* Bins Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
          {filteredBins.map((bin) => {
            const routeData = routeLookup[bin.binId] || {};
            const isPredictiveCatch = isPriority(bin) && Number(bin.fillLevel) < 70;
            
            return (
              <div key={bin.binId} style={{position: 'relative'}}>
                {isPredictiveCatch && (
                  <div style={{ position: "absolute", top: -10, right: -10, background: "var(--status-half)", color: "white", fontSize: "11px", padding: "4px 8px", borderRadius: "12px", fontWeight: 700, zIndex: 10, boxShadow: "var(--box-shadow)" }}>
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