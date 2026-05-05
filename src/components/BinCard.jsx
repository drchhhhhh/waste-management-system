import React from "react";

const statusColor = {
  normal: { bg: "#d5f5e3", border: "#1e8449", text: "#1e8449" },
  warning: { bg: "#fdebd0", border: "#d35400", text: "#d35400" },
  critical: { bg: "#fadbd8", border: "#c0392b", text: "#c0392b" },
};

function BinCard({ bin }) {
  const colors = statusColor[bin.status] || statusColor.normal;
  const time = bin.lastUpdated
    ? new Date(bin.lastUpdated).toLocaleTimeString()
    : "N/A";

  return (
    <div style={{
      background: "white",
      borderRadius: "12px",
      padding: "16px",
      borderLeft: `5px solid ${colors.border}`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: "15px" }}>{bin.binId}</span>
        <span style={{
          background: colors.bg,
          color: colors.text,
          borderRadius: "12px",
          padding: "3px 10px",
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase"
        }}>
          {bin.status}
        </span>
      </div>

      <div style={{ fontSize: "12px", color: "#888", margin: "4px 0 10px" }}>
        {bin.zone}
      </div>

      {/* Fill Level Bar */}
      <div style={{ background: "#eee", borderRadius: "10px", height: "10px", marginBottom: "6px" }}>
        <div style={{
          width: `${bin.fillLevel}%`,
          background: colors.border,
          height: "10px",
          borderRadius: "10px",
          transition: "width 0.5s ease"
        }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
        <span style={{ color: colors.text, fontWeight: 700 }}>{bin.fillLevel}% Full</span>
        <span style={{ color: "#aaa" }}>Updated: {time}</span>
      </div>
    </div>
  );
}

export default BinCard;