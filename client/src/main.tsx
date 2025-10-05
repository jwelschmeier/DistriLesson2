import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Load Replit dev banner only in development mode
if (import.meta.env.DEV) {
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://replit.com/public/js/replit-dev-banner.js';
  document.body.appendChild(script);
}

createRoot(document.getElementById("root")!).render(<App />);
