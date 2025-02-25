import React, { useState, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import axios from "axios";
// Import our external stylesheet
import "./App.css";

export default function App() {
  const [chess] = useState(() => new Chess());
  const startingFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const [position, setPosition] = useState(startingFen);
  const [bestMove, setBestMove] = useState("");
  const [highlight, setHighlight] = useState({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isFlipped, setIsFlipped] = useState(false);
  const [moveHistory, setMoveHistory] = useState([startingFen]);
  const [gameStatus, setGameStatus] = useState("");
  const [evaluation, setEvaluation] = useState(null);

  const currentTurn = chess.turn() === "w" ? "White" : "Black";
  const topText = gameStatus ? gameStatus : `Current Turn: ${currentTurn}`;

  useEffect(() => {
    getBestMove(startingFen);
    // eslint-disable-next-line
  }, []);

  // Updated API URL to point to the EC2 backend
  const apiUrl = "http://3.146.34.3:5000";

  async function getBestMove(fen) {
    if (gameStatus) return;
    try {
      const resp = await axios.post(`${apiUrl}/best-move`, { fen });
      const { bestMove, evaluation } = resp.data;

      if (bestMove) {
        setBestMove(bestMove);
        const fromSquare = bestMove.slice(0, 2);
        const toSquare = bestMove.slice(2, 4);

        setHighlight({
          [fromSquare]: { backgroundColor: "yellow" },
          [toSquare]: { backgroundColor: "green" },
        });
      } else {
        setBestMove("");
        setHighlight({});
      }

      setEvaluation(evaluation);
    } catch (err) {
      console.error("Failed to fetch best move:", err);
      setErrorMessage("Failed to fetch best move.");
    }
  }

  function checkGameOver() {
    if (!chess.isGameOver()) return;

    if (chess.isCheckmate()) {
      const winner = chess.turn() === "w" ? "Black" : "White";
      setGameStatus(`${winner} Wins!`);
    } else if (
      chess.isStalemate() ||
      chess.isDraw() ||
      chess.isThreefoldRepetition() ||
      chess.isInsufficientMaterial()
    ) {
      setGameStatus("Draw");
    }
  }

  function onPieceDrop(sourceSquare, targetSquare) {
    setErrorMessage("");
    if (gameStatus) return false;

    const piece = chess.get(sourceSquare);
    if (!piece) {
      setErrorMessage("No piece on the selected square.");
      return false;
    }

    const pieceColor = piece.color === "w" ? "White" : "Black";
    if (pieceColor !== currentTurn) {
      setErrorMessage(`Not ${pieceColor}'s turn.`);
      return false;
    }

    try {
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (!move) {
        setErrorMessage("Illegal move.");
        return false;
      }

      const newFen = chess.fen();
      setPosition(newFen);
      setMoveHistory([...moveHistory, newFen]);
      checkGameOver();
      getBestMove(newFen);
      return true;
    } catch (err) {
      console.error("Move error:", err);
      setErrorMessage("Illegal move.");
      return false;
    }
  }

  function undoLastMove() {
    setErrorMessage("");
    if (moveHistory.length > 1) {
      const newHistory = [...moveHistory];
      newHistory.pop();
      const prevFen = newHistory[newHistory.length - 1];
      setMoveHistory(newHistory);
      chess.load(prevFen);
      setPosition(prevFen);
      setGameStatus("");
      setEvaluation(null);
      getBestMove(prevFen);
    } else {
      resetGame();
    }
  }

  function resetGame() {
    chess.reset();
    setPosition(startingFen);
    setMoveHistory([startingFen]);
    setBestMove("");
    setErrorMessage("");
    setGameStatus("");
    setEvaluation(null);
    getBestMove(startingFen);
  }

  function toggleFlip() {
    setIsFlipped(!isFlipped);
  }

  let blackHeight = 50;
  let whiteHeight = 50;
  let displayEval = "No evaluation yet.";

  if (evaluation !== null) {
    if (typeof evaluation === "string" && evaluation.includes("mate")) {
      const mateVal = parseInt(evaluation.split(" ")[1], 10);
      if (mateVal > 0) {
        blackHeight = 0;
        whiteHeight = 100;
        displayEval = `White mates in ${mateVal}`;
      } else {
        blackHeight = 100;
        whiteHeight = 0;
        displayEval = `Black mates in ${Math.abs(mateVal)}`;
      }
    } else {
      const evalInt = parseInt(evaluation, 10);
      const clipped = Math.max(-400, Math.min(400, evalInt));

      whiteHeight = ((clipped + 400) / 800) * 100;
      blackHeight = 100 - whiteHeight;

      const pawns = evalInt / 100;
      const sign = pawns >= 0 ? "+" : "";
      if (evalInt === 0) {
        displayEval = "Evaluation: 0.00 (Equal)";
      } else {
        displayEval = `Evaluation: ${sign}${pawns.toFixed(2)}`;
      }
    }
  }

  return (
    <div className="app-container">
      <div className="header-container">
        <h1 style={{ margin: 0 }}>Chess Evaluation</h1>
        <h2 style={{ margin: "10px 0" }}>{topText}</h2>

        <div style={{ marginBottom: "10px" }}>
          <button onClick={resetGame}>Reset</button>
          <button onClick={toggleFlip}>Flip</button>
          <button onClick={undoLastMove}>Undo</button>
        </div>
      </div>

      <div className="board-and-eval">
        <Chessboard
          position={position}
          onPieceDrop={onPieceDrop}
          boardOrientation={isFlipped ? "black" : "white"}
          customSquareStyles={highlight}
          boardWidth={600}
        />

        <div className="eval-bar-container">
          <p style={{ margin: "0 0 5px" }}>{displayEval}</p>
          <div className="bar-container">
            <div className="black-bar" style={{ height: `${blackHeight}%` }}></div>
            <div className="white-bar" style={{ height: `${whiteHeight}%` }}></div>
          </div>
        </div>
      </div>

      <div className="info-section">
        <p>Next Best Move: {bestMove || "Calculating..."}</p>
        {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}
      </div>
    </div>
  );
}
