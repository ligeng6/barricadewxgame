export const SIZE = 9;

export const PLAYER_RED = 0;
export const PLAYER_GREEN = 1;

export const GOAL_ROW = [0, 8];
export const START_POS = [{ r: 8, c: 4 }, { r: 0, c: 4 }];
export const WALLS_PER_PLAYER = 10;

function key(r, c) {
  return r + ',' + c;
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function createState() {
  return {
    pawns: START_POS.map((p) => ({ ...p })),
    wallsLeft: [WALLS_PER_PLAYER, WALLS_PER_PLAYER],
    hWalls: new Set(),
    vWalls: new Set(),
    turn: PLAYER_RED,
    winner: -1,
    moves: 0,
  };
}

export function blocksVertical(state, r, c) {
  return state.hWalls.has(key(r, c)) || state.hWalls.has(key(r, c - 1));
}

export function blocksHorizontal(state, r, c) {
  return state.vWalls.has(key(r, c)) || state.vWalls.has(key(r - 1, c));
}

function edgeBlocked(state, r, c, r2, c2) {
  if (r2 === r) return blocksHorizontal(state, r, Math.min(c, c2));
  return blocksVertical(state, Math.min(r, r2), c);
}

export function legalMoves(state, player) {
  const res = [];
  const { r, c } = state.pawns[player];
  const other = state.pawns[1 - player];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let i = 0; i < dirs.length; i += 1) {
    const dr = dirs[i][0];
    const dc = dirs[i][1];
    const r1 = r + dr;
    const c1 = c + dc;
    if (!inBounds(r1, c1) || edgeBlocked(state, r, c, r1, c1)) continue;
    if (other.r === r1 && other.c === c1) {
      const r2 = r + 2 * dr;
      const c2 = c + 2 * dc;
      if (inBounds(r2, c2) && !edgeBlocked(state, r1, c1, r2, c2)) {
        res.push({ r: r2, c: c2 });
      } else {
        const sides = [[-dc, dr], [dc, -dr]];
        for (let j = 0; j < sides.length; j += 1) {
          const rd = r1 + sides[j][0];
          const cd = c1 + sides[j][1];
          if (!inBounds(rd, cd) || edgeBlocked(state, r1, c1, rd, cd)) continue;
          if ((state.pawns[0].r === rd && state.pawns[0].c === cd)
            || (state.pawns[1].r === rd && state.pawns[1].c === cd)) continue;
          res.push({ r: rd, c: cd });
        }
      }
    } else {
      res.push({ r: r1, c: c1 });
    }
  }
  return res;
}

export function hasPath(state, player) {
  const goal = GOAL_ROW[player];
  const start = state.pawns[player];
  const seen = new Set([key(start.r, start.c)]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.r === goal) return true;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let i = 0; i < dirs.length; i += 1) {
      const nr = cur.r + dirs[i][0];
      const nc = cur.c + dirs[i][1];
      if (!inBounds(nr, nc) || seen.has(key(nr, nc))) continue;
      if (edgeBlocked(state, cur.r, cur.c, nr, nc)) continue;
      seen.add(key(nr, nc));
      queue.push({ r: nr, c: nc });
    }
  }
  return false;
}

export function wallPlacementError(state, orientation, r, c) {
  if (!inBounds(r, c) || r > SIZE - 2 || c > SIZE - 2) return 'outOfBounds';
  const walls = orientation === 'h' ? state.hWalls : state.vWalls;
  if (walls.has(key(r, c))) return 'overlap';
  if (orientation === 'h') {
    if (walls.has(key(r, c - 1)) || walls.has(key(r, c + 1))) return 'overlap';
  } else if (walls.has(key(r - 1, c)) || walls.has(key(r + 1, c))) {
    return 'overlap';
  }
  walls.add(key(r, c));
  const okRed = hasPath(state, PLAYER_RED);
  const okGreen = hasPath(state, PLAYER_GREEN);
  walls.delete(key(r, c));
  if (!okRed || !okGreen) return 'noPath';
  return null;
}

export function canPlaceWall(state, orientation, r, c) {
  return wallPlacementError(state, orientation, r, c) === null;
}

export function applyMove(state, player, to) {
  if (state.winner !== -1 || player !== state.turn) return false;
  const moves = legalMoves(state, player);
  let ok = false;
  for (let i = 0; i < moves.length; i += 1) {
    if (moves[i].r === to.r && moves[i].c === to.c) {
      ok = true;
      break;
    }
  }
  if (!ok) return false;
  state.pawns[player] = { r: to.r, c: to.c };
  state.moves += 1;
  if (to.r === GOAL_ROW[player]) {
    state.winner = player;
    return true;
  }
  state.turn = 1 - player;
  return true;
}

export function applyWall(state, player, orientation, r, c) {
  if (state.winner !== -1 || player !== state.turn) return false;
  if (state.wallsLeft[player] <= 0) return false;
  if (!canPlaceWall(state, orientation, r, c)) return false;
  (orientation === 'h' ? state.hWalls : state.vWalls).add(key(r, c));
  state.wallsLeft[player] -= 1;
  state.moves += 1;
  state.turn = 1 - player;
  return true;
}
