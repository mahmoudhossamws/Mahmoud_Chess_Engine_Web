// Vanilla JS chess UI without external chessboard/jQuery dependencies
console.log('--- Initializing Chess Game (no external board dependency) ---');

// Ensure chess.js is available
if (typeof Chess === 'undefined') {
    alert('Failed to load chess.js (rules engine). Please connect to the internet or vendor it locally.');
    throw new Error('chess.js not loaded');
}

// Elements
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('gameStatus');
const whoIsWinningEl = document.getElementById('whoIsWinning');
const whiteProbabilityEl = document.getElementById('whiteProbability');
const blackProbabilityEl = document.getElementById('blackProbability');
const leftPlayerInfo = document.querySelector('#leftPlayerPanel .player-info');
const rightPlayerInfo = document.querySelector('#rightPlayerPanel .player-info');
const promotionModal = document.getElementById('promotionModal');
const promotionButtonsContainer = promotionModal.querySelector('.promotion-options');
const startNewGameBtn = document.getElementById('startNewGameBtn');

// Game state
const game = new Chess();
let selectedSquare = null; // algebraic like 'e2'
let legalMovesFromSelected = []; // array of target squares
let pendingPromotion = null; // { from, to, color }
let manualGameOver = false; // reserved for future manual endings
let lastAIMoveUCI = null;    // e.g., 'e7e5' or 'a1h1q'

// Create board squares as a CSS grid (8x8)
function createBoardGrid() {
    boardEl.classList.add('simple-board');
    boardEl.innerHTML = '';
    const files = ['a','b','c','d','e','f','g','h'];
    for (let r = 8; r >= 1; r--) {
        for (let f = 0; f < 8; f++) {
            const sq = files[f] + r; // a8 ... h1
            const div = document.createElement('div');
            div.className = 'sq ' + ((r + f) % 2 === 0 ? 'light' : 'dark');
            div.dataset.square = sq;
            div.addEventListener('click', onSquareClick);
            boardEl.appendChild(div);
        }
    }
}

function renderPieces() {
    // Clear all piece elements then draw based on game.board()
    document.querySelectorAll('#board .sq').forEach(el => {
        el.innerHTML = '';
        el.classList.remove('sel','move','capture');
    });
    const board = game.board(); // 2D array rank 8->1, file a->h
    const files = ['a','b','c','d','e','f','g','h'];
    for (let r = 8; r >= 1; r--) {
        const row = board[8 - r];
        for (let f = 0; f < 8; f++) {
            const piece = row[f];
            if (!piece) continue;
            const sq = files[f] + r;
            const el = document.querySelector(`#board .sq[data-square="${sq}"]`);
            if (!el) continue;
            const token = document.createElement('span');
            // Modern, bold, black & white Unicode glyphs
            token.className = 'pc ' + piece.color + piece.type; // e.g., 'pc wp' or 'pc bk'
            token.textContent = pieceToGlyph(piece.color + piece.type);
            el.appendChild(token);
        }
    }
}

function pieceToGlyph(code) {
    // High-contrast Unicode chess glyphs (normal look, modern weight)
    const map = {
        wp: '♙', wr: '♖', wn: '♘', wb: '♗', wq: '♕', wk: '♔',
        bp: '♟', br: '♜', bn: '♞', bb: '♝', bq: '♛', bk: '♚'
    };
    return map[code] || '?';
}

function highlightMoves(from) {
    clearHighlights();
    const moves = game.moves({ square: from, verbose: true });
    legalMovesFromSelected = moves.map(m => m.to);
    const fromEl = document.querySelector(`#board .sq[data-square="${from}"]`);
    if (fromEl) fromEl.classList.add('sel');
    moves.forEach(m => {
        const toEl = document.querySelector(`#board .sq[data-square="${m.to}"]`);
        if (!toEl) return;
        const isCapture = m.flags.includes('c') || m.flags.includes('e');
        const isKCastle = m.flags.includes('k');
        const isQCastle = m.flags.includes('q');
        if (isKCastle || isQCastle) {
            toEl.classList.add('castle');
        } else {
            toEl.classList.add(isCapture ? 'capture' : 'move');
        }
    });
}

