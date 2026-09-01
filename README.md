# FreeChess Coach — Real-Time Blunder & Brilliant Hint Browser Extension

A universal, independent Chrome extension that monitors chessboards in real time across any chess website (Chess.com, Lichess, Chessground, and custom DOM implementations). It evaluates candidate and played moves via Stockfish NNUE in the background and provides clean, subtle visual cues:
- 🔴 **Red Glow**: Blunders, mistakes, or inaccuracies before and after committing a move.
- 🔵 **Blue Glow**: Brilliant sacrifices, great moves, or top engine choices.

---

## Features
- **Universal Board & Piece Detection**: Automatically detects boards and parses pieces from DOM elements, CSS `transform: translate(x, y)` coordinates, or `square-XY` class notations without site lock-in.
- **Pre-Move / Hover Preview**: Evaluates candidate moves in real time while dragging or hovering over destination squares before dropping the piece.
- **Chrome MV3 Offscreen Architecture**: Runs Stockfish WebAssembly inside an isolated extension offscreen document for zero CSP restrictions and zero main-thread lag.
- **Clean Visuals**: Sleek, subtle ambient glows and a high-visibility fixed HUD badge without screen-shaking distractions.

---

## Installation
1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select this directory.
5. Open any chess website and start playing!
