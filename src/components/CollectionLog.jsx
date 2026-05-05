import React, { useEffect, useState } from "react";
import { db } from "../firebase/config";
import { collection, onSnapshot } from "firebase/firestore";

function CollectionLog() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bins"), (snapshot) => {
      const collected = snapshot.docs
        .map((doc) => doc.data())
        .filter((bin) => bin.lastCollected)
        .sort((a, b) => new Date(b.lastCollected) - new Date(a.lastCollected));
      setLogs(collected);
    });
    return () => unsub();
  }, []);

  return (
    <div style={{
      background: "white",
      borderRadius: "12px",
      padding: "16px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
      marginBottom: "20px"
    }}>
      <h3 style={{ marginBottom: "12px", fontSize: "15px", color: "#1a5276" }}>
        📋 Collection Log
      </h3>

      {logs.length === 0 ? (
        <p style={{ color: "#888", fontSize: "13px" }}>
          No collections recorded yet. Mark a bin as collected to log it here.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f0f2f5" }}>
              {["Bin ID", "Zone", "Collected At", "Current Fill"].map((h) => (
                <th key={h} style={{
                  padding: "10px 12px",
                  textAlign: "left",
                  color: "#555",
                  fontWeight: 700,
                  borderBottom: "2px solid #ddd"
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((bin, i) => (
              <tr key={bin.binId} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}>
                <td style={{ padding: "10px 12px", fontWeight: 700 }}>{bin.binId}</td>
                <td style={{ padding: "10px 12px", color: "#555" }}>{bin.zone}</td>
                <td style={{ padding: "10px 12px", color: "#555" }}>
                  {new Date(bin.lastCollected).toLocaleString()}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{
                    background: "#d5f5e3",
                    color: "#1e8449",
                    borderRadius: "10px",
                    padding: "3px 10px",
                    fontWeight: 700,
                    fontSize: "12px"
                  }}>
                    {bin.fillLevel}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default CollectionLog;