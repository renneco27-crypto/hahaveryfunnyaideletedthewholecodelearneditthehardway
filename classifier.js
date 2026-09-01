const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function toCp(line) {
  if (!line) return 0;
  if (typeof line.mateIn === 'number') {
    return line.mateIn > 0 ? 100000 - line.mateIn : -100000 - line.mateIn;
  }
  return typeof line.cp === 'number' ? line.cp : 0;
}

function getThresh(category, prevCp) {
  const a = Math.abs(prevCp);
  // Adjusted thresholds for depth 8 evaluations with normal fluctuations
  if (category === 'best') return Math.max(0, 0.0001 * a * a + 0.0236 * a - 3.7143);
  if (category === 'excellent') return Math.max(0, 0.0002 * a * a + 0.1231 * a + 20.5455); // Reduced from 27.5
  if (category === 'good') return Math.max(0, 0.0002 * a * a + 0.2643 * a + 50.5455); // Reduced from 60.5
  if (category === 'inaccuracy') return Math.max(0, 0.0002 * a * a + 0.3624 * a + 80.0909); // Reduced from 108.1
  if (category === 'mistake') return Math.max(0, 0.0003 * a * a + 0.4027 * a + 150.8182); // Reduced from 225.8
  return Infinity;
}

function isSquareAttacked(board, sq, attackerColor) {
  if (!board) return false;
  if (typeof board.is_attacked === 'function') return board.is_attacked(sq, attackerColor);
  if (typeof board.isAttacked === 'function') return board.isAttacked(sq, attackerColor);
  try {
    const clone = new Chess(board.fen());
    const currentTurn = clone.turn();
    if (currentTurn !== attackerColor) {
      const tokens = clone.fen().split(' ');
      tokens[1] = attackerColor;
      tokens[3] = '-';
      clone.load(tokens.join(' '));
    }
    const moves = clone.moves({ verbose: true });
    return moves.some(m => m.to === sq);
  } catch (e) {
    return false;
  }
}

function detectBrilliantSacrifice(playedUci, evBefore, evAfter, boardBefore, isTopMove) {
  console.log("[Brilliant Detection] Checking move:", playedUci, "evBefore:", evBefore, "evAfter:", evAfter, "isTopMove:", isTopMove);
  
  if (!boardBefore) {
    console.log("[Brilliant Detection] No board provided");
    return false;
  }
  const from = playedUci.slice(0, 2);
  const to = playedUci.slice(2, 4);
  const piece = boardBefore.get(from);
  if (!piece) {
    console.log("[Brilliant Detection] No piece at from square");
    return false;
  }

  const pieceVal = PIECE_VAL[piece.type] || 0;
  if (pieceVal < 3) {
    console.log("[Brilliant Detection] Piece value too low:", pieceVal);
    return false; // Pawns and Kings excluded
  }

  if (evBefore >= 700 || evBefore <= -700) {
    console.log("[Brilliant Detection] Position too good/bad:", evBefore);
    return false;
  }

  const delta = Math.max(0, evBefore - evAfter);
  
  // REQUIRE minimum evaluation swing of 4 points (400 centipawns) for brilliant
  if (delta < 400) {
    console.log("[Brilliant Detection] Evaluation swing too small:", delta, "required: 400");
    return false;
  }
  
  if (delta > 35 && !isTopMove) {
    console.log("[Brilliant Detection] Delta too high for non-top move:", delta);
    return false;
  }

  if (evAfter < -50) {
    console.log("[Brilliant Detection] Final evaluation too low:", evAfter);
    return false;
  }

  try {
    const clone = new Chess(boardBefore.fen());
    const m = clone.move({ from, to, promotion: playedUci[4] || 'q' });
    if (!m) {
      console.log("[Brilliant Detection] Move invalid");
      return false;
    }

    const capturedVal = m.captured ? PIECE_VAL[m.captured] : 0;
    const oppMoves = clone.moves({ verbose: true });
    const squareAttacked = oppMoves.some(oppM => oppM.to === to);

    let isMaterialSacrifice = squareAttacked && (pieceVal > capturedVal);
    console.log("[Brilliant Detection] Primary sacrifice check:", isMaterialSacrifice, "pieceVal:", pieceVal, "capturedVal:", capturedVal, "squareAttacked:", squareAttacked);

    if (!isMaterialSacrifice) {
      const attackedPieces = oppMoves.filter(oppM => {
        const targetPiece = clone.get(oppM.to);
        return targetPiece && PIECE_VAL[targetPiece.type] >= 3;
      });
      if (attackedPieces.length > 0 && delta <= 15) {
        isMaterialSacrifice = true;
        console.log("[Brilliant Detection] Secondary sacrifice check passed, attackedPieces:", attackedPieces.length);
      }
    }

    console.log("[Brilliant Detection] Final result:", isMaterialSacrifice);
    return isMaterialSacrifice;
  } catch (e) {
    console.log("[Brilliant Detection] Error:", e);
    return false;
  }
}

function classifyMove(topBefore, secondBefore, afterLine, playedUci, boardBefore) {
  if (!topBefore || !afterLine) return 'good';

  const afterNeg = {
    move: afterLine.move,
    cp: typeof afterLine.cp === 'number' ? -afterLine.cp : null,
    mateIn: typeof afterLine.mateIn === 'number' ? -afterLine.mateIn : null
  };

  const evBefore = toCp(topBefore);
  const evAfter = toCp(afterNeg);
  const delta = Math.max(0, evBefore - evAfter);
  const prevCp = topBefore.cp || 0;
  const isTop = (playedUci === topBefore.move);
  const onlyMove = secondBefore && (toCp(topBefore) - toCp(secondBefore)) >= 350;

  if (typeof afterNeg.mateIn === 'number') {
    if (afterNeg.mateIn < 0) return 'blunder';
    if (afterNeg.mateIn > 0 && evBefore < 50000) return 'best';
  }

  // 1. BRILLIANT
  if (detectBrilliantSacrifice(playedUci, evBefore, evAfter, boardBefore, isTop)) {
    return 'brilliant';
  }

  // 2. GREAT vs BEST
  if (isTop) return onlyMove ? 'great' : 'best';
  if (onlyMove) return 'blunder';

  // 3. DEFENDED SQUARE OVERRIDE
  if (boardBefore && delta >= 200) {
    const from = playedUci.slice(0, 2);
    const to = playedUci.slice(2, 4);
    const movingPiece = boardBefore.get(from);
    const capturedPiece = boardBefore.get(to);
    if (movingPiece && capturedPiece) {
      const attackerVal = PIECE_VAL[movingPiece.type] || 0;
      const captureVal = PIECE_VAL[capturedPiece.type] || 0;
      const opponentColor = movingPiece.color === 'w' ? 'b' : 'w';
      const squareDefended = isSquareAttacked(boardBefore, to, opponentColor);
      const netLoss = squareDefended ? (attackerVal - captureVal) : 0;
      if (netLoss >= 4) return 'blunder';
    }
  }

  // 4. POLYNOMIAL LOSS
  const categories = ['best', 'excellent', 'good', 'inaccuracy', 'mistake'];
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    if (delta <= getThresh(cat, prevCp)) {
      if (cat === 'blunder') {
        if (evAfter >= 600 || evBefore <= -600) return 'good';
      }
      return cat;
    }
  }

  return 'blunder';
}

if (typeof window !== 'undefined') {
  window.ChessClassifier = {
    classifyMove,
    detectBrilliantSacrifice,
    getThresh,
    toCp
  };
}
