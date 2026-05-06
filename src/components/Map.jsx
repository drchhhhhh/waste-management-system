import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const statusColor = { normal: "#1e8449", warning: "#d35400", critical: "#c0392b" };
const DEPOT = { lat: 13.7572, lng: 121.0588, binId: "Barangay Hall", zone: "Depot" };

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

function optimizeRoute(bins, startPoint = DEPOT) {
  const unvisited = bins.filter(hasValidCoordinates).map(normalizePoint);
  const route = [];
  let current = normalizePoint(startPoint);
  while (unvisited.length > 0) {
    let nearestIndex = 0; let nearestDistance = Infinity;
    unvisited.forEach((bin, index) => {
      const distance = getDistance(current, bin);
      const currentNearest = unvisited[nearestIndex];
      const isCloser = distance < nearestDistance;
      const isTieButEarlierId = distance === nearestDistance && String(bin.binId).localeCompare(String(currentNearest?.binId || "")) < 0;
      if (isCloser || isTieButEarlierId) { nearestDistance = distance; nearestIndex = index; }
    });
    const nearest = unvisited.splice(nearestIndex, 1)[0];
    route.push({ ...nearest, distanceFromPrev: nearestDistance });
    current = nearest;
  }
  return route;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "--";
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

function latLngToObject(coord) { return { lat: coord[1], lng: coord[0] }; }

function getPointAlongRoute(routeCoords, progress) {
  if (!routeCoords || routeCoords.length === 0) return DEPOT;
  if (routeCoords.length === 1) return latLngToObject(routeCoords[0]);
  const points = routeCoords.map(latLngToObject);
  const segmentDistances = [];
  let totalDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const distance = getDistance(points[i], points[i + 1]);
    segmentDistances.push(distance);
    totalDistance += distance;
  }
  if (!Number.isFinite(totalDistance) || totalDistance === 0) return points[0];
  const targetDistance = totalDistance * progress;
  let travelled = 0;
  for (let i = 0; i < segmentDistances.length; i++) {
    const segmentDistance = segmentDistances[i];
    if (travelled + segmentDistance >= targetDistance) {
      const segmentProgress = (targetDistance - travelled) / segmentDistance;
      return { lat: points[i].lat + (points[i + 1].lat - points[i].lat) * segmentProgress, lng: points[i].lng + (points[i + 1].lng - points[i].lng) * segmentProgress };
    }
    travelled += segmentDistance;
  }
  return points[points.length - 1];
}

function getCollectorStart(bins, completedStops) {
  const lastCompletedId = [...completedStops].reverse().find(Boolean);
  const lastCompletedBin = bins.find((bin) => bin.binId === lastCompletedId && hasValidCoordinates(bin));
  return lastCompletedBin ? normalizePoint(lastCompletedBin) : DEPOT;
}

function orderBinsByRouteIds(bins, routeBinIds = []) {
  const binById = bins.filter(hasValidCoordinates).reduce((lookup, bin) => {
    lookup[String(bin.binId)] = normalizePoint(bin);
    return lookup;
  }, {});
  return routeBinIds.map((binId) => binById[String(binId)]).filter(Boolean);
}

function attachSequentialDistances(routeBins, startPoint = DEPOT) {
  let current = normalizePoint(startPoint);
  return routeBins.map((bin) => {
    const distanceFromPrev = getDistance(current, bin);
    current = bin;
    return { ...bin, distanceFromPrev };
  });
}

function GarbageCollectorMarker({ position, nextStop }) {
  const map = useMap();
  const markerRef = useRef(null);
  const pulseRef = useRef(null);
  useEffect(() => {
    if (!position) return;
    if (!pulseRef.current) {
      pulseRef.current = L.circleMarker([position.lat, position.lng], { radius: 22, color: "#e74c3c", fillColor: "#e74c3c", fillOpacity: 0.15, weight: 2, opacity: 0.45 }).addTo(map);
    }
    const collectorIcon = L.divIcon({
      className: "",
      html: `<div style="width: 38px; height: 38px; background: #e74c3c; border: 3px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 19px; box-shadow: 0 2px 8px rgba(0,0,0,0.35);">🚛</div>`,
      iconSize: [38, 38], iconAnchor: [19, 19],
    });
    if (!markerRef.current) { markerRef.current = L.marker([position.lat, position.lng], { icon: collectorIcon }).addTo(map); }
  }, [map, position]);
  useEffect(() => {
    if (!position) return;
    const popupContent = `<strong>Garbage Collector</strong><br/>Current position reflected on route<br/>${nextStop ? `Destination: <b>${nextStop.binId}</b>` : "No active destination"}`;
    pulseRef.current?.setLatLng([position.lat, position.lng]);
    markerRef.current?.setLatLng([position.lat, position.lng]);
    markerRef.current?.bindPopup(popupContent);
  }, [position, nextStop?.binId]);
  useEffect(() => {
    return () => {
      if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }
      if (pulseRef.current) { map.removeLayer(pulseRef.current); pulseRef.current = null; }
    };
  }, [map]);
  return null;
}

