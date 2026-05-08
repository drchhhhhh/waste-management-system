import React, { useEffect, useState } from "react";
import { db } from "../firebase/config";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

function CollectionLog() {
  const [logs, setLogs] = useState([]);
  const [showAllModal, setShowAllModal] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "collectionHistory"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setLogs(history);
    });
    return () => unsub();
  }, []);

  const displayLogs = logs.slice(0, 10);

  const getBadgeColor = (fillLevel) => {
    if (fillLevel >= 90) return { bg: "rgba(239,68,68,0.12)", text: "#f87171" };
    if (fillLevel >= 70) return { bg: "rgba(245,158,11,0.12)", text: "#fbbf24" };
    return { bg: "rgba(34,197,94,0.12)", text: "#4ade80" };
  };

  const thStyle = {
    padding: "12px 16px",
    color: "var(--text-muted)",
    fontWeight: 600,
    fontSize: "11px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    borderBottom: "1px solid var(--surface-border)",
    textAlign: "left",
  };

  const tdStyle = (extra = {}) => ({
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    fontSize: "13px",
    ...extra,
  });

  return (
    <>
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "17px", color: "var(--text-main)", fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>
              Collection Log
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
              {logs.length} total records
            </p>
          </div>

          {logs.length > 10 && (
            <button
              onClick={() => setShowAllModal(true)}
              style={{
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.25)",
                color: "var(--primary-color)",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "var(--transition)",
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "rgba(34,197,94,0.18)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "rgba(34,197,94,0.1)")}
            >
              See All →
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px dashed var(--surface-border)",
            padding: "32px",
            borderRadius: "10px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "14px",
          }}>
            No collections recorded yet. Start a route to see logs here.
          </div>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: "10px", border: "1px solid var(--surface-border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead style={{ background: "rgba(255,255,255,0.02)" }}>
                <tr>
                  <th style={thStyle}>Date & Time</th>
                  <th style={thStyle}>Bin ID</th>
                  <th style={thStyle}>Zone</th>
                  <th style={thStyle}>Volume</th>
                </tr>
              </thead>
              <tbody>
                {displayLogs.map((log) => {
                  const badge = getBadgeColor(log.fillLevel);
                  return (
                    <tr
                      key={log.id}
                      style={{ transition: "background 0.15s" }}
                      onMouseOver={(e) => (e.currentTarget.style.background = "rgba(34,197,94,0.04)")}
                      onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={tdStyle({ color: "var(--text-muted)" })}>
                        {new Date(log.timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td style={tdStyle({ fontWeight: 600, color: "var(--text-main)", fontFamily: "'Syne', sans-serif" })}>
                        {log.binId}
                      </td>
                      <td style={tdStyle({ color: "var(--text-muted)" })}>{log.zone}</td>
                      <td style={tdStyle()}>
                        <span style={{
                          background: badge.bg,
                          color: badge.text,
                          padding: "4px 10px",
                          borderRadius: "99px",
                          fontWeight: 700,
                          fontSize: "11px",
                          letterSpacing: "0.5px",
                        }}>
                          {log.fillLevel}% Full
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showAllModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.75)",
          display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 9999, padding: "24px",
          backdropFilter: "blur(6px)",
        }}>
          <div style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--surface-border)",
            borderRadius: "var(--border-radius)",
            width: "100%", maxWidth: "800px", maxHeight: "85vh",
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          }}>
            <div style={{
              padding: "24px 28px",
              borderBottom: "1px solid var(--surface-border)",
              display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            }}>
              <div>
                <h3 style={{ margin: "0 0 6px 0", fontFamily: "'Syne', sans-serif", fontSize: "18px", color: "var(--text-main)", fontWeight: 700 }}>
                  Complete Audit Trail
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                  All {logs.length} records from the database
                </p>
              </div>
              <button
                onClick={() => setShowAllModal(false)}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--surface-border)",
                  borderRadius: "8px",
                  width: "36px", height: "36px",
                  fontSize: "14px", cursor: "pointer",
                  color: "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "var(--transition)",
                  flexShrink: 0,
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = "var(--text-main)")}
                onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                ✕
              </button>
            </div>

            <div style={{ overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                    {["Date & Time", "Bin ID", "Zone", "Volume"].map((h) => (
                      <th key={h} style={{ ...thStyle, padding: "14px 24px", position: "sticky", top: 0, background: "var(--surface-raised)", zIndex: 10 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const badge = getBadgeColor(log.fillLevel);
                    return (
                      <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "14px 24px", color: "var(--text-muted)", fontSize: "13px" }}>
                          {new Date(log.timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td style={{ padding: "14px 24px", fontWeight: 600, color: "var(--text-main)", fontFamily: "'Syne', sans-serif" }}>
                          {log.binId}
                        </td>
                        <td style={{ padding: "14px 24px", color: "var(--text-muted)", fontSize: "13px" }}>{log.zone}</td>
                        <td style={{ padding: "14px 24px" }}>
                          <span style={{ background: badge.bg, color: badge.text, padding: "4px 10px", borderRadius: "99px", fontWeight: 700, fontSize: "11px", letterSpacing: "0.5px" }}>
                            {log.fillLevel}% Full
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default CollectionLog;