import React, { useEffect, useState } from "react";
import { db } from "../firebase/config";
// We import query and orderBy so we can fetch the history chronologically!
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

function CollectionLog() {
  const [logs, setLogs] = useState([]);
  const [showAllModal, setShowAllModal] = useState(false);

  useEffect(() => {
    // We request the logs from the new history table, newest dates first
    const q = query(collection(db, "collectionHistory"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setLogs(history);
    });
    return () => unsub();
  }, []);

  // Limit the dashboard view to just the 10 most recent collections
  const displayLogs = logs.slice(0, 10);

  // A helper function to color-code the fill level badges
  const getBadgeColor = (fillLevel) => {
    if (fillLevel >= 90) return { bg: "#fadbd8", text: "#c0392b" };
    if (fillLevel >= 70) return { bg: "#fdebd0", text: "#d35400" };
    return { bg: "#d5f5e3", text: "#1e8449" };
  };

  return (
    <>
      <div style={{ background: "white", borderRadius: "12px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: "20px" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "15px", color: "#1a5276" }}>📋 Historic Collection Log</h3>
          
          {/* Render the 'See All' button only if we actually have more than 10 records */}
          {logs.length > 10 && (
            <button 
              onClick={() => setShowAllModal(true)} 
              style={{ background: "#f0f4f8", border: "none", color: "#2e86c1", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "background 0.2s" }}
              onMouseOver={(e) => e.target.style.background = "#dce9f5"}
              onMouseOut={(e) => e.target.style.background = "#f0f4f8"}
            >
              See All
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <p style={{ color: "#888", fontSize: "13px", margin: 0 }}>
            No collections recorded yet. Start a route to see logs here.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f0f2f5", color: "#555" }}>
                <th style={{ padding: "10px", borderBottom: "2px solid #ddd" }}>Date & Time</th>
                <th style={{ padding: "10px", borderBottom: "2px solid #ddd" }}>Bin ID</th>
                <th style={{ padding: "10px", borderBottom: "2px solid #ddd" }}>Zone</th>
                <th style={{ padding: "10px", borderBottom: "2px solid #ddd" }}>Recorded Volume</th>
              </tr>
            </thead>
            <tbody>
              {displayLogs.map((log, i) => {
                const badge = getBadgeColor(log.fillLevel);
                return (
                  <tr key={log.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}>
                    <td style={{ padding: "10px", color: "#555" }}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td style={{ padding: "10px", fontWeight: 700, color: "#1a5276" }}>{log.binId}</td>
                    <td style={{ padding: "10px", color: "#555" }}>{log.zone}</td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ background: badge.bg, color: badge.text, padding: "4px 10px", borderRadius: "12px", fontWeight: "bold", fontSize: "11px" }}>
                        {log.fillLevel}% Full
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ⭐ THE POPUP MODAL (Activates when 'See All' is clicked) */}
      {showAllModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, padding: "20px", backdropFilter: "blur(3px)" }}>
          <div style={{ background: "white", borderRadius: "12px", width: "100%", maxWidth: "700px", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
            
            {/* Modal Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "#1a5276", fontSize: "18px" }}>📋 Complete Collection Audit Trail</h3>
                <p style={{ margin: 0, fontSize: "12px", color: "#888" }}>Showing all {logs.length} historical records in the database.</p>
              </div>
              <button 
                onClick={() => setShowAllModal(false)} 
                style={{ background: "#f0f2f5", border: "none", borderRadius: "50%", width: "32px", height: "32px", fontSize: "16px", cursor: "pointer", color: "#555", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                ✖
              </button>
            </div>
            
            {/* Modal Scrollable Body */}
            <div style={{ overflowY: "auto", padding: "0 20px 20px 20px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left", marginTop: "10px" }}>
                <thead>
                  <tr style={{ color: "#555" }}>
                    <th style={{ padding: "12px 10px", borderBottom: "2px solid #ddd", position: "sticky", top: 0, background: "#f0f2f5" }}>Date & Time</th>
                    <th style={{ padding: "12px 10px", borderBottom: "2px solid #ddd", position: "sticky", top: 0, background: "#f0f2f5" }}>Bin ID</th>
                    <th style={{ padding: "12px 10px", borderBottom: "2px solid #ddd", position: "sticky", top: 0, background: "#f0f2f5" }}>Zone</th>
                    <th style={{ padding: "12px 10px", borderBottom: "2px solid #ddd", position: "sticky", top: 0, background: "#f0f2f5" }}>Recorded Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => {
                    const badge = getBadgeColor(log.fillLevel);
                    return (
                      <tr key={log.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa", borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "12px 10px", color: "#555" }}>{new Date(log.timestamp).toLocaleString()}</td>
                        <td style={{ padding: "12px 10px", fontWeight: 700, color: "#1a5276" }}>{log.binId}</td>
                        <td style={{ padding: "12px 10px", color: "#555" }}>{log.zone}</td>
                        <td style={{ padding: "12px 10px" }}>
                          <span style={{ background: badge.bg, color: badge.text, padding: "4px 10px", borderRadius: "12px", fontWeight: "bold", fontSize: "11px" }}>
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