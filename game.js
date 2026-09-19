// Initialize Socket.io
const socket = typeof io !== 'undefined' ? io() : null;

let stockfish = null;
let board = [];
let turn = 'white';
let selectedSquare = null;
let validMoves = [];
let gameActive = false;
let playerColor = 'white';
let chosenColorChoice = 'white';
let isAnimating = false;
let selectedBotRating = 2100;
let moveHistory = [];
let historyLog = [];
let castlingRights = { K: true, Q: true, k: true, q: true };
let enPassantSquare = null; 
let hintSquare = null;
let isHintActive = false;
let lastPlayerMoveTime = 0;

// Multiplayer Variables
let gameMode = 'bot'; // 'bot' or 'friend'
let myRoomId = null;

function initStockfish() {
    try {
        stockfish = new Worker('stockfish.js'); 
        
        stockfish.onmessage = function(event) {
            let data = event.data;
            if (typeof data === 'string' && data.includes('bestmove')) {
                let match = data.match(/bestmove\s+(\S+)/);
                if (match) {
                    let bestMove = match[1];
                    if (isHintActive) {
                        showHintMove(bestMove);
                        isHintActive = false;
                    } else {
                        executeEngineMove(bestMove);
                    }
                }
            }
        };

        stockfish.onerror = function(err) {
            console.warn('Stockfish worker failed to load. Fallback AI active.', err);
            stockfish = null;
        };

        stockfish.postMessage('uci');
    } catch(e) {
        console.warn('Stockfish Worker not supported or missing. Fallback active.');
        stockfish = null;
    }
}

window.onload = function() {
    initStockfish();
    setupUI();
};

function setupUI() {
    let openModalBtn = document.getElementById('openModalBtn');
    if (openModalBtn) {
        openModalBtn.onclick = () => {
            let modal = document.getElementById('ratingModal');
            if (modal) modal.style.display = 'flex';
        };
    }

    document.querySelectorAll('.rating-btn').forEach(btn => {
        btn.onclick = function() {
            selectedBotRating = parseInt(this.getAttribute('data-rating')) || 1600;
            gameMode = 'bot';
            
            if (chosenColorChoice === 'random') {
                playerColor = Math.random() < 0.5 ? 'white' : 'black';
            } else {
                playerColor = chosenColorChoice;
            }

            let modal = document.getElementById('ratingModal');
            if (modal) modal.style.display = 'none';

            let lobbyGrid = document.querySelector('.lobby-grid');
            if (lobbyGrid) lobbyGrid.classList.add('hidden');

            let gameContainer = document.getElementById('game-container');
            if (gameContainer) gameContainer.classList.remove('hidden');
            
            let botBadge = document.getElementById('botRatingBadge');
            if (botBadge) botBadge.innerText = selectedBotRating;

            let oppName = document.getElementById('opponentNameText');
            if (oppName) oppName.innerText = `Stockfish Bot (${selectedBotRating})`;

            startGame();
        };
    });
}

window.setChosenColor = function(color) {
    chosenColorChoice = color;
    document.querySelectorAll('.color-choice-btn').forEach(btn => {
        btn.style.border = (btn.getAttribute('data-color') === color) ? '2px solid #629924' : 'none';
    });
}

window.closeModal = function() {
    let modal = document.getElementById('ratingModal');
    if (modal) modal.style.display = 'none';
}

window.playAgain = function() {
    let goModal = document.getElementById('gameOverModal');
    if (goModal) goModal.style.display = 'none';
    startGame();
}

window.goHome = function() {
    let goModal = document.getElementById('gameOverModal');
    if (goModal) goModal.style.display = 'none';
    let gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.classList.add('hidden');
    let lobbyGrid = document.querySelector('.lobby-grid');
    if (lobbyGrid) lobbyGrid.classList.remove('hidden');
}

window.startBotGame = function() {
    let modal = document.getElementById('ratingModal');
    if (modal) {
        modal.style.display = 'flex';
    } else {
        gameMode = 'bot';
        let lobbyGrid = document.querySelector('.lobby-grid');
        if (lobbyGrid) lobbyGrid.classList.add('hidden');
        let gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.classList.remove('hidden');
        startGame();
    }
}

