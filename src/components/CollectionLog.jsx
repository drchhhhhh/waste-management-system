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
    if (fillLevel >= 90) return { bg: "#fee2e2", text: "var(--status-full)" };
    if (fillLevel >= 70) return { bg: "#fef3c7", text: "#d97706" };
    return { bg: "#d1fae5", text: "var(--status-empty)" };
  };

  return (
    <>
      <div style={{ width: "100%" }}> {/* Box styling removed, handled by Dashboard wrapper */}
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", color: "var(--text-main)", fontWeight: 700 }}>📋 Historic Collection Log</h3>
          
          {logs.length > 10 && (
            <button 
              onClick={() => setShowAllModal(true)} 
              style={{ background: "var(--bg-color)", border: "none", color: "var(--text-main)", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "var(--transition)" }}
              onMouseOver={(e) => e.target.style.background = "#e2e8f0"}
              onMouseOut={(e) => e.target.style.background = "var(--bg-color)"}
            >
              See All Records
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <div style={{ background: "var(--bg-color)", padding: "24px", borderRadius: "8px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
            No collections recorded yet. Start a route to see logs here.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: 600 }}>Date & Time</th>
                  <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: 600 }}>Bin ID</th>
                  <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: 600 }}>Zone</th>
                  <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: 600 }}>Recorded Volume</th>
                </tr>
              </thead>
              <tbody>
                {displayLogs.map((log) => {
                  const badge = getBadgeColor(log.fillLevel);
                  return (
                    <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "#f8fafc"} onMouseOut={(e) => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "16px", color: "var(--text-muted)" }}>
                        {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: "16px", fontWeight: 600, color: "var(--text-main)" }}>{log.binId}</td>
                      <td style={{ padding: "16px", color: "var(--text-muted)" }}>{log.zone}</td>
                      <td style={{ padding: "16px" }}>
                        <span style={{ background: badge.bg, color: badge.text, padding: "6px 12px", borderRadius: "9999px", fontWeight: 700, fontSize: "12px", letterSpacing: "0.5px" }}>
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

      {showAllModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, padding: "24px", backdropFilter: "blur(4px)" }}>
          <div className="modern-card" style={{ width: "100%", maxWidth: "800px", maxHeight: "85vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
            
            <div style={{ padding: "24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-color)" }}>
              <div>
                <h3 style={{ margin: "0 0 8px 0", color: "var(--text-main)", fontSize: "20px", fontWeight: 700 }}>📋 Complete Collection Audit Trail</h3>
                <p style={{ margin: 0, fontSize: "14px", color: "var(--text-muted)" }}>Showing all {logs.length} historical records in the database.</p>
              </div>
              <button 
                onClick={() => setShowAllModal(false)} 
                style={{ background: "var(--bg-color)", border: "none", borderRadius: "50%", width: "36px", height: "36px", fontSize: "16px", cursor: "pointer", color: "var(--text-main)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}
                onMouseOver={(e) => e.target.style.background = "#e2e8f0"}
                onMouseOut={(e) => e.target.style.background = "var(--bg-color)"}
              >
                ✖
              </button>
            </div>
            
            <div style={{ overflowY: "auto", padding: "0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", textAlign: "left" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "16px 24px", color: "var(--text-muted)", fontWeight: 600, position: "sticky", top: 0, background: "#f8fafc", borderBottom: "2px solid #e2e8f0", zIndex: 10 }}>Date & Time</th>
                    <th style={{ padding: "16px 24px", color: "var(--text-muted)", fontWeight: 600, position: "sticky", top: 0, background: "#f8fafc", borderBottom: "2px solid #e2e8f0", zIndex: 10 }}>Bin ID</th>
                    <th style={{ padding: "16px 24px", color: "var(--text-muted)", fontWeight: 600, position: "sticky", top: 0, background: "#f8fafc", borderBottom: "2px solid #e2e8f0", zIndex: 10 }}>Zone</th>
                    <th style={{ padding: "16px 24px", color: "var(--text-muted)", fontWeight: 600, position: "sticky", top: 0, background: "#f8fafc", borderBottom: "2px solid #e2e8f0", zIndex: 10 }}>Recorded Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const badge = getBadgeColor(log.fillLevel);
                    return (
                      <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "16px 24px", color: "var(--text-muted)" }}>{new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td style={{ padding: "16px 24px", fontWeight: 600, color: "var(--text-main)" }}>{log.binId}</td>
                        <td style={{ padding: "16px 24px", color: "var(--text-muted)" }}>{log.zone}</td>
                        <td style={{ padding: "16px 24px" }}>
                          <span style={{ background: badge.bg, color: badge.text, padding: "6px 12px", borderRadius: "9999px", fontWeight: 700, fontSize: "12px", letterSpacing: "0.5px" }}>
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