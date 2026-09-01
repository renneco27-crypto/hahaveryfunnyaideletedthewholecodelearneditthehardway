/**
 * Offscreen Host for Stockfish Engine Worker
 * Runs inside the extension origin (chrome-extension://...) with full WebWorker & WASM support.
 */

let worker = null;
let isReady = false;
let currentBuffer = [];
let currentResolver = null;
const evalQueue = [];
let isBusy = false;
let bgPort = null;

function initStockfishWorker() {
  try {
    worker = new Worker("stockfish.js");

    worker.onmessage = (e) => {
      const line = e.data;
      if (typeof line !== "string") return;
      currentBuffer.push(line);

      if (line === "uciok") {
        worker.postMessage("setoption name MultiPV value 2");
        worker.postMessage("isready");
      } else if (line === "readyok") {
        isReady = true;
        isBusy = false;
        console.log("[Offscreen Stockfish] Engine ready!");
        processQueue();
      } else if (line.startsWith("bestmove")) {
        isBusy = false;
        if (currentResolver) {
          const lines = parseLines(currentBuffer);
          currentResolver(lines);
          currentResolver = null;
        }
        currentBuffer = [];
        processQueue();
      }
    };

    worker.onerror = (err) => {
      console.error("[Offscreen Stockfish] Worker error:", err);
      isBusy = false;
      if (currentResolver) {
        currentResolver([]);
        currentResolver = null;
      }
      processQueue();
    };

    worker.postMessage("uci");
  } catch (err) {
    console.error("[Offscreen Stockfish] Initialization failed:", err);
  }
}

function parseLines(lines) {
  const byPV = {};
  lines.forEach((l) => {
    if (!l.startsWith("info")) return;
    const pvM = l.match(/\bpv\s+(\S+)/);
    const cpM = l.match(/\bscore cp (-?\d+)/);
    const mateM = l.match(/\bscore mate (-?\d+)/);
    const pvIdM = l.match(/\bmultipv (\d+)/);
    const depM = l.match(/\bdepth (\d+)/);
    if (!pvM) return;

    const pvId = pvIdM ? +pvIdM[1] : 1;
    const dep = depM ? +depM[1] : 0;

    if (!byPV[pvId] || dep >= byPV[pvId].dep) {
      const pvFull = l.match(/\bpv\s+(.+)/);
      const pvArr = pvFull ? pvFull[1].trim().split(/\s+/) : [pvM[1]];
      byPV[pvId] = {
        move: pvM[1],
        pv: pvArr.slice(0, 10),
        cp: cpM ? +cpM[1] : null,
        mateIn: mateM ? +mateM[1] : null,
        dep: dep
      };
    }
  });
  return Object.values(byPV);
}

function processQueue() {
  if (isBusy || evalQueue.length === 0 || !worker) return;

  const item = evalQueue.shift();
  isBusy = true;
  currentResolver = item.resolve;
  currentBuffer = [];

  worker.postMessage("position fen " + item.fen);
  worker.postMessage(`go depth ${item.depth} movetime ${item.movetime}`);
}

function evaluate(fen, depth = 10, movetime = 200) {
  return new Promise((resolve) => {
    if (!worker) {
      initStockfishWorker();
    }
    evalQueue.push({ fen, depth, movetime, resolve });
    processQueue();
  });
}

// Connect Port directly to Background Service Worker
function connectBackgroundPort() {
  try {
    bgPort = chrome.runtime.connect({ name: "offscreen-engine" });
    bgPort.onMessage.addListener((msg) => {
      if (msg && msg.action === "EVALUATE") {
        evaluate(msg.fen, msg.depth, msg.movetime)
          .then((lines) => {
            bgPort.postMessage({ id: msg.id, success: true, lines });
          })
          .catch((err) => {
            bgPort.postMessage({ id: msg.id, success: false, error: err.message, lines: [] });
          });
      }
    });
    bgPort.onDisconnect.addListener(() => {
      bgPort = null;
      setTimeout(connectBackgroundPort, 500);
    });
  } catch (e) {
    setTimeout(connectBackgroundPort, 1000);
  }
}

initStockfishWorker();
connectBackgroundPort();