window.backToLobby = function() {
    goHome();
}

function startGame() {
    board = [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ];
    turn = 'white';
    selectedSquare = null;
    validMoves = [];
    moveHistory = [];
    historyLog = [];
    castlingRights = { K: true, Q: true, k: true, q: true };
    enPassantSquare = null;
    hintSquare = null;
    gameActive = true;
    updateMoveHistoryDisplay();
    renderBoard();

    if (gameMode === 'bot' && playerColor === 'black') {
        setTimeout(triggerBotMove, 400);
    }
}

function playSound(type) {
    try {
        let ctx = new (window.AudioContext || window.webkitAudioContext)();
        let osc = ctx.createOscillator();
        let gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'move') {
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            osc.start();
            osc.stop(ctx.currentTime + 0.08);
        } else if (type === 'capture') {
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
        }
    } catch(e) {}
}

function renderBoard() {
    let boardEl = document.getElementById('chessboard') || document.getElementById('board');
    if (!boardEl) return;
    boardEl.innerHTML = '';

    let whiteInCheck = isKingPosAttacked(board, 'white', 'black');
    let blackInCheck = isKingPosAttacked(board, 'black', 'white');
    
    let statusText = document.getElementById('statusText') || document.getElementById('game-status');
    if (statusText) {
        statusText.innerText = `Turn: ${turn.charAt(0).toUpperCase() + turn.slice(1)}`;
    }

    let displayBoard = board;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let actualR = playerColor === 'white' ? r : 7 - r;
            let actualC = playerColor === 'white' ? c : 7 - c;

            let square = document.createElement('div');
            let isLight = (actualR + actualC) % 2 === 0;
            square.className = 'square ' + (isLight ? 'light' : 'dark');
            square.dataset.row = actualR;
            square.dataset.col = actualC;

            let piece = displayBoard[actualR][actualC];

            if (piece === 'K' && whiteInCheck) square.classList.add('check');
            if (piece === 'k' && blackInCheck) square.classList.add('check');

            if (hintSquare && hintSquare.row === actualR && hintSquare.col === actualC) {
                square.classList.add('hint');
            }

            if (piece) {
                let img = document.createElement('img');
                img.className = 'piece';
                img.src = getPieceImage(piece);
                square.appendChild(img);
            }

            if (selectedSquare && selectedSquare.row === actualR && selectedSquare.col === actualC) {
                square.classList.add('selected');
            }

            for (let i = 0; i < validMoves.length; i++) {
                let vm = validMoves[i];
                if (vm.row === actualR && vm.col === actualC) {
                    let indicator = document.createElement('div');
                    indicator.className = (displayBoard[actualR][actualC] || (enPassantSquare && enPassantSquare.row === actualR && enPassantSquare.col === actualC)) ? 'capture-indicator' : 'move-indicator';
                    square.appendChild(indicator);
                }
            }

            square.onclick = () => handleSquareClick(actualR, actualC);
            boardEl.appendChild(square);
        }
    }
}

function getPieceImage(piece) {
    // Agar SVG files root folder me hain, toh basePath '' (empty) hona chahiye
    const basePath = ''; 
    let map = {
        'P': 'wp.svg', 'N': 'wn.svg', 'B': 'wb.svg', 'R': 'wr.svg', 'Q': 'wq.svg', 'K': 'wk.svg',
        'p': 'bp.svg', 'n': 'bn.svg', 'b': 'bb.svg', 'r': 'br.svg', 'q': 'bq.svg', 'k': 'bk.svg'
    };
    return map[piece] ? basePath + map[piece] : '';
}

