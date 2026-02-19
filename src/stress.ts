import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xoolmbmnzbsvcqeyqvyi.supabase.co',
  'sb_publishable_A1cLFAKbAg77TfTkD2RB-w_PahU316T'
);

async function generateStressBatch(count: number) {
  const jobs = [];

  for (let i = 0; i < count; i++) {
    jobs.push({
      status: 'pending',
      payload: {
        multiplier: 7,
        modulus: 1000003,
        steps: 5000,
        // Randomized start to find anomalies
        x: Math.floor(Math.random() * 5),
        y: Math.floor(Math.random() * 7),
        vx: Math.random() > 0.5 ? 1 : -1,
        vy: Math.random() > 0.5 ? 1 : -1,
        sim_type: 'SIM_3_COL'
      }
    });
  }

  // Bulk insert to Supabase
  const { error } = await supabase.from('jobs').insert(jobs);

  if (error) console.error("Stress Test Injection Failed:", error);
  else console.log(`Successfully injected ${count} jobs into the cloud.`);
}

// Run it: npx tsx src/stress.ts 100
const runCount = parseInt(process.argv[2]) || 10;
generateStressBatch(runCount);