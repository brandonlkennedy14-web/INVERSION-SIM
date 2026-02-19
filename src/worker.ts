import { createClient } from '@supabase/supabase-js';
import { Sim3Runner } from './sim3col';

// 1. Initialize Supabase with your credentials
const SUPABASE_URL = 'https://xoolmbmnzbsvcqeyqvyi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_A1cLFAKbAg77TfTkD2RB-w_PahU316T';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function startWorker() {
  console.log("Worker started. Listening for Sim 3 jobs...");

  while (true) {
    // 2. Claim a pending job (Status: 'pending')
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'pending')
      .limit(1)
      .single();

    if (error || !job) {
      // No jobs? Wait 5 seconds and check again
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    // 3. Mark job as 'processing' so others don't grab it
    await supabase.from('jobs').update({ status: 'processing' }).eq('id', job.id);

    try {
      console.log(`Running Job ${job.id} (Multiplier: ${job.payload.multiplier})...`);
      
      // 4. Execute Sim 3 logic
      const runner = new Sim3Runner(job.payload.x, job.payload.y, job.payload.vx, job.payload.vy);
      const results = [];
      
      for (let i = 0; i < (job.payload.steps || 1000); i++) {
        runner.runCOLStep();
        // Only log anomalies to save memory
        if (i % 100 === 0) results.push({ step: i, phi: runner.state.phi });
      }

      // 5. Submit results and mark as 'completed'
      await supabase
        .from('jobs')
        .update({ 
          status: 'completed', 
          result: { final_phi: runner.state.phi, log: results },
          completed_at: new Date()
        })
        .eq('id', job.id);

      console.log(`Job ${job.id} finished.`);
    } catch (err) {
      console.error(`Job ${job.id} failed:`, err);
      await supabase.from('jobs').update({ status: 'pending' }).eq('id', job.id);
    }
  }
}

startWorker();