function handleSquareClick(r, c) {
    if (!gameActive || isAnimating || turn !== playerColor) return;

    let piece = board[r][c];
    let color = piece ? (piece === piece.toUpperCase() ? 'white' : 'black') : null;

    if (selectedSquare) {
        let isValid = false;
        for (let i = 0; i < validMoves.length; i++) {
            if (validMoves[i].row === r && validMoves[i].col === c) {
                isValid = true;
                break;
            }
        }
        if (isValid) {
            let sr = selectedSquare.row;
            let sc = selectedSquare.col;
            selectedSquare = null;
            validMoves = [];
            hintSquare = null;

            animateAndMakeMove(sr, sc, r, c, function() {
                checkGameEndConditions();
                if (gameActive && gameMode === 'bot' && turn !== playerColor) {
                    setTimeout(triggerBotMove, 200);
                }
            }, true);
            return;
        }
    }

    if (piece && color === playerColor) {
        selectedSquare = { row: r, col: c };
        validMoves = getValidMoves(r, c);
        hintSquare = null;
        renderBoard();
    } else {
        selectedSquare = null;
        validMoves = [];
        renderBoard();
    }
}

function animateAndMakeMove(sr, sc, tr, tc, callback, isLocal = true) {
    isAnimating = true;
    let boardEl = document.getElementById('chessboard') || document.getElementById('board');
    let piece = board[sr][sc];
    let targetPiece = board[tr][tc];

    playSound(targetPiece ? 'capture' : 'move');

    let fileChars = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    let moveStr = `${fileChars[sc]}${8 - sr} → ${fileChars[tc]}${8 - tr}`;
    historyLog.push(moveStr);
    updateMoveHistoryDisplay();

    if (gameMode === 'friend' && isLocal && myRoomId && socket) {
        socket.emit('make-move', { roomId: myRoomId, move: { sr, sc, tr, tc } });
    }

    if (!boardEl) {
        executeMoveLogic(sr, sc, tr, tc);
        renderBoard();
        isAnimating = false;
        if (callback) callback();
        return;
    }

    let startSquareEl = boardEl.querySelector(`[data-row='${sr}'][data-col='${sc}']`);
    let targetSquareEl = boardEl.querySelector(`[data-row='${tr}'][data-col='${tc}']`);
    let pieceImg = startSquareEl ? startSquareEl.querySelector('img') : null;

    if (!pieceImg || !targetSquareEl) {
        executeMoveLogic(sr, sc, tr, tc);
        renderBoard();
        isAnimating = false;
        if (callback) callback();
        return;
    }

    let startRect = startSquareEl.getBoundingClientRect();
    let targetRect = targetSquareEl.getBoundingClientRect();
    let dx = targetRect.left - startRect.left;
    let dy = targetRect.top - startRect.top;

    pieceImg.style.position = 'absolute';
    pieceImg.style.zIndex = '100';
    pieceImg.style.transition = 'transform 0.18s ease-in-out';
    pieceImg.style.transform = `translate(${dx}px, ${dy}px)`;

    setTimeout(() => {
        executeMoveLogic(sr, sc, tr, tc);
        renderBoard();
        isAnimating = false;
        if (callback) callback();
    }, 180);
}

function saveState() {
    moveHistory.push({
        board: board.map(row => row.slice()),
        turn: turn,
        castlingRights: { ...castlingRights },
        enPassantSquare: enPassantSquare ? { ...enPassantSquare } : null,
        historyLogLength: historyLog.length
    });
}

function executeMoveLogic(sr, sc, tr, tc) {
    if (turn === playerColor) {
        lastPlayerMoveTime = Date.now();
    }
    saveState();
    let piece = board[sr][sc];

    if (piece.toLowerCase() === 'k' && Math.abs(tc - sc) === 2) {
        if (tc === 6) {
            board[tr][5] = board[tr][7];
            board[tr][7] = '';
        } else if (tc === 2) {
            board[tr][3] = board[tr][0];
            board[tr][0] = '';
        }
    }

    if (piece.toLowerCase() === 'p' && enPassantSquare && tr === enPassantSquare.row && tc === enPassantSquare.col) {
        board[sr][tc] = '';
    }

    if (piece.toLowerCase() === 'p' && Math.abs(tr - sr) === 2) {
        enPassantSquare = { row: (sr + tr) / 2, col: sc };
    } else {
        enPassantSquare = null;
    }

    if (piece === 'K') { castlingRights.K = false; castlingRights.Q = false; }
    if (piece === 'k') { castlingRights.k = false; castlingRights.q = false; }
    if (piece === 'R' && sr === 7 && sc === 0) castlingRights.Q = false;
    if (piece === 'R' && sr === 7 && sc === 7) castlingRights.K = false;
    if (piece === 'r' && sr === 0 && sc === 0) castlingRights.q = false;
    if (piece === 'r' && sr === 0 && sc === 7) castlingRights.k = false;

    board[tr][tc] = piece;
    board[sr][sc] = '';

    if (piece === 'P' && tr === 0) board[tr][tc] = 'Q';
    if (piece === 'p' && tr === 7) board[tr][tc] = 'q';

    turn = turn === 'white' ? 'black' : 'white';
}

