# 🎮 Modern 1v1 Battle Tetris - 프로젝트 컨텍스트

이 프로젝트는 **React**, **TypeScript**, **Socket.IO**를 사용하여 구축된 고성능 현대식 1v1 배틀 테트리스 게임입니다. 현대적인 테트리스 가이드라인(SRS, 7-Bag)을 준수하며, 로컬 AI 대전 및 원격 멀티플레이어를 지원합니다.

## 🚀 빠른 시작

### 개발 환경 설정
1.  **의존성 설치**:
    ```bash
    npm install
    ```
2.  **전체 실행 (백엔드 + 프론트엔드)**:
    ```bash
    npm run dev:all
    ```
    *   **프론트엔드**: [http://localhost:5173](http://localhost:5173) (Vite)
    *   **백엔드**: 3001 포트 (Socket.IO 매칭 서버)

### 주요 스크립트
- `npm run dev`: Vite 프론트엔드만 실행합니다.
- `node server.js`: 매칭 및 리더보드 서버만 실행합니다.
- `npm run build`: TypeScript 컴파일 및 프로젝트 빌드를 수행합니다.
- `npm run lint`: 코드 품질을 위해 ESLint를 실행합니다.

---

## 🏗️ 아키텍처 및 모듈 구조

### 1. 게임 엔진 (`src/engine.ts`)
테트리스의 핵심 물리 및 로직을 담당합니다.
- **SRS (Super Rotation System)**: 벽 차기(Wall Kick) 알고리즘 구현.
- **7-Bag 시스템**: 블록 분포의 공정성을 위한 랜덤 생성 방식.
- **공격 시스템**: T-Spin, Combo, B2B, Perfect Clear에 기반한 가비지 라인 계산.
- **Lock Delay**: "Infinity" 조작 리셋 구현 (최대 15회 이동/회전).

### 2. AI 에이전트 (`src/ai.ts`)
**Pierre Dellacherie 알고리즘**을 사용한 휴리스틱 기반 AI입니다.
- 보드 평가 지표: 착지 높이(Landing Height), 제거된 셀 수, 보드 우물(Wells), 행/열 전환(Transitions), 구멍(Holes)의 수.
- "VS AI" 모드를 위해 플레이어의 브라우저에서 로컬로 실행됩니다.

### 3. 네트워킹 (`server.js` & `src/App.tsx`)
- **Socket.IO**: 그리드, 블록 상태, 가비지 전송의 실시간 동기화.
- **룸 시스템**: 매칭을 위한 간단한 4자리 영문/숫자 방 코드.
- **리더보드**: `leaderboard.json`에 승/패 기록 영구 저장.

### 4. UI 및 렌더링
- **`src/App.tsx`**: 메인 엔트리 포인트, React Hook 기반 상태 관리 및 Socket.IO 클라이언트 로직.
- **`src/components/TetrisBoard.tsx`**: **HTML5 Canvas API**를 사용한 고성능 렌더링.
- **`src/App.css`**: 커스텀 애니메이션이 포함된 현대적인 다크 테마 스타일링.

---

## 🛠️ 개발 규칙 및 컨벤션

- **상태 관리**: 게임 상태 및 네트워킹을 위해 React의 `useState`, `useEffect`, `useMemo`를 적극 활용합니다.
- **불변성**: 게임 그리드는 문자열 2차원 배열(`PieceType | null`)로 취급합니다.
- **통신 설정**: `vite.config.ts`를 통해 프론트엔드의 `/socket.io` 경로를 백엔드(3001)로 프록시합니다.
- **데이터 저장**: 
    - **로컬**: 키 바인딩 및 플레이어 이름은 `localStorage`에 저장합니다.
    - **서버**: 전체 리더보드는 서버의 `leaderboard.json`에 저장됩니다.

## 📝 주요 규칙 (테트리스 가이드라인)

| 기능 | 구현 상세 |
| :--- | :--- |
| **SRS** | 모든 회전에 대해 5단계 벽 차기 테스트 수행. |
| **7-Bag** | 블록을 7개 한 묶음으로 섞어서 공급. |
| **가비지** | 각 공격 배치마다 구멍 위치가 일정한 가비지 생성. |
| **T-Spin** | 3-코너 규칙 기반 감지 (T-블록 전용). |
| **콤보** | 연속 라인 클리어 시 점진적인 공격 보너스 부여. |

---

## 📂 프로젝트 구조
- `src/assets/`: 정적 자산 (SVG/이미지).
- `src/components/`: React 컴포넌트 (TetrisBoard 등).
- `src/engine.ts`: 핵심 게임 메커니즘 로직.
- `src/ai.ts`: AI 최적수 탐색 로직.
- `src/constants.ts`: SRS 데이터, 블록 모양 및 킥 맵 데이터.
- `server.js`: Node.js/Socket.IO 서버 로직.
- `leaderboard.json`: 리더보드 데이터 저장 파일.
- `vite.config.ts`: Vite 서버 및 프록시 구성.
