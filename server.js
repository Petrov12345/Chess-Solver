const express = require("express");
const { spawn } = require("child_process");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();

// Security and logging middleware
app.use(helmet());
app.use(morgan("combined"));

// Configure CORS: set allowed origin via environment variable (or default to all origins for development)
const allowedOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));

app.use(bodyParser.json());

// Use environment variable for Stockfish path (set STOCKFISH_PATH in production)
const STOCKFISH_PATH = process.env.STOCKFISH_PATH || "C:\\Users\\julpe\\Downloads\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe";

// Spawn Stockfish when the server starts
const stockfish = spawn(STOCKFISH_PATH);

console.log("Stockfish process started.");
stockfish.stdin.write("uci\n");

stockfish.stderr.on("data", (data) => {
  console.error("Stockfish Error:", data.toString());
});

stockfish.on("close", (code) => {
  console.log(`Stockfish process exited with code ${code}`);
});

// Handle unexpected errors gracefully
stockfish.on("error", (err) => {
  console.error("Failed to start Stockfish:", err);
  process.exit(1);
});

// Function to query Stockfish for the best move and evaluation
function getBestMoveAndEval(fen, depth = 15) {
  return new Promise((resolve, reject) => {
    let bestMove = null;
    let evaluation = null;
    let isFinished = false;

    // Side to move is the 2nd field in the FEN (e.g. "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1")
    const sideToMove = fen.split(" ")[1]; // 'w' or 'b'

    const handleData = (data) => {
      const lines = data.toString().split("\n");
      for (let line of lines) {
        const trimmed = line.trim();

        // Extract evaluation from lines like: "info depth 15 score cp 34" or "info depth 15 score mate -2"
        if (trimmed.startsWith("info depth")) {
          const scoreMatch = trimmed.match(/score (\w+) (-?\d+)/);
          if (scoreMatch) {
            const scoreType = scoreMatch[1];  // "cp" or "mate"
            const scoreValue = parseInt(scoreMatch[2], 10);

            if (scoreType === "cp") {
              // If it's Black to move, invert the sign so we keep everything from White's perspective
              let val = scoreValue;
              if (sideToMove === "b") {
                val = -val;
              }
              evaluation = val;
            } else if (scoreType === "mate") {
              // If it's Black to move, invert the mate sign too
              let val = scoreValue;
              if (sideToMove === "b") {
                val = -val;
              }
              evaluation = `mate ${val}`;
            }
          }
        }

        // bestmove line
        if (trimmed.startsWith("bestmove")) {
          const moveMatch = trimmed.match(/bestmove\s(\S+)/);
          if (moveMatch) {
            bestMove = moveMatch[1];
          }
          isFinished = true;
          stockfish.stdout.off("data", handleData);
          resolve({ bestMove, evaluation });
        }
      }
    };

    stockfish.stdout.on("data", handleData);

    // Send commands to Stockfish
    stockfish.stdin.write(`position fen ${fen}\n`);
    stockfish.stdin.write(`go depth ${depth}\n`);

    // Timeout after 5s if no bestmove is received
    setTimeout(() => {
      if (!isFinished) {
        stockfish.stdout.off("data", handleData);
        reject(new Error("Stockfish timed out or gave no bestmove."));
      }
    }, 5000);
  });
}

// Endpoint to get best move and evaluation
app.post("/best-move", async (req, res) => {
  const { fen } = req.body;
  if (!fen) {
    return res.status(400).json({ error: "FEN string is required" });
  }
  try {
    const { bestMove, evaluation } = await getBestMoveAndEval(fen, 15);
    return res.json({ bestMove, evaluation });
  } catch (err) {
    console.error("Error getting best move:", err);
    return res.status(500).json({ error: "Error calculating best move" });
  }
});

// Ensure Stockfish shuts down when the server stops
process.on("SIGINT", () => {
  console.log("Shutting down server and Stockfish...");
  stockfish.kill();
  process.exit();
});

process.on("exit", () => {
  stockfish.kill();
});

// Use environment variable for port (default to 5000)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

