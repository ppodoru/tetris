
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';
import { TetrisEngine } from './engine';
import { TetrisAI } from './ai';
import TetrisBoard from './components/TetrisBoard';
import { SHAPES } from './constants';

const DAS_DELAY = 170; // Delayed Auto Shift
const ARR_INTERVAL = 30; // Auto Repeat Rate

export type KeyBindings = {
  left: string[];
  right: string[];
  down: string[];
  rotateCW: string[];
  rotateCCW: string[];
  hardDrop: string[];
  hold: string[];
};

const DEFAULT_BINDINGS: KeyBindings = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  down: ['ArrowDown', 'KeyS'],
  rotateCW: ['ArrowUp', 'KeyW', 'KeyX'],
  rotateCCW: ['KeyZ'],
  hardDrop: ['Space', 'Enter'],
  hold: ['ShiftLeft', 'ShiftRight', 'KeyC'],
};

function App() {
  const [bindings, setBindings] = useState<KeyBindings>(() => {
    const saved = localStorage.getItem('tetrisBindings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_BINDINGS;
      }
    }
    return DEFAULT_BINDINGS;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [rebindingKey, setRebindingKey] = useState<keyof KeyBindings | null>(null);
  const rebindingKeyRef = useRef<keyof KeyBindings | null>(null);
  useEffect(() => {
    localStorage.setItem('tetrisBindings', JSON.stringify(bindings));
  }, [bindings]);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const bgmRef = useRef<HTMLAudioElement | null>(null);

  const sounds = useMemo(() => {
    return {
      drop: new Audio('https://raw.githubusercontent.com/raimonvibe/Tetris2.0/master/drop.mp3'),
      gameover: new Audio('https://raw.githubusercontent.com/idonteatcookie/Tetris/master/audio/gameOver.mp3'),
      clear: new Audio('https://raw.githubusercontent.com/idonteatcookie/Tetris/master/audio/clearLine.mp3'),
    };
  }, []);

  const playSound = useCallback((name: keyof typeof sounds) => {
    if (isMutedRef.current) return;
    const sound = sounds[name];
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }, [sounds]);

  const [isGameStarted, setIsGameStarted] = useState(false);
  const [gameMode, setGameMode] = useState<'menu' | 'ai' | 'remote'>('menu');
  const [remoteStatus, setRemoteStatus] = useState<'disconnected' | 'waiting' | 'connected'>('disconnected');
  const [gameId, setGameId] = useState(0);

  // Player name & room system
  const [playerName, setPlayerName] = useState(() => {
    const saved = localStorage.getItem('tetrisPlayerName');
    if (saved) return saved;
    const defaultName = 'Player' + Math.floor(1000 + Math.random() * 9000);
    localStorage.setItem('tetrisPlayerName', defaultName);
    return defaultName;
  });
  const [opponentName, setOpponentName] = useState('');
  const [availableRooms, setAvailableRooms] = useState<Array<{code: string, hostName: string}>>([]);
  const [remoteError, setRemoteError] = useState('');
  const [lobbyView, setLobbyView] = useState<'none' | 'create' | 'join'>('none');
  const [leaderboardData, setLeaderboardData] = useState<Array<{name: string, wins: number, losses: number}>>([]);

  const gameResultReported = useRef(false);

  const appRef = useRef<HTMLDivElement>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const roomRef = useRef<string | null>(null);
  const gameModeRef = useRef(gameMode);

  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);

  useEffect(() => {
    if (gameMode === 'menu') {
      const s = io();
      s.on('leaderboard_data', (data) => {
        setLeaderboardData(data);
        s.disconnect();
      });
      s.emit('get_leaderboard');
      
      return () => {
        s.disconnect();
      };
    }
  }, [gameMode]);

  useEffect(() => {
    if (isGameStarted && appRef.current) {
      appRef.current.focus();
    }
  }, [isGameStarted]);

  const [, setTick] = useState(0);

  const [playerEngine, cpuEngine] = useMemo(() => {
    const p = new TetrisEngine();
    const c = new TetrisEngine();
    
    p.onAttack = (lines) => {
      if (gameModeRef.current !== 'remote') {
        c.receiveGarbage(lines);
      } else if (socketRef.current) {
        socketRef.current.emit("game_action", {
          room: roomRef.current,
          type: "attack",
          attack: lines
        });
      }
    };
    c.onAttack = (lines) => {
      if (gameModeRef.current !== 'remote') {
        p.receiveGarbage(lines);
      }
    };
    
    p.onLock = () => playSound('drop');
    p.onClear = () => playSound('clear');
    p.onGameOver = () => {
      playSound('gameover');
      bgmRef.current?.pause();
    };
    
    p.onStateChange = () => {
      setTick(t => t + 1);
      // Don't sync if the game is over, this prevents dead engines from sending empty grids 
      // immediately upon restarting and confusing the opponent.
      if (gameModeRef.current === 'remote' && socketRef.current) {
         socketRef.current.emit("game_action", {
           room: roomRef.current,
           type: "sync",
           state: {
             grid: p.grid,
             currentPiece: p.currentPiece,
             holdPiece: p.holdPiece,
             nextQueue: p.nextQueue,
             score: p.score,
             linesCleared: p.linesCleared,
             combo: p.combo,
             isGameOver: p.isGameOver,
             b2b: p.b2b,
             garbageQueue: p.garbageQueue
           }
         });
      }
    };
    c.onGameOver = () => {
      playSound('gameover');
      bgmRef.current?.pause();
    };
    c.onStateChange = () => setTick(t => t + 1);

    return [p, c];
  }, [playSound, gameId]);

  // Socket.IO listeners
  useEffect(() => {
    if (gameMode !== 'remote' || !socketRef.current) return;
    const socket = socketRef.current;
    
    const onGameOver = (data: { winner: string, loser: string }) => {
      // If we are the loser, we already know. But if we are the winner, we need to know.
      const isWinner = data.winner === playerName || data.winner === 'Player';
      const isLoser = data.loser === playerName || data.loser === 'Player';
      
      if (isWinner) {
        cpuEngine.isGameOver = true;
        playSound('gameover');
        bgmRef.current?.pause();
      } else if (isLoser) {
        playerEngine.isGameOver = true;
        // playerEngine.onGameOver will handle the sound and bgm pause
      }
      setTick(t => t + 1);
    };

    const onOpponentAction = (data: any) => {
      if (data.type === 'sync' && data.state) {
        const s = data.state;
        cpuEngine.grid = s.grid;
        cpuEngine.currentPiece = s.currentPiece;
        cpuEngine.holdPiece = s.holdPiece;
        cpuEngine.nextQueue = s.nextQueue;
        cpuEngine.score = s.score;
        cpuEngine.linesCleared = s.linesCleared;
        cpuEngine.combo = s.combo;
        cpuEngine.isGameOver = s.isGameOver;
        cpuEngine.b2b = s.b2b;
        cpuEngine.garbageQueue = s.garbageQueue;
        setTick(t => t + 1);
      } else if (data.type === 'attack') {
        playerEngine.receiveGarbage(data.attack);
        setTick(t => t + 1);
      } else if (data.type === 'restart') {
        // Force the opponent's engine to be game over immediately to stop processing
        cpuEngine.isGameOver = false; 
        playerEngine.isGameOver = false;
        setGameId(id => id + 1);
      }
    };

    const onOpponentDisconnected = () => {
      setRemoteStatus('disconnected');
    };

    socket.on('opponent_action', onOpponentAction);
    socket.on('opponent_disconnected', onOpponentDisconnected);
    socket.on('game_over', onGameOver);
    
    return () => {
      socket.off('opponent_action', onOpponentAction);
      socket.off('opponent_disconnected', onOpponentDisconnected);
      socket.off('game_over', onGameOver);
    };
  }, [gameMode, cpuEngine, playerEngine, playerName, opponentName]);

  useEffect(() => {
    bgmRef.current = new Audio('https://raw.githubusercontent.com/RahulShagri/OG-Tetris-Game/main/theme.mp3');
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.3;
    
    if (isGameStarted && !isMuted) {
      bgmRef.current.play().catch(() => {
        console.log("Audio play blocked by browser. Click anywhere to start.");
      });
    }

    return () => {
      bgmRef.current?.pause();
      bgmRef.current = null;
    };
  }, [isGameStarted]);

  useEffect(() => {
    if (bgmRef.current) {
      if (isMuted) bgmRef.current.pause();
      else bgmRef.current.play().catch(() => {});
    }
  }, [isMuted]);

  const keysPressed = useRef<Record<string, boolean>>({});
  const dasTimeout = useRef<Record<string, number | null>>({});
  const arrInterval = useRef<Record<string, number | null>>({});

  const syncState = useCallback(() => {
    if (gameModeRef.current === 'remote' && socketRef.current && playerEngine) {
      socketRef.current.emit("game_action", {
        room: roomRef.current,
        type: "sync",
        state: {
          grid: playerEngine.grid,
          currentPiece: playerEngine.currentPiece,
          holdPiece: playerEngine.holdPiece,
          nextQueue: playerEngine.nextQueue,
          score: playerEngine.score,
          linesCleared: playerEngine.linesCleared,
          combo: playerEngine.combo,
          isGameOver: playerEngine.isGameOver,
          b2b: playerEngine.b2b,
          garbageQueue: playerEngine.garbageQueue
        }
      });
    }
  }, [playerEngine]);

  // Immediate sync when game starts or restarts to avoid delay
  useEffect(() => {
    if (isGameStarted && gameMode === 'remote') {
      syncState();
    }
  }, [gameId, isGameStarted, gameMode, syncState]);

  const handleInput = useCallback((code: string) => {
    const isOver = !isGameStarted || playerEngine.isGameOver || cpuEngine.isGameOver ||
      (gameMode === 'remote' && remoteStatus === 'disconnected');
    if (isOver) return;

    if (bindings.left.includes(code)) playerEngine.move(-1, 0);
    else if (bindings.right.includes(code)) playerEngine.move(1, 0);
    else if (bindings.down.includes(code)) playerEngine.move(0, 1);
    else if (bindings.rotateCW.includes(code)) playerEngine.rotate(true);
    else if (bindings.rotateCCW.includes(code)) playerEngine.rotate(false);
    else if (bindings.hardDrop.includes(code)) playerEngine.hardDrop();
    else if (bindings.hold.includes(code)) playerEngine.hold();
    else return;

    setTick(t => t + 1);
    syncState();
  }, [playerEngine, cpuEngine, isGameStarted, syncState, bindings, gameMode, remoteStatus]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept input from text fields
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (rebindingKeyRef.current) {
        e.preventDefault();
        const action = rebindingKeyRef.current;
        setBindings((prev: KeyBindings) => ({ ...prev, [action]: [e.code] }));
        setRebindingKey(null);
        rebindingKeyRef.current = null;
        return;
      }

      // Prevent default browser scrolling only for known active bounds
      const allBoundKeys = Object.values(bindings).flat();
      if (allBoundKeys.includes(e.code) && (e.code.startsWith('Arrow') || e.code === 'Space')) {
        e.preventDefault();
      }

      if (keysPressed.current[e.code]) return;
      keysPressed.current[e.code] = true;
      handleInput(e.code);

      if (bindings.left.includes(e.code) || bindings.right.includes(e.code) || bindings.down.includes(e.code)) {
        dasTimeout.current[e.code] = window.setTimeout(() => {
          arrInterval.current[e.code] = window.setInterval(() => {
            handleInput(e.code);
          }, ARR_INTERVAL);
        }, DAS_DELAY);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = false;
      if (dasTimeout.current[e.code]) {
        clearTimeout(dasTimeout.current[e.code]!);
        dasTimeout.current[e.code] = null;
      }
      if (arrInterval.current[e.code]) {
        clearInterval(arrInterval.current[e.code]!);
        arrInterval.current[e.code] = null;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleInput, bindings]);

  useEffect(() => {
    if (!isGameStarted) return;
    
    const interval = setInterval(() => {
      // Stop the game if anyone has lost
      if (playerEngine.isGameOver || cpuEngine.isGameOver) return;

      playerEngine.move(0, 1);
      setTick(t => t + 1);
      syncState();
    }, 1000);
    return () => clearInterval(interval);
  }, [playerEngine, cpuEngine, isGameStarted, syncState]);

  useEffect(() => {
    if (!isGameStarted || gameMode === 'remote') return;

    const interval = setInterval(() => {
      // Stop the AI from playing if the game is over
      if (playerEngine.isGameOver || cpuEngine.isGameOver) return;

      const bestMove = TetrisAI.findBestMove(cpuEngine);
      if (bestMove && cpuEngine.currentPiece) {
        cpuEngine.currentPiece.rotation = bestMove.rotation;
        cpuEngine.currentPiece.shape = SHAPES[cpuEngine.currentPiece.type][bestMove.rotation];
        cpuEngine.currentPiece.x = bestMove.x;
        cpuEngine.hardDrop();
        setTick(t => t + 1);
      }
    }, 800); // CPU speed

    return () => clearInterval(interval);
  }, [cpuEngine, playerEngine, isGameStarted]);

  useEffect(() => {
    return () => {
      playerEngine.destroy();
      cpuEngine.destroy();
    };
  }, [playerEngine, cpuEngine]);

  const handleRestart = () => {
    if (gameModeRef.current === 'remote' && remoteStatus === 'disconnected') {
      setIsGameStarted(false);
      setGameMode('menu');
      return;
    }
    
    // Stop syncs from firing during the tear-down
    playerEngine.isGameOver = false;
    cpuEngine.isGameOver = false;

    setGameId(id => id + 1);
    
    if (bgmRef.current && !isMutedRef.current) {
      bgmRef.current.play().catch(() => {});
    }

    if (gameModeRef.current === 'remote' && socketRef.current && roomRef.current) {
      socketRef.current.emit('game_action', {
        room: roomRef.current,
        type: 'restart'
      });
    }
  };

  const isOpponentDisconnected = gameMode === 'remote' && remoteStatus === 'disconnected' && isGameStarted;
  const isGameOver = playerEngine.isGameOver || cpuEngine.isGameOver || isOpponentDisconnected;
  
  let winnerText = '';
  if (isOpponentDisconnected) winnerText = 'OPPONENT LEFT';
  else if (playerEngine.isGameOver) winnerText = gameMode === 'remote' ? 'OPPONENT WINS' : 'CPU WINS';
  else if (cpuEngine.isGameOver) winnerText = 'PLAYER WINS';

  // Report game result to server for leaderboard (remote games only)
  useEffect(() => {
    if (isGameOver && gameMode === 'remote' && socketRef.current && !gameResultReported.current) {
      gameResultReported.current = true;
      const myName = playerName || 'Player';
      const theirName = opponentName || 'Opponent';
      
      // Only one player should report the result to avoid double increments.
      // Easiest is to have the loser report it.
      if (playerEngine.isGameOver) {
        socketRef.current.emit('game_result', { winner: theirName, loser: myName, room: roomRef.current });
      } else if (isOpponentDisconnected) {
        // If the opponent disconnects, the remaining player reports the win.
        socketRef.current.emit('game_result', { winner: myName, loser: theirName, room: roomRef.current });
      }
    }
  }, [isGameOver, gameMode, playerEngine.isGameOver, isOpponentDisconnected, playerName, opponentName]);

  // Reset the reported flag when game restarts
  useEffect(() => {
    gameResultReported.current = false;
  }, [gameId]);

  const getKeyDisplayName = (code: string) => {
    const map: Record<string, string> = {
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'Space': 'Space',
      'Enter': 'Enter',
      'ShiftLeft': 'Shift',
      'ShiftRight': 'Shift',
      'ControlLeft': 'Ctrl',
      'ControlRight': 'Ctrl',
      'AltLeft': 'Alt',
      'AltRight': 'Alt',
    };
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return map[code] || code;
  };

  return (
    <div 
      className="App" 
      ref={appRef} 
      tabIndex={0} 
      style={{ outline: 'none' }}
      onClick={() => {
        if (isGameStarted) appRef.current?.focus();
      }}
    >
      {!isGameStarted && (
        <div className="start-screen-overlay">
          <div className="start-screen-modal">
            <h1 className="title">Modern 1v1 Tetris</h1>
            {!isSettingsOpen && (
              <div style={{ marginTop: '20px', width: '100%', maxWidth: '500px' }}>
                <h3 style={{ color: '#ff9800', textAlign: 'center', marginBottom: '10px' }}>🏆 Leaderboard</h3>
                <div style={{ 
                  overflow: 'hidden',
                  backgroundColor: '#1a1a2e', borderRadius: '8px', border: '1px solid #444',
                  width: '100%'
                }}>
                  {leaderboardData.length === 0 ? (
                    <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No records yet</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #555', backgroundColor: '#111' }}>
                          <th style={{ padding: '8px', textAlign: 'left', color: '#aaa' }}>Rank</th>
                          <th style={{ padding: '8px', textAlign: 'left', color: '#aaa' }}>Player</th>
                          <th style={{ padding: '8px', textAlign: 'center', color: '#4caf50' }}>W</th>
                          <th style={{ padding: '8px', textAlign: 'center', color: '#f44336' }}>L</th>
                          <th style={{ padding: '8px', textAlign: 'center', color: '#ff9800' }}>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const myIdx = leaderboardData.findIndex(e => e.name === playerName);
                          const top3 = leaderboardData.slice(0, 3);
                          const displayEntries = top3.map((entry, idx) => ({ entry, rank: idx + 1 }));
                          
                          let showEllipsis = false;
                          if (myIdx >= 3) {
                            if (myIdx > 3) showEllipsis = true;
                            displayEntries.push({ entry: leaderboardData[myIdx], rank: myIdx + 1 });
                          }

                          return (
                            <>
                              {displayEntries.map(({ entry, rank }, i) => {
                                const total = entry.wins + entry.losses;
                                const winRate = total > 0 ? Math.round((entry.wins / total) * 100) : 0;
                                const isMe = entry.name === playerName;
                                const isLastEntryAndRequiresEllipsis = showEllipsis && i === displayEntries.length - 1;

                                return (
                                  <React.Fragment key={entry.name}>
                                    {isLastEntryAndRequiresEllipsis && (
                                      <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', padding: '4px', color: '#666' }}>•••</td>
                                      </tr>
                                    )}
                                    <tr style={{ 
                                      borderBottom: '1px solid #333',
                                      backgroundColor: isMe ? 'rgba(33, 150, 243, 0.2)' : 'transparent',
                                    }}>
                                      <td style={{ padding: '8px', color: rank <= 3 ? '#ff9800' : '#888' }}>{rank}</td>
                                      <td style={{ padding: '8px', fontWeight: isMe ? 'bold' : 'normal' }}>{entry.name}</td>
                                      <td style={{ padding: '8px', textAlign: 'center' }}>{entry.wins}</td>
                                      <td style={{ padding: '8px', textAlign: 'center' }}>{entry.losses}</td>
                                      <td style={{ padding: '8px', textAlign: 'center', color: '#ff9800' }}>{winRate}%</td>
                                    </tr>
                                  </React.Fragment>
                                );
                              })}
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
            
            {gameMode === 'menu' && lobbyView === 'none' && !isSettingsOpen && (
              <div className="start-buttons" style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'center', flexDirection: 'column', alignItems: 'center' }}>
                
                {/* Player name input */}
                <input 
                  type="text" 
                  placeholder="Enter your name" 
                  value={playerName}
                  onChange={(e) => {
                    setPlayerName(e.target.value);
                    localStorage.setItem('tetrisPlayerName', e.target.value);
                  }}
                  maxLength={12}
                  style={{ 
                    padding: '10px 16px', fontSize: '1rem', borderRadius: '8px', 
                    border: '2px solid #555', backgroundColor: '#222', color: '#fff',
                    textAlign: 'center', width: '200px', outline: 'none'
                  }}
                />
                
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button 
                    className="start-button" 
                    onClick={() => {
                      keysPressed.current = {};
                      if (appRef.current) appRef.current.focus();
                      setGameMode('ai');
                      setIsGameStarted(true);
                    }}
                  >
                    VS AI
                  </button>
                  <button 
                    className="start-button" 
                    onClick={() => {
                      setLobbyView('create');
                      const name = playerName || 'Player';
                      socketRef.current = io();
                      socketRef.current.emit('create_room', { name });
                      
                      socketRef.current.on('room_created', (data) => {
                        roomRef.current = data.room;
                        setGameMode('remote');
                        setRemoteStatus('waiting');
                      });

                      socketRef.current.on('game_start', (data) => {
                        setOpponentName(data.opponentName || 'Opponent');
                        roomRef.current = data.room;
                        setRemoteStatus('connected');
                        keysPressed.current = {};
                        if (appRef.current) appRef.current.focus();
                        setIsGameStarted(true);
                      });
                    }}
                    style={{ backgroundColor: '#2196f3' }}
                  >
                    CREATE ROOM
                  </button>
                  <button 
                    className="start-button" 
                    onClick={() => {
                      setLobbyView('join');
                      socketRef.current = io();
                      socketRef.current.on('room_list', (rooms) => {
                        setAvailableRooms(rooms);
                      });
                      socketRef.current.emit('list_rooms');
                    }}
                    style={{ backgroundColor: '#4caf50' }}
                  >
                    JOIN ROOM
                  </button>
                </div>
                
                <button 
                  className="start-button" 
                  onClick={() => setIsSettingsOpen(true)}
                  style={{ backgroundColor: '#555', padding: '10px 20px', fontSize: '1.2rem', marginTop: '10px' }}
                >
                  ⚙️ Settings
                </button>

                

              </div>
            )}

            {/* Create Room Panel - Waiting State */}
            {lobbyView === 'create' && (
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <p style={{ color: '#ff9800', fontSize: '1.1rem' }}>
                  Waiting for opponent...
                </p>
                <button 
                  className="start-button" 
                  onClick={() => {
                    playerEngine.reset();
                    cpuEngine.reset();
                    setGameId(id => id + 1);
                    setLobbyView('none');
                    setGameMode('menu');
                    setRemoteStatus('disconnected');
                    if (socketRef.current) socketRef.current.disconnect();
                  }}
                  style={{ backgroundColor: '#555', padding: '8px 16px', fontSize: '0.9rem' }}
                >
                  ← Back
                </button>
              </div>
            )}

            {/* Join Room Panel - Room List */}
            {lobbyView === 'join' && (
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <h3 style={{ color: '#fff', margin: 0 }}>Available Rooms</h3>
                {remoteError && <p style={{ color: '#f44336', margin: 0 }}>{remoteError}</p>}
                <div style={{ 
                  width: '280px', maxHeight: '200px', overflowY: 'auto',
                  backgroundColor: '#1a1a2e', borderRadius: '8px', border: '1px solid #444'
                }}>
                  {availableRooms.length === 0 ? (
                    <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No rooms available</p>
                  ) : (
                    availableRooms.map(room => (
                      <div 
                        key={room.code}
                        onClick={() => {
                          const name = playerName || 'Player';
                          setGameMode('remote');
                          setRemoteError('');

                          socketRef.current!.on('join_error', (data) => {
                            setRemoteError(data.message);
                          });

                          socketRef.current!.on('game_start', (data) => {
                            setOpponentName(data.opponentName || 'Opponent');
                            roomRef.current = data.room;
                            setRemoteStatus('connected');
                            keysPressed.current = {};
                            if (appRef.current) appRef.current.focus();
                            setIsGameStarted(true);
                          });

                          socketRef.current!.emit('join_room', { name, room: room.code });
                        }}
                        style={{ 
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '12px 16px', borderBottom: '1px solid #333',
                          cursor: 'pointer', color: '#fff', transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a4e')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <span style={{ fontWeight: 'bold' }}>{room.hostName}</span>
                        <span style={{ color: '#4caf50', fontSize: '0.85rem' }}>JOIN ▶</span>
                      </div>
                    ))
                  )}
                </div>
                <button 
                  className="start-button" 
                  onClick={() => {
                    playerEngine.reset();
                    cpuEngine.reset();
                    setGameId(id => id + 1);
                    setLobbyView('none');
                    setRemoteError('');
                    setGameMode('menu');
                    if (socketRef.current) {
                      socketRef.current.disconnect();
                      socketRef.current = null;
                    }
                  }}
                  style={{ backgroundColor: '#555', padding: '8px 16px', fontSize: '0.9rem' }}
                >
                  ← Back
                </button>
              </div>
            )}

            {isSettingsOpen && (
              <div className="settings-panel" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                <h3 style={{ color: '#fff', marginBottom: '10px' }}>Key Bindings</h3>
                {(Object.keys(bindings) as Array<keyof KeyBindings>).map(key => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', width: '250px', color: '#ccc' }}>
                    <span style={{ textTransform: 'capitalize' }}>{key.replace('rotate', 'Rotate ')}</span>
                    <button 
                      onClick={() => {
                        setRebindingKey(key as keyof KeyBindings);
                        rebindingKeyRef.current = key as keyof KeyBindings;
                      }}
                      style={{ 
                        padding: '4px 8px', 
                        cursor: 'pointer', 
                        backgroundColor: rebindingKey === key ? '#ff9800' : '#333',
                        color: '#fff',
                        border: '1px solid #555',
                        borderRadius: '4px',
                        minWidth: '100px'
                      }}
                    >
                      {rebindingKey === key ? 'Press Key...' : bindings[key as keyof KeyBindings][0]}
                    </button>
                  </div>
                ))}
                <button 
                  className="start-button" 
                  onClick={() => setIsSettingsOpen(false)}
                  style={{ backgroundColor: '#555', padding: '8px 16px', fontSize: '1rem', marginTop: '15px' }}
                >
                  Confirm
                </button>
              </div>
            )}



          </div>
        </div>
      )}



      <header className="game-header">
        <h1>Modern 1v1 Tetris</h1>
        <button className="sound-toggle" tabIndex={-1} onClick={() => setIsMuted(!isMuted)}>
          {isMuted ? '🔈 Unmute' : '🔊 Mute'}
        </button>
      </header>
      <div className="game-container">
        <div className="player-side">
          <h3>{playerName || 'PLAYER'}</h3>
          <div className="garbage-meter-container">
            <div 
              className={`garbage-meter ${playerEngine.garbageQueue.reduce((a,b) => a+b, 0) >= 10 ? 'danger' : ''}`}
              style={{ height: `${(playerEngine.garbageQueue.reduce((a,b) => a+b, 0) / 20) * 100}%` }}
            ></div>
          </div>
          <TetrisBoard engine={playerEngine} />
        </div>
        <div className="cpu-side">
          <h3>{gameMode === 'remote' ? (opponentName || 'OPPONENT') : 'CPU (AI)'}</h3>
          <div className="garbage-meter-container">
            <div 
              className={`garbage-meter ${cpuEngine.garbageQueue.reduce((a,b) => a+b, 0) >= 10 ? 'danger' : ''}`}
              style={{ height: `${(cpuEngine.garbageQueue.reduce((a,b) => a+b, 0) / 20) * 100}%` }}
            ></div>
          </div>
          <TetrisBoard engine={cpuEngine} />
        </div>
      </div>
      <div className="controls">
        <p>
          <kbd>{getKeyDisplayName(bindings.left[0])}</kbd>
          <kbd>{getKeyDisplayName(bindings.right[0])}</kbd> Move | 
          <kbd>{getKeyDisplayName(bindings.rotateCW[0])}</kbd> Rotate | 
          <kbd>{getKeyDisplayName(bindings.rotateCCW[0])}</kbd> CCW | 
          <kbd>{getKeyDisplayName(bindings.down[0])}</kbd> Soft Drop | 
          <kbd>{getKeyDisplayName(bindings.hardDrop[0])}</kbd> Hard Drop | 
          <kbd>{getKeyDisplayName(bindings.hold[0])}</kbd> Hold
        </p>
      </div>

      {isGameOver && (
        <div className="game-over-overlay">
          <div className="game-over-modal">
            <h2>GAME OVER</h2>
            <h3 className={(playerEngine.isGameOver || isOpponentDisconnected) ? 'cpu-wins' : 'player-wins'}>{winnerText}</h3>
            <div className="stats-row">
              <p>Player Lines: {playerEngine.linesCleared}</p>
              <p>{gameMode === 'remote' ? 'Opponent Lines:' : 'CPU Lines:'} {cpuEngine.linesCleared}</p>
            </div>
            <div className="button-group" style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'center' }}>
              {!isOpponentDisconnected && (
                <button className="restart-button" onClick={handleRestart}>RESTART GAME</button>
              )}
              <button 
                className="restart-button" 
                style={{ backgroundColor: '#555' }} 
                onClick={() => {
                  setLobbyView('none');
                  setIsGameStarted(false);
                  setGameMode('menu');
                  setGameId(id => id + 1);
                  if (socketRef.current && gameMode === 'remote') {
                    socketRef.current.disconnect();
                  }
                }}
              >
                RETURN TO MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