function clearHighlights() {
    document.querySelectorAll('#board .sq').forEach(el => el.classList.remove('sel','move','capture','castle'));
}

function onSquareClick(e) {
    if (manualGameOver) return;
    const sq = e.currentTarget.dataset.square;
    if (game.game_over()) return;
    // Only allow human (white) to move
    if (game.turn() !== 'w') return;

    // If selecting a white piece square first
    const piece = game.get(sq);
    if (!selectedSquare) {
        if (piece && piece.color === 'w') {
            selectedSquare = sq;
            highlightMoves(sq);
        }
        return;
    }

    // If clicking same color piece again, reselect
    if (piece && piece.color === 'w' && sq !== selectedSquare) {
        selectedSquare = sq;
        highlightMoves(sq);
        return;
    }

    // Attempt move from selectedSquare -> sq
    if (selectedSquare) {
        const isPromotion = shouldPromptPromotion(selectedSquare, sq, 'w');
        if (isPromotion) {
            pendingPromotion = { from: selectedSquare, to: sq, color: 'w' };
            openPromotionModal();
            return;
        }
        const move = game.move({ from: selectedSquare, to: sq, promotion: 'q' });
        if (!move) {
            // illegal: keep selection only if clicked a white piece
            if (piece && piece.color === 'w') {
                selectedSquare = sq;
                highlightMoves(sq);
            } else {
                selectedSquare = null;
                clearHighlights();
            }
            return;
        }
        selectedSquare = null;
        clearHighlights();
        syncAfterHumanMove();
    }
}

function shouldPromptPromotion(from, to, color) {
    const p = game.get(from);
    if (!p || p.type !== 'p' || p.color !== color) return false;
    const rank = to[1];
    return (color === 'w' && rank === '8') || (color === 'b' && rank === '1');
}

function openPromotionModal() {
    promotionModal.style.display = 'flex';
}
function closePromotionModal() {
    promotionModal.style.display = 'none';
}

promotionButtonsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (!pendingPromotion) return;
    const promotionPiece = btn.getAttribute('data-piece');
    const move = game.move({
        from: pendingPromotion.from,
        to: pendingPromotion.to,
        promotion: promotionPiece
    });
    pendingPromotion = null;
    closePromotionModal();
    if (move) {
        syncAfterHumanMove();
    } else {
        // illegal (shouldn't happen), just re-render
        renderPieces();
        updateStatus();
    }
});

function syncAfterHumanMove() {
    renderPieces();
    updateStatus();
    // Query engine once (probability + best move) and apply AI move
    if (!manualGameOver && !game.game_over()) {
        setTimeout(engineEvaluateAndAct, 450);
    }
}

function updateStatus() {
    if (manualGameOver) return; // reserved
    const turnSide = game.turn();
    const turnLabel = turnSide === 'w' ? 'You' : 'Mahmoud';
    let status = `${turnLabel} to move.`;

    // Indicate check state in a personalized way
    if (!game.game_over() && game.in_check()) {
        status += ' ' + (turnSide === 'w' ? 'You are in check!' : 'Mahmoud is in check!');
    }

    if (game.game_over()) {
        if (game.in_checkmate()) {
            const winnerLabel = turnSide === 'w' ? 'Mahmoud' : 'You';
            status = `Checkmate. ${winnerLabel} won!`;
            whoIsWinningEl.textContent = `${winnerLabel} won!`;
        } else if (game.in_stalemate()) {
            status = 'Stalemate. Draw!';
            whoIsWinningEl.textContent = 'Draw!';
        } else if (game.in_threefold_repetition()) {
            status = 'Threefold repetition. Draw!';
            whoIsWinningEl.textContent = 'Draw!';
        } else if (game.insufficient_material()) {
            status = 'Insufficient material. Draw!';
            whoIsWinningEl.textContent = 'Draw!';
        } else if (game.in_draw()) {
            // Remaining draw case most likely 50-move rule
            status = `50-move rule. Draw!`;
            whoIsWinningEl.textContent = 'Draw!';
        } else {
            status = 'Game Over.';
            whoIsWinningEl.textContent = 'Game Over';
        }
    }

    // Optionally show last AI move UCI without labeling source
    // if (lastAIMoveUCI && !game.game_over()) {
    //     status += ` [Last AI move: ${lastAIMoveUCI}]`;
    // }

    statusEl.textContent = status;

    if (game.game_over()) {
        // On game over, clear probabilities and active highlights
        whiteProbabilityEl.textContent = 'N/A';
        blackProbabilityEl.textContent = 'N/A';
        leftPlayerInfo.classList.remove('active');
        rightPlayerInfo.classList.remove('active');
    } else {
        // Keep probabilities as set by the AI; only toggle active highlights
        if (turnSide === 'w') {
            leftPlayerInfo.classList.add('active');
            rightPlayerInfo.classList.remove('active');
        } else {
            rightPlayerInfo.classList.add('active');
            leftPlayerInfo.classList.remove('active');
        }
    }

    // Engine evaluation is triggered on turn changes, not on every status update
}