function RouteLayer({ bins, priorityBins, completedStops, routeVersion, routeStarted, collectingBinId, onCollectorMove, onRouteInfoChange, onArriveAtStop }) {
  const map = useMap();
  const routeLineRef = useRef([]);
  const markersRef = useRef([]);
  const animationFrameRef = useRef(null);
  const completedAnimationKeysRef = useRef(new Set());

  useEffect(() => { completedAnimationKeysRef.current.clear(); }, [routeVersion]);

  useEffect(() => {
    const collectorStart = getCollectorStart(bins, completedStops);
    const remaining = priorityBins.filter((bin) => !completedStops.includes(bin.binId));
    const orderedRoute = attachSequentialDistances(remaining, collectorStart);
    const nextStop = orderedRoute[0] || null;
    const collectingBin = collectingBinId ? bins.find((bin) => bin.binId === collectingBinId && hasValidCoordinates(bin)) : null;

    const activeRouteKey = `${routeVersion}-${collectorStart.binId || `${collectorStart.lat},${collectorStart.lng}`}-${nextStop?.binId || 'none'}`;

    if (collectingBin) {
      const normalizedCollectingBin = normalizePoint(collectingBin);
      onCollectorMove(normalizedCollectingBin);
      onRouteInfoChange({ nextStop: normalizedCollectingBin, distanceToNext: 0 });
      return; 
    }

    routeLineRef.current.forEach((layer) => map.removeLayer(layer));
    routeLineRef.current = [];
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    if (!nextStop) {
      onCollectorMove(collectorStart);
      onRouteInfoChange({ nextStop: null, distanceToNext: null });
      if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
      return;
    }

    const fullWaypoints = [collectorStart, ...orderedRoute];
    const fullCoords = fullWaypoints.map((p) => `${p.lng},${p.lat}`).join(";");
    const fullRouteUrl = `https://router.project-osrm.org/route/v1/driving/${fullCoords}?overview=full&geometries=geojson`;

    const activeCoords = [collectorStart, nextStop].map((p) => `${p.lng},${p.lat}`).join(";");
    const activeRouteUrl = `https://router.project-osrm.org/route/v1/driving/${activeCoords}?overview=full&geometries=geojson`;

    Promise.all([fetch(fullRouteUrl).then((res) => res.json()), fetch(activeRouteUrl).then((res) => res.json())])
      .then(([fullData, activeData]) => {
        if (!fullData.routes || fullData.routes.length === 0) return;

        const fullGeojson = fullData.routes[0].geometry;
        const activeGeojson = activeData.routes?.[0]?.geometry;

        const fullRouteLine = L.geoJSON(fullGeojson, { style: { color: "#7f8c8d", weight: 5, opacity: 0.65 } }).addTo(map);
        routeLineRef.current.push(fullRouteLine);

        if (activeGeojson) {
          const activeRouteLine = L.geoJSON(activeGeojson, { style: { color: "#e74c3c", weight: 7, opacity: 0.95 } }).addTo(map);
          routeLineRef.current.push(activeRouteLine);

          const activeRouteCoordinates = activeGeojson.coordinates;
          const distanceToNext = activeData.routes?.[0]?.distance ?? getDistance(collectorStart, nextStop);
          onRouteInfoChange({ nextStop, distanceToNext });

          if (!routeStarted) {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            onCollectorMove(collectorStart);
          } else if (completedAnimationKeysRef.current.has(activeRouteKey)) {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            onCollectorMove(nextStop);
          } else {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            const animationDuration = Math.max(5000, Math.min(15000, distanceToNext * 15));
            const startTime = performance.now();
            const animateCollector = (now) => {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / animationDuration, 1);
              onCollectorMove(getPointAlongRoute(activeRouteCoordinates, progress));
              if (progress < 1) {
                animationFrameRef.current = requestAnimationFrame(animateCollector);
              } else {
                animationFrameRef.current = null;
                completedAnimationKeysRef.current.add(activeRouteKey);
                onCollectorMove(nextStop);
                onArriveAtStop?.(nextStop);
              }
            };
            animationFrameRef.current = requestAnimationFrame(animateCollector);
          }
        } else {
          onCollectorMove(collectorStart);
          onRouteInfoChange({ nextStop, distanceToNext: getDistance(collectorStart, nextStop) });
        }

        orderedRoute.forEach((bin, index) => {
          const isNext = index === 0;
          const icon = L.divIcon({
            className: "",
            html: `<div style="width: 32px; height: 32px; background: ${isNext ? "#e74c3c" : statusColor[bin.status] || "#888"}; border: 3px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; color: white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">${index + 1}</div>`,
            iconSize: [32, 32], iconAnchor: [16, 16],
          });
          const marker = L.marker([bin.lat, bin.lng], { icon }).addTo(map).bindPopup(`<strong>${bin.binId}</strong><br/>${bin.zone}<br/>Fill: ${bin.fillLevel}%<br/>Stop #${index + 1}${isNext ? " — <b>CURRENT DESTINATION</b>" : ""}`);
          markersRef.current.push(marker);
        });

        const depotIcon = L.divIcon({
          className: "",
          html: `<div style="width: 38px; height: 38px; background: #1a5276; border: 3px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 17px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">🏛️</div>`,
          iconSize: [38, 38], iconAnchor: [19, 19],
        });
        const depotMarker = L.marker([DEPOT.lat, DEPOT.lng], { icon: depotIcon }).addTo(map).bindPopup("<strong>Barangay Hall</strong><br/>Starting point");
        markersRef.current.push(depotMarker);
      })
      .catch((err) => console.error("OSRM error:", err));

    return () => {
      if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
    };
  }, [ map, priorityBins.map(b => b.binId).join(','), completedStops.length, routeVersion, routeStarted, collectingBinId, onCollectorMove, onRouteInfoChange, onArriveAtStop ]);

  return null;
}

