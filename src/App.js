import React, { useEffect } from "react";
import { startSimulator } from "./simulator/binSimulator";
import Dashboard from "./components/Dashboard";
import "./App.css";

function App() {
  useEffect(() => {
    // Start the simulator and save the cleanup function
    const cleanup = startSimulator();
    
    // This physically kills the old simulator if React ever reloads the page
    return cleanup; 
  }, []);

  return (
    <div className="App">
      <Dashboard />
    </div>
  );
}

export default App;