function updateMoveHistoryDisplay() {
    let listEl = document.getElementById('moveHistoryList') || document.getElementById('move-history');
    if (!listEl) return;
    listEl.innerHTML = '';
    for (let i = 0; i < historyLog.length; i += 2) {
        let moveNum = Math.floor(i / 2) + 1;
        let whiteMove = historyLog[i] || '';
        let blackMove = historyLog[i + 1] || '';
        let div = document.createElement('div');
        div.style.padding = '4px 0';
        div.innerText = `${moveNum}. ${whiteMove}   ${blackMove}`;
        listEl.appendChild(div);
    }
    listEl.scrollTop = listEl.scrollHeight;
}

window.undoMove = function() {
    if (moveHistory.length === 0 || !gameActive) return;
    if (gameMode === 'friend') {
        alert('Undo is disabled in multiplayer mode');
        return;
    }
    
    let stepsToUndo = (turn === playerColor && moveHistory.length >= 2) ? 2 : 1;
    if (stepsToUndo > moveHistory.length) stepsToUndo = moveHistory.length;

    for (let i = 0; i < stepsToUndo; i++) {
        let prevState = moveHistory.pop();
        if (prevState) {
            board = prevState.board;
            turn = prevState.turn;
            castlingRights = prevState.castlingRights;
            enPassantSquare = prevState.enPassantSquare;
            historyLog = historyLog.slice(0, prevState.historyLogLength);
        }
    }
    selectedSquare = null;
    validMoves = [];
    hintSquare = null;
    updateMoveHistoryDisplay();
    renderBoard();
}

window.resignGame = function() {
    if (!gameActive) return;
    gameActive = false;
    showGameOverModal("Resignation", `You resigned. Opponent wins the match!`);
}

function showGameOverModal(title, message) {
    let titleEl = document.getElementById('gameOverTitle');
    let msgEl = document.getElementById('gameOverMessage');
    let modalEl = document.getElementById('gameOverModal');
    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;
    if (modalEl) {
        modalEl.style.display = 'flex';
    } else {
        alert(`${title}: ${message}`);
    }
}

window.requestHint = function() {
    if (!stockfish || !gameActive || turn !== playerColor) return;
    isHintActive = true;
    let fen = getFen();
    stockfish.postMessage('position fen ' + fen);
    stockfish.postMessage('go movetime 400');
}

function showHintMove(bestMoveStr) {
    let sc = bestMoveStr.charCodeAt(0) - 97;
    let sr = 8 - parseInt(bestMoveStr[1]);
    let tc = bestMoveStr.charCodeAt(2) - 97;
    let tr = 8 - parseInt(bestMoveStr[3]);
    hintSquare = { row: tr, col: tc };
    renderBoard();
}

function triggerFallbackBotMove() {
    if (!gameActive || gameMode !== 'bot') return;
    let allMoves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let piece = board[r][c];
            if (piece && ((turn === 'white' && piece === piece.toUpperCase()) || (turn === 'black' && piece === piece.toLowerCase()))) {
                let moves = getValidMoves(r, c);
                for (let i = 0; i < moves.length; i++) {
                    let m = moves[i];
                    allMoves.push({ sr: r, sc: c, tr: m.row, tc: m.col });
                }
            }
        }
    }
    if (allMoves.length > 0) {
        let randomMove = allMoves[Math.floor(Math.random() * allMoves.length)];
        animateAndMakeMove(randomMove.sr, randomNode.sc, randomMove.tr, randomMove.tc, function() {
            checkGameEndConditions();
        }, false);
    }
}

function triggerBotMove() {
    if (!gameActive || gameMode !== 'bot') return;
    
    if (!stockfish) {
        setTimeout(triggerFallbackBotMove, 300);
        return;
    }

    let skillLevel = 20;
    let movetime = 1000;

    if (selectedBotRating <= 800) {
        skillLevel = 1;
        movetime = 300;
    } else if (selectedBotRating <= 1200) {
        skillLevel = 5;
        movetime = 500;
    } else if (selectedBotRating <= 1600) {
        skillLevel = 12;
        movetime = 800;
    } else {
        skillLevel = 20;
        movetime = 1200;
    }

    stockfish.postMessage('setoption name Skill Level value ' + skillLevel);
    let fen = getFen();
    stockfish.postMessage('position fen ' + fen);
    stockfish.postMessage('go movetime ' + movetime);
}

function executeEngineMove(bestMoveStr) {
    if (bestMoveStr === '(none)' || !gameActive || gameMode !== 'bot') return;

    let sc = bestMoveStr.charCodeAt(0) - 97;
    let sr = 8 - parseInt(bestMoveStr[1]);
    let tc = bestMoveStr.charCodeAt(2) - 97;
    let tr = 8 - parseInt(bestMoveStr[3]);

    animateAndMakeMove(sr, sc, tr, tc, function() {
        checkGameEndConditions();
    }, false);
}

function checkGameEndConditions() {
    if (!hasAnyLegalMoves(turn)) {
        gameActive = false;
        let inCheck = isKingPosAttacked(board, turn, turn === 'white' ? 'black' : 'white');
        setTimeout(() => {
            if (inCheck) {
                let winner = turn === 'white' ? 'Black' : 'White';
                showGameOverModal("Checkmate!", `${winner} wins by checkmate.`);
            } else {
                showGameOverModal("Stalemate!", `Game drawn by stalemate.`);
            }
        }, 150);
    }
}

function getFen() {
    let fen = '';
    for (let r = 0; r < 8; r++) {
        let emptyCount = 0;
        for (let c = 0; c < 8; c++) {
            let p = board[r][c];
            if (!p) {
                emptyCount++;
            } else {
                if (emptyCount > 0) { fen += emptyCount; emptyCount = 0; }
                fen += p;
            }
        }
        if (emptyCount > 0) fen += emptyCount;
        if (r < 7) fen += '/';
    }
    let castlingStr = '';
    if (castlingRights.K) castlingStr += 'K';
    if (castlingRights.Q) castlingStr += 'Q';
    if (castlingRights.k) castlingStr += 'k';
    if (castlingRights.q) castlingStr += 'q';
    if (castlingStr === '') castlingStr = '-';

    let epStr = '-';
    if (enPassantSquare) {
        let fileChar = String.fromCharCode(97 + enPassantSquare.col);
        let rankNum = 8 - enPassantSquare.row;
        epStr = fileChar + rankNum;
    }

    fen += ` ${turn[0]} ${castlingStr} ${epStr} 0 1`;
    return fen;
}

function getValidMoves(row, col) {
    let piece = board[row][col];
    if (!piece) return [];
    let color = piece === piece.toUpperCase() ? 'white' : 'black';
    let rawMoves = [];
    let p = piece.toLowerCase();

    if (p === 'p') {
        let dir = color === 'white' ? -1 : 1;
        let startRow = color === 'white' ? 6 : 1;
        let r = row + dir;
        if (r >= 0 && r < 8 && !board[r][col]) {
            rawMoves.push({ row: r, col: col });
            if (row === startRow && !board[row + 2 * dir][col] && !board[r][col]) {
                rawMoves.push({ row: row + 2 * dir, col: col });
            }
        }
        for (let i = 0; i < 2; i++) {
            let dc = (i === 0 ? -1 : 1);
            let c = col + dc;
            if (c >= 0 && c < 8 && r >= 0 && r < 8) {
                let target = board[r][c];
                if (target && (target === target.toUpperCase() ? 'white' : 'black') !== color) {
                    rawMoves.push({ row: r, col: c });
                }
                if (enPassantSquare && enPassantSquare.row === r && enPassantSquare.col === c) {
                    rawMoves.push({ row: r, col: c });
                }
            }
        }
    } else if (p === 'n') {
        let steps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (let i = 0; i < steps.length; i++) {
            let s = steps[i];
            let r = row + s[0], c = col + s[1];
            if (r >= 0 && r < 8 && c >= 0 && c < 8) {
                let target = board[r][c];
                if (!target || (target === target.toUpperCase() ? 'white' : 'black') !== color) {
                    rawMoves.push({ row: r, col: c });
                }
            }
        }
    } else if (p === 'b' || p === 'r' || p === 'q') {
        let dirs = [];
        if (p === 'b' || p === 'q') dirs.push([-1,-1], [-1,1], [1,-1], [1,1]);
        if (p === 'r' || p === 'q') dirs.push([-1,0], [1,0], [0,-1], [0,1]);
        for (let i = 0; i < dirs.length; i++) {
            let d = dirs[i];
            let r = row + d[0], c = col + d[1];
            while (r >= 0 && r < 8 && c >= 0 && c < 8) {
                let target = board[r][c];
                if (!target) {
                    rawMoves.push({ row: r, col: c });
                } else {
                    if ((target === target.toUpperCase() ? 'white' : 'black') !== color) {
                        rawMoves.push({ row: r, col: c });
                    }
                    break;
                }
                r += d[0]; c += d[1];
            }
        }
    } else if (p === 'k') {
        let dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (let i = 0; i < dirs.length; i++) {
            let d = dirs[i];
            let r = row + d[0], c = col + d[1];
            if (r >= 0 && r < 8 && c >= 0 && c < 8) {
                let target = board[r][c];
                if (!target || (target === target.toUpperCase() ? 'white' : 'black') !== color) {
                    rawMoves.push({ row: r, col: c });
                }
            }
        }
        let oppColor = color === 'white' ? 'black' : 'white';
        if (color === 'white' && row === 7 && col === 4) {
            if (castlingRights.K && !board[7][5] && !board[7][6] && !isSquareAttackedOnBoard(board, 7, 4, oppColor) && !isSquareAttackedOnBoard(board, 7, 5, oppColor) && !isSquareAttackedOnBoard(board, 7, 6, oppColor)) {
                rawMoves.push({ row: 7, col: 6 });
            }
            if (castlingRights.Q && !board[7][1] && !board[7][2] && !board[7][3] && !isSquareAttackedOnBoard(board, 7, 4, oppColor) && !isSquareAttackedOnBoard(board, 7, 3, oppColor) && !isSquareAttackedOnBoard(board, 7, 2, oppColor)) {
                rawMoves.push({ row: 7, col: 2 });
            }
        } else if (color === 'black' && row === 0 && col === 4) {
            if (castlingRights.k && !board[0][5] && !board[0][6] && !isSquareAttackedOnBoard(board, 0, 4, oppColor) && !isSquareAttackedOnBoard(board, 0, 5, oppColor) && !isSquareAttackedOnBoard(board, 0, 6, oppColor)) {
                rawMoves.push({ row: 0, col: 6 });
            }
            if (castlingRights.q && !board[0][1] && !board[0][2] && !board[0][3] && !isSquareAttackedOnBoard(board, 0, 4, oppColor) && !isSquareAttackedOnBoard(board, 0, 3, oppColor) && !isSquareAttackedOnBoard(board, 0, 2, oppColor)) {
                rawMoves.push({ row: 0, col: 2 });
            }
        }
    }

    let legalMoves = [];
    for (let i = 0; i < rawMoves.length; i++) {
        let m = rawMoves[i];
        let tempBoard = board.map(r => r.slice());
        tempBoard[m.row][m.col] = tempBoard[row][col];
        tempBoard[row][col] = '';

        if (!isKingPosAttacked(tempBoard, color, color === 'white' ? 'black' : 'white')) {
            legalMoves.push(m);
        }
    }
    return legalMoves;
}

function isSquareAttackedOnBoard(b, r, c, attackerColor) {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            let piece = b[row][col];
            if (!piece) continue;
            let pColor = piece === piece.toUpperCase() ? 'white' : 'black';
            if (pColor === attackerColor) {
                if (canPieceAttackSquare(b, row, col, r, c)) return true;
            }
        }
    }
    return false;
}

function canPieceAttackSquare(b, sr, sc, tr, tc) {
    let piece = b[sr][sc].toLowerCase();
    let color = b[sr][sc] === b[sr][sc].toUpperCase() ? 'white' : 'black';
    if (piece === 'p') {
        let dir = color === 'white' ? -1 : 1;
        return tr === sr + dir && Math.abs(tc - sc) === 1;
    }
    if (piece === 'n') {
        let dr = Math.abs(tr - sr), dc = Math.abs(tc - sc);
        return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
    }
    if (piece === 'k') {
        return Math.abs(tr - sr) <= 1 && Math.abs(tc - sc) <= 1;
    }
    if (piece === 'b' || piece === 'r' || piece === 'q') {
        let dr = tr - sr, dc = tc - sc;
        if (piece === 'b' && Math.abs(dr) !== Math.abs(dc)) return false;
        if (piece === 'r' && dr !== 0 && dc !== 0) return false;
        if (piece === 'q' && Math.abs(dr) !== Math.abs(dc) && dr !== 0 && dc !== 0) return false;
        
        let stepR = dr === 0 ? 0 : dr / Math.abs(dr);
        let stepC = dc === 0 ? 0 : dc / Math.abs(dc);
        let currR = sr + stepR, currC = sc + stepC;
        while (currR !== tr || currC !== tc) {
            let target = b[currR][currC];
            if (target && target !== '') return false;
            currR += stepR; currC += stepC;
        }
        return true;
    }
    return false;
}

function isKingPosAttacked(b, color, attackerColor) {
    let kingChar = color === 'white' ? 'K' : 'k';
    let kr = -1, kc = -1;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (b[r][c] === kingChar) { kr = r; kc = c; break; }
        }
    }
    if (kr === -1) return false;
    return isSquareAttackedOnBoard(b, kr, kc, attackerColor);
}

function hasAnyLegalMoves(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let piece = board[r][c];
            if (piece && ((color === 'white' && piece === piece.toUpperCase()) || (color === 'black' && piece === piece.toLowerCase()))) {
                let moves = getValidMoves(r, c);
                if (moves.length > 0) return true;
            }
        }
    }
    return false;
}

// Online Private Room Logic
window.createPrivateGame = function() {
    if (!socket) return alert('Server Connection Lost! Run node server.js');
    gameMode = 'friend';
    socket.emit('create-room');
}

window.joinPrivateGame = function() {
    if (!socket) return alert('Server Connection Lost! Run node server.js');
    let codeInput = document.getElementById('roomCodeInput');
    let code = codeInput ? codeInput.value.trim().toUpperCase() : '';
    if (!code) return alert('Please enter a room code!');
    
    gameMode = 'friend';
    socket.emit('join-room', code);
}

if (socket) {
    socket.on('room-created', (data) => {
        playerColor = data.color;
        myRoomId = data.roomId;
        let statusText = document.getElementById('roomStatusText');
        if (statusText) statusText.innerText = `Room Code: ${myRoomId} (Share this with friend)`;
    });

    socket.on('game-start', (data) => {
        myRoomId = data.roomId;
        gameMode = 'friend';
        playerColor = data.color;
        
        let oppName = document.getElementById('opponentNameText');
        if (oppName) oppName.innerText = "Friend (Online)";

        let startScreen = document.getElementById('startScreen');
        let gameScreen = document.getElementById('gameScreen');
        if (startScreen) startScreen.style.display = 'none';
        if (gameScreen) gameScreen.style.display = 'flex';
        
        startGame();
    });

    socket.on('opp-move', (moveData) => {
        animateAndMakeMove(moveData.sr, moveData.sc, moveData.tr, moveData.tc, function() {
            checkGameEndConditions();
        }, false);
    });

    socket.on('room-error', (err) => {
        alert(err);
    });
}