import fs from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';

// Blockchain-like storage directory
const BLOCKCHAIN_DIR = path.resolve('./blockchain_data');

// Ensure blockchain directory exists
function ensureBlockchainDir() {
  if (!fs.existsSync(BLOCKCHAIN_DIR)) {
    fs.mkdirSync(BLOCKCHAIN_DIR, { recursive: true });
  }
}

// Interface for anomaly data
interface AnomalyData {
  runDir: string;
  score: number;
  timestamp: string;
  data: any;
  category: string;
}

// Interface for blockchain block
interface Block {
  index: number;
  timestamp: string;
  data: AnomalyData[];
  previousHash: string;
  hash: string;
}

export class BlockchainManager {
  wallet: ethers.Wallet | null;
  provider: ethers.JsonRpcProvider | null;
  private chain: Block[];
  private categories: Map<string, AnomalyData[]>;
  private topAnomaliesPerCategory: Map<string, number>;

  constructor() {
    // Disable actual blockchain for now (no real wallet/provider)
    this.wallet = null;
    this.provider = null;
    
    // Initialize in-memory chain and categories
    this.chain = [];
    this.categories = new Map();
    this.topAnomaliesPerCategory = new Map();
    
    // Initialize categories
    this.initializeCategories();
    
    // Load existing data from storage
    this.loadFromStorage();
    
    // Create genesis block if chain is empty
    if (this.chain.length === 0) {
      this.createGenesisBlock();
    }
  }

  private initializeCategories(): void {
    const categoryNames = [
      'Event Density',
      'Phase Anomaly', 
      'Spiral Phase Dynamics',
      'Simulation Summary',
      'randomness',
      'structure',
      'reemergence',
      'event_density'
    ];
    
    for (const category of categoryNames) {
      this.categories.set(category, []);
      this.topAnomaliesPerCategory.set(category, 1000); // Default top 1000
    }
  }

  private loadFromStorage(): void {
    ensureBlockchainDir();
    
    // Load chain
    const chainPath = path.join(BLOCKCHAIN_DIR, 'chain.json');
    if (fs.existsSync(chainPath)) {
      try {
        this.chain = JSON.parse(fs.readFileSync(chainPath, 'utf-8'));
        console.log(`Loaded ${this.chain.length} blocks from blockchain storage`);
      } catch (error) {
        console.error('Error loading chain:', error);
        this.chain = [];
      }
    }
    
    // Load categories index
    const indexPath = path.join(BLOCKCHAIN_DIR, 'categories_index.json');
    if (fs.existsSync(indexPath)) {
      try {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (const [category, data] of Object.entries(index)) {
          this.categories.set(category, data as AnomalyData[]);
        }
        console.log(`Loaded ${this.categories.size} categories from index`);
      } catch (error) {
        console.error('Error loading categories index:', error);
      }
    }
  }

