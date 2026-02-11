import { ethers } from 'ethers';

// Assume a deployed smart contract for anomaly storage
// Contract address and ABI (replace with actual deployed contract)
const CONTRACT_ADDRESS = '0xYourContractAddressHere'; // Placeholder
const CONTRACT_ABI = [
  'function addAnomaly(string category, string data) public',
  'function getTopAnomalies(string category, uint256 limit) public view returns (string[] memory)',
  'function getAnomalyCount(string category) public view returns (uint256)',
  'function removeAnomaly(string category, uint256 index) public' // For deletion if needed, but we'll manage top 1000 on add
];

export class BlockchainManager {
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private contract: ethers.Contract;

  constructor() {
    // Connect to a local blockchain or testnet (e.g., Hardhat, Ganache)
    this.provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545'); // Local Hardhat node
    this.signer = new ethers.Wallet('0xYourPrivateKeyHere', this.provider); // Replace with actual private key
    this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.signer);
  }

  // Post anomaly data to blockchain
  async postAnomaly(category: string, data: any): Promise<void> {
    const dataString = JSON.stringify(data);
    const tx = await this.contract.addAnomaly(category, dataString);
    await tx.wait();
  }

  // Get top anomalies from blockchain (sorted by score descending, limit to 1000)
  async getTopAnomalies(category: string, limit: number = 1000): Promise<any[]> {
    const anomaliesStrings: string[] = await this.contract.getTopAnomalies(category, limit);
    return anomaliesStrings.map(str => JSON.parse(str));
  }

  // Check if a run is in top 1000 for a category
  async isInTop(category: string, runDir: string): Promise<boolean> {
    const topAnomalies = await this.getTopAnomalies(category, 1000);
    return topAnomalies.some(anomaly => anomaly.runDir === runDir);
  }
}
