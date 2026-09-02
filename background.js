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
    
    // Open chessda.com analysis page in new tab (keep original game tab open)
    const chessdaUrl = "https://chessda.com/analysis";
    chrome.tabs.create({ url: chessdaUrl }, (tab) => {
      console.log("[Background] Opened chessda.com tab:", tab.id);
    });
    
    sendResponse({ success: true });
  } else if (request.action === "INJECT_CHESSDA_SCRIPT") {
    console.log("[Background] INJECT_CHESSDA_SCRIPT request received:", request);
    
    // Inject automation script into the current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const tab = tabs[0];
        console.log("[Background] Injecting script into tab:", tab.id);
        
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (fen) => {
            console.log("[Chessda Automation] Script injected successfully");
            console.log("[Chessda Automation] FEN to paste:", fen);
            
            // Wait for Edit Board button and add click listener
            const checkForEditButton = setInterval(() => {
              const editButton = Array.from(document.querySelectorAll('button')).find(btn => 
                btn.textContent.includes('Edit Board')
              );
              
              if (editButton) {
                clearInterval(checkForEditButton);
                console.log("[Chessda Automation] Edit Board button found, adding click listener");
                
                editButton.addEventListener('click', () => {
                  console.log("[Chessda Automation] Edit Board clicked - starting automation");
                  
                  setTimeout(() => {
                    const fenInput = document.getElementById('editor-fen');
                    if (fenInput) {
                      console.log("[Chessda Automation] FEN input found, pasting FEN");
                      fenInput.value = fen;
                      
                      const inputEvent = new Event('input', { bubbles: true });
                      fenInput.dispatchEvent(inputEvent);
                      
                      setTimeout(() => {
                        const startButton = Array.from(document.querySelectorAll('button')).find(btn => 
                          btn.textContent.includes('Start Analysis')
                        );
                        
                        if (startButton) {
                          console.log("[Chessda Automation] Start Analysis button found, clicking it");
                          startButton.click();
                          console.log("[Chessda Automation] Automation complete!");
                        } else {
                          console.log("[Chessda Automation] Start Analysis button not found");
                        }
                      }, 500);
                    } else {
                      console.log("[Chessda Automation] FEN input not found");
                    }
                  }, 500);
                });
              }
            }, 500);
            
            setTimeout(() => clearInterval(checkForEditButton), 10000);
          },
          args: [request.fen]
        }, (results) => {
          if (chrome.runtime.lastError) {
            console.error("[Background] Script injection failed:", chrome.runtime.lastError);
          } else {
            console.log("[Background] Script injection successful");
          }
        });
      }
    });
    
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open for async response
});

