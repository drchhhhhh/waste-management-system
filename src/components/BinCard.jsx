import React from "react";

const statusColor = {
  normal: { bg: "#d5f5e3", border: "#1e8449", text: "#1e8449" },
  warning: { bg: "#fdebd0", border: "#d35400", text: "#d35400" },
  critical: { bg: "#fadbd8", border: "#c0392b", text: "#c0392b" },
};

function BinCard({ bin, routeOrder, isCurrentDestination, isCollecting, isCompleted }) {
  const colors = statusColor[bin.status] || statusColor.normal;
  const time = bin.lastUpdated ? new Date(bin.lastUpdated).toLocaleTimeString() : "N/A";

  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        padding: "16px",
        borderLeft: `5px solid ${isCollecting || isCurrentDestination ? "#e74c3c" : isCompleted ? "#1e8449" : colors.border}`,
        boxShadow: isCollecting || isCurrentDestination ? "0 2px 10px rgba(231,76,60,0.22)" : "0 2px 8px rgba(0,0,0,0.07)",
        opacity: isCompleted ? 0.82 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
        <span style={{ fontWeight: 700, fontSize: "15px" }}>{bin.binId}</span>
        <span
          style={{
            background: colors.bg,
            color: colors.text,
            borderRadius: "12px",
            padding: "3px 10px",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          {bin.status}
        </span>
      </div>

      <div style={{ fontSize: "12px", color: "#888", margin: "4px 0 10px" }}>{bin.zone}</div>

      {(routeOrder || isCurrentDestination || isCollecting || isCompleted) && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
          {routeOrder && (
            <span
              style={{
                background: isCollecting || isCurrentDestination ? "#e74c3c" : "#eef2f5",
                color: isCollecting || isCurrentDestination ? "white" : "#555",
                borderRadius: "8px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              Route #{routeOrder}
            </span>
          )}
          {(isCurrentDestination || isCollecting) && (
            <span
              style={{
                background: "#fff5f5",
                color: "#c0392b",
                border: "1px solid #f5b7b1",
                borderRadius: "8px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              {isCollecting ? "Collecting" : "Current destination"}
            </span>
          )}
          {isCompleted && (
            <span
              style={{
                background: "#d5f5e3",
                color: "#1e8449",
                borderRadius: "8px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              Collected
            </span>
          )}
        </div>
      )}

      <div style={{ background: "#eee", borderRadius: "10px", height: "10px", marginBottom: "6px" }}>
        <div
          style={{
            width: `${bin.fillLevel}%`,
            background: isCollecting ? "#e74c3c" : isCompleted ? "#1e8449" : colors.border,
            height: "10px",
            borderRadius: "10px",
            transition: isCollecting ? "width 0.12s linear" : "width 0.5s ease",
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
        <span style={{ color: isCollecting ? "#e74c3c" : isCompleted ? "#1e8449" : colors.text, fontWeight: 700 }}>{bin.fillLevel}% Full</span>
        <span style={{ color: "#aaa" }}>Updated: {time}</span>
      </div>
    </div>
  );
}

export default BinCard;