  private saveToStorage(): void {
    ensureBlockchainDir();
    
    // Save chain
    const chainPath = path.join(BLOCKCHAIN_DIR, 'chain.json');
    fs.writeFileSync(chainPath, JSON.stringify(this.chain, null, 2));
    
    // Save categories index
    const index: Record<string, AnomalyData[]> = {};
    for (const [category, data] of this.categories) {
      index[category] = data;
    }
    const indexPath = path.join(BLOCKCHAIN_DIR, 'categories_index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  private createGenesisBlock(): void {
    const genesisBlock: Block = {
      index: 0,
      timestamp: new Date().toISOString(),
      data: [],
      previousHash: '0',
      hash: this.calculateHash(0, new Date().toISOString(), [], '0')
    };
    this.chain.push(genesisBlock);
    this.saveToStorage();
    console.log('Created genesis block');
  }

  private calculateHash(index: number, timestamp: string, data: AnomalyData[], previousHash: string): string {
    // Simple hash calculation (in production, use proper crypto)
    const str = `${index}${timestamp}${JSON.stringify(data)}${previousHash}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private createBlock(data: AnomalyData[]): Block {
    const previousBlock = this.chain[this.chain.length - 1];
    const newBlock: Block = {
      index: this.chain.length,
      timestamp: new Date().toISOString(),
      data: data,
      previousHash: previousBlock.hash,
      hash: this.calculateHash(
        this.chain.length,
        new Date().toISOString(),
        data,
        previousBlock.hash
      )
    };
    return newBlock;
  }

  // Post an anomaly to the blockchain
  async postAnomaly(category: string, anomalyData: any): Promise<void> {
    // Extract score from anomaly data
    let score = 0;
    if (typeof anomalyData.score === 'number') {
      score = anomalyData.score;
    } else if (anomalyData.anomalies) {
      // For botFleet anomalies, get max score from anomalies object
      const anomalyValues = Object.values(anomalyData.anomalies).filter(v => typeof v === 'number') as number[];
      score = Math.max(...anomalyValues, 0);
    }
    
    // Create anomaly entry
    const entry: AnomalyData = {
      runDir: anomalyData.runDir || anomalyData.run || 'unknown',
      score: score,
      timestamp: new Date().toISOString(),
      data: anomalyData,
      category: category
    };
    
    // Get current category data
    let categoryData = this.categories.get(category) || [];
    
    // Check if this runDir already exists (update) or is new
    const existingIndex = categoryData.findIndex(e => e.runDir === entry.runDir);
    
    if (existingIndex >= 0) {
      // Check if new score overtakes the old one
      if (entry.score > categoryData[existingIndex].score) {
        console.log(`[BLOCKCHAIN] Overtaken! ${entry.runDir}: ${categoryData[existingIndex].score} -> ${entry.score} in category ${category}`);
        // Update with new higher score
        categoryData[existingIndex] = entry;
      } else {
        console.log(`[BLOCKCHAIN] Ignored lower score: ${entry.runDir}: ${entry.score} (existing: ${categoryData[existingIndex].score}) in category ${category}`);
        // Don't update - existing score is higher or equal
        return;
      }
    } else {
      // New entry - add it
      categoryData.push(entry);
    }
    
    // Sort by score descending
    categoryData.sort((a, b) => b.score - a.score);
    
    // Limit to top K
    const topK = this.topAnomaliesPerCategory.get(category) || 1000;
    const overtakenEntries = categoryData.slice(topK);
    categoryData = categoryData.slice(0, topK);
    
    // Log if any entries were overtaken
    if (overtakenEntries.length > 0) {
      console.log(`[BLOCKCHAIN] ${overtakenEntries.length} entries overtaken in category ${category}`);
      for (const overtaken of overtakenEntries) {
        console.log(`  - Overtaken: ${overtaken.runDir} (score: ${overtaken.score})`);
      }
    }
    
    // Update categories map
    this.categories.set(category, categoryData);
    
    // Add to blockchain
    const block = this.createBlock([entry]);
    this.chain.push(block);
    
    // Save to persistent storage
    this.saveToStorage();
    
    console.log(`[BLOCKCHAIN] Posted anomaly: ${entry.runDir} to ${category} with score ${entry.score}`);
    console.log(`[BLOCKCHAIN] Chain now has ${this.chain.length} blocks`);
  }

  // Get top anomalies for a category
  async getTopAnomalies(category: string, limit: number = 1000): Promise<AnomalyData[]> {
    const categoryData = this.categories.get(category) || [];
    return categoryData.slice(0, limit);
  }

  // Get all anomalies (for debugging)
  async getAllAnomalies(): Promise<Map<string, AnomalyData[]>> {
    return new Map(this.categories);
  }

  // Get chain info
  getChainInfo(): { blockCount: number; categories: string[] } {
    return {
      blockCount: this.chain.length,
      categories: Array.from(this.categories.keys())
    };
  }

  // Verify chain integrity
  async verifyChain(): Promise<boolean> {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];
      
      // Verify hash
      const calculatedHash = this.calculateHash(
        currentBlock.index,
        currentBlock.timestamp,
        currentBlock.data,
        currentBlock.previousHash
      );
      
      if (calculatedHash !== currentBlock.hash) {
        console.error(`Block ${i} hash mismatch!`);
        return false;
      }
      
      // Verify previous hash
      if (currentBlock.previousHash !== previousBlock.hash) {
        console.error(`Block ${i} previous hash mismatch!`);
        return false;
      }
    }
    console.log('[BLOCKCHAIN] Chain verification passed');
    return true;
  }

  // Legacy method - kept for compatibility
  async postResults(results: any) {
    // Post to default category
    await this.postAnomaly('Simulation Results', results);
  }
}

export default BlockchainManager;
