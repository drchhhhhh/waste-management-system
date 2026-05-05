import { db } from "../firebase/config";
import { doc, setDoc } from "firebase/firestore";

const bins = [
  { id: "BIN-001", lat: 13.7565, lng: 121.0583, zone: "Zone 1" },
  { id: "BIN-002", lat: 13.7570, lng: 121.0590, zone: "Zone 1" },
  { id: "BIN-003", lat: 13.7558, lng: 121.0575, zone: "Zone 2" },
  { id: "BIN-004", lat: 13.7580, lng: 121.0600, zone: "Zone 2" },
  { id: "BIN-005", lat: 13.7550, lng: 121.0565, zone: "Zone 3" },
  { id: "BIN-006", lat: 13.7590, lng: 121.0610, zone: "Zone 3" },
  { id: "BIN-007", lat: 13.7545, lng: 121.0558, zone: "Zone 4" },
  { id: "BIN-008", lat: 13.7600, lng: 121.0620, zone: "Zone 4" },
];

const fillLevels = {};
bins.forEach(bin => {
  fillLevels[bin.id] = Math.floor(Math.random() * 50) + 20; // start 20-70%
});

let simulatorStarted = false;

export const startSimulator = async () => {
  if (simulatorStarted) return; // prevent duplicate intervals
  simulatorStarted = true;
  console.log("Simulator started...");

  const run = async () => {
    for (const bin of bins) {
      if (fillLevels[bin.id] >= 100) {
        fillLevels[bin.id] = 0;
      } else {
        fillLevels[bin.id] += Math.floor(Math.random() * 4) + 1; // increase 1-4%
      }

      const fillLevel = Math.min(fillLevels[bin.id], 100);

      let status = "normal";
      if (fillLevel >= 70 && fillLevel < 90) status = "warning";
      if (fillLevel >= 90) status = "critical";

      await setDoc(doc(db, "bins", bin.id), {
        binId: bin.id,
        lat: bin.lat,
        lng: bin.lng,
        zone: bin.zone,
        fillLevel,
        status,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });
    }
    console.log("Updated:", new Date().toLocaleTimeString());
  };

  await run(); // run immediately on start
  setInterval(run, 15000); // then every 15 seconds
};