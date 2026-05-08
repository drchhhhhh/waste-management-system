import React from "react";

const statusConfig = {
  normal:   { bg: "rgba(34,197,94,0.1)",   border: "#22c55e", text: "#4ade80",  dot: "#22c55e" },
  warning:  { bg: "rgba(245,158,11,0.1)",  border: "#f59e0b", text: "#fbbf24",  dot: "#f59e0b" },
  critical: { bg: "rgba(239,68,68,0.1)",   border: "#ef4444", text: "#f87171",  dot: "#ef4444" },
};

function BinCard({ bin, routeOrder, isCurrentDestination, isCollecting, isCompleted }) {
  const colors = statusConfig[bin.status] || statusConfig.normal;
  
  const time = bin.lastUpdated
    ? new Date(bin.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "N/A";

  // Using raw Hex codes so that appending opacity values (like 88, 33) produces valid CSS.
  const activeBorderColor =
    isCollecting || isCurrentDestination
      ? "#ef4444"
      : isCompleted
      ? "#22c55e"
      : colors.border;

  const cardStyle = {
    background: "var(--surface-raised)",
    borderRadius: "var(--border-radius)",
    padding: "20px",
    border: `1px solid ${activeBorderColor}33`,  // Valid: #RRGGBBAA
    borderLeft: `4px solid ${activeBorderColor}`,
    boxShadow:
      isCollecting || isCurrentDestination
        ? "0 0 20px rgba(239,68,68,0.15), var(--box-shadow)"
        : "var(--box-shadow)",
    opacity: isCompleted ? 0.55 : 1,
    transition: "var(--transition)",
  };

  // Safely fallback to 0 and clamp the percentage bar between 0 and 100
  const safeFillLevel = Number(bin.fillLevel) || 0;
  const clampedFillLevel = Math.min(100, Math.max(0, safeFillLevel));

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "15px", color: "var(--text-main)", letterSpacing: "-0.01em" }}>
          {bin.binId}
        </span>
        <span
          style={{
            background: colors.bg,
            color: colors.text,
            borderRadius: "99px",
            padding: "3px 10px",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.dot, flexShrink: 0 }} />
          {bin.status}
        </span>
      </div>

      {/* Zone */}
      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "14px", fontWeight: 500 }}>
        {bin.zone}
      </div>

      {/* Route Tags */}
      {(routeOrder || isCurrentDestination || isCollecting || isCompleted) && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
          {routeOrder && (
            <span style={{
              background: isCollecting || isCurrentDestination ? "#ef4444" : "rgba(255,255,255,0.06)",
              color: isCollecting || isCurrentDestination ? "white" : "var(--text-muted)",
              borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 600,
            }}>
              Route #{routeOrder}
            </span>
          )}
          {(isCurrentDestination || isCollecting) && (
            <span style={{
              background: "rgba(239,68,68,0.12)",
              color: "#f87171",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 600,
            }}>
              {isCollecting ? "🚛 Collecting..." : "📍 Next Stop"}
            </span>
          )}
          {isCompleted && (
            <span style={{
              background: "rgba(34,197,94,0.12)",
              color: "#22c55e",
              borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 600,
            }}>
              ✅ Collected
            </span>
          )}
        </div>
      )}

      {/* Fill Level Bar */}
      <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "99px", height: "8px", marginBottom: "10px", overflow: "hidden" }}>
        <div
          style={{
            width: `${clampedFillLevel}%`,
            background: `linear-gradient(90deg, ${activeBorderColor}88, ${activeBorderColor})`,
            height: "100%",
            borderRadius: "99px",
            transition: isCollecting ? "width 0.15s linear" : "width 0.6s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: `0 0 8px ${activeBorderColor}66`,
          }}
        />
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
        <span style={{ color: activeBorderColor, fontWeight: 700, fontSize: "14px" }}>
          {Math.round(safeFillLevel)}%
          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500, marginLeft: "4px" }}>full</span>
        </span>
        <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "11px" }}>
          {time}
        </span>
      </div>
    </div>
  );
}

export default BinCard;