// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CyberResilienceFHE is SepoliaConfig {
    struct EncryptedExerciseData {
        uint256 institutionId;
        euint32 encryptedBreachAttempts;    // Encrypted number of breach attempts
        euint32 encryptedResponseTime;      // Encrypted response time in minutes
        euint32 encryptedVulnerabilities;   // Encrypted number of vulnerabilities found
        uint256 timestamp;
    }
    
    struct ResilienceAssessment {
        string riskLevel;
        string recommendations;
        string systemicRiskFlag;
        bool isRevealed;
    }

    uint256 public institutionCount;
    mapping(uint256 => EncryptedExerciseData) public encryptedExerciseData;
    mapping(uint256 => ResilienceAssessment) public assessments;
    
    mapping(string => euint32) private encryptedRiskCount;
    string[] private riskLevelList;
    
    mapping(uint256 => uint256) private requestToInstitutionId;
    
    event DataSubmitted(uint256 indexed institutionId, uint256 timestamp);
    event AssessmentRequested(uint256 indexed institutionId);
    event AssessmentCompleted(uint256 indexed institutionId);
    
    modifier onlyRegulator() {
        // Add regulator access control logic here
        _;
    }
    
    function submitEncryptedExerciseData(
        euint32 encryptedBreachAttempts,
        euint32 encryptedResponseTime,
        euint32 encryptedVulnerabilities
    ) public {
        institutionCount += 1;
        uint256 newId = institutionCount;
        
        encryptedExerciseData[newId] = EncryptedExerciseData({
            institutionId: newId,
            encryptedBreachAttempts: encryptedBreachAttempts,
            encryptedResponseTime: encryptedResponseTime,
            encryptedVulnerabilities: encryptedVulnerabilities,
            timestamp: block.timestamp
        });
        
        assessments[newId] = ResilienceAssessment({
            riskLevel: "",
            recommendations: "",
            systemicRiskFlag: "",
            isRevealed: false
        });
        
        emit DataSubmitted(newId, block.timestamp);
    }
    
    function requestResilienceAssessment(uint256 institutionId) public onlyRegulator {
        EncryptedExerciseData storage data = encryptedExerciseData[institutionId];
        require(!assessments[institutionId].isRevealed, "Assessment already completed");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(data.encryptedBreachAttempts);
        ciphertexts[1] = FHE.toBytes32(data.encryptedResponseTime);
        ciphertexts[2] = FHE.toBytes32(data.encryptedVulnerabilities);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.generateAssessment.selector);
        requestToInstitutionId[reqId] = institutionId;
        
        emit AssessmentRequested(institutionId);
    }
    
    function generateAssessment(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public onlyRegulator {
        uint256 institutionId = requestToInstitutionId[requestId];
        require(institutionId != 0, "Invalid request");
        
        ResilienceAssessment storage assessment = assessments[institutionId];
        require(!assessment.isRevealed, "Assessment already completed");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        
        assessment.riskLevel = calculateRiskLevel(results[0], results[1], results[2]);
        assessment.recommendations = generateRecommendations(results[0], results[1], results[2]);
        assessment.systemicRiskFlag = checkSystemicRisk(results[0], results[1]);
        assessment.isRevealed = true;
        
        if (FHE.isInitialized(encryptedRiskCount[assessment.riskLevel]) == false) {
            encryptedRiskCount[assessment.riskLevel] = FHE.asEuint32(0);
            riskLevelList.push(assessment.riskLevel);
        }
        encryptedRiskCount[assessment.riskLevel] = FHE.add(
            encryptedRiskCount[assessment.riskLevel], 
            FHE.asEuint32(1)
        );
        
        emit AssessmentCompleted(institutionId);
    }
    
    function getAssessment(uint256 institutionId) public view returns (
        string memory riskLevel,
        string memory recommendations,
        string memory systemicRiskFlag,
        bool isRevealed
    ) {
        ResilienceAssessment storage a = assessments[institutionId];
        return (a.riskLevel, a.recommendations, a.systemicRiskFlag, a.isRevealed);
    }
    
    function getEncryptedRiskCount(string memory riskLevel) public view returns (euint32) {
        return encryptedRiskCount[riskLevel];
    }
    
    function requestRiskCountDecryption(string memory riskLevel) public onlyRegulator {
        euint32 count = encryptedRiskCount[riskLevel];
        require(FHE.isInitialized(count), "Risk level not found");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptRiskCount.selector);
        requestToInstitutionId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(riskLevel)));
    }
    
    function decryptRiskCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public onlyRegulator {
        uint256 riskLevelHash = requestToInstitutionId[requestId];
        string memory riskLevel = getRiskLevelFromHash(riskLevelHash);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        uint32 count = abi.decode(cleartexts, (uint32));
    }
    
    // Helper functions for assessment generation
    function calculateRiskLevel(uint32 breaches, uint32 responseTime, uint32 vulns) private pure returns (string memory) {
        uint32 score = breaches * 3 + responseTime * 2 + vulns * 5;
        if (score > 100) return "Critical";
        if (score > 70) return "High";
        if (score > 40) return "Medium";
        return "Low";
    }
    
    function generateRecommendations(uint32 breaches, uint32 responseTime, uint32 vulns) private pure returns (string memory) {
        if (breaches > 5 || responseTime > 120 || vulns > 10) {
            return "Immediate remediation required; Conduct full security audit";
        }
        if (breaches > 2 || responseTime > 60 || vulns > 5) {
            return "Enhance monitoring; Update incident response plan";
        }
        return "Regular maintenance; Staff training recommended";
    }
    
    function checkSystemicRisk(uint32 breaches, uint32 responseTime) private pure returns (string memory) {
        if (breaches > 10 && responseTime > 180) return "High systemic risk";
        if (breaches > 5 && responseTime > 120) return "Potential systemic risk";
        return "No systemic risk detected";
    }
    
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
    
    function getRiskLevelFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < riskLevelList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(riskLevelList[i]))) == hash) {
                return riskLevelList[i];
            }
        }
        revert("Risk level not found");
    }
}