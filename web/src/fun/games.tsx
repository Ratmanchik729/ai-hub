// Мини-игры в палитре EGA. Все оригинальные, без чужих ассетов.
import { useEffect, useRef, useState } from "react";

export const EGA = [
  "#000000", "#0000AA", "#00AA00", "#00AAAA", "#AA0000", "#AA00AA", "#AA5500", "#AAAAAA",
  "#555555", "#5555FF", "#55FF55", "#55FFFF", "#FF5555", "#FF55FF", "#FFFF55", "#FFFFFF",
];

function useBest(key: string, lowerIsBetter = false) {
  const [best, setBest] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(key);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });
  const submit = (v: number) => {
    setBest((b) => {
      const better = b === null || (lowerIsBetter ? v < b : v > b);
      if (!better) return b;
      try {
        localStorage.setItem(key, String(v));
      } catch {
        /* ignore */
      }
      return v;
    });
  };
  return [best, submit] as const;
}

// ---------------------------------------------------------------------------
// Питон в ring 0: змейка ест байты, растёт и ускоряется.
// ---------------------------------------------------------------------------

const N = 18; // клеток по стороне
const CELL = 16;

export function SnakeGame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [state, setState] = useState<"idle" | "play" | "dead">("idle");
  const [best, submit] = useBest("fun-snake-best");
  const game = useRef({
    snake: [{ x: 9, y: 9 }],
    dir: { x: 1, y: 0 },
    next: { x: 1, y: 0 },
    food: { x: 4, y: 4 },
    speed: 140,
    score: 0,
  });

  const draw = () => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const g = game.current;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, N * CELL, N * CELL);
    ctx.fillStyle = "#0000AA";
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if ((i + j) % 2) ctx.fillRect(i * CELL + 7, j * CELL + 7, 2, 2);
    // байт
    ctx.fillStyle = "#FFFF55";
    ctx.fillRect(g.food.x * CELL + 2, g.food.y * CELL + 2, CELL - 4, CELL - 4);
    ctx.fillStyle = "#AA5500";
    ctx.font = "9px monospace";
    ctx.fillText("FF", g.food.x * CELL + 3, g.food.y * CELL + 11);
    // змейка
    g.snake.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? "#55FF55" : i % 2 ? "#00AA00" : "#00AAAA";
      ctx.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
    });
  };

  const placeFood = () => {
    const g = game.current;
    do {
      g.food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
    } while (g.snake.some((p) => p.x === g.food.x && p.y === g.food.y));
  };

  const start = () => {
    game.current = { snake: [{ x: 9, y: 9 }, { x: 8, y: 9 }], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 }, food: { x: 4, y: 4 }, speed: 140, score: 0 };
    placeFood();
    setScore(0);
    setState("play");
    canvas.current?.focus();
  };

  useEffect(() => {
    draw();
    if (state !== "play") return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const g = game.current;
      g.dir = g.next;
      const head = { x: (g.snake[0].x + g.dir.x + N) % N, y: (g.snake[0].y + g.dir.y + N) % N };
      if (g.snake.some((p) => p.x === head.x && p.y === head.y)) {
        setState("dead");
        submit(g.score);
        draw();
        return;
      }
      g.snake.unshift(head);
      if (head.x === g.food.x && head.y === g.food.y) {
        g.score++;
        setScore(g.score);
        g.speed = Math.max(55, g.speed - 5);
        placeFood();
      } else {
        g.snake.pop();
      }
      draw();
      timer = setTimeout(tick, g.speed);
    };
    timer = setTimeout(tick, game.current.speed);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, ц: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, ы: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, ф: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, в: { x: 1, y: 0 },
    };
    const d = map[e.key];
    if (e.key === " " && state !== "play") {
      e.preventDefault();
      start();
      return;
    }
    if (!d) return;
    e.preventDefault();
    const g = game.current;
    if (d.x !== -g.dir.x || d.y !== -g.dir.y) g.next = d;
  };

  return (
    <div className="game">
      <div className="game-head">
        <b>ПИТОН В RING 0</b>
        <span>
          байты: {score} · рекорд: {best ?? "—"}
        </span>
      </div>
      <div className="game-screen">
        <canvas ref={canvas} width={N * CELL} height={N * CELL} tabIndex={0} onKeyDown={onKey} />
        {state !== "play" && (
          <div className="game-overlay" onClick={start}>
            {state === "dead" ? (
              <>
                <div className="blink">*** SEGFAULT ***</div>
                <div>съел сам себя на {score} байтах</div>
              </>
            ) : (
              <div>стрелки / WASD</div>
            )}
            <button className="primary">{state === "dead" ? "Перезапуск" : "Старт"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Лови баги: баги размножаются, давишь кликом. 12 на поле — kernel panic.
// ---------------------------------------------------------------------------

const BUG = ["..X..X..", "...XX...", ".XXXXXX.", "X.XXXX.X", ".XXXXXX.", "X.XXXX.X", ".XXXXXX.", "X..XX..X"];
const G = 6;
const LIMIT = 12;

export function BugGame() {
  const [bugs, setBugs] = useState<Set<number>>(new Set());
  const [score, setScore] = useState(0);
  const [state, setState] = useState<"idle" | "play" | "dead">("idle");
  const [splat, setSplat] = useState<number | null>(null);
  const [best, submit] = useBest("fun-bugs-best");
  const scoreRef = useRef(0);

  useEffect(() => {
    if (state !== "play") return;
    let delay = 900;
    let timer: ReturnType<typeof setTimeout>;
    const spawn = () => {
      setBugs((b) => {
        const free = [...Array(G * G).keys()].filter((i) => !b.has(i));
        const n = new Set(b);
        if (free.length) n.add(free[Math.floor(Math.random() * free.length)]);
        if (n.size >= LIMIT) {
          setState("dead");
          submit(scoreRef.current);
        }
        return n;
      });
      delay = Math.max(280, delay * 0.97);
      timer = setTimeout(spawn, delay);
    };
    timer = setTimeout(spawn, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const start = () => {
    setBugs(new Set());
    setScore(0);
    scoreRef.current = 0;
    setState("play");
  };

  const squash = (i: number) => {
    if (state !== "play" || !bugs.has(i)) return;
    const n = new Set(bugs);
    n.delete(i);
    setBugs(n);
    scoreRef.current++;
    setScore(scoreRef.current);
    setSplat(i);
    setTimeout(() => setSplat((s) => (s === i ? null : s)), 150);
  };

  return (
    <div className="game">
      <div className="game-head">
        <b>ЛОВИ БАГИ</b>
        <span>
          раздавлено: {score} · рекорд: {best ?? "—"}
        </span>
      </div>
      <div className="game-screen">
        <div className="bug-grid">
          {[...Array(G * G).keys()].map((i) => (
            <div key={i} className={`bug-cell ${splat === i ? "splat" : ""}`} onMouseDown={() => squash(i)}>
              {bugs.has(i) && (
                <svg viewBox="0 0 8 8" shapeRendering="crispEdges">
                  {BUG.flatMap((row, y) =>
                    [...row].map((c, x) => (c === "X" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null)),
                  )}
                </svg>
              )}
            </div>
          ))}
        </div>
        <div className="bug-meter">
          нагрузка: {"█".repeat(bugs.size)}
          {"░".repeat(Math.max(0, LIMIT - bugs.size))}
        </div>
        {state !== "play" && (
          <div className="game-overlay" onClick={start}>
            {state === "dead" ? (
              <>
                <div className="blink">KERNEL PANIC</div>
                <div>багов стало слишком много</div>
              </>
            ) : (
              <div>дави баги, пока их меньше {LIMIT}</div>
            )}
            <button className="primary">{state === "dead" ? "Ещё раз" : "Старт"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Тест реакции: дождись жёлтого и жми.
// ---------------------------------------------------------------------------

export function ReactionGame() {
  const [phase, setPhase] = useState<"idle" | "wait" | "go" | "result" | "early">("idle");
  const [ms, setMs] = useState(0);
  const [best, submit] = useBest("fun-reaction-best", true);
  const t0 = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const click = () => {
    if (phase === "idle" || phase === "result" || phase === "early") {
      setPhase("wait");
      timer.current = setTimeout(() => {
        t0.current = performance.now();
        setPhase("go");
      }, 1200 + Math.random() * 2800);
    } else if (phase === "wait") {
      clearTimeout(timer.current);
      setPhase("early");
    } else if (phase === "go") {
      const v = Math.round(performance.now() - t0.current);
      setMs(v);
      submit(v);
      setPhase("result");
    }
  };

  const verdict = (v: number) =>
    v < 200 ? "уровень: прерывание процессора" : v < 280 ? "уровень: кэш L1" : v < 400 ? "уровень: оперативка" : "уровень: дискета";

  return (
    <div className="game">
      <div className="game-head">
        <b>РЕАКЦИЯ</b>
        <span>рекорд: {best ? `${best} мс` : "—"}</span>
      </div>
      <div className={`reaction ${phase}`} onMouseDown={click}>
        {phase === "idle" && "Кликни, чтобы начать"}
        {phase === "wait" && "Жди жёлтого…"}
        {phase === "go" && "ЖМИ!"}
        {phase === "early" && "Фальстарт. Кликни ещё раз"}
        {phase === "result" && (
          <>
            <div className="big">{ms} мс</div>
            <div>{verdict(ms)}</div>
            <div className="small">кликни, чтобы повторить</div>
          </>
        )}
      </div>
    </div>
  );
}
