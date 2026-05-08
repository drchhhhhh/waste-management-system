import React, { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "../firebase/config";
import { collection, onSnapshot, doc, updateDoc, writeBatch } from "firebase/firestore";
import BinCard from "./BinCard";
import Map from "./Map";
import RoutePanel from "./RoutePanel";
import CollectionLog from "./CollectionLog";
import { setSimulationPaused } from "../simulator/binSimulator";

const DEPOT = { lat: 13.7572, lng: 121.0588, binId: "Barangay Hall", zone: "Depot" };
const VOLUME_THRESHOLD = 4; 

// ⭐ NEW: This automatically converts any old "Zone X" in your Firestore into the new descriptive names
function getUpdatedZoneName(oldZone) {
  if (oldZone === "Zone 1") return "Commercial Zone";
  if (oldZone === "Zone 2") return "Dense Residential Zone";
  if (oldZone === "Zone 3") return "Standard Residential Zone";
  if (oldZone === "Zone 4") return "Rural Zone";
  return oldZone; 
}

// ⭐ UPDATED: Generation rates are now based on the new descriptive zone names
function getDailyGenerationRate(zone) {
  const currentZone = getUpdatedZoneName(zone);
  if (currentZone === "Commercial Zone") return 34; // Fills very fast
  if (currentZone === "Dense Residential Zone") return 25; // Fills fast
  if (currentZone === "Standard Residential Zone") return 15; // Fills average
  return 10; // Rural Zone - Fills slow
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

function fallbackOptimizeRoute(bins, startPoint = DEPOT) {
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

async function optimizeRouteByRoad(bins, startPoint = DEPOT) {
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

  const priorityBinsCount = bins.filter(isPriority).length;
  
  const priorityBinIdsStr = useMemo(() => {
    return bins.filter((bin) => isPriority(bin) && hasValidCoordinates(bin)).map(b => b.binId).sort().join(",");
  }, [bins]);

  useEffect(() => {
    let isMounted = true;
    const calculateRoadPreview = async () => {
      const priorityBins = bins.filter((bin) => isPriority(bin) && hasValidCoordinates(bin));
      if (priorityBins.length === 0) {
        if (isMounted) setPreviewRouteBinIds([]);
        return;
      }
      const shortestRoadPath = await optimizeRouteByRoad(priorityBins, DEPOT);
      if (isMounted) setPreviewRouteBinIds(shortestRoadPath.map(b => b.binId));
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
      batch.update(binRef, { 
        fillLevel: newFill, 
        status: getStatusFromFillLevel(newFill), 
        isCollecting: false,
        zone: getUpdatedZoneName(bin.zone) // Auto-updates the database zone name!
      });
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
      batch.update(binRef, { 
        fillLevel, 
        status: getStatusFromFillLevel(fillLevel), 
        isCollecting: false,
        zone: getUpdatedZoneName(bin.zone) // Auto-updates the database zone name!
      });
    });
    await batch.commit();
    
    setHasIgnoredDispatch(false);
    resetRouteState();
  };

  const handleResetSimulation = async () => {
    const batch = writeBatch(db);
    bins.forEach((bin) => {
      const binRef = doc(db, "bins", bin.id);
      batch.update(binRef, { 
        fillLevel: 0, 
        status: "normal", 
        isCollecting: false,
        zone: getUpdatedZoneName(bin.zone) // Auto-updates the database zone name!
      });
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
      const promptTimer = setTimeout(() => {
        setShowDispatchPrompt(true);
      }, 500);
      return () => clearTimeout(promptTimer);
    } else if (priorityBinsCount < VOLUME_THRESHOLD) {
      setShowDispatchPrompt(false);
    }
  }, [priorityBinsCount, routeStarted, previewRouteBinIds, hasIgnoredDispatch]);

  const handleCancelRoute = () => {
    resetRouteState();
  };

  const handleArriveAtStop = useCallback((bin) => {
    if (!routeStarted || collectingBinId || !bin?.binId) return;

    if (bin.binId === DEPOT.binId) {
      setRouteStarted(false);
      setCompletedStops([]);
      setCollectingBinId(null);
      return;
    }

    if (completedStops.includes(bin.binId)) return;
    setCollectingBinId(bin.binId);
  }, [routeStarted, collectingBinId, completedStops]);

  useEffect(() => {
    if (!routeStarted || !collectingBinId) return;
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

        let newRouteIds = [];
        if (currentDestinationId) {
            const destBin = bins.find(b => b.binId === currentDestinationId);
            const otherBins = currentPriorityBins.filter(b => b.binId !== currentDestinationId);
            const optimalTail = await optimizeRouteByRoad(otherBins, destBin);
            newRouteIds = [currentDestinationId, ...optimalTail.map(b => b.binId)];
        } else {
            const lastCompletedId = [...completedStops].reverse().find(Boolean);
            const lastCompletedBin = bins.find(b => b.binId === lastCompletedId && hasValidCoordinates(b));
            const startPoint = lastCompletedBin ? normalizePoint(lastCompletedBin) : DEPOT;
            const optimal = await optimizeRouteByRoad(currentPriorityBins, startPoint);
            newRouteIds = optimal.map(b => b.binId);
        }

        if (isMounted) {
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

  // ⭐ NEW: Updated the filter list to use the new names
  const zones = ["All", "Commercial Zone", "Dense Residential Zone", "Standard Residential Zone", "Rural Zone"];
  
  // Also updated the filter logic to properly compare the newly updated names
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
    <div style={{ minHeight: "100vh", background: "#f0f2f5", position: "relative" }}>
      {showDispatchPrompt && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "white", padding: "30px", borderRadius: "16px", maxWidth: "420px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: "50px", marginBottom: "15px" }}>🚨</div>
            <h2 style={{ margin: "0 0 10px 0", color: "#c0392b", fontSize: "22px" }}>Dispatch Recommended</h2>
            <p style={{ color: "#555", marginBottom: "25px", fontSize: "15px", lineHeight: "1.5" }}>
              The system predicts <strong>{priorityBinsCount} bins</strong> require attention, reaching the operational threshold. Do you want to dispatch the collection truck now?
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button onClick={handleStartRoute} style={{ background: "#27ae60", color: "white", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "14px", transition: "transform 0.1s" }} onMouseOver={(e) => e.target.style.transform = "scale(1.05)"} onMouseOut={(e) => e.target.style.transform = "scale(1)"}>
                ✅ Yes, Dispatch Route
              </button>
              <button onClick={() => { setShowDispatchPrompt(false); setHasIgnoredDispatch(true); }} style={{ background: "#e74c3c", color: "white", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "14px", transition: "transform 0.1s" }} onMouseOver={(e) => e.target.style.transform = "scale(1.05)"} onMouseOut={(e) => e.target.style.transform = "scale(1)"}>
                ❌ No, Ignore for Now
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "linear-gradient(135deg, #1a5276, #2e86c1)", color: "white", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 8px rgba(0,0,0,0.2)", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700 }}>🗑️ Waste Collection Monitoring System</h1>
          <p style={{ fontSize: "13px", opacity: 0.85 }}>Brgy. Palloocan West, Batangas City (Smart Advisor Dispatch)</p>
        </div>
      </div>

      <div style={{ padding: "20px 24px" }}>
        
        <div style={{ background: priorityBinsCount >= VOLUME_THRESHOLD && !hasIgnoredDispatch ? "#fadbd8" : (hasIgnoredDispatch ? "#fdf2e9" : "#e8f8f5"), border: `2px solid ${priorityBinsCount >= VOLUME_THRESHOLD && !hasIgnoredDispatch ? "#c0392b" : (hasIgnoredDispatch ? "#e67e22" : "#17a589")}`, borderRadius: "12px", padding: "12px 20px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: "bold", color: priorityBinsCount >= VOLUME_THRESHOLD && !hasIgnoredDispatch ? "#922b21" : (hasIgnoredDispatch ? "#ba4a00" : "#0e6655"), fontSize: "15px" }}>
              {hasIgnoredDispatch ? "⏸️ Dispatch Paused by Admin" : "📊 Smart Advisor Volume Monitor"}
            </div>
            <div style={{ color: priorityBinsCount >= VOLUME_THRESHOLD && !hasIgnoredDispatch ? "#c0392b" : (hasIgnoredDispatch ? "#d35400" : "#117a65"), fontSize: "13px", marginTop: "2px" }}>
              {hasIgnoredDispatch 
                ? "You ignored the prompt. The system will prompt again when the next day is simulated or data changes." 
                : `System advises dispatch when ${VOLUME_THRESHOLD} bins require collection.`}
            </div>
          </div>
          <div style={{ fontSize: "22px", fontWeight: 900, color: priorityBinsCount >= VOLUME_THRESHOLD && !hasIgnoredDispatch ? "#c0392b" : (hasIgnoredDispatch ? "#e67e22" : "#17a589") }}>
            {priorityBinsCount} / {VOLUME_THRESHOLD}
          </div>
        </div>

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
            <div style={{ fontWeight: 700, color: "#1a5276", fontSize: "14px" }}>Predictive Controls</div>
            <div style={{ fontSize: "12px", color: "#666" }}>Simulate time passing to predict waste generation rates.</div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={handleAdvanceOneDay} disabled={routeStarted || Boolean(collectingBinId)} style={{ background: routeStarted || collectingBinId ? "#9aa7b0" : "#1a5276", color: "white", border: "none", borderRadius: "8px", padding: "9px 16px", cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 700 }}>📅 Advance Time (1 Day)</button>
            <button onClick={handleRandomizeBins} disabled={routeStarted || Boolean(collectingBinId)} style={{ background: "#ffffff", color: routeStarted || collectingBinId ? "#9aa7b0" : "#1a5276", border: "1px solid #b7c9d8", borderRadius: "8px", padding: "9px 16px", cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 700 }}>🔀 Seed Random Bins</button>
            <button onClick={handleResetSimulation} disabled={routeStarted || Boolean(collectingBinId)} style={{ background: "#ffffff", color: routeStarted || collectingBinId ? "#9aa7b0" : "#1a5276", border: "1px solid #b7c9d8", borderRadius: "8px", padding: "9px 16px", cursor: routeStarted || collectingBinId ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 700 }}>Reset all to 0%</button>
          </div>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <Map bins={bins} completedStops={completedStops} routeVersion={routeVersion} routeStarted={routeStarted} collectingBinId={collectingBinId} routeBinIds={activeRouteBinIds} onArriveAtStop={handleArriveAtStop} />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <RoutePanel bins={bins} completedStops={completedStops} routeStarted={routeStarted} routeBinIds={activeRouteBinIds} collectingBinId={collectingBinId} onStartRoute={handleStartRoute} onCancelRoute={handleCancelRoute} />
        </div>

        <CollectionLog />

        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          {zones.map((zone) => (
            <button key={zone} onClick={() => setSelectedZone(zone)} style={{ padding: "8px 18px", borderRadius: "20px", border: "none", cursor: "pointer", background: selectedZone === zone ? "#2e86c1" : "#dce9f5", color: selectedZone === zone ? "white" : "#2e86c1", fontWeight: 600, fontSize: "13px", transition: "all 0.2s" }}>{zone}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}>
          {filteredBins.map((bin) => {
            const routeData = routeLookup[bin.binId] || {};
            const isPredictiveCatch = isPriority(bin) && Number(bin.fillLevel) < 70;
            
            return (
              <div key={bin.binId} style={{position: 'relative'}}>
                {isPredictiveCatch && (
                  <div style={{ position: "absolute", top: -8, right: -8, background: "#f39c12", color: "white", fontSize: "10px", padding: "3px 6px", borderRadius: "10px", fontWeight: "bold", zIndex: 10 }}>
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