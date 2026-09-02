/**
 * Background Service Worker for FreeChess Coach Extension
 * Manages the offscreen document and routes engine evaluations via long-lived Ports.
 */

let creatingOffscreenPromise = null;
let offscreenPort = null;
const pendingContentCallbacks = new Map();

async function setupOffscreenDocument(path = "offscreen.html") {
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
  } else {
    creatingOffscreenPromise = chrome.offscreen.createDocument({
      url: path,
      reasons: ["WORKERS"],
      justification: "Run Stockfish chess engine WebAssembly in a Web Worker"
    });
    await creatingOffscreenPromise;
    creatingOffscreenPromise = null;
  }
}

// Manage Port Connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "offscreen-engine") {
    offscreenPort = port;
    offscreenPort.onMessage.addListener((response) => {
      if (response && response.id && pendingContentCallbacks.has(response.id)) {
        const callback = pendingContentCallbacks.get(response.id);
        pendingContentCallbacks.delete(response.id);
        callback(response);
      }
    });

    offscreenPort.onDisconnect.addListener(() => {
      offscreenPort = null;
    });
  } else if (port.name === "content-engine") {
    port.onMessage.addListener(async (msg) => {
      if (msg && msg.action === "EVALUATE") {
        try {
          await setupOffscreenDocument();

          if (offscreenPort) {
            pendingContentCallbacks.set(msg.id, (res) => {
              try {
                port.postMessage(res);
              } catch (e) {}
            });
            offscreenPort.postMessage(msg);
          } else {
            // Wait for offscreen port connection
            let retries = 0;
            const interval = setInterval(() => {
              retries++;
              if (offscreenPort) {
                clearInterval(interval);
                pendingContentCallbacks.set(msg.id, (res) => {
                  try {
                    port.postMessage(res);
                  } catch (e) {}
                });
                offscreenPort.postMessage(msg);
              } else if (retries > 20) {
                clearInterval(interval);
                port.postMessage({ id: msg.id, success: false, lines: [] });
              }
            }, 100);
          }
        } catch (err) {
          port.postMessage({ id: msg.id, success: false, error: err.message, lines: [] });
        }
      }
    });
  }
});

// Handle automation messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "OPEN_CHESSDA") {
    console.log("[Background] OPEN_CHESSDA request received:", request);
    
    // Find and close the original game tab
    chrome.tabs.query({ url: request.originalGameUrl }, (tabs) => {
      if (tabs.length > 0) {
        const gameTab = tabs[0];
        console.log("[Background] Closing original game tab:", gameTab.id);
        chrome.tabs.remove(gameTab.id);
      }
    });
    
    // Open chessda.com analysis page
    const chessdaUrl = "https://chessda.com/analysis";
    chrome.tabs.create({ url: chessdaUrl }, (tab) => {
      console.log("[Background] Opened chessda.com tab:", tab.id);
    });
    
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open for async response
});

