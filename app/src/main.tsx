import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import NotificationBannerHost from "./components/NotificationBanner";
import "./index.css";
import "highlight.js/styles/github-dark.css";

// The notification banner window (v0.1.1, issue #53) boots the same bundle
// with ?banner=1 — it renders only the toast host instead of the app shell,
// and marks the view so index.css keeps the body transparent.
const bannerMode = new URLSearchParams(window.location.search).has("banner");

if (bannerMode) {
  document.documentElement.dataset.klepaiView = "banner";
  document.body.dataset.klepaiView = "banner";
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <NotificationBannerHost />,
  );
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