function BinMarkers({ bins, priorityBinIds }) {
  return bins.filter((bin) => hasValidCoordinates(bin) && !priorityBinIds.includes(bin.binId)).map((bin) => (
      <CircleMarker key={`${bin.binId}-${bin.fillLevel}-${bin.status}`} center={[Number(bin.lat), Number(bin.lng)]} radius={10} fillColor={statusColor[bin.status] || "#888"} color="white" weight={2} fillOpacity={0.9} >
        <Popup><strong>{bin.binId}</strong><br />Zone: {bin.zone}<br />Fill Level: {bin.fillLevel}%<br />Status: {bin.status}</Popup>
      </CircleMarker>
    ));
}

function Map({ bins, completedStops = [], routeVersion = 0, routeStarted = false, collectingBinId = null, routeBinIds = [], onArriveAtStop }) {
  const [collectorPosition, setCollectorPosition] = useState(DEPOT);
  const [routeInfo, setRouteInfo] = useState({ nextStop: null, distanceToNext: null });

  const priorityBins = useMemo(() => {
    if (routeBinIds.length > 0) return orderBinsByRouteIds(bins, routeBinIds);
    // Restored >= 70 threshold for route map preview
    return optimizeRoute(bins.filter((bin) => Number(bin.fillLevel) >= 70 && hasValidCoordinates(bin)), DEPOT);
  }, [bins, routeBinIds.join(",")]);

  const collectorStart = useMemo(() => getCollectorStart(bins, completedStops), [bins, completedStops]);
  const remainingPriorityBins = priorityBins.filter((bin) => !completedStops.includes(bin.binId));
  const orderedRoute = attachSequentialDistances(remainingPriorityBins, collectorStart);
  const nextStop = routeInfo.nextStop || orderedRoute[0] || null;
  const priorityBinIds = priorityBins.map((bin) => bin.binId);

  useEffect(() => {
    setCollectorPosition(collectorStart);
    setRouteInfo({ nextStop: null, distanceToNext: null });
  }, [routeVersion]);

  useEffect(() => {
    if (priorityBins.length === 0) { setCollectorPosition(collectorStart); setRouteInfo({ nextStop: null, distanceToNext: null }); }
  }, [priorityBins.length, collectorStart]);

  return (
    <div style={{ borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
      <div style={{ background: "white", padding: "10px 16px", display: "flex", gap: "12px", alignItems: "center", borderBottom: "1px solid #eee", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: "13px", color: "#333" }}>Legend:</span>
        {[{ color: "#1e8449", label: "Normal (0–69%)" }, { color: "#d35400", label: "Warning (70–89%)" }, { color: "#c0392b", label: "Critical (90–100%)" }, { color: "#7f8c8d", label: "Overall route" }, { color: "#e74c3c", label: "Current route" }].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "13px", height: "13px", borderRadius: "50%", background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: "12px", color: "#555" }}>{item.label}</span>
          </div>
        ))}
      </div>
      <MapContainer center={[DEPOT.lat, DEPOT.lng]} zoom={16} style={{ height: "420px", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        <BinMarkers bins={bins} priorityBinIds={priorityBinIds} />
        {priorityBins.length > 0 && (
          <RouteLayer bins={bins} priorityBins={priorityBins} completedStops={completedStops} routeVersion={routeVersion} routeStarted={routeStarted} collectingBinId={collectingBinId} onCollectorMove={setCollectorPosition} onRouteInfoChange={setRouteInfo} onArriveAtStop={onArriveAtStop} />
        )}
        <GarbageCollectorMarker position={collectorPosition} nextStop={nextStop} />
      </MapContainer>
    </div>
  );
}
export default Map;