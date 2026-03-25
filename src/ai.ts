
import type { TetrisEngine } from './engine';
import { COLS, ROWS, SHAPES } from './constants';

export class TetrisAI {
  // Pierre Dellacherie Heuristic Weights (Improved)
  private static WEIGHTS = {
    aggregateHeight: -0.510066,
    completeLines: 0.760666,
    holes: -0.35663,
    bumpiness: -0.184483
  };

  static evaluateGrid(grid: (string | null)[][], linesCleared: number) {
    const heights = this.getHeights(grid);
    const aggregateHeight = heights.reduce((sum, h) => sum + h, 0);
    const holes = this.countHoles(grid, heights);
    const bumpiness = this.getBumpiness(heights);

    return (
      this.WEIGHTS.aggregateHeight * aggregateHeight +
      this.WEIGHTS.completeLines * linesCleared +
      this.WEIGHTS.holes * holes +
      this.WEIGHTS.bumpiness * bumpiness
    );
  }

  private static getHeights(grid: (string | null)[][]): number[] {
    const heights = Array(COLS).fill(0);
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (grid[y][x] !== null) {
          heights[x] = ROWS - y;
          break;
        }
      }
    }
    return heights;
  }

  private static countHoles(grid: (string | null)[][], heights: number[]): number {
    let holes = 0;
    for (let x = 0; x < COLS; x++) {
      for (let y = ROWS - heights[x]; y < ROWS; y++) {
        if (grid[y][x] === null) {
          holes++;
        }
      }
    }
    return holes;
  }

  private static getBumpiness(heights: number[]): number {
    let bumpiness = 0;
    for (let i = 0; i < heights.length - 1; i++) {
      bumpiness += Math.abs(heights[i] - heights[i + 1]);
    }
    return bumpiness;
  }

  static findBestMove(engine: TetrisEngine): { x: number; rotation: number } | null {
    if (!engine.currentPiece) return null;

    let bestScore = -Infinity;
    let bestMove = null;
    const type = engine.currentPiece.type;

    // Test all rotations
    for (let rotation = 0; rotation < SHAPES[type].length; rotation++) {
      const shape = SHAPES[type][rotation];
      
      // Test all horizontal positions
      for (let x = -2; x < COLS; x++) {
        if (engine.checkCollision(x, 0, shape)) continue;

        // Simulate Hard Drop
        let y = 0;
        while (!engine.checkCollision(x, y + 1, shape)) {
          y++;
        }

        // Apply to a temporary grid and evaluate
        const tempGrid = engine.grid.map(row => [...row]);
        let linesCleared = 0;

        shape.forEach((row, rIdx) => {
          row.forEach((cell, cIdx) => {
            if (cell) {
              const ny = y + rIdx;
              const nx = x + cIdx;
              if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
                tempGrid[ny][nx] = type;
              }
            }
          });
        });

        // Check for cleared lines in temp grid
        for (let r = 0; r < ROWS; r++) {
          if (tempGrid[r].every(c => c !== null)) {
            tempGrid.splice(r, 1);
            tempGrid.unshift(Array(COLS).fill(null));
            linesCleared++;
          }
        }

        const score = this.evaluateGrid(tempGrid, linesCleared);
        if (score > bestScore) {
          bestScore = score;
          bestMove = { x, rotation };
        }
      }
    }

    return bestMove;
  }
}
