
import { COLS, ROWS, SHAPES, WALL_KICK_DATA, KICK_MAP } from './constants';
import type { PieceType } from './constants';

export interface Piece {
  type: PieceType;
  rotation: number;
  x: number;
  y: number;
  shape: number[][];
}

export class TetrisEngine {
  grid: (string | null)[][];
  currentPiece: Piece | null = null;
  holdPiece: PieceType | null = null;
  canHold: boolean = true;
  nextQueue: PieceType[] = [];
  bag: PieceType[] = [];
  score: number = 0;
  linesCleared: number = 0;
  combo: number = -1;
  isGameOver: boolean = false;
  b2b: boolean = false;
  garbageQueue: number[] = [];
  private lastMoveWasRotate: boolean = false;
  
  // Lock delay properties
  lockDelayTimeout: number | null = null;
  lockMovements: number = 0;
  lowestY: number = 0;
  onStateChange?: () => void;

  constructor() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.refillBag();
    this.nextQueue = [...this.pullFromBag(5)];
    this.spawnPiece();
  }

  private refillBag() {
    const pieces: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    this.bag = [...pieces].sort(() => Math.random() - 0.5);
  }

  reset() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.currentPiece = null;
    this.holdPiece = null;
    this.canHold = true;
    this.score = 0;
    this.linesCleared = 0;
    this.combo = -1;
    this.isGameOver = false;
    this.b2b = false;
    this.garbageQueue = [];
    this.lastMoveWasRotate = false;
    this.clearLockDelay();
    
    this.refillBag();
    this.nextQueue = [...this.pullFromBag(5)];
    this.spawnPiece();
  }

  private pullFromBag(count: number): PieceType[] {
    const pulled: PieceType[] = [];
    for (let i = 0; i < count; i++) {
      if (this.bag.length === 0) this.refillBag();
      pulled.push(this.bag.pop()!);
    }
    return pulled;
  }

  spawnPiece() {
    const type = this.nextQueue.shift()!;
    if (this.nextQueue.length < 5) {
      this.nextQueue.push(...this.pullFromBag(1));
    }

    this.currentPiece = {
      type,
      rotation: 0,
      x: Math.floor(COLS / 2) - Math.floor(SHAPES[type][0][0].length / 2),
      y: 0,
      shape: SHAPES[type][0],
    };

    this.lowestY = this.currentPiece.y;
    this.lockMovements = 0;
    this.clearLockDelay();

    if (this.checkCollision(this.currentPiece.x, this.currentPiece.y, this.currentPiece.shape)) {
      this.isGameOver = true;
      this.onGameOver?.();
    }
    this.canHold = true;
    this.lastMoveWasRotate = false;
    this.updateLockDelay();
  }

  destroy() {
    this.clearLockDelay();
  }

  private clearLockDelay() {
    if (this.lockDelayTimeout !== null) {
      window.clearTimeout(this.lockDelayTimeout);
      this.lockDelayTimeout = null;
    }
  }

  private resetLockDelay() {
    this.clearLockDelay();
    this.lockDelayTimeout = window.setTimeout(() => {
      // If we are still touching the ground and game is not over, lock it
      if (this.currentPiece && !this.isGameOver && this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.shape)) {
        this.lockPiece();
        this.onStateChange?.();
      }
    }, 500);
  }

  private updateLockDelay() {
    if (!this.currentPiece || this.isGameOver) return;
    
    if (this.currentPiece.y > this.lowestY) {
      this.lowestY = this.currentPiece.y;
      this.lockMovements = 0;
    }

    const isTouchingGround = this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.shape);

    if (isTouchingGround) {
      if (this.lockMovements >= 15) {
        this.lockPiece();
      } else {
        this.resetLockDelay();
      }
    } else {
      this.clearLockDelay();
    }
  }

  hold() {
    if (!this.canHold || !this.currentPiece) return;

    const currentType = this.currentPiece.type;
    if (this.holdPiece === null) {
      this.holdPiece = currentType;
      this.spawnPiece();
    } else {
      const nextType = this.holdPiece;
      this.holdPiece = currentType;
      this.currentPiece = {
        type: nextType,
        rotation: 0,
        x: Math.floor(COLS / 2) - Math.floor(SHAPES[nextType][0][0].length / 2),
        y: 0,
        shape: SHAPES[nextType][0],
      };
      this.lowestY = this.currentPiece.y;
      this.lockMovements = 0;
      this.updateLockDelay();
    }
    this.canHold = false;
    this.lastMoveWasRotate = false;
  }

  checkCollision(x: number, y: number, shape: number[][], grid = this.grid): boolean {
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const newX = x + col;
          const newY = y + row;
          if (
            newX < 0 ||
            newX >= COLS ||
            newY >= ROWS ||
            (newY >= 0 && grid[newY][newX] !== null)
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  move(dx: number, dy: number): boolean {
    if (!this.currentPiece || this.isGameOver) return false;
    if (!this.checkCollision(this.currentPiece.x + dx, this.currentPiece.y + dy, this.currentPiece.shape)) {
      this.currentPiece.x += dx;
      this.currentPiece.y += dy;
      if (dx !== 0 || dy !== 0) {
        this.lastMoveWasRotate = false;
        if (dx !== 0) {
          this.onMove?.();
          if (this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.shape)) {
            this.lockMovements++;
          }
        }
      }
      this.updateLockDelay();
      return true;
    }
    
    if (dy > 0) {
      // Trying to move down but blocked -> hit the floor
      if (this.lockMovements >= 15) {
        this.lockPiece();
      } else {
        if (!this.lockDelayTimeout) {
          this.updateLockDelay();
        }
      }
    }
    return false;
  }

  rotate(clockwise: boolean) {
    if (!this.currentPiece || this.isGameOver || this.currentPiece.type === 'O') return;

    const fromRotation = this.currentPiece.rotation;
    const toRotation = (fromRotation + (clockwise ? 1 : 3)) % 4;
    const newShape = SHAPES[this.currentPiece.type][toRotation];
    
    const kickKey = `${fromRotation}-${toRotation}`;
    const kickData = WALL_KICK_DATA[this.currentPiece.type === 'I' ? 'I' : 'normal'][KICK_MAP[kickKey]];

    for (const [kx, ky] of kickData) {
      if (!this.checkCollision(this.currentPiece.x + kx, this.currentPiece.y - ky, newShape)) {
        this.currentPiece.x += kx;
        this.currentPiece.y -= ky;
        this.currentPiece.rotation = toRotation;
        this.currentPiece.shape = newShape;
        this.lastMoveWasRotate = true;
        this.onRotate?.();

        if (this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.shape)) {
          this.lockMovements++;
        }
        
        this.updateLockDelay();
        return;
      }
    }
  }

  hardDrop() {
    if (!this.currentPiece || this.isGameOver) return;
    this.clearLockDelay();
    while (!this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.shape)) {
      this.currentPiece.y++;
      this.lastMoveWasRotate = false;
    }
    this.lockPiece();
  }

  getGhostY(): number {
    if (!this.currentPiece) return 0;
    let ghostY = this.currentPiece.y;
    while (!this.checkCollision(this.currentPiece.x, ghostY + 1, this.currentPiece.shape)) {
      ghostY++;
    }
    return ghostY;
  }

  private checkTSpin(): boolean {
    if (!this.currentPiece || this.currentPiece.type !== 'T' || !this.lastMoveWasRotate) return false;
    
    const { x, y } = this.currentPiece;
    const corners = [
      { nx: x, ny: y },
      { nx: x + 2, ny: y },
      { nx: x, ny: y + 2 },
      { nx: x + 2, ny: y + 2 }
    ];
    
    let occupied = 0;
    corners.forEach(c => {
      if (c.nx < 0 || c.nx >= COLS || c.ny >= ROWS || (c.ny >= 0 && this.grid[c.ny][c.nx] !== null)) {
        occupied++;
      }
    });
    
    return occupied >= 3;
  }

  private lockPiece() {
    if (!this.currentPiece) return;
    this.clearLockDelay();
    const isTSpin = this.checkTSpin();

    this.currentPiece.shape.forEach((row, rIdx) => {
      row.forEach((cell, cIdx) => {
        if (cell) {
          const y = this.currentPiece!.y + rIdx;
          const x = this.currentPiece!.x + cIdx;
          if (y >= 0 && y < ROWS) {
            this.grid[y][x] = this.currentPiece!.type;
          }
        }
      });
    });

    this.onLock?.();
    this.clearLines(isTSpin);
    this.applyGarbage();
    this.spawnPiece();
  }

  private clearLines(isTSpin: boolean) {
    const linesToClear: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.grid[y].every(cell => cell !== null)) {
        linesToClear.push(y);
      }
    }

    if (linesToClear.length > 0) {
      this.linesCleared += linesToClear.length;
      this.onClear?.(linesToClear.length);
      linesToClear.forEach(y => {
        this.grid.splice(y, 1);
        this.grid.unshift(Array(COLS).fill(null));
      });
      this.combo++;
      this.calculateAttack(linesToClear.length, isTSpin);
    } else {
      this.combo = -1;
      if (isTSpin) this.calculateAttack(0, true);
    }
  }

  private calculateAttack(lines: number, isTSpin: boolean) {
    let attack = 0;
    
    if (isTSpin) {
      if (lines === 1) attack = 2;
      else if (lines === 2) attack = 4;
      else if (lines === 3) attack = 6;
      else attack = 0;
    } else {
      if (lines === 2) attack = 1;
      else if (lines === 3) attack = 2;
      else if (lines === 4) attack = 4;
    }

    const isPerfectClear = this.grid.every(row => row.every(cell => cell === null));
    if (isPerfectClear) attack += 10;

    if (lines === 4 || isTSpin) {
      if (this.b2b) attack += 1;
      this.b2b = true;
    } else if (lines > 0) {
      this.b2b = false;
    }

    if (this.combo > 0) {
      const comboAttack = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
      attack += comboAttack[Math.min(this.combo, comboAttack.length - 1)];
    }

    while (attack > 0 && this.garbageQueue.length > 0) {
      if (this.garbageQueue[0] <= attack) {
        attack -= this.garbageQueue.shift()!;
      } else {
        this.garbageQueue[0] -= attack;
        attack = 0;
      }
    }

    if (attack > 0) {
      this.onAttack?.(attack);
    }
  }

  onAttack?: (lines: number) => void;
  onMove?: () => void;
  onRotate?: () => void;
  onLock?: () => void;
  onClear?: (lines: number) => void;
  onGameOver?: () => void;

  receiveGarbage(lines: number) {
    this.garbageQueue.push(lines);
  }

  private applyGarbage() {
    if (this.garbageQueue.length === 0) return;
    
    const lines = this.garbageQueue.shift()!;
    const holeX = Math.floor(Math.random() * COLS);

    for (let i = 0; i < lines; i++) {
      this.grid.shift();
      const newRow = Array(COLS).fill('G');
      newRow[holeX] = null;
      this.grid.push(newRow);
    }
  }
}
