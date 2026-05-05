import React, { useEffect } from "react";
import { startSimulator } from "./simulator/binSimulator";
import Dashboard from "./components/Dashboard";
import "./App.css";

function App() {
  useEffect(() => {
    startSimulator();
  }, []);

  return (
    <div className="App">
      <Dashboard />
    </div>
  );
}

export default App;