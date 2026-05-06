/**
 * Alert Display Component
 * Renders real-time alerts from the Alert Center
 */

import React, { useState, useEffect } from 'react';
import { globalAlertCenter, ALERT_SEVERITY, ALERT_TYPES } from '../alerts/alertCenter.js';

const severityColors = {
  critical: {
    bg: '#fadbd8',
    text: '#c0392b',
    icon: '🚨',
  },
  warning: {
    bg: '#fdebd0',
    text: '#d35400',
    icon: '⚠️',
  },
  info: {
    bg: '#d5f5e3',
    text: '#1e8449',
    icon: 'ℹ️',
  },
};

function AlertItem({ alert, onDismiss }) {
  const colors = severityColors[alert.severity] || severityColors.info;

  return (
    <div
      style={{
        padding: '12px 16px',
        marginBottom: '8px',
        borderRadius: '4px',
        backgroundColor: colors.bg,
        color: colors.text,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '14px',
        fontWeight: '500',
        animation: 'slideIn 0.3s ease-in-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '18px' }}>{colors.icon}</span>
        <div>
          <p style={{ margin: '0 0 2px 0', fontWeight: 'bold' }}>
            {alert.type.replace(/_/g, ' ').toUpperCase()}
          </p>
          <p style={{ margin: '0', fontSize: '13px', opacity: 0.9 }}>
            {alert.message}
          </p>
        </div>
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '18px',
          color: colors.text,
          padding: '0',
          marginLeft: '12px',
        }}
        aria-label="Dismiss alert"
      >
        ✕
      </button>
    </div>
  );
}

export function AlertDisplay({ maxAlerts = 5, position = 'top-right' }) {
  const [alerts, setAlerts] = useState(new Map());

  useEffect(() => {
    const unsubscribe = globalAlertCenter.subscribe((alertMap) => {
      setAlerts(new Map(alertMap));
    });

    return unsubscribe;
  }, []);

  const criticalAlerts = Array.from(alerts.values())
    .filter((a) => a.severity === ALERT_SEVERITY.CRITICAL)
    .slice(0, maxAlerts);

  const otherAlerts = Array.from(alerts.values())
    .filter((a) => a.severity !== ALERT_SEVERITY.CRITICAL)
    .slice(0, maxAlerts);

  const visibleAlerts = [...criticalAlerts, ...otherAlerts].slice(0, maxAlerts);

  const positionStyles = {
    'top-right': {
      position: 'fixed',
      top: '20px',
      right: '20px',
    },
    'top-left': {
      position: 'fixed',
      top: '20px',
      left: '20px',
    },
    'bottom-right': {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
    },
    'bottom-left': {
      position: 'fixed',
      bottom: '20px',
      left: '20px',
    },
  };

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(400px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
      <div
        style={{
          ...positionStyles[position],
          maxWidth: '400px',
          zIndex: 9999,
          pointerEvents: visibleAlerts.length > 0 ? 'auto' : 'none',
        }}
      >
        {visibleAlerts.map((alert) => (
          <AlertItem
            key={alert.id}
            alert={alert}
            onDismiss={() => globalAlertCenter.dismiss(alert.id)}
          />
        ))}
      </div>
    </>
  );
}

export default AlertDisplay;
