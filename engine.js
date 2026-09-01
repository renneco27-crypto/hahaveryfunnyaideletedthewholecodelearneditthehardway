/**
 * Stockfish Engine Bridge for Content Script
 * Uses dedicated long-lived Port connections to Background Service Worker.
 * Eliminates 'message channel closed' and CSP errors completely.
 */

class StockfishEngine {
  constructor() {
    this.port = null;
    this.reqId = 0;
    this.pendingCallbacks = new Map();
    this.isReady = true;
    this.debugMode = true; // Enable debugging
    this.connect();
  }

  connect() {
    try {
      console.log("[StockfishEngine] Attempting to connect to background worker...");
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.connect) {
        this.port = chrome.runtime.connect({ name: "content-engine" });
        console.log("[StockfishEngine] Port connection established");

        this.port.onMessage.addListener((res) => {
          console.log("[StockfishEngine] Message received:", res);
          if (res && res.id && this.pendingCallbacks.has(res.id)) {
            const cb = this.pendingCallbacks.get(res.id);
            this.pendingCallbacks.delete(res.id);
            if (res.success && Array.isArray(res.lines)) {
              console.log("[StockfishEngine] Evaluation successful, lines:", res.lines.length);
              cb(res.lines);
            } else {
              console.log("[StockfishEngine] Evaluation failed or no lines, returning empty");
              cb(res.lines || []);
            }
          }
        });

        this.port.onDisconnect.addListener(() => {
          console.log("[StockfishEngine] Port disconnected, reconnecting...");
          this.port = null;
          // Reconnect after brief pause
          setTimeout(() => this.connect(), 500);
        });
      } else {
        console.error("[StockfishEngine] Chrome runtime not available");
      }
    } catch (err) {
      console.error("[StockfishEngine] Port connection failed:", err);
      setTimeout(() => this.connect(), 1000);
    }
  }

  evaluate(fen, depth = 10, movetime = 200) {
    return new Promise((resolve) => {
      const id = ++this.reqId;
      this.pendingCallbacks.set(id, resolve);
      console.log("[StockfishEngine] Evaluate request - ID:", id, "FEN:", fen, "depth:", depth, "movetime:", movetime);

      if (!this.port) {
        console.log("[StockfishEngine] No port, connecting...");
        this.connect();
      }

      if (this.port) {
        try {
          this.port.postMessage({
            action: "EVALUATE",
            id: id,
            fen: fen,
            depth: depth,
            movetime: movetime
          });
          console.log("[StockfishEngine] Message sent successfully");
        } catch (e) {
          console.error("[StockfishEngine] PostMessage failed:", e);
          this.connect();
          setTimeout(() => {
            if (this.port) {
              this.port.postMessage({
                action: "EVALUATE",
                id: id,
                fen: fen,
                depth: depth,
                movetime: movetime
              });
            } else {
              console.log("[StockfishEngine] Still no port after reconnect, returning empty");
              resolve([]);
            }
          }, 300);
        }
      } else {
        console.log("[StockfishEngine] No port available, returning empty immediately");
        resolve([]);
      }
      
      // Fallback timeout - much longer for debugging
      setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          console.log("[StockfishEngine] Evaluation timeout for ID:", id);
          this.pendingCallbacks.delete(id);
          resolve([]);
        }
      }, 5000); // 5 second timeout for debugging
    });
  }
}

if (typeof window !== "undefined") {
  window.StockfishEngine = StockfishEngine;
}


