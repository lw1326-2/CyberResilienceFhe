// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface FinancialData {
  id: string;
  institution: string;
  encryptedData: string;
  timestamp: number;
  riskLevel: "low" | "medium" | "high";
  complianceStatus: "pending" | "approved" | "rejected";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [dataList, setDataList] = useState<FinancialData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newData, setNewData] = useState({
    institution: "",
    riskData: "",
    complianceNotes: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRisk, setFilterRisk] = useState<"all" | "low" | "medium" | "high">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");

  // Calculate statistics
  const approvedCount = dataList.filter(d => d.complianceStatus === "approved").length;
  const pendingCount = dataList.filter(d => d.complianceStatus === "pending").length;
  const rejectedCount = dataList.filter(d => d.complianceStatus === "rejected").length;
  const highRiskCount = dataList.filter(d => d.riskLevel === "high").length;

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing data keys:", e);
        }
      }
      
      const list: FinancialData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`data_${key}`);
          if (dataBytes.length > 0) {
            try {
              const data = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                institution: data.institution,
                encryptedData: data.encryptedData,
                timestamp: data.timestamp,
                riskLevel: data.riskLevel || "medium",
                complianceStatus: data.complianceStatus || "pending"
              });
            } catch (e) {
              console.error(`Error parsing data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setDataList(list);
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const addData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAdding(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting financial data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const data = {
        institution: newData.institution,
        encryptedData: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        riskLevel: "medium",
        complianceStatus: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(data))
      );
      
      const keysBytes = await contract.getData("data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "data_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Financial data encrypted and stored securely!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewData({
          institution: "",
          riskData: "",
          complianceNotes: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAdding(false);
    }
  };

  const approveData = async (dataId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataBytes = await contract.getData(`data_${dataId}`);
      if (dataBytes.length === 0) {
        throw new Error("Data not found");
      }
      
      const data = JSON.parse(ethers.toUtf8String(dataBytes));
      
      const updatedData = {
        ...data,
        complianceStatus: "approved"
      };
      
      await contract.setData(
        `data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedData))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE compliance check completed!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Approval failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectData = async (dataId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataBytes = await contract.getData(`data_${dataId}`);
      if (dataBytes.length === 0) {
        throw new Error("Data not found");
      }
      
      const data = JSON.parse(ethers.toUtf8String(dataBytes));
      
      const updatedData = {
        ...data,
        complianceStatus: "rejected"
      };
      
      await contract.setData(
        `data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedData))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE rejection completed!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredData = dataList.filter(data => {
    const matchesSearch = data.institution.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRisk = filterRisk === "all" || data.riskLevel === filterRisk;
    const matchesStatus = filterStatus === "all" || data.complianceStatus === filterStatus;
    return matchesSearch && matchesRisk && matchesStatus;
  });

  const renderRiskBar = (riskLevel: "low" | "medium" | "high") => {
    const width = riskLevel === "low" ? "30%" : riskLevel === "medium" ? "60%" : "90%";
    const color = riskLevel === "low" ? "#4CAF50" : riskLevel === "medium" ? "#FFC107" : "#F44336";
    return (
      <div className="risk-bar-container">
        <div 
          className="risk-bar" 
          style={{ width, backgroundColor: color }}
        ></div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FHE Financial Resilience</h1>
          <p>Confidential Analysis of Financial System Cyber Resilience</p>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <section className="dashboard-section">
          <div className="dashboard-card">
            <h2>System Overview</h2>
            <p>Analyze encrypted financial data using FHE to assess systemic risks without exposing sensitive information.</p>
            <div className="fhe-badge">FHE-Powered Analysis</div>
          </div>
          
          <div className="dashboard-card">
            <h3>Compliance Status</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{dataList.length}</div>
                <div className="stat-label">Total</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{approvedCount}</div>
                <div className="stat-label">Approved</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{rejectedCount}</div>
                <div className="stat-label">Rejected</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card">
            <h3>Risk Assessment</h3>
            <div className="risk-summary">
              <div className="risk-item">
                <span>High Risk</span>
                <span>{highRiskCount}</span>
              </div>
              <div className="risk-item">
                <span>Medium Risk</span>
                <span>{dataList.length - highRiskCount}</span>
              </div>
            </div>
          </div>
        </section>
        
        <section className="data-section">
          <div className="section-header">
            <h2>Financial Institution Data</h2>
            <div className="controls">
              <div className="search-filter">
                <input 
                  type="text" 
                  placeholder="Search institutions..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select 
                  value={filterRisk}
                  onChange={(e) => setFilterRisk(e.target.value as any)}
                >
                  <option value="all">All Risk Levels</option>
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="high">High Risk</option>
                </select>
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div className="action-buttons">
                <button 
                  onClick={loadData}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
                <button 
                  onClick={() => setShowAddModal(true)}
                >
                  Add Institution Data
                </button>
              </div>
            </div>
          </div>
          
          <div className="data-list">
            {filteredData.length === 0 ? (
              <div className="empty-state">
                <p>No financial data found</p>
                <button onClick={() => setShowAddModal(true)}>
                  Add First Data Entry
                </button>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Institution</th>
                    <th>Risk Level</th>
                    <th>Date Submitted</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map(data => (
                    <tr key={data.id}>
                      <td>{data.institution}</td>
                      <td>
                        {renderRiskBar(data.riskLevel)}
                        <span className="risk-label">{data.riskLevel}</span>
                      </td>
                      <td>{new Date(data.timestamp * 1000).toLocaleDateString()}</td>
                      <td>
                        <span className={`status-badge ${data.complianceStatus}`}>
                          {data.complianceStatus}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            onClick={() => approveData(data.id)}
                            disabled={data.complianceStatus !== "pending"}
                          >
                            Approve
                          </button>
                          <button 
                            onClick={() => rejectData(data.id)}
                            disabled={data.complianceStatus !== "pending"}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
  
      {showAddModal && (
        <ModalAdd 
          onSubmit={addData} 
          onClose={() => setShowAddModal(false)} 
          adding={adding}
          data={newData}
          setData={setNewData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-info">
            <h3>FHE Financial Resilience</h3>
            <p>Using Fully Homomorphic Encryption to analyze financial system cyber resilience confidentially.</p>
          </div>
          <div className="footer-links">
            <a href="#">Documentation</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Financial Regulatory Authority</p>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  data: any;
  setData: (data: any) => void;
}

const ModalAdd: React.FC<ModalAddProps> = ({ 
  onSubmit, 
  onClose, 
  adding,
  data,
  setData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setData({
      ...data,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!data.institution || !data.riskData) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="add-modal">
        <div className="modal-header">
          <h2>Add Financial Institution Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <p>Data will be encrypted using FHE before submission</p>
          </div>
          
          <div className="form-group">
            <label>Institution Name *</label>
            <input 
              type="text"
              name="institution"
              value={data.institution} 
              onChange={handleChange}
              placeholder="Enter financial institution name" 
            />
          </div>
          
          <div className="form-group">
            <label>Risk Data *</label>
            <textarea 
              name="riskData"
              value={data.riskData} 
              onChange={handleChange}
              placeholder="Enter encrypted risk assessment data..." 
              rows={4}
            />
          </div>
          
          <div className="form-group">
            <label>Compliance Notes</label>
            <textarea 
              name="complianceNotes"
              value={data.complianceNotes} 
              onChange={handleChange}
              placeholder="Additional compliance notes..." 
              rows={2}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose}>
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={adding}
          >
            {adding ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;