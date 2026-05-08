// We are exporting this so Dashboard.jsx doesn't crash, 
// but it no longer needs to do anything since the background loop is gone.
export const setSimulationPaused = (paused) => {
  window.isSimulationPaused = paused;
};

export const startSimulator = () => {
  // The background interval that randomly increased bin percentages 
  // every 5 seconds has been completely removed.
  
  // Bins will now be 100% FIXED and static. 
  // They will only get new trash when you click "Randomize", 
  // and they will only drain when you click "Start Route".
  
  console.log("Background waste accumulation is disabled. Bins are now fixed.");

  // Return an empty cleanup function for App.js
  return () => {};
};