import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const statusColor = {
  normal: "#1e8449",
  warning: "#d35400",
  critical: "#c0392b",
};

const DEPOT = { lat: 13.7572, lng: 121.0588 };

function getDistance(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function optimizeRoute(bins) {
  if (bins.length === 0) return [];
  const unvisited = [...bins];
  const route = [];
  let current = DEPOT;
  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let nearestDist = Infinity;
    unvisited.forEach((bin, i) => {
      const dist = getDistance(current, bin);
      if (dist < nearestDist) { nearestDist = dist; nearestIndex = i; }
    });
    const nearest = unvisited.splice(nearestIndex, 1)[0];
    route.push(nearest);
    current = nearest;
  }
  return route;
}

// Driver location marker + heading arrow
function DriverMarker({ position }) {
  const map = useMap();
  const markerRef = useRef(null);
  const pulseRef = useRef(null);

  useEffect(() => {
    if (!position) return;

    // Remove old markers
    if (markerRef.current) map.removeLayer(markerRef.current);
    if (pulseRef.current) map.removeLayer(pulseRef.current);

    // Pulse ring
    pulseRef.current = L.circleMarker([position.lat, position.lng], {
      radius: 22,
      color: "#2e86c1",
      fillColor: "#2e86c1",
      fillOpacity: 0.15,
      weight: 2,
      opacity: 0.4,
    }).addTo(map);

    // Driver icon
    const driverIcon = L.divIcon({
      className: "",
      html: `
        <div style="
          width: 36px; height: 36px;
          background: #2e86c1;
          border: 3px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        ">🚛</div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    markerRef.current = L.marker([position.lat, position.lng], { icon: driverIcon })
      .addTo(map)
      .bindPopup(`
        <strong>Your Location</strong><br/>
        Accuracy: ±${Math.round(position.accuracy)}m<br/>
        <small style="color:#888">${new Date().toLocaleTimeString()}</small>
      `);

    return () => {
      if (markerRef.current) map.removeLayer(markerRef.current);
      if (pulseRef.current) map.removeLayer(pulseRef.current);
    };
  }, [position]);

  return null;
}

// Route line drawn via OSRM
function RouteLayer({ priorityBins, completedStops, driverPosition }) {
  const map = useMap();
  const routeLineRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (routeLineRef.current) {
      routeLineRef.current.forEach(layer => map.removeLayer(layer));
    }
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    const remaining = priorityBins.filter(b => !completedStops.includes(b.binId));
    if (remaining.length === 0) return;

    const optimized = optimizeRoute(remaining);

    // Start from driver's position if available, otherwise depot
    const startPoint = driverPosition
      ? { lat: driverPosition.lat, lng: driverPosition.lng }
      : DEPOT;

    const waypoints = [startPoint, ...optimized, DEPOT];
    const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!data.routes || data.routes.length === 0) return;

        const geojson = data.routes[0].geometry;

        const routeLine = L.geoJSON(geojson, {
          style: { color: "#2e86c1", weight: 5, opacity: 0.85 }
        }).addTo(map);

        const dashedLine = L.geoJSON(geojson, {
          style: { color: "white", weight: 2, opacity: 0.6, dashArray: "8, 12" }
        }).addTo(map);

        routeLineRef.current = [routeLine, dashedLine];

        // Numbered stop markers
        optimized.forEach((bin, index) => {
          const isNext = index === 0;
          const icon = L.divIcon({
            className: "",
            html: `
              <div style="
                width: 32px; height: 32px;
                background: ${isNext ? "#f39c12" : statusColor[bin.status] || "#888"};
                border: 3px solid white;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-size: 13px; font-weight: bold; color: white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              ">${index + 1}</div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });

          const marker = L.marker([bin.lat, bin.lng], { icon })
            .addTo(map)
            .bindPopup(`
              <strong>${bin.binId}</strong><br/>
              ${bin.zone}<br/>
              Fill: ${bin.fillLevel}%<br/>
              Stop #${index + 1}${isNext ? " — <b>NEXT STOP</b>" : ""}
            `);
          markersRef.current.push(marker);
        });

        // Depot marker
        const depotIcon = L.divIcon({
          className: "",
          html: `
            <div style="
              width: 36px; height: 36px;
              background: #1a5276; border: 3px solid white;
              border-radius: 50%; display: flex;
              align-items: center; justify-content: center;
              font-size: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            ">🏠</div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const depotMarker = L.marker([DEPOT.lat, DEPOT.lng], { icon: depotIcon })
          .addTo(map)
          .bindPopup("<strong>Barangay Hall</strong><br/>Depot — Start / End");
        markersRef.current.push(depotMarker);

        map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
      })
      .catch(err => console.error("OSRM error:", err));

    return () => {
      if (routeLineRef.current) {
        routeLineRef.current.forEach(layer => map.removeLayer(layer));
      }
      markersRef.current.forEach(m => map.removeLayer(m));
    };
  }, [
    priorityBins.map(b => b.binId + b.fillLevel).join(","),
    completedStops.join(","),
    driverPosition?.lat,
    driverPosition?.lng,
  ]);

  return null;
}

function BinMarkers({ bins, priorityBinIds }) {
  return bins
    .filter(bin => !priorityBinIds.includes(bin.binId))
    .map((bin) => (
      <CircleMarker
        key={`${bin.binId}-${bin.fillLevel}-${bin.status}`}
        center={[bin.lat, bin.lng]}
        radius={10}
        fillColor={statusColor[bin.status] || "#888"}
        color="white"
        weight={2}
        fillOpacity={0.9}
      >
        <Popup>
          <strong>{bin.binId}</strong><br />
          Zone: {bin.zone}<br />
          Fill Level: {bin.fillLevel}%<br />
          Status: {bin.status}
        </Popup>
      </CircleMarker>
    ));
}

// Centers map on driver
function RecenterButton({ position }) {
  const map = useMap();
  if (!position) return null;
  return (
    <div
      onClick={() => map.setView([position.lat, position.lng], 17)}
      style={{
        position: "absolute",
        bottom: "16px",
        right: "16px",
        zIndex: 1000,
        background: "white",
        border: "2px solid #2e86c1",
        borderRadius: "10px",
        padding: "8px 14px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 700,
        color: "#2e86c1",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }}
    >
      📍 My Location
    </div>
  );
}

function RecenterControl({ position }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    const control = L.control({ position: "bottomright" });
    control.onAdd = () => {
      const div = L.DomUtil.create("div");
      div.innerHTML = `
        <div id="recenter-btn" style="
          background: white; border: 2px solid #2e86c1;
          border-radius: 10px; padding: 8px 14px;
          cursor: pointer; font-size: 13px; font-weight: bold;
          color: #2e86c1; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          display: flex; align-items: center; gap: 6px;
        ">📍 My Location</div>
      `;
      div.onclick = () => map.setView([position.lat, position.lng], 17);
      return div;
    };
    control.addTo(map);
    return () => control.remove();
  }, [position]);
  return null;
}

function Map({ bins, completedStops = [] }) {
  const [driverPosition, setDriverPosition] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const watchIdRef = useRef(null);

  const priorityBins = bins.filter(b => b.fillLevel >= 70);
  const priorityBinIds = priorityBins.map(b => b.binId);

  const startTracking = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    setTrackingActive(true);
    setLocationError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setDriverPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocationError(null);
      },
      (err) => {
        setLocationError("Location access denied. Please allow location access.");
        setTrackingActive(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    setTrackingActive(false);
    setDriverPosition(null);
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Distance to next stop
  const nextStop = priorityBins.filter(b => !completedStops.includes(b.binId))[0];
  const distToNext = driverPosition && nextStop
    ? Math.round(getDistance(driverPosition, nextStop))
    : null;

  return (
    <div style={{ borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>

      {/* Top bar */}
      <div style={{
        background: "white", padding: "10px 16px",
        display: "flex", gap: "12px", alignItems: "center",
        borderBottom: "1px solid #eee", flexWrap: "wrap"
      }}>
        <span style={{ fontWeight: 700, fontSize: "13px", color: "#333" }}>Legend:</span>
        {[
          { color: "#1e8449", label: "Normal (0–69%)" },
          { color: "#d35400", label: "Warning (70–89%)" },
          { color: "#c0392b", label: "Critical (90–100%)" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "13px", height: "13px", borderRadius: "50%", background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: "12px", color: "#555" }}>{item.label}</span>
          </div>
        ))}

        {/* Live counts */}
        <div style={{ display: "flex", gap: "8px", marginLeft: "auto", flexWrap: "wrap" }}>
          {[
            { color: "#1e8449", label: "Normal", count: bins.filter(b => b.status === "normal").length },
            { color: "#d35400", label: "Warning", count: bins.filter(b => b.status === "warning").length },
            { color: "#c0392b", label: "Critical", count: bins.filter(b => b.status === "critical").length },
          ].map((item) => (
            <div key={item.label} style={{
              display: "flex", alignItems: "center", gap: "5px",
              background: "#f8f9fa", borderRadius: "12px", padding: "3px 10px"
            }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: item.color }} />
              <span style={{ color: item.color, fontWeight: 700, fontSize: "12px" }}>{item.count}</span>
              <span style={{ color: "#888", fontSize: "12px" }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Driver tracking bar */}
      <div style={{
        background: trackingActive ? "#eaf4fb" : "#f8f9fa",
        padding: "10px 16px",
        display: "flex", alignItems: "center", gap: "12px",
        borderBottom: "1px solid #eee", flexWrap: "wrap"
      }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          {trackingActive && driverPosition ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "18px" }}>🚛</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "#1a5276" }}>
                  Live tracking active
                </div>
                <div style={{ fontSize: "11px", color: "#888" }}>
                  Accuracy: ±{Math.round(driverPosition.accuracy)}m
                  {distToNext !== null && (
                    <span style={{ marginLeft: "10px", color: "#f39c12", fontWeight: 700 }}>
                      • Next stop: {distToNext < 1000 ? `${distToNext}m` : `${(distToNext/1000).toFixed(1)}km`} away
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : trackingActive ? (
            <span style={{ fontSize: "13px", color: "#888" }}>📡 Getting your location...</span>
          ) : (
            <span style={{ fontSize: "13px", color: "#888" }}>
              🚛 Driver tracking — enable to show your live position on the map
            </span>
          )}
          {locationError && (
            <div style={{ fontSize: "12px", color: "#c0392b", marginTop: "4px" }}>
              ⚠️ {locationError}
            </div>
          )}
        </div>

        <button
          onClick={trackingActive ? stopTracking : startTracking}
          style={{
            background: trackingActive ? "#c0392b" : "#2e86c1",
            color: "white", border: "none", borderRadius: "8px",
            padding: "8px 16px", fontSize: "12px",
            cursor: "pointer", fontWeight: 700, flexShrink: 0
          }}
        >
          {trackingActive ? "⏹ Stop Tracking" : "📍 Enable Tracking"}
        </button>
      </div>

      {/* Map */}
      <MapContainer
        center={[13.7570, 121.0590]}
        zoom={16}
        style={{ height: "420px", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <BinMarkers bins={bins} priorityBinIds={priorityBinIds} />
        {priorityBins.length > 0 && (
          <RouteLayer
            priorityBins={priorityBins}
            completedStops={completedStops}
            driverPosition={driverPosition}
          />
        )}
        {driverPosition && <DriverMarker position={driverPosition} />}
        {driverPosition && <RecenterControl position={driverPosition} />}
      </MapContainer>
    </div>
  );
}

export default Map;