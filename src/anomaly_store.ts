import fs from "node:fs";
import path from "node:path";
import { TopKStore } from "./anomaly_store.js";

const stores = {
  randomness: new TopKStore("anomalies/randomness_top.json"),
  structure: new TopKStore("anomalies/structure_top.json"),
  reemergence: new TopKStore("anomalies/reemergence_top.json"),
  tfast: new TopKStore("anomalies/tstruct_fastest.json"),
  tslow: new TopKStore("anomalies/tstruct_slowest.json"),
};

export type Entry = {
  seed: number;
  runIndex: number;
  score: number;
  sig: string;
  cfg: any;
};

export class TopKStore {
  private file: string;
  private K: number;
  private items: Entry[] = [];

  constructor(file: string, K = 1000) {
    this.file = file;
    this.K = K;

    if (fs.existsSync(file)) {
      this.items = JSON.parse(fs.readFileSync(file, "utf8"));
    }
  }
stores.randomness.tryInsert(
  {
    seed,
    runIndex: i,
    score: anomaly.randomness.maxEntropy,
    sig: trajSig,
    cfg,
  },
  (a, b) => a.score > b.score // higher entropy is better
);

stores.structure.tryInsert(
  {
    seed,
    runIndex: i,
    score: anomaly.structure.repeatRate,
    sig: trajSig,
    cfg,
  },
  (a, b) => a.score > b.score
);

if (anomaly.reemergence.reemerges) {
  const gap = anomaly.reemergence.again - anomaly.reemergence.first;
  stores.reemergence.tryInsert(
    {
      seed,
      runIndex: i,
      score: gap,
      sig: anomaly.reemergence.sig,
      cfg,
    },
    (a, b) => a.score > b.score
  );
}

if (anomaly.timeToStructure.t_struct != null) {
  const t = anomaly.timeToStructure.t_struct;

  stores.tfast.tryInsert(
    { seed, runIndex: i, score: -t, sig: trajSig, cfg },
    (a, b) => a.score > b.score // more negative = faster
  );

  stores.tslow.tryInsert(
    { seed, runIndex: i, score: t, sig: trajSig, cfg },
    (a, b) => a.score > b.score
  );
}

  tryInsert(e: Entry, better: (a: Entry, b: Entry) => boolean) {
    // if not full, just insert
    if (this.items.length < this.K) {
      this.items.push(e);
      return true;
    }

    // find worst
    let worstIdx = 0;
    for (let i = 1; i < this.items.length; i++) {
      if (better(this.items[worstIdx], this.items[i])) {
        worstIdx = i;
      }
    }

    // if new does not beat worst → discard
    if (!better(e, this.items[worstIdx])) return false;

    this.items[worstIdx] = e;
    return true;
  }

  save() {
    this.items.sort((a, b) => b.score - a.score);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2));
  }
}


