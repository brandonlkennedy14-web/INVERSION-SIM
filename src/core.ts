import fs from "node:fs";
import type { RunConfig, State, Variant, Event } from "./types.js";

export function runVariant(variant: Variant, cfg: RunConfig) {
  let s: State = { step: 0, x: cfg.x0, y: cfg.y0, vx: cfg.vx0, vy: cfg.vy0, phase: cfg.phase0 };

  const trajectory: any[] = [{ step: 0, x: s.x, y: s.y, vx: s.vx, vy: s.vy, phase: s.phase, isCorner: false, inverted: false, inversionMask: 0 }];
  const events: Event[] = [];

  // schedule (optional)
  const schedule = cfg.inversionSchedule ?? null;
  const applied = new Set<string>();
  let inversionMask = 0;

  // legacy single inversion (optional)
  let didInvert = false;

  for (let i = 0; i < cfg.steps; i++) {
    let next = variant.stepOnce(s, cfg);

    // ---- MULTI inversion schedule ----
    if (schedule) {
      for (const m of schedule) {
        if (next.step === m.step && !applied.has(m.kind)) {
          applied.add(m.kind);

          const before = { ...next };

          if (m.kind === "GEOM") {
            // Invert velocity and reflect position back to start point
            next = { ...next, vx: -next.vx, vy: -next.vy, x: cfg.x0, y: cfg.y0 };
            inversionMask |= 1 << 0;
          } else if (m.kind === "SPHERE") {
            const cx = (cfg.sizeX - 1) / 2;
            const cy = (cfg.sizeY - 1) / 2;
            next = { ...next, x: Math.round(2 * cx - next.x), y: Math.round(2 * cy - next.y) };
            inversionMask |= 1 << 1;
          } else if (m.kind === "OBSERVER") {
            next = { ...next, phase: -next.phase };
            inversionMask |= 1 << 2;
          } else if (m.kind === "CAUSAL") {
            inversionMask |= 1 << 3;
          }

          (next as any).inverted = true;
          (next as any).inversionMask = inversionMask;
          (next as any).inversionKind = m.kind; // Log the kind for better representation

          // marker event with more details
          events.push({
            step: next.step,
            eventType: `INVERT_${m.kind}`,
            phaseBefore: before.phase,
            phaseAfter: next.phase,
            x: next.x, y: next.y, vx: next.vx, vy: next.vy,
            inversionKind: m.kind, // Additional field for logical representation
          } as any);
        }
      }
    }

    // ---- legacy single inversion (ONLY if no schedule) ----
    if (!schedule) {
      const invStep = cfg.inversionStep;
      if (!didInvert && invStep != null && next.step === invStep) {
        didInvert = true;

        const phaseBefore = next.phase;
        const phaseAfter = -phaseBefore;

        next = { ...next, vx: -next.vx, vy: -next.vy, phase: phaseAfter } as any;

        events.push({
          step: next.step,
          eventType: "INVERT",
          phaseBefore,
          phaseAfter,
          x: next.x, y: next.y, vx: next.vx, vy: next.vy,
        });
      }
    }

    const detected = variant.detectEvents(s, next, cfg);

    let phase = next.phase;
    for (const ev of detected) {
      const before = phase;
      const after = variant.applyPhase(before, ev.eventType, cfg);
      phase = after;

      events.push({
        step: next.step,
        eventType: ev.eventType,
        phaseBefore: before,
        phaseAfter: after,
        x: next.x, y: next.y, vx: next.vx, vy: next.vy,
      });
    }

    const isCorner = detected.some(e => e.eventType.startsWith("corner."));
    s = { ...next, phase } as any;

    trajectory.push({
      step: s.step,
      x: s.x, y: s.y,
      vx: s.vx, vy: s.vy,
      phase: s.phase,
      isCorner,
      inverted: (s as any).inverted ?? didInvert,
      inversionMask: (s as any).inversionMask ?? 0,
    });
  }

  return { trajectory, events };
}

export function writeOutputs(outDir: string, name: string, result: ReturnType<typeof runVariant>, cfg: RunConfig) {
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(`${outDir}/${name}.trajectory.json`, JSON.stringify(result.trajectory, null, 2));

  const header = "step,eventType,phaseBefore,phaseAfter,x,y,vx,vy\n";
  const rows = result.events
    .map(e => `${e.step},${e.eventType},${e.phaseBefore},${e.phaseAfter},${e.x},${e.y},${e.vx},${e.vy}`)
    .join("\n");
  fs.writeFileSync(`${outDir}/${name}.events.csv`, header + rows);

  fs.writeFileSync(`${outDir}/${name}.meta.json`, JSON.stringify({ parameters: cfg }, null, 2));
}