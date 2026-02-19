import * as THREE from 'three';
import { createClient } from '@supabase/supabase-js';

// 1. Setup Supabase
const supabase = createClient('https://xoolmbmnzbsvcqeyqvyi.supabase.co', 'sb_publishable_A1cLFAKbAg77TfTkD2RB-w_PahU316T');

// 2. Initialize Three.js Scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.z = 15;

// 3. The 8-Bot Cube (Centroid Unit)
const bots: THREE.Mesh[] = [];
const botGeometry = new THREE.SphereGeometry(0.1, 16, 16);
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

// Position 8 bots at cube corners
for (let i = 0; i < 8; i++) {
    const bot = new THREE.Mesh(botGeometry, material);
    scene.add(bot);
    bots.push(bot);
}

// 4. Fetch and Render Top Anomaly
async function renderTopAnomaly() {
    const { data: job } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'completed')
        .order('result->final_phi', { ascending: false }) // Temporary "Score" logic
        .limit(1)
        .single();

    if (job && job.result.log) {
        drawTrajectory(job.result.log);
    }
}

// 5. Drawing the "Braided" Path
function drawTrajectory(log: any[]) {
    const points = log.map(entry => {
        // Converting Phase (phi) and Step to 3D Polar Coordinates
        const radius = Math.log(entry.phi + 1); 
        const angle = entry.step * 0.1;
        return new THREE.Vector3(
            radius * Math.cos(angle),
            radius * Math.sin(angle),
            entry.step * 0.01 // Vertical "Lifting"
        );
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x3366ff });
    const line = new THREE.Line(geometry, lineMaterial);
    scene.add(line);
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    scene.rotation.y += 0.005; // Gentle rotation for the screensaver
    renderer.render(scene, camera);
}

animate();
renderTopAnomaly();