import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xoolmbmnzbsvcqeyqvyi.supabase.co', 
    'sb_publishable_A1cLFAKbAg77TfTkD2RB-w_PahU316T'
);

async function injectTestJob() {
    console.log("Injecting high-anomaly test job...");
    const { error } = await supabase.from('jobs').insert([
        {
            status: 'completed',
            payload: { multiplier: 7, steps: 2000 },
            result: {
                // Mocking a trajectory that "hits" prime levels 2, 3, 5, 7
                log: Array.from({ length: 20 }, (_, i) => ({
                    step: i * 100,
                    phi: [2.1, 3.5, 5.2, 7.8, 11.3, 13.1][i % 6] // Bouncing off Primes
                }))
            },
            completed_at: new Date()
        }
    ]);

    if (error) console.error("Injection failed:", error);
    else console.log("Success! Refresh your browser to see the trajectory.");
}

injectTestJob();