function uciToMove(uci) {
    if (!uci || typeof uci !== 'string') return null;
    const s = uci.trim().toLowerCase();
    if (s.length < 4) return null;
    const from = s.slice(0, 2);
    const to = s.slice(2, 4);
    let promotion;
    if (s.length >= 5) promotion = s[4];
    if (promotion && typeof promotion === 'string') promotion = promotion.toLowerCase();
    return promotion ? { from, to, promotion } : { from, to };
}

async function engineEvaluateAndAct() {
    if (manualGameOver || game.game_over()) return;
    const fen = game.fen();
    // Default placeholders
    whiteProbabilityEl.textContent = 'Calculating…';
    blackProbabilityEl.textContent = 'Calculating…';

    let moved = false;
    let movedFromAPI = false;
    if (typeof window.fetchEngineEval === 'function') {
        try {
            const { prob, best_move } = await window.fetchEngineEval(fen);
            // Update probabilities first
            const wPct = Math.round(prob * 100);
            const bPct = 100 - wPct;
            whiteProbabilityEl.textContent = `${wPct}%`;
            blackProbabilityEl.textContent = `${bPct}%`;
            whoIsWinningEl.textContent = wPct === 50 ? 'Balanced' : (wPct > 50 ? 'You' : 'Mahmoud');

            // If it's black's turn, apply engine move
            if (game.turn() === 'b' && !game.game_over()) {
                const mv = uciToMove(best_move);
                if (mv) {
                    const res = game.move(mv);
                    if (res) {
                        moved = true;
                        movedFromAPI = true;
                        lastAIMoveUCI = best_move || `${mv.from}${mv.to}${mv.promotion || ''}`;
                        console.log('ai move done for now');
                    } else if (mv.promotion) {
                        const alt = { ...mv, promotion: 'q' };
                        if (game.move(alt)) {
                            moved = true;
                            movedFromAPI = true;
                            lastAIMoveUCI = `${mv.from}${mv.to}q`;
                            console.log('ai move done for now');
                        }
                    }
                }
            }
        } catch (e) {
            // Evaluation failed; will fallback to random move below
        }
    }

    // Fallback to random move if not moved
    if (!moved && game.turn() === 'b' && !game.game_over()) {
        const moves = game.moves({ verbose: true });
        if (moves.length > 0) {
            const idx = Math.floor(Math.random() * moves.length);
            const m = moves[idx];
            if (m.flags.includes('p')) {
                game.move({ from: m.from, to: m.to, promotion: 'q' });
            } else {
                game.move(m);
            }
            lastAIMoveUCI = `${m.from}${m.to}${m.promotion || ''}`;
        }
    }

    renderPieces();
    updateStatus();
}

function startNewGame() {
    game.reset();
    selectedSquare = null;
    pendingPromotion = null;
    manualGameOver = false;
    lastAIMoveUCI = null;
    clearHighlights();
    renderPieces();
    updateStatus();
    closePromotionModal();
    // Compute probability at the start of a new game as well
    setTimeout(engineEvaluateAndAct, 300);
}

startNewGameBtn.addEventListener('click', () => startNewGame());
// draw/resign UI removed per request

// Initialize board
createBoardGrid();
renderPieces();
updateStatus();
console.log('Chess UI ready.');
// Compute probability at start (even before the first move)
engineEvaluateAndAct();
// Also trigger when the engine client is ready
window.addEventListener('engineClientReady', () => {
    engineEvaluateAndAct();
});