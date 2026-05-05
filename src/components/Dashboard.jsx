import React, { useEffect, useState } from "react";
import { db } from "../firebase/config";
import { collection, onSnapshot } from "firebase/firestore";
import BinCard from "./BinCard";
import Map from "./Map";
import RoutePanel from "./RoutePanel";
import CollectionLog from "./CollectionLog";

function Dashboard() {
  const [bins, setBins] = useState([]);
  const [selectedZone, setSelectedZone] = useState("All");
const [completedStops, setCompletedStops] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bins"), (snapshot) => {
      const data = snapshot.docs.map((doc) => doc.data());
      setBins(data);
    });
    return () => unsub();
  }, []);

  const zones = ["All", "Zone 1", "Zone 2", "Zone 3", "Zone 4"];
  const filteredBins = selectedZone === "All"
    ? bins
    : bins.filter((b) => b.zone === selectedZone);

  const critical = bins.filter(b => b.status === "critical").length;
  const warning = bins.filter(b => b.status === "warning").length;
  const normal = bins.filter(b => b.status === "normal").length;

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1a5276, #2e86c1)",
        color: "white",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
      }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700 }}>
            🗑️ Waste Collection Monitoring System
          </h1>
          <p style={{ fontSize: "13px", opacity: 0.85 }}>
            Brgy. Palloocan West, Batangas City
          </p>
        </div>
        <div style={{ fontSize: "13px", opacity: 0.85 }}>
          Live • Updates every 5s
        </div>
      </div>

      <div style={{ padding: "20px 24px" }}>
        {/* Summary Cards */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
          {[
            { label: "Total Bins", value: bins.length, color: "#2e86c1", bg: "#d6eaf8" },
            { label: "Critical", value: critical, color: "#c0392b", bg: "#fadbd8" },
            { label: "Warning", value: warning, color: "#d35400", bg: "#fdebd0" },
            { label: "Normal", value: normal, color: "#1e8449", bg: "#d5f5e3" },
          ].map((card) => (
            <div key={card.label} style={{
              background: card.bg,
              borderLeft: `5px solid ${card.color}`,
              borderRadius: "10px",
              padding: "14px 20px",
              flex: "1",
              minWidth: "140px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)"
            }}>
              <div style={{ fontSize: "28px", fontWeight: 700, color: card.color }}>
                {card.value}
              </div>
              <div style={{ fontSize: "13px", color: "#555", marginTop: "2px" }}>
                {card.label}
              </div>
            </div>
          ))}
        </div>

        {/* Map */}
        <div style={{ marginBottom: "20px" }}>
          <Map bins={bins} completedStops={completedStops} />
        </div>

        {/* Route Panel */}
        <div style={{ marginBottom: "20px" }}>
            <RoutePanel bins={bins} completedStops={completedStops} setCompletedStops={setCompletedStops} />
        </div>

        {/* Collection Log */}
        <CollectionLog />

        {/* Zone Filter */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          {zones.map((zone) => (
            <button key={zone} onClick={() => setSelectedZone(zone)} style={{
              padding: "8px 18px",
              borderRadius: "20px",
              border: "none",
              cursor: "pointer",
              background: selectedZone === zone ? "#2e86c1" : "#dce9f5",
              color: selectedZone === zone ? "white" : "#2e86c1",
              fontWeight: 600,
              fontSize: "13px",
              transition: "all 0.2s"
            }}>
              {zone}
            </button>
          ))}
        </div>

        {/* Bin Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "16px"
        }}>
          {filteredBins.map((bin) => (
            <BinCard key={bin.binId} bin={bin} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;