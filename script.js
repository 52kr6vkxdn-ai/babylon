
// Eclipse Tiles - Cinematic Puzzle Game
// Exported standalone version

const GRID_SIZE = 8;
const TOTAL_LEVELS = 1500;
const TILE_COLORS = [
  { name: 'red', color: '#FF6B6B' },
  { name: 'blue', color: '#4D96FF' },
  { name: 'green', color: '#6BCB77' },
  { name: 'yellow', color: '#FFD93D' },
  { name: 'purple', color: '#C9B1FF' },
];
const FEEDBACK_MESSAGES = ['Great!', 'Awesome!', 'Perfect!', 'Wow!', 'Good Job!'];

let audioContext = null;
let musicGainNode = null;
let sfxGainNode = null;
let isMusicPlaying = false;

// Game state
let currentScreen = 'home';
let currentLevel = 1;
let board = [];
let selected = null;
let progress = 0;
let moves = 30;
let animating = false;
let gameState = 'playing';
let combo = 0;
let gameProgress = loadProgress();

function loadProgress() {
  try {
    const saved = localStorage.getItem('eclipseTilesProgress');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return { unlockedLevel: 1, stars: {} };
}

function saveProgress() {
  try {
    localStorage.setItem('eclipseTilesProgress', JSON.stringify(gameProgress));
  } catch (e) {}
}

function getStarThresholds(level) {
  return {
    star1: 100 + level * 10,
    star2: 200 + level * 15,
    star3: 300 + level * 25,
  };
}

function getMoves(level) {
  return Math.max(15, 30 - Math.floor(level / 25));
}

function getLevelColor(level) {
  const colors = ['#FF6B6B', '#4D96FF', '#6BCB77', '#FFD93D', '#C9B1FF', '#FF8E53', '#00D9FF', '#FF6B9D', '#7BED9F', '#FFA502'];
  return colors[Math.floor((level - 1) / 150) % colors.length];
}

function getRandomTile() {
  return {
    colorType: TILE_COLORS[Math.floor(Math.random() * TILE_COLORS.length)].name,
    special: null,
    id: Math.random().toString(36).substr(2, 9),
  };
}

// Audio functions
async function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    musicGainNode = audioContext.createGain();
    sfxGainNode = audioContext.createGain();
    musicGainNode.connect(audioContext.destination);
    sfxGainNode.connect(audioContext.destination);
    musicGainNode.gain.value = 0.3;
    sfxGainNode.gain.value = 0.5;
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
}

function createTone(frequency, duration, type = 'sine') {
  if (!audioContext || !sfxGainNode) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(0.3, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
  osc.connect(gain);
  gain.connect(sfxGainNode);
  osc.start();
  osc.stop(audioContext.currentTime + duration);
}

function playSwipe() {
  initAudio().then(() => {
    if (!audioContext || !sfxGainNode) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(sfxGainNode);
    osc.start();
    osc.stop(audioContext.currentTime + 0.1);
  });
}

function playMatch() {
  initAudio().then(() => {
    createTone(523.25, 0.15, 'sine');
    setTimeout(() => createTone(659.25, 0.15, 'sine'), 50);
    setTimeout(() => createTone(783.99, 0.2, 'sine'), 100);
  });
}

function playExplosion() {
  initAudio().then(() => {
    if (!audioContext || !sfxGainNode) return;
    const bufferSize = audioContext.sampleRate * 0.3;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, audioContext.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.4, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGainNode);
    noise.start();
    noise.stop(audioContext.currentTime + 0.3);
    createTone(80, 0.3, 'sine');
    createTone(60, 0.4, 'sine');
  });
}

function playSelect() {
  initAudio().then(() => createTone(600, 0.08, 'sine'));
}

function playInvalid() {
  initAudio().then(() => {
    createTone(200, 0.1, 'square');
    setTimeout(() => createTone(150, 0.15, 'square'), 100);
  });
}

function playWin() {
  initAudio().then(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      setTimeout(() => createTone(freq, 0.3, 'sine'), i * 150);
    });
    setTimeout(() => {
      createTone(1046.5, 0.5, 'sine');
      createTone(783.99, 0.5, 'sine');
    }, 600);
  });
}

function playLose() {
  initAudio().then(() => {
    createTone(400, 0.2, 'sine');
    setTimeout(() => createTone(350, 0.2, 'sine'), 200);
    setTimeout(() => createTone(300, 0.3, 'sine'), 400);
    setTimeout(() => createTone(250, 0.4, 'sine'), 600);
  });
}

function playCombo(level) {
  initAudio().then(() => {
    const baseFreq = 400 + level * 100;
    createTone(baseFreq, 0.1, 'sine');
    setTimeout(() => createTone(baseFreq * 1.25, 0.1, 'sine'), 50);
    setTimeout(() => createTone(baseFreq * 1.5, 0.15, 'sine'), 100);
    if (level >= 3) setTimeout(() => createTone(baseFreq * 2, 0.2, 'triangle'), 150);
  });
}

function playMusicLoop() {
  if (!audioContext || !musicGainNode || !isMusicPlaying) return;
  const notes = [110, 146.83, 164.81, 220];
  const duration = 4;
  notes.forEach((freq, index) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = index % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();
    lfo.frequency.value = 0.5;
    lfoGain.gain.value = 2;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();
    gain.gain.setValueAtTime(0.01, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + 1);
    gain.gain.linearRampToValueAtTime(0.01, audioContext.currentTime + duration);
    osc.connect(gain);
    gain.connect(musicGainNode);
    osc.start();
    osc.stop(audioContext.currentTime + duration);
    setTimeout(() => lfo.stop(), duration * 1000);
  });
  setTimeout(() => { if (isMusicPlaying) playMusicLoop(); }, (duration - 0.5) * 1000);
}

function startMusic() {
  initAudio().then(() => {
    if (!isMusicPlaying) {
      isMusicPlaying = true;
      playMusicLoop();
    }
  });
}

// Game logic
function checkMatch(board, row, col, colorType) {
  if (!colorType) return false;
  let hCount = 1;
  for (let c = col - 1; c >= 0 && board[row][c]?.colorType === colorType; c--) hCount++;
  for (let c = col + 1; c < GRID_SIZE && board[row][c]?.colorType === colorType; c++) hCount++;
  if (hCount >= 3) return true;
  let vCount = 1;
  for (let r = row - 1; r >= 0 && board[r][col]?.colorType === colorType; r--) vCount++;
  for (let r = row + 1; r < GRID_SIZE && board[r][col]?.colorType === colorType; r++) vCount++;
  return vCount >= 3;
}

function initializeBoard() {
  const newBoard = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      let tile, attempts = 0;
      do {
        tile = getRandomTile();
        newBoard[row][col] = tile;
        attempts++;
      } while (checkMatch(newBoard, row, col, tile.colorType) && attempts < 100);
    }
  }
  return newBoard;
}

function findAllMatches(board) {
  const matchGroups = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE - 2; col++) {
      const tile = board[row][col];
      if (!tile) continue;
      const group = [{ row, col }];
      let c = col + 1;
      while (c < GRID_SIZE && board[row][c]?.colorType === tile.colorType) {
        group.push({ row, col: c });
        c++;
      }
      if (group.length >= 3) {
        matchGroups.push({ cells: group, colorType: tile.colorType });
        col = c - 1;
      }
    }
  }
  for (let col = 0; col < GRID_SIZE; col++) {
    for (let row = 0; row < GRID_SIZE - 2; row++) {
      const tile = board[row][col];
      if (!tile) continue;
      const group = [{ row, col }];
      let r = row + 1;
      while (r < GRID_SIZE && board[r][col]?.colorType === tile.colorType) {
        group.push({ row: r, col });
        r++;
      }
      if (group.length >= 3) {
        matchGroups.push({ cells: group, colorType: tile.colorType });
        row = r - 1;
      }
    }
  }
  return matchGroups;
}

function activateRowClear(board, row) {
  const positions = [];
  for (let c = 0; c < GRID_SIZE; c++) {
    if (board[row][c]) positions.push({ row, col: c });
  }
  return positions;
}

function activateColorBomb(board, targetColor) {
  const positions = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (board[r][c]?.colorType === targetColor) {
        positions.push({ row: r, col: c });
      }
    }
  }
  return positions;
}

function isAdjacent(pos1, pos2) {
  return Math.abs(pos1.col - pos2.col) + Math.abs(pos1.row - pos2.row) === 1;
}

function swapTiles(board, pos1, pos2) {
  const newBoard = board.map(row => [...row]);
  const temp = newBoard[pos1.row][pos1.col];
  newBoard[pos1.row][pos1.col] = newBoard[pos2.row][pos2.col];
  newBoard[pos2.row][pos2.col] = temp;
  return newBoard;
}

function dropTiles(board) {
  const newBoard = board.map(row => [...row]);
  for (let col = 0; col < GRID_SIZE; col++) {
    let emptyRow = GRID_SIZE - 1;
    for (let row = GRID_SIZE - 1; row >= 0; row--) {
      if (newBoard[row][col]) {
        if (row !== emptyRow) {
          newBoard[emptyRow][col] = newBoard[row][col];
          newBoard[row][col] = null;
        }
        emptyRow--;
      }
    }
  }
  return newBoard;
}

function fillEmptyTiles(board) {
  const newBoard = board.map(row => [...row]);
  for (let col = 0; col < GRID_SIZE; col++) {
    for (let row = 0; row < GRID_SIZE; row++) {
      if (!newBoard[row][col]) {
        let newTile, attempts = 0;
        do {
          newTile = getRandomTile();
          newBoard[row][col] = newTile;
          attempts++;
        } while (checkMatch(newBoard, row, col, newTile.colorType) && attempts < 50);
      }
    }
  }
  return newBoard;
}

// Rendering
function createStars() {
  const container = document.querySelector('.stars-bg');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 50; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.style.width = (Math.random() * 3 + 1) + 'px';
    star.style.height = star.style.width;
    star.style.left = (Math.random() * 100) + '%';
    star.style.top = (Math.random() * 100) + '%';
    star.style.animationDelay = (Math.random() * 2) + 's';
    star.style.opacity = Math.random() * 0.5 + 0.3;
    container.appendChild(star);
  }
}

function showFeedback(text) {
  const existing = document.querySelector('.feedback');
  if (existing) existing.remove();
  const feedback = document.createElement('div');
  feedback.className = 'feedback';
  feedback.textContent = text;
  document.querySelector('.board-container')?.appendChild(feedback);
  setTimeout(() => feedback.remove(), 1000);
}

function render() {
  const app = document.getElementById('app');
  
  if (currentScreen === 'home') {
    app.innerHTML = `
      <div class="game-container home-screen">
        <div class="stars-bg"></div>
        <h1 class="home-title">Eclipse</h1>
        <h2 class="home-subtitle">TILES</h2>
        <p class="home-desc">A Cinematic Puzzle Experience</p>
        <button class="btn btn-primary" onclick="goToLevels()">▶️ PLAY</button>
        <p style="color: rgba(255,255,255,0.3); font-size: 0.75rem; margin-top: 40px;">© 2024 Eclipse Tiles</p>
      </div>
    `;
    createStars();
    return;
  }
  
  if (currentScreen === 'levels') {
    let levelBtns = '';
    for (let i = 1; i <= Math.min(TOTAL_LEVELS, 100); i++) {
      const unlocked = i <= gameProgress.unlockedLevel;
      const stars = gameProgress.stars[i] || 0;
      const color = getLevelColor(i);
      levelBtns += `
        <button class="level-btn" 
          style="background: ${unlocked ? color : 'rgba(255,255,255,0.1)'}; color: ${unlocked ? '#000' : '#666'};"
          ${unlocked ? `onclick="startLevel(${i})"` : 'disabled'}>
          ${i}
          <span class="level-stars">${'⭐'.repeat(stars)}</span>
        </button>
      `;
    }
    app.innerHTML = `
      <div class="game-container">
        <div class="stars-bg"></div>
        <button class="btn btn-secondary back-btn" onclick="goToHome()">← Back</button>
        <h2 style="margin-bottom: 20px; z-index: 10;">Select Level</h2>
        <div class="level-grid">${levelBtns}</div>
      </div>
    `;
    createStars();
    return;
  }
  
  // Game screen
  const thresholds = getStarThresholds(currentLevel);
  const progressPercent = Math.min(100, (progress / thresholds.star3) * 100);
  
  let boardHtml = '';
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const tile = board[row][col];
      if (tile) {
        const isSelected = selected && selected.row === row && selected.col === col;
        const specialIcon = tile.special === 'rowClear' ? '⚡' : tile.special === 'colorBomb' ? '💣' : '';
        boardHtml += `
          <div class="tile tile-${tile.colorType} ${isSelected ? 'selected' : ''}" 
               data-row="${row}" data-col="${col}">
            ${specialIcon ? `<span class="special-icon">${specialIcon}</span>` : ''}
          </div>
        `;
      } else {
        boardHtml += '<div class="tile" style="opacity: 0;"></div>';
      }
    }
  }
  
  let modalHtml = '';
  if (gameState !== 'playing') {
    const earnedStars = progress >= thresholds.star3 ? 3 : progress >= thresholds.star2 ? 2 : progress >= thresholds.star1 ? 1 : 0;
    modalHtml = `
      <div class="modal-overlay">
        <div class="modal">
          <h2 class="modal-title">${gameState === 'won' ? 'Level Complete!' : 'Out of Moves!'}</h2>
          <div class="modal-stars">${'⭐'.repeat(earnedStars)}${'☆'.repeat(3 - earnedStars)}</div>
          <p class="modal-score">Score: ${progress}</p>
          <button class="btn btn-secondary" onclick="startLevel(currentLevel)">Restart</button>
          ${gameState === 'won' ? `<button class="btn btn-primary" onclick="startLevel(Math.min(currentLevel + 1, TOTAL_LEVELS))">Next Level</button>` : ''}
          <br><button class="btn btn-secondary" style="margin-top: 10px;" onclick="goToLevels()">Levels</button>
        </div>
      </div>
    `;
  }
  
  app.innerHTML = `
    <div class="game-container">
      <div class="stars-bg"></div>
      <button class="btn btn-secondary back-btn" onclick="goToLevels()">← Levels</button>
      <div class="header">
        <h1 class="title">Level ${currentLevel}</h1>
      </div>
      <div class="game-info">
        <div class="info-box">
          <div class="info-label">MOVES</div>
          <div class="info-value">${moves}</div>
        </div>
        <div class="info-box">
          <div class="info-label">SCORE</div>
          <div class="info-value">${progress}</div>
        </div>
        ${combo > 1 ? `<div class="info-box"><div class="info-label">COMBO</div><div class="info-value">x${combo}</div></div>` : ''}
      </div>
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
        <div class="star-markers">
          <span>⭐ ${thresholds.star1}</span>
          <span>⭐⭐ ${thresholds.star2}</span>
          <span>⭐⭐⭐ ${thresholds.star3}</span>
        </div>
      </div>
      <div class="board-container">
        <div class="board">${boardHtml}</div>
      </div>
      ${modalHtml}
    </div>
  `;
  createStars();
  
  // Add touch/click handlers
  document.querySelectorAll('.tile[data-row]').forEach(tile => {
    let startX, startY;
    tile.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    });
    tile.addEventListener('touchend', e => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - startX;
      const dy = endY - startY;
      const row = parseInt(tile.dataset.row);
      const col = parseInt(tile.dataset.col);
      if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
        if (Math.abs(dx) > Math.abs(dy)) {
          handleSwipe(row, col, dx > 0 ? 'right' : 'left');
        } else {
          handleSwipe(row, col, dy > 0 ? 'down' : 'up');
        }
      } else {
        handleClick(row, col);
      }
    });
    tile.addEventListener('click', () => {
      handleClick(parseInt(tile.dataset.row), parseInt(tile.dataset.col));
    });
  });
}

// Game actions
function goToHome() {
  currentScreen = 'home';
  render();
}

function goToLevels() {
  currentScreen = 'levels';
  startMusic();
  render();
}

function startLevel(level) {
  currentLevel = level;
  currentScreen = 'game';
  board = initializeBoard();
  selected = null;
  progress = 0;
  moves = getMoves(level);
  gameState = 'playing';
  combo = 0;
  render();
}

function handleClick(row, col) {
  if (animating || gameState !== 'playing') return;
  playSelect();
  if (!selected) {
    selected = { row, col };
    render();
    return;
  }
  if (isAdjacent(selected, { row, col })) {
    handleInteraction(selected, { row, col });
  } else {
    selected = { row, col };
    render();
  }
}

function handleSwipe(row, col, direction) {
  if (animating || gameState !== 'playing') return;
  let pos2;
  switch (direction) {
    case 'up': pos2 = { row: row - 1, col }; break;
    case 'down': pos2 = { row: row + 1, col }; break;
    case 'left': pos2 = { row, col: col - 1 }; break;
    case 'right': pos2 = { row, col: col + 1 }; break;
  }
  if (pos2.row < 0 || pos2.row >= GRID_SIZE || pos2.col < 0 || pos2.col >= GRID_SIZE) return;
  selected = null;
  handleInteraction({ row, col }, pos2);
}

async function handleInteraction(pos1, pos2) {
  animating = true;
  playSwipe();
  board = swapTiles(board, pos1, pos2);
  render();
  await sleep(150);
  
  // Check special tiles
  const tile1 = board[pos1.row][pos1.col];
  const tile2 = board[pos2.row][pos2.col];
  
  if (tile1?.special === 'colorBomb' && tile2) {
    playExplosion();
    const positions = activateColorBomb(board, tile2.colorType);
    positions.push(pos1);
    positions.forEach(p => board[p.row][p.col] = null);
    progress += positions.length * 15;
    showFeedback('Perfect!');
    render();
    await sleep(300);
    board = dropTiles(board);
    render();
    await sleep(150);
    board = fillEmptyTiles(board);
    await processMatches();
    moves--;
  } else if (tile2?.special === 'colorBomb' && tile1) {
    playExplosion();
    const positions = activateColorBomb(board, tile1.colorType);
    positions.push(pos2);
    positions.forEach(p => board[p.row][p.col] = null);
    progress += positions.length * 15;
    showFeedback('Perfect!');
    render();
    await sleep(300);
    board = dropTiles(board);
    render();
    await sleep(150);
    board = fillEmptyTiles(board);
    await processMatches();
    moves--;
  } else if (tile1?.special === 'rowClear') {
    playExplosion();
    const positions = activateRowClear(board, pos1.row);
    positions.forEach(p => board[p.row][p.col] = null);
    progress += positions.length * 10;
    showFeedback('Awesome!');
    render();
    await sleep(300);
    board = dropTiles(board);
    render();
    await sleep(150);
    board = fillEmptyTiles(board);
    await processMatches();
    moves--;
  } else if (tile2?.special === 'rowClear') {
    playExplosion();
    const positions = activateRowClear(board, pos2.row);
    positions.forEach(p => board[p.row][p.col] = null);
    progress += positions.length * 10;
    showFeedback('Awesome!');
    render();
    await sleep(300);
    board = dropTiles(board);
    render();
    await sleep(150);
    board = fillEmptyTiles(board);
    await processMatches();
    moves--;
  } else {
    const hasMatches = await processMatches();
    if (!hasMatches) {
      playInvalid();
      board = swapTiles(board, pos1, pos2);
      render();
      await sleep(150);
    } else {
      moves--;
    }
  }
  
  selected = null;
  animating = false;
  combo = 0;
  checkWinLose();
  render();
}

async function processMatches() {
  let hasMatches = true;
  let hadAnyMatches = false;
  let totalCombo = 0;
  
  while (hasMatches) {
    const matchGroups = findAllMatches(board);
    if (matchGroups.length === 0) {
      hasMatches = false;
      break;
    }
    
    hadAnyMatches = true;
    totalCombo++;
    combo = totalCombo;
    
    if (totalCombo > 1) playCombo(totalCombo);
    
    const matchedCells = new Set();
    let maxMatchSize = 0;
    
    matchGroups.forEach(group => {
      maxMatchSize = Math.max(maxMatchSize, group.cells.length);
      group.cells.forEach(cell => matchedCells.add(`${cell.row},${cell.col}`));
      
      if (group.cells.length === 4) {
        const lastCell = group.cells[group.cells.length - 1];
        const tile = board[lastCell.row][lastCell.col];
        if (tile) {
          tile.special = 'rowClear';
          matchedCells.delete(`${lastCell.row},${lastCell.col}`);
        }
      } else if (group.cells.length >= 5) {
        const lastCell = group.cells[group.cells.length - 1];
        const tile = board[lastCell.row][lastCell.col];
        if (tile) {
          tile.special = 'colorBomb';
          matchedCells.delete(`${lastCell.row},${lastCell.col}`);
        }
      }
    });
    
    if (maxMatchSize >= 5 || totalCombo >= 4) showFeedback('Perfect!');
    else if (maxMatchSize >= 4 || totalCombo >= 3) showFeedback('Awesome!');
    else if (totalCombo >= 2) showFeedback(FEEDBACK_MESSAGES[Math.floor(Math.random() * 2) + 3]);
    else if (maxMatchSize >= 3) showFeedback('Great!');
    
    playMatch();
    
    const basePoints = matchedCells.size * (5 + Math.floor(Math.random() * 6));
    const multiplier = totalCombo >= 3 ? 1.5 : 1;
    progress += Math.floor(basePoints * multiplier);
    
    matchedCells.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      board[r][c] = null;
    });
    
    render();
    await sleep(200);
    
    board = dropTiles(board);
    render();
    await sleep(150);
    
    board = fillEmptyTiles(board);
    render();
    await sleep(150);
  }
  
  return hadAnyMatches;
}

function checkWinLose() {
  if (gameState !== 'playing') return;
  const thresholds = getStarThresholds(currentLevel);
  const earnedStars = progress >= thresholds.star3 ? 3 : progress >= thresholds.star2 ? 2 : progress >= thresholds.star1 ? 1 : 0;
  
  if (moves <= 0 || earnedStars === 3) {
    if (earnedStars > 0) {
      if (currentLevel >= gameProgress.unlockedLevel) {
        gameProgress.unlockedLevel = Math.min(currentLevel + 1, TOTAL_LEVELS);
      }
      if (!gameProgress.stars[currentLevel] || gameProgress.stars[currentLevel] < earnedStars) {
        gameProgress.stars[currentLevel] = earnedStars;
      }
      saveProgress();
      gameState = 'won';
      playWin();
    } else if (moves <= 0) {
      gameState = 'lost';
      playLose();
    }
    render();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize
document.addEventListener('DOMContentLoaded', render);
