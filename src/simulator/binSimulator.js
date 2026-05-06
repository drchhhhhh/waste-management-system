import { db } from "../firebase/config";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";

// Use the global window object to ensure absolute synchrony, 
// destroying any chance of React hot-reloading creating ghost intervals.
window.isSimulationPaused = window.isSimulationPaused || false;

export const setSimulationPaused = (paused) => {
  window.isSimulationPaused = paused;
};

export const startSimulator = () => {
  // If a simulator is already running in the background, kill it first.
  if (window.binSimInterval) {
    clearInterval(window.binSimInterval);
  }

  window.binSimInterval = setInterval(async () => {
    // STRICT FREEZE: If the truck is driving, absolutely do nothing.
    if (window.isSimulationPaused) {
      return; 
    }

    try {
      const binsCollection = collection(db, "bins");
      const snapshot = await getDocs(binsCollection);

      snapshot.forEach(async (binDoc) => {
        const binData = binDoc.data();

        // Leave 0% bins or actively collecting bins alone
        if (binData.fillLevel === 0 || binData.isCollecting === true) {
          return;
        }

        const currentFill = binData.fillLevel || 0;
        const newFill = Math.min(100, currentFill + Math.floor(Math.random() * 3) + 1);

        const binRef = doc(db, "bins", binDoc.id);
        await updateDoc(binRef, {
          fillLevel: newFill,
          status: newFill >= 90 ? "critical" : (newFill >= 70 ? "warning" : "normal"),
          lastUpdated: new Date().toISOString()
        });
      });
    } catch (error) {
      console.error("Error in background bin simulation:", error);
    }
  }, 5000);

  return () => {
    clearInterval(window.binSimInterval);
    window.binSimInterval = null;
  };
};