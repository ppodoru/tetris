
import React, { useEffect, useRef, useCallback } from 'react';
import { TetrisEngine } from '../engine';
import type { PieceType } from '../constants';
import { BLOCK_SIZE, COLS, ROWS, COLORS, SHAPES } from '../constants';

interface TetrisBoardProps {
  engine: TetrisEngine;
}

const PiecePreview: React.FC<{ type: PieceType | null }> = ({ type }) => {
  if (!type) return <div className="mini-grid" />;
  
  const shape = SHAPES[type][0]; // Show spawn rotation
  const previewBlockSize = 15;

  return (
    <div className="mini-grid" style={{ 
      position: 'relative', 
      width: '80px', 
      height: '60px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${shape[0].length}, ${previewBlockSize}px)`,
        gridTemplateRows: `repeat(${shape.length}, ${previewBlockSize}px)`,
        gap: '1px'
      }}>
        {shape.map((row, y) => 
          row.map((cell, x) => (
            <div key={`${x}-${y}`} style={{
              width: previewBlockSize,
              height: previewBlockSize,
              backgroundColor: cell ? COLORS[type] : 'transparent',
              border: cell ? '1px solid rgba(0,0,0,0.3)' : 'none'
            }} />
          ))
        )}
      </div>
    </div>
  );
};

const TetrisBoard: React.FC<TetrisBoardProps> = ({ engine }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Helper to draw a 3D looking block
    const drawBlock = (x: number, y: number, color: string) => {
      const px = x * BLOCK_SIZE;
      const py = y * BLOCK_SIZE;
      ctx.fillStyle = color;
      ctx.fillRect(px, py, BLOCK_SIZE, BLOCK_SIZE);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(px, py, BLOCK_SIZE, 3);
      ctx.fillRect(px, py, 3, BLOCK_SIZE);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(px, py + BLOCK_SIZE - 3, BLOCK_SIZE, 3);
      ctx.fillRect(px + BLOCK_SIZE - 3, py, 3, BLOCK_SIZE);
    };

    // Draw grid
    engine.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell) {
          drawBlock(x, y, cell === 'G' ? '#888' : COLORS[cell as PieceType]);
        }
      });
    });

    // Draw ghost piece
    if (engine.currentPiece && !engine.isGameOver) {
      const ghostY = engine.getGhostY();
      engine.currentPiece.shape.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cell) {
            const px = (engine.currentPiece!.x + cIdx) * BLOCK_SIZE;
            const py = (ghostY + rIdx) * BLOCK_SIZE;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(px, py, BLOCK_SIZE, BLOCK_SIZE);
            ctx.strokeStyle = COLORS[engine.currentPiece!.type];
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
            ctx.lineWidth = 1;
          }
        });
      });
    }

    // Draw current piece
    if (engine.currentPiece && !engine.isGameOver) {
      engine.currentPiece.shape.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cell) {
            drawBlock(
              engine.currentPiece!.x + cIdx,
              engine.currentPiece!.y + rIdx,
              COLORS[engine.currentPiece!.type]
            );
          }
        });
      });
    }
  }, [engine]);

  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      draw();
      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [draw]);

  return (
    <div className="board-container">
      <div className="board-info left">
        <div className="hold-box">
          <p>HOLD</p>
          <PiecePreview type={engine.holdPiece} />
        </div>
      </div>
      
      <canvas
        ref={canvasRef}
        width={COLS * BLOCK_SIZE}
        height={ROWS * BLOCK_SIZE}
        className="game-canvas"
      />

      <div className="board-info right">
        <div className="next-box">
          <p>NEXT</p>
          {engine.nextQueue.slice(0, 5).map((type, i) => (
            <PiecePreview key={i} type={type} />
          ))}
        </div>
        <div className="stats">
          <p>COMBO: {engine.combo > 0 ? engine.combo : 0}</p>
          <p>B2B: {engine.b2b ? 'ON' : 'OFF'}</p>
        </div>
      </div>
    </div>
  );
};

export default TetrisBoard;
