import React from "react";

// Updated to use a modern, subtle background but inherit our strong CSS variable colors for borders/text
const statusColor = {
  normal: { bg: "#d1fae5", border: "var(--status-empty)", text: "var(--primary-hover)" },
  warning: { bg: "#fef3c7", border: "var(--status-half)", text: "#d97706" },
  critical: { bg: "#fee2e2", border: "var(--status-full)", text: "var(--status-full)" },
};

function BinCard({ bin, routeOrder, isCurrentDestination, isCollecting, isCompleted }) {
  const colors = statusColor[bin.status] || statusColor.normal;
  const time = bin.lastUpdated ? new Date(bin.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A";

  // Determine the active accent color based on the truck's interaction
  const activeBorderColor = isCollecting || isCurrentDestination ? "var(--status-full)" : isCompleted ? "var(--status-empty)" : colors.border;

  return (
    <div
      style={{
        background: "var(--surface-color)",
        borderRadius: "var(--border-radius)",
        padding: "20px",
        borderLeft: `6px solid ${activeBorderColor}`,
        boxShadow: isCollecting || isCurrentDestination ? "0 4px 12px rgba(239, 68, 68, 0.15)" : "var(--box-shadow)",
        opacity: isCompleted ? 0.65 : 1, // Make completed bins fade back more cleanly
        transition: "var(--transition)"
      }}
    >
      {/* Header Area: Bin ID and Status Pill */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
        <span style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-main)" }}>{bin.binId}</span>
        <span
          style={{
            background: colors.bg,
            color: colors.text,
            borderRadius: "9999px", // Pill shape
            padding: "4px 12px",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          {bin.status}
        </span>
      </div>

      {/* Zone Label */}
      <div style={{ fontSize: "13px", color: "var(--text-muted)", margin: "4px 0 16px", fontWeight: 500 }}>
        {bin.zone}
      </div>

      {/* Dynamic Route Tags */}
      {(routeOrder || isCurrentDestination || isCollecting || isCompleted) && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          {routeOrder && (
            <span
              style={{
                background: isCollecting || isCurrentDestination ? "var(--status-full)" : "#f1f5f9",
                color: isCollecting || isCurrentDestination ? "white" : "var(--text-muted)",
                borderRadius: "6px",
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              Route #{routeOrder}
            </span>
          )}
          {(isCurrentDestination || isCollecting) && (
            <span
              style={{
                background: "#fee2e2",
                color: "var(--status-full)",
                border: "1px solid #fca5a5",
                borderRadius: "6px",
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              {isCollecting ? "🚛 Collecting..." : "📍 Next Stop"}
            </span>
          )}
          {isCompleted && (
            <span
              style={{
                background: "#d1fae5",
                color: "var(--status-empty)",
                borderRadius: "6px",
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              ✅ Collected
            </span>
          )}
        </div>
      )}

      {/* Fill Level Progress Bar */}
      <div style={{ background: "#f1f5f9", borderRadius: "12px", height: "12px", marginBottom: "8px", overflow: "hidden" }}>
        <div
          style={{
            width: `${bin.fillLevel}%`,
            background: activeBorderColor,
            height: "100%",
            borderRadius: "12px",
            transition: isCollecting ? "width 0.15s linear" : "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>

      {/* Footer Area: Percentage and Timestamp */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", alignItems: "center" }}>
        <span style={{ color: activeBorderColor, fontWeight: 700, fontSize: "14px" }}>
          {bin.fillLevel}% Full
        </span>
        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
          Updated: {time}
        </span>
      </div>
    </div>
  );
}

export default BinCard;