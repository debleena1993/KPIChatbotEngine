// Server replaced with Python FastAPI - see main.py
// This file now starts the Python backend

import { execSync } from "child_process";

console.log("Starting Python FastAPI server...");
try {
  execSync("python main.py", { stdio: "inherit" });
} catch (error) {
  console.error("Failed to start Python server:", error);
  process.exit(1);
}