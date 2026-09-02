/**
 * Universal Content Script for FreeChess Coach Browser Extension
 * - Real-time autonomous chessboard detection (Chessground, Chess.com, Lichess, custom DOM)
 * - DOM-to-FEN piece scanner & live state sync
 * - Real-time candidate move hover/drag evaluation + move commitment tracking
 * - High-visibility Fixed HUD Badge & Vibrant Red/Blue Glows
 */

(function () {
  console.log(
    "%c[FreeChess Coach] Extension loaded. Scanning for chessboards...",
    "background: #1e3a8a; color: #93c5fd; font-size: 13px; font-weight: bold; padding: 4px 8px; border-radius: 4px;"
  );

  let stockfish = null;
  let game = new Chess();
  let boardElement = null;
  let boardConfirmed = false;
  let boardOrientation = "w"; // 'w' or 'b'
  let currentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  let lastScannedFen = "";
  let isEvaluating = false;
  let startSquare = null;
  let draggedPiece = null;
  let tabResetDetected = false; // Track if we just had a tab reset
  let positionCheckTimer = null; // 5-second timer for position verification
  let originalPositionDetected = false; // Track if we detected original position temporarily
  let stockfishAwake = false; // Track if Stockfish is responding

  // 1. Initialize Stockfish Engine Bridge immediately and keep it running
  function initEngine() {
    try {
      console.log("[FreeChess Coach] Initializing Stockfish engine...");
      stockfish = new StockfishEngine();
      console.log("[FreeChess Coach] Stockfish engine initialized and warming up...");
      
      // Show initial pill immediately to indicate extension is loaded
      setTimeout(() => {
        const board = findBoard();
        if (board) {
          attachStatusPill(board, "Coach Loading · Stockfish Warming Up", "normal", true);
        } else {
          // Create pill even without board to show extension is active
          let pill = document.getElementById("freechess-connected-pill");
          if (!pill) {
            pill = document.createElement("div");
            pill.id = "freechess-connected-pill";
            pill.className = "";
            pill.innerHTML = `<span class="dot"></span> Coach Loading · Stockfish Warming Up`;
            pill.style.opacity = "1";
            pill.style.top = "20px";
            pill.style.left = "50%";
            pill.style.transform = "translateX(-50%)";
            document.body.appendChild(pill);
          }
        }
      }, 100);
      
      // Warm up Stockfish with a simple position to ensure it's ready
      setTimeout(async () => {
        try {
          const warmupResult = await stockfish.evaluate("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 4, 1000);
          console.log("[FreeChess Coach] Stockfish warmup complete:", warmupResult ? "ready" : "failed");
          stockfishAwake = warmupResult && warmupResult.length > 0;
          
          // Update status pill when Stockfish is ready
          const board = findBoard();
          if (board) {
            const statusText = stockfishAwake ? "Stockfish Ready" : "Stockfish Failed";
            attachStatusPill(board, `Coach Active · ${statusText}`, "normal", true);
          } else {
            // Update pill even without board
            let pill = document.getElementById("freechess-connected-pill");
            if (pill) {
              const statusText = stockfishAwake ? "Stockfish Ready" : "Stockfish Failed";
              pill.innerHTML = `<span class="dot"></span> Coach Active · ${statusText}`;
            }
          }
        } catch (e) {
          console.error("[FreeChess Coach] Stockfish warmup failed:", e);
          stockfishAwake = false;
          
          // Update pill to show failure
          let pill = document.getElementById("freechess-connected-pill");
          if (pill) {
            pill.innerHTML = `<span class="dot"></span> Coach Active · Stockfish Failed`;
          }
        }
      }, 500);
    } catch (e) {
      console.error("[FreeChess Coach] Failed to initialize engine bridge:", e);
      stockfishAwake = false;
    }
  }

  // 2. Universal Board Detector
  function findBoard() {
    // Priority 1: Direct board components (Chessground, Chess.com, Lichess)
    const directSelectors = [
      "cg-board",
      "chess-board",
      "div#board",
      ".chessboard",
      ".cg-wrap",
      "cg-container",
      ".board-wrap",
      ".board-container",
      ".main-board",
      "div.board"
    ];

    for (let s of directSelectors) {
      const el = document.querySelector(s);
      if (el) {
        // Find best visual bounding container
        const target = el.closest(".board-wrap, .board-container, chess-board, cg-container") || el;
        if (target.offsetWidth > 120 || el.offsetWidth > 120) {
          if (!boardConfirmed) showBoardAttachedConfirmation(target);
          return target;
        }
      }
    }

    // Priority 2: Coordinate SVGs or labels
    const svgCoords = document.querySelector('svg.coordinates, svg[viewBox="0 0 100 100"].coordinates, coords');
    if (svgCoords) {
      const boardContainer = svgCoords.closest("chess-board, .board-container, .board, #board, div[class*='board']") || svgCoords.parentElement;
      if (boardContainer) {
        if (!boardConfirmed) showBoardAttachedConfirmation(boardContainer);
        return boardContainer;
      }
    }

    // Priority 3: Element containing 6+ chess piece elements
    const pieces = document.querySelectorAll('piece, .piece, [class*="piece"], div[class*="square-"] img');
    if (pieces.length >= 6) {
      let commonParent = pieces[0].parentElement;
      while (commonParent && commonParent !== document.body) {
        if (commonParent.offsetWidth > 150 && commonParent.offsetHeight > 150) {
          if (!boardConfirmed) showBoardAttachedConfirmation(commonParent);
          return commonParent;
        }
        commonParent = commonParent.parentElement;
      }
    }

    return null;
  }

  // 3. Detect Board Orientation (White vs Black on bottom)
  function detectOrientation(board) {
    if (!board) return "w";
    const classStr = (board.className || "") + " " + (board.parentElement ? board.parentElement.className : "");
    if (classStr.includes("flipped") || classStr.includes("orientation-black") || classStr.includes("black")) {
      return "b";
    }
    const attr = board.getAttribute("orientation") || (board.parentElement ? board.parentElement.getAttribute("orientation") : null);
    if (attr === "black") return "b";
    if (attr === "white") return "w";

    // Check rank labels
    const rankLabels = board.querySelectorAll('.ranks coord, text.rank-label, .coordinates text');
    if (rankLabels && rankLabels.length > 0) {
      const firstText = rankLabels[0].textContent.trim();
      const firstRect = rankLabels[0].getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      if (firstText === "1" && firstRect.top > boardRect.top + boardRect.height * 0.5) return "w";
      if (firstText === "8" && firstRect.top > boardRect.top + boardRect.height * 0.5) return "b";
    }

    return "w";
  }

  // 4. Update Fixed Floating Status Pill Position (Farther Up)
  function updatePillPosition(pill, board) {
    if (!pill || !board) return;
    const rect = board.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const topPos = Math.max(12, rect.top - 58);
      const leftPos = rect.left + rect.width / 2;
      pill.style.top = topPos + "px";
      pill.style.left = leftPos + "px";
      pill.style.transform = "translateX(-50%)";
    }
  }

  // 5. Visual Confirmation & Toast Pill
  function showBoardAttachedConfirmation(board) {
    if (boardConfirmed) return;
    boardConfirmed = true;

    attachStatusPill(board, "Coach Connected · Monitoring Board", "normal", true);

    console.log(
      "%c[FreeChess Coach] ✓ Chess Board Found & Hooked Successfully!",
      "background: #064e3b; color: #34d399; font-size: 13px; font-weight: bold; padding: 5px 12px; border-radius: 4px;"
    );
  }

  function attachStatusPill(board, text, mood = "normal", keepVisible = false) {
    let pill = document.getElementById("freechess-connected-pill");
    if (!pill) {
      pill = document.createElement("div");
      pill.id = "freechess-connected-pill";
      document.body.appendChild(pill);

      window.addEventListener("resize", () => {
        if (boardElement) updatePillPosition(pill, boardElement);
      });
      window.addEventListener("scroll", () => {
        if (boardElement) updatePillPosition(pill, boardElement);
      });
    }

    updatePillPosition(pill, board);

    pill.className = "";
    if (mood === "blunder") pill.classList.add("blunder");
    if (mood === "brilliant") pill.classList.add("brilliant");

    pill.innerHTML = `<span class="dot"></span> ${text}`;
    pill.style.opacity = "1";

    clearTimeout(pill._timer);
    if (!keepVisible) {
      pill._timer = setTimeout(() => {
        // Return to normal ready badge showing Stockfish status
        pill.className = "";
        const statusText = stockfishAwake ? "Stockfish Ready" : "Stockfish Sleeping";
        pill.innerHTML = `<span class="dot"></span> Coach Active · ${statusText}`;
        updatePillPosition(pill, board);
      }, 4000);
    }
  }

  // 6. Visual Glow Dispatcher (Clean & Smooth — No Screen Shake)
  function triggerFeedback(type, detailMsg = "") {
    const board = boardElement || findBoard();
    if (!board) return;

    // Handle combined format like "inaccuracy-push"
    if (type.includes('-')) {
      const parts = type.split('-');
      const mainType = parts[0]; // inaccuracy, mistake, blunder
      const hintType = parts[1]; // capture, push, piece
      
      const label = mainType === 'blunder' ? 'Blunder!!' : mainType === 'mistake' ? 'Mistake?' : 'Inaccuracy?!';
      
      // Map hint types to display labels
      const hintLabels = {
        'capture': 'Capture',
        'push': 'Push',
        'piece': 'Piece'
      };
      const hintLabel = hintLabels[hintType] || hintType;
      
      attachStatusPill(board, `🔴 ${label} - ${hintLabel}`, "blunder");
      console.log(`%c[FreeChess Coach] 🔴 RED GLOW (${mainType.toUpperCase()}) - ${hintLabel}`, "color: #ef4444; font-weight: bold; font-size: 13px;");
      return;
    }

    // Manage Inner Glow Overlay
    let overlay = board.querySelector(".freechess-glow-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "freechess-glow-overlay";
      if (window.getComputedStyle(board).position === "static") {
        board.style.position = "relative";
      }
      board.appendChild(overlay);
    }

    overlay.classList.remove("blunder", "brilliant");
    void overlay.offsetWidth; // Force reflow

    if (type === "blunder" || type === "mistake" || type === "inaccuracy" || type === "mate_loss") {
      overlay.classList.add("blunder");
      let label;
      if (type === "mate_loss") {
        label = "Mate Loss";
      } else {
        label = type === "blunder" ? "Blunder!!" : type === "mistake" ? "Mistake?" : "Inaccuracy?!";
      }
      attachStatusPill(board, `🔴 ${label} ${detailMsg}`, "blunder");
      console.log(`%c[FreeChess Coach] 🔴 RED GLOW (${type.toUpperCase()}) ${detailMsg}`, "color: #ef4444; font-weight: bold; font-size: 13px;");
    } else if (type === "brilliant" || type === "great" || type === "best" || type === "mate_win") {
      overlay.classList.add("brilliant");
      let label;
      if (type === "mate_win") {
        label = "Mate Found";
      } else {
        label = type === "brilliant" ? "Brilliant!!" : type === "great" ? "Great Move!" : "Best Move ★";
      }
      attachStatusPill(board, `🔵 ${label} ${detailMsg}`, "brilliant");
      console.log(`%c[FreeChess Coach] 🔵 BLUE GLOW (${type.toUpperCase()}) ${detailMsg}`, "color: #38bdf8; font-weight: bold; font-size: 13px;");
    }
  }

  // 7. Universal DOM Piece Scanner -> FEN Generator
  function parsePieceElement(el) {
    if (!el) return null;
    
    // Ignore captured pieces stored in Chess.com recycling pool
    if (el.classList.contains("element-pool") || el.closest(".element-pool")) {
      return null;
    }

    const cls = (el.className || "").toString();
    const tag = (el.tagName || "").toLowerCase();

    // 1. Direct 2-character token match: e.g. "br", "wp", "bn", "wq", "bk", "bb", etc.
    const tokenMatch = cls.match(/\b([wb])([pnbrqk])\b/i);
    if (tokenMatch) {
      return {
        color: tokenMatch[1].toLowerCase(),
        type: tokenMatch[2].toLowerCase()
      };
    }

    let color = null;
    let type = null;

    if (cls.includes("white")) color = "w";
    else if (cls.includes("black")) color = "b";

    const pieceTypes = [
      { name: "pawn", code: "p" },
      { name: "knight", code: "n" },
      { name: "bishop", code: "b" },
      { name: "rook", code: "r" },
      { name: "queen", code: "q" },
      { name: "king", code: "k" }
    ];

    for (let pt of pieceTypes) {
      if (cls.includes(pt.name)) {
        type = pt.code;
        break;
      }
    }

    if (!type && el.dataset && el.dataset.piece) {
      const p = el.dataset.piece;
      color = p[0].toLowerCase() === "w" ? "w" : "b";
      type = p[1].toLowerCase();
    }

    if (!type && tag === "img") {
      const src = el.getAttribute("src") || "";
      const match = src.match(/([wb])([pnbrqk])\./i);
      if (match) {
        color = match[1].toLowerCase();
        type = match[2].toLowerCase();
      }
    }

    if (color && type) {
      return { color, type };
    }
    return null;
  }

  function getSquareForPieceElement(el, board, orientation) {
    if (!el || el.classList.contains("element-pool") || el.closest(".element-pool")) {
      return null;
    }

    const cls = (el.className || "").toString();

    const namedSqMatch = cls.match(/square-([a-h][1-8])/);
    if (namedSqMatch) return namedSqMatch[1];

    const numSqMatch = cls.match(/square-(\d)(\d)/);
    if (numSqMatch) {
      const fileIdx = parseInt(numSqMatch[1], 10) - 1;
      const rankIdx = parseInt(numSqMatch[2], 10);
      const files = "abcdefgh";
      if (fileIdx >= 0 && fileIdx < 8 && rankIdx >= 1 && rankIdx <= 8) {
        return `${files[fileIdx]}${rankIdx}`;
      }
    }

    if (el.dataset && el.dataset.square) return el.dataset.square;

    const boardRect = board.getBoundingClientRect();
    const squareW = (boardRect.width || 540) / 8;
    const squareH = (boardRect.height || 540) / 8;

    let posX = 0;
    let posY = 0;

    const transform = el.style.transform || "";
    const translateMatch = transform.match(/translate(?:3d)?\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/);
    const percentMatch = transform.match(/translate(?:3d)?\(\s*(-?[\d.]+)%\s*,\s*(-?[\d.]+)%/);

    if (translateMatch) {
      posX = parseFloat(translateMatch[1]);
      posY = parseFloat(translateMatch[2]);
    } else if (percentMatch) {
      posX = (parseFloat(percentMatch[1]) / 100) * squareW;
      posY = (parseFloat(percentMatch[2]) / 100) * squareH;
    } else {
      const pRect = el.getBoundingClientRect();
      posX = pRect.left + pRect.width / 2 - boardRect.left;
      posY = pRect.top + pRect.height / 2 - boardRect.top;
    }

    let col = Math.round(posX / squareW);
    let row = Math.round(posY / squareH);
    col = Math.max(0, Math.min(7, col));
    row = Math.max(0, Math.min(7, row));

    const files = "abcdefgh";
    if (orientation === "w") {
      const file = files[col];
      const rank = 8 - row;
      return `${file}${rank}`;
    } else {
      const file = files[7 - col];
      const rank = row + 1;
      return `${file}${rank}`;
    }
  }

  // 10.5. Verify position after tab reset to handle the window where pieces are in original position
  function verifyPositionAfterReset(board) {
    if (!board) return;
    
    const scannedFen = scanBoardToFen(board);
    if (!scannedFen) return;
    
    const boardFen = scannedFen.split(" ")[0];
    
    // If still in original position after 3 seconds, it's actually a new game
    if (boardFen === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR") {
      console.log("%c[FreeChess Coach] Position still original after 3 seconds - confirmed new game", "color: #10b981; font-weight: bold; font-size: 13px;");
      game = new Chess();
      currentFen = game.fen();
      tabResetDetected = false;
    } else {
      // Position changed from original, so it was a tab reset mid-game
      console.log("%c[FreeChess Coach] Position changed from original - confirmed tab reset mid-game", "color: #f59e0b; font-weight: bold; font-size: 13px;");
      // Keep tabResetDetected = true to track first move
    }
    
    positionCheckTimer = null;
  }

  function scanBoardToFen(board) {
    if (!board) return null;
    const orientation = detectOrientation(board);
    boardOrientation = orientation;

    const pieceEls = board.querySelectorAll('piece, .piece, [class*="piece"], div[class*="square-"] img, div.square img');
    if (pieceEls.length < 2) return null;

    const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
    const files = "abcdefgh";

    pieceEls.forEach((el) => {
      const p = parsePieceElement(el);
      if (!p) return;
      const sq = getSquareForPieceElement(el, board, orientation);
      if (!sq || sq.length !== 2) return;

      const fIdx = files.indexOf(sq[0]);
      const rIdx = 8 - parseInt(sq[1], 10);
      if (fIdx >= 0 && fIdx < 8 && rIdx >= 0 && rIdx < 8) {
        grid[rIdx][fIdx] = p.color === "w" ? p.type.toUpperCase() : p.type.toLowerCase();
      }
    });

    const fenRows = [];
    for (let r = 0; r < 8; r++) {
      let emptyCount = 0;
      let rowStr = "";
      for (let c = 0; c < 8; c++) {
        const piece = grid[r][c];
        if (!piece) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            rowStr += emptyCount;
            emptyCount = 0;
          }
          rowStr += piece;
        }
      }
      if (emptyCount > 0) rowStr += emptyCount;
      fenRows.push(rowStr);
    }

    const boardFen = fenRows.join("/");
    let turn = game ? game.turn() : "w";

    // Detect tab reset: if we're not at starting position on first scan
    if (!lastScannedFen && boardFen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR") {
      originalPositionDetected = false;
      tabResetDetected = true;
      console.log("%c[FreeChess Coach] Tab reset detected - starting 3-second position check", "color: #f59e0b; font-weight: bold; font-size: 13px;");
      
      // Start 3-second timer to check if position changes
      if (positionCheckTimer) clearTimeout(positionCheckTimer);
      positionCheckTimer = setTimeout(() => {
        verifyPositionAfterReset(board);
      }, 3000);
    }
    
    // Detect if board is in original position (new game)
    if (boardFen === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR") {
      if (!originalPositionDetected) {
        originalPositionDetected = true;
        console.log("%c[FreeChess Coach] Original position detected - new game", "color: #10b981; font-weight: bold; font-size: 13px;");
      }
      // Reset to starting position
      game = new Chess();
      currentFen = game.fen();
      if (positionCheckTimer) clearTimeout(positionCheckTimer);
      tabResetDetected = false;
    }

    try {
      const currentMoves = game.moves({ verbose: true });
      for (let m of currentMoves) {
        const testGame = new Chess(game.fen());
        testGame.move(m);
        if (testGame.fen().split(" ")[0] === boardFen) {
          game = testGame;
          return game.fen();
        }
      }
    } catch (e) {}

    const fullFen = `${boardFen} ${turn} KQkq - 0 1`;
    return fullFen;
  }

  // 8. Get Square from Mouse/Pointer Event
  function getSquareFromEvent(e, board) {
    if (!board) board = boardElement || findBoard();
    if (!board) return null;

    const target = e.target;
    if (target) {
      if (target.dataset && target.dataset.square) return target.dataset.square;
      const namedSq = (target.className || "").toString().match(/square-([a-h][1-8])/);
      if (namedSq) return namedSq[1];
      const parentSq = target.closest("[data-square], [class*='square-']");
      if (parentSq) {
        if (parentSq.dataset && parentSq.dataset.square) return parentSq.dataset.square;
        const pMatch = (parentSq.className || "").toString().match(/square-([a-h][1-8])/);
        if (pMatch) return pMatch[1];
      }
    }

    const boardRect = board.getBoundingClientRect();
    if (
      e.clientX >= boardRect.left &&
      e.clientX <= boardRect.right &&
      e.clientY >= boardRect.top &&
      e.clientY <= boardRect.bottom
    ) {
      const squareW = boardRect.width / 8;
      const squareH = boardRect.height / 8;
      let col = Math.floor((e.clientX - boardRect.left) / squareW);
      let row = Math.floor((e.clientY - boardRect.top) / squareH);
      col = Math.max(0, Math.min(7, col));
      row = Math.max(0, Math.min(7, row));

      const files = "abcdefgh";
      const orientation = boardOrientation || "w";
      if (orientation === "w") {
        return `${files[col]}${8 - row}`;
      } else {
        return `${files[7 - col]}${row + 1}`;
      }
    }

    return null;
  }

  // 9. Position Pre-caching for 0ms Pre-move Feedback
  let cachedPositionLines = null;
  let cachedFen = null;
  let lastPreviewCandidate = null;
  let hoverDebounce = null;

  async function precomputeCurrentPosition(fen) {
    if (!stockfish || !fen) return;
    if (cachedFen === fen && cachedPositionLines) return;
    try {
      const lines = await stockfish.evaluate(fen, 12, 300);
      if (lines && lines.length > 0) {
        cachedPositionLines = lines;
        cachedFen = fen;
      }
    } catch (e) {}
  }

  // 10. Real-time Pre-Move & Candidate Evaluation (While Dragging/Hovering)
  async function evaluateCandidateMove(uciMove, baseFen, isPreview = false) {
    console.log("[FreeChess Coach] DEBUG: evaluateCandidateMove called with", uciMove, isPreview);
    if (!stockfish) {
      console.log("[FreeChess Coach] DEBUG: Stockfish not available");
      return;
    }
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);

    const fenBefore = baseFen || game.fen();
    let tempGame;
    try {
      tempGame = new Chess(fenBefore);
    } catch (e) {
      console.log("[FreeChess Coach] DEBUG: Chess initialization failed for", fenBefore);
      return;
    }

    const moveRes = tempGame.move({ from, to, promotion: uciMove[4] || "q" });
    if (!moveRes) {
      console.log("[FreeChess Coach] DEBUG: Invalid move", uciMove);
      return;
    }

    const fenAfter = tempGame.fen();
    console.log("[FreeChess Coach] DEBUG: FEN before:", fenBefore, "FEN after:", fenAfter);

    try {
      // 1. Get Before Lines (from cache or fast eval)
      let beforeLines = (cachedFen === fenBefore && cachedPositionLines) ? cachedPositionLines : null;
      if (!beforeLines) {
        console.log("[FreeChess Coach] DEBUG: Evaluating before position");
        beforeLines = await stockfish.evaluate(fenBefore, 6, 2000);
        console.log("[FreeChess Coach] DEBUG: Before evaluation result:", beforeLines);
        if (!beforeLines || beforeLines.length === 0) {
          console.log("[FreeChess Coach] WARNING: Stockfish returned empty results for before evaluation");
          stockfishAwake = false;
          return;
        }
        cachedPositionLines = beforeLines;
        cachedFen = fenBefore;
        stockfishAwake = true;
      }

      const topBefore = beforeLines[0] || null;
      const secondBefore = beforeLines[1] || null;
      console.log("[FreeChess Coach] DEBUG: Top before move:", topBefore ? topBefore.move : "none");

      // 2. Instant classification for Top Move
      if (topBefore && uciMove === topBefore.move) {
        console.log("[FreeChess Coach] DEBUG: Move matches top engine choice");
        triggerFeedback("best", "(Top Engine Choice ★)");
        return;
      }

      // 3. Fast Evaluation of Move Destination
      console.log("[FreeChess Coach] DEBUG: Evaluating after position");
      const afterLines = await stockfish.evaluate(fenAfter, 6, 2000);
      console.log("[FreeChess Coach] DEBUG: After evaluation result:", afterLines);
      
      if (!afterLines || afterLines.length === 0) {
        console.log("[FreeChess Coach] WARNING: Stockfish returned empty results for after evaluation");
        stockfishAwake = false;
        return;
      }
      
      stockfishAwake = true;
      const afterLine = afterLines[0] || null;
      console.log("[FreeChess Coach] DEBUG: After line:", afterLine);

      if (topBefore && afterLine) {
        const tag = isPreview ? " [Preview]" : "";
        
        // Handle mate display first - when Stockfish finds mate, show "mate in X"
        if (typeof afterLine.mateIn === 'number' && afterLine.mateIn !== null) {
          const mateCount = Math.abs(afterLine.mateIn);
          const isMateWin = afterLine.mateIn > 0;
          const feedbackType = isMateWin ? 'mate_win' : 'mate_loss';
          const detailMsg = `Mate in ${mateCount}${tag}`;
          triggerFeedback(feedbackType, detailMsg);
        } else {
          // Normal classification for non-mate positions
          const cls = ChessClassifier.classifyMove(topBefore, secondBefore, afterLine, uciMove, new Chess(fenBefore));
          console.log("[FreeChess Coach] DEBUG: Classification result:", cls);
          const cpVal = typeof afterLine.cp === "number" ? (-afterLine.cp / 100).toFixed(1) : "";
          const sign = cpVal && parseFloat(cpVal) > 0 ? "+" : "";
          const detailMsg = cpVal ? `(${sign}${cpVal})${tag}` : tag;
          triggerFeedback(cls, detailMsg);
        }
      }
    } catch (err) {
      console.error("[FreeChess Coach] Eval error:", err);
      stockfishAwake = false;
    }
  }

  // 11. Attach Real-Time Pointer & Drag Listeners for Instant Pre-Move Glow
  function attachListeners() {
    // When piece is picked up / clicked
    const onDragStart = (e) => {
      const board = boardElement || findBoard();
      if (!board) return;
      const sq = getSquareFromEvent(e, board);
      if (sq) {
        startSquare = sq;
        draggedPiece = e.target.closest("piece, .piece, [class*='piece'], img");
        lastPreviewCandidate = null;
      }
    };

    // While dragging / hovering over destination squares BEFORE releasing
    const onDragMove = (e) => {
      if (!startSquare) return;
      const board = boardElement || findBoard();
      if (!board) return;

      const hoverSq = getSquareFromEvent(e, board);
      if (!hoverSq || hoverSq === startSquare) return;

      const candidateUci = `${startSquare}${hoverSq}`;
      if (candidateUci === lastPreviewCandidate) return;

      // Verify move legality from current position
      try {
        const legalMoves = game.moves({ verbose: true });
        const isLegal = legalMoves.some((m) => m.from === startSquare && m.to === hoverSq);
        if (!isLegal) return;

        lastPreviewCandidate = candidateUci;

        // Debounce slightly to allow smooth cursor tracking
        clearTimeout(hoverDebounce);
        hoverDebounce = setTimeout(() => {
          console.log(`%c[FreeChess Coach] 🔍 Pre-Move Preview: ${candidateUci}`, "color: #eab308; font-weight: bold;");
          evaluateCandidateMove(candidateUci, game.fen(), true);
        }, 30);
      } catch (err) {}
    };

    // When piece is dropped / move released
    const onDragEnd = (e) => {
      if (!startSquare) return;
      clearTimeout(hoverDebounce);

      const board = boardElement || findBoard();
      const destSq = getSquareFromEvent(e, board);

      if (destSq && destSq !== startSquare) {
        const uciCandidate = `${startSquare}${destSq}`;
        try {
          const legalMoves = game.moves({ verbose: true });
          const isLegal = legalMoves.some((m) => m.from === startSquare && m.to === destSq);
          if (isLegal) {
            evaluateCandidateMove(uciCandidate, game.fen(), false);
          }
        } catch (err) {}
      }

      startSquare = null;
      draggedPiece = null;
      lastPreviewCandidate = null;
    };

    window.addEventListener("pointerdown", onDragStart, true);
    window.addEventListener("mousedown", onDragStart, true);

    window.addEventListener("pointermove", onDragMove, true);
    window.addEventListener("mousemove", onDragMove, true);
    window.addEventListener("dragover", onDragMove, true);

    window.addEventListener("pointerup", onDragEnd, true);
    window.addEventListener("mouseup", onDragEnd, true);
    window.addEventListener("drop", onDragEnd, true);
  }

  // 11. Analyze opponent move and provide hint when they make inaccuracy
  async function analyzeOpponentMoveAndHint(playedUci, prevFen, currentFen) {
    if (!stockfish) return;
    
    try {
      console.log("[FreeChess Coach] HINT DEBUG: Analyzing opponent move", playedUci, "prevFen:", prevFen, "currentFen:", currentFen);
      
      // Evaluate the opponent's move to classify it
      const oldGame = new Chess(prevFen);
      const from = playedUci.slice(0, 2);
      const to = playedUci.slice(2, 4);
      const promotion = playedUci[4] || "q";
      
      // Get evaluation before opponent's move
      const beforeLines = await stockfish.evaluate(prevFen, 6, 2000);
      const topBefore = beforeLines[0] || null;
      const secondBefore = beforeLines[1] || null;
      console.log("[FreeChess Coach] HINT DEBUG: Before evaluation:", topBefore);
      
      // Simulate opponent's move and evaluate after
      const tempGame = new Chess(prevFen);
      tempGame.move({ from, to, promotion });
      const afterLines = await stockfish.evaluate(tempGame.fen(), 6, 2000);
      const afterLine = afterLines[0] || null;
      console.log("[FreeChess Coach] HINT DEBUG: After evaluation:", afterLine);
      
      // Classify opponent's move
      if (topBefore && afterLine) {
        const cls = ChessClassifier.classifyMove(topBefore, secondBefore, afterLine, playedUci, oldGame);
        console.log("[FreeChess Coach] HINT DEBUG: Opponent move classified as:", cls);
        
        // If opponent made inaccuracy, mistake, or blunder, give hint
        if (cls === 'inaccuracy' || cls === 'mistake' || cls === 'blunder') {
          // Find best move for current position (after opponent's move)
          console.log("[FreeChess Coach] HINT DEBUG: Getting best move for current position");
          const currentLines = await stockfish.evaluate(currentFen, 6, 2000);
          const bestMove = currentLines[0];
          console.log("[FreeChess Coach] HINT DEBUG: Best move found:", bestMove);

          // If the opponent's move allows a forced mate (mateIn > 0 = side to move mates),
          // label the hint "mate in N" instead of a blunder/mistake push.
          const board = boardElement || findBoard();
          if (typeof afterLine.mateIn === 'number' && afterLine.mateIn !== null && afterLine.mateIn > 0) {
            const mateCount = Math.abs(afterLine.mateIn);
            console.log(`%c[FreeChess Coach] 🔴 Mate in ${mateCount} (opponent allowed mate)`, "color: #f59e0b; font-weight: bold; font-size: 13px;");
            if (board) {
              attachStatusPill(board, `🔴 Mate in ${mateCount}`, "blunder", false);
            }
          } else if (bestMove && bestMove.move) {
            const bestFrom = bestMove.move.slice(0, 2);
            const bestTo = bestMove.move.slice(2, 4);
            
            // Check if best move is a capture by checking destination square
            const currentGame = new Chess(currentFen);
            const destinationPiece = currentGame.get(bestTo);
            const movingPiece = currentGame.get(bestFrom);
            
            console.log("[FreeChess Coach] HINT DEBUG: Game state check - currentFen:", currentFen);
            console.log("[FreeChess Coach] HINT DEBUG: Coordinates - bestFrom:", bestFrom, "bestTo:", bestTo);
            console.log("[FreeChess Coach] HINT DEBUG: Pieces - destinationPiece:", destinationPiece, "movingPiece:", movingPiece);
            
            // It's a capture if there's an opponent piece at the destination
            const isCapture = destinationPiece !== null && movingPiece && destinationPiece.color !== movingPiece.color;
            
            let hint;
            if (isCapture) {
              hint = "capture";
            } else if (movingPiece && movingPiece.type === 'p') {
              hint = "push";
            } else {
              hint = "piece";
            }
            
            console.log("[FreeChess Coach] HINT DEBUG: Best move analysis - move:", bestMove.move, "isCapture:", isCapture, "destinationPiece:", destinationPiece, "movingPiece:", movingPiece, "hint:", hint);
            
            // Show hint as accuracy-prompt format
            if (board) {
              // Map hint types to display labels
              const hintLabels = {
                'capture': 'Capture',
                'push': 'Push',
                'piece': 'Piece'
              };
              const hintLabel = hintLabels[hint] || hint;
              
              const label = cls === 'blunder' ? 'Blunder!!' : cls === 'mistake' ? 'Mistake?' : 'Inaccuracy?!';
              attachStatusPill(board, `🔴 ${label} - ${hintLabel}`, "blunder", false);
              console.log(`%c[FreeChess Coach] 🔴 ${label} - ${hintLabel} (best: ${bestMove.move})`, "color: #f59e0b; font-weight: bold; font-size: 13px;");
            }
          } else {
            console.log("[FreeChess Coach] HINT DEBUG: No best move found");
          }
        } else {
          console.log("[FreeChess Coach] HINT DEBUG: Opponent move not inaccuracy/mistake/blunder:", cls);
        }
      } else {
        console.log("[FreeChess Coach] HINT DEBUG: Missing evaluation data for classification");
      }
    } catch (err) {
      console.error("[FreeChess Coach] Opponent analysis error:", err);
    }
  }

  // 12. Observe Game Board & Piece Mutations
  function observeGameMutations() {
    let debounceTimer = null;

    const checkBoardAndSync = () => {
      boardElement = findBoard();
      if (!boardElement) return;

      const scannedFen = scanBoardToFen(boardElement);
      if (scannedFen && scannedFen !== lastScannedFen) {
        const prevFen = lastScannedFen;
        lastScannedFen = scannedFen;

        try {
          const testGame = new Chess(scannedFen);

          if (prevFen) {
            const oldGame = new Chess(prevFen);
            const legalMoves = oldGame.moves({ verbose: true });
            for (let m of legalMoves) {
              const sim = new Chess(prevFen);
              sim.move(m);
              if (sim.fen().split(" ")[0] === scannedFen.split(" ")[0]) {
                const playedUci = `${m.from}${m.to}${m.promotion || ""}`;
                console.log(`%c[FreeChess Coach] ♟ Move Played: ${playedUci} (${m.san})`, "color: #10b981; font-weight: bold; font-size: 13px;");
                
                // If tab reset detected, track who moved to fix turn
                if (tabResetDetected) {
                  const movedColor = m.color; // 'w' or 'b'
                  const nextTurn = movedColor === 'w' ? 'b' : 'w';
                  
                  // Update game with correct turn
                  const correctedGame = new Chess(scannedFen.split(" ")[0] + " " + nextTurn + " KQkq - 0 1");
                  game = correctedGame;
                  currentFen = correctedGame.fen();
                  
                  tabResetDetected = false;
                  console.log(`%c[FreeChess Coach] Turn corrected: ${movedColor} moved, now ${nextTurn}'s turn`, "color: #10b981; font-weight: bold; font-size: 13px;");
                }
                
                evaluateCandidateMove(playedUci, prevFen, false);
                
                // Check if opponent made inaccuracy and give hint
                analyzeOpponentMoveAndHint(playedUci, prevFen, scannedFen);
                break;
              }
            }
          }

          game = testGame;
          currentFen = scannedFen;

          // Pre-cache position for 0ms drag response on the new turn
          precomputeCurrentPosition(scannedFen);
        } catch (e) {}
      }
    };

    checkBoardAndSync();

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkBoardAndSync, 60);
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  // 13. Game Review Automation
  function setupGameReviewAutomation() {
    // Only run on chess.com game pages
    if (!window.location.hostname.includes('chess.com') || !window.location.pathname.includes('/game/')) {
      return;
    }

    console.log("[FreeChess Coach] Setting up game review automation on chess.com");

    // Watch for game review button clicks
    document.addEventListener('click', (event) => {
      const button = event.target.closest('a[href*="/analysis/game/"]');
      if (button) {
        console.log("[FreeChess Coach] Game Review button clicked");
        
        // Extract game ID from current URL
        const currentUrl = window.location.href;
        const gameIdMatch = currentUrl.match(/\/game\/[^\/]+\/(\d+)/);
        console.log("[FreeChess Coach] Current URL:", currentUrl);
        console.log("[FreeChess Coach] Game ID match:", gameIdMatch);
        
        if (gameIdMatch) {
          const gameId = gameIdMatch[1];
          console.log("[FreeChess Coach] Extracted game ID:", gameId);
          
          // Store game ID for later use
          sessionStorage.setItem('chessCoachGameId', gameId);
          sessionStorage.setItem('chessCoachAutomatingReview', 'true');
          
          // Extract the analysis URL from the button
          const analysisUrl = button.getAttribute('href');
          const fullAnalysisUrl = analysisUrl.startsWith('http') ? analysisUrl : `https://www.chess.com${analysisUrl}`;
          
          console.log("[FreeChess Coach] Analysis URL from button:", analysisUrl);
          console.log("[FreeChess Coach] Full analysis URL:", fullAnalysisUrl);
          
          // Navigate to analysis page first
          setTimeout(() => {
            console.log("[FreeChess Coach] Navigating to analysis page:", fullAnalysisUrl);
            window.location.href = fullAnalysisUrl;
          }, 100);
        }
      }
    }, true);
  }

  // 14. Chess.com Analysis Page FEN Extraction
  function setupChessComAnalysisExtraction() {
    // Only run on chess.com analysis pages
    if (!window.location.hostname.includes('chess.com') || !window.location.pathname.includes('/analysis/game/')) {
      return;
    }

    console.log("[FreeChess Coach] Setting up FEN extraction on chess.com analysis page");

    // Check if we're in automation mode
    if (sessionStorage.getItem('chessCoachAutomatingReview') !== 'true') {
      return;
    }

    // Wait for the page to load and then find the Share Game button
    setTimeout(() => {
      const shareButton = Array.from(document.querySelectorAll('span')).find(el => 
        el.textContent.includes('Share Game') && el.classList.contains('cc-aside-item-label')
      );
      
      if (shareButton) {
        console.log("[FreeChess Coach] Found Share Game button, clicking it");
        shareButton.click();
        
        // Wait for the share dialog to appear and extract FEN
        setTimeout(() => {
          const fenInput = document.getElementById('share-fen');
          if (fenInput) {
            const fen = fenInput.value;
            console.log("[FreeChess Coach] Extracted FEN from share dialog:", fen);
            sessionStorage.setItem('chessCoachExtractedFen', fen);
            
            // Proceed to chessda.com
            const gameId = sessionStorage.getItem('chessCoachGameId');
            const originalGameUrl = `https://www.chess.com/game/live/${gameId}`;
            
            console.log("[FreeChess Coach] Sending message to open chessda.com");
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
              chrome.runtime.sendMessage({
                action: 'OPEN_CHESSDA',
                fen: fen,
                originalGameUrl: originalGameUrl
              });
            }
          } else {
            console.log("[FreeChess Coach] FEN input not found in share dialog");
          }
        }, 1000);
      } else {
        console.log("[FreeChess Coach] Share Game button not found, trying alternative methods");
        
        // Try to find FEN from the board directly
        try {
          const board = findBoard();
          if (board) {
            const fen = scanBoardToFen(board);
            console.log("[FreeChess Coach] Extracted FEN from board:", fen);
            sessionStorage.setItem('chessCoachExtractedFen', fen);
            
            const gameId = sessionStorage.getItem('chessCoachGameId');
            const originalGameUrl = `https://www.chess.com/game/live/${gameId}`;
            
            console.log("[FreeChess Coach] Sending message to open chessda.com (board extraction)");
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
              chrome.runtime.sendMessage({
                action: 'OPEN_CHESSDA',
                fen: fen,
                originalGameUrl: originalGameUrl
              });
            }
          }
        } catch (err) {
          console.error("[FreeChess Coach] Alternative FEN extraction failed:", err);
        }
      }
    }, 2000); // Wait 2 seconds for page to load
  }

  // 15. Chessda.com Automation
  function setupChessdaAutomation() {
    // Only run on chessda.com analysis page
    if (!window.location.hostname.includes('chessda.com') || !window.location.pathname.includes('/analysis')) {
      return;
    }

    console.log("[FreeChess Coach] Setting up automation on chessda.com");

    // Wait for the Edit Board button to be available
    const checkForEditButton = setInterval(() => {
      const editButton = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent.includes('Edit Board')
      );
      
      if (editButton) {
        clearInterval(checkForEditButton);
        console.log("[FreeChess Coach] Edit Board button found, clicking it");
        editButton.click();
        
        // Wait for the FEN input to appear after clicking Edit Board
        setTimeout(() => {
          const fenInput = document.getElementById('editor-fen');
          const startButton = Array.from(document.querySelectorAll('button')).find(btn => 
            btn.textContent.includes('Start Analysis')
          );
          
          if (fenInput && startButton) {
            console.log("[FreeChess Coach] FEN input and start button found");
            
            // Get FEN from sessionStorage
            const fen = sessionStorage.getItem('chessCoachExtractedFen');
            if (fen) {
              console.log("[FreeChess Coach] Pasting FEN:", fen);
              
              // Set FEN value
              fenInput.value = fen;
              
              // Trigger input event to ensure the field recognizes the change
              const inputEvent = new Event('input', { bubbles: true });
              fenInput.dispatchEvent(inputEvent);
              
              // Wait a moment then click start button
              setTimeout(() => {
                console.log("[FreeChess Coach] Clicking start button");
                startButton.click();
                
                // Clear automation flags
                sessionStorage.removeItem('chessCoachAutomatingReview');
                sessionStorage.removeItem('chessCoachGameId');
                sessionStorage.removeItem('chessCoachExtractedFen');
              }, 500);
            } else {
              console.error("[FreeChess Coach] No FEN found in sessionStorage");
            }
          } else {
            console.log("[FreeChess Coach] FEN input or start button not found after Edit Board click");
          }
        }, 1000);
      }
    }, 500);

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkForEditButton);
      console.log("[FreeChess Coach] Edit Board button timeout");
    }, 10000);
  }

  // Run initialization
  initEngine();
  attachListeners();
  observeGameMutations();
  setupGameReviewAutomation();
  setupChessComAnalysisExtraction();
  setupChessdaAutomation();
})();


