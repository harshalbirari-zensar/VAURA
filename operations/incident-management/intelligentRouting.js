/**
 * Intelligent Routing and Escalation Module
 * Automatically routes incidents to the right team/person
 * Similar to Aisera ITOps AI smart routing capability
 */

import { executeQuery, COLLECTIONS } from '../../mongodb.js';
import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';
import logger from '../../logger.js';

dotenv.config();

const endpoint = process.env["AZURE_OPENAI_ENDPOINT"] || "https://zenvinciopenai.openai.azure.com/";
const apiKey = process.env["AZURE_OPENAI_API_KEY"];
const apiVersion = "2025-01-01-preview";
const deployment = "vinci-openai";

const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });

// Routing rules based on incident categories
const ROUTING_RULES = {
  NETWORK: {
    teams: ['Network Operations', 'Infrastructure Team'],
    skills: ['Networking', 'Firewall', 'VPN', 'DNS'],
    escalationPath: ['L1 Network', 'L2 Network', 'Network Manager']
  },
  DATABASE: {
    teams: ['Database Team', 'DBA Team'],
    skills: ['SQL', 'Oracle', 'MongoDB', 'Database Administration'],
    escalationPath: ['L1 DBA', 'L2 DBA', 'Senior DBA']
  },
  APPLICATION: {
    teams: ['Application Support', 'Development Team'],
    skills: ['Java', 'Python', 'Node.js', 'Application Support'],
    escalationPath: ['L1 App Support', 'L2 App Support', 'Dev Team Lead']
  },
  SECURITY: {
    teams: ['Security Operations', 'InfoSec Team'],
    skills: ['Security', 'Compliance', 'Access Management'],
    escalationPath: ['Security Analyst', 'Security Engineer', 'CISO']
  },
  HARDWARE: {
    teams: ['Desktop Support', 'Hardware Team'],
    skills: ['Hardware', 'Desktop Support', 'Server Hardware'],
    escalationPath: ['L1 Desktop', 'L2 Hardware', 'Hardware Manager']
  },
  CLOUD: {
    teams: ['Cloud Operations', 'DevOps Team'],
    skills: ['AWS', 'Azure', 'Cloud', 'Kubernetes', 'Docker'],
    escalationPath: ['Cloud Engineer', 'Senior Cloud Engineer', 'Cloud Architect']
  }
};

/**
 * Intelligently route incident to appropriate team
 */
async function routeIncident(incident) {
  try {
    logger.info(`Routing incident: ${incident.IncidentNo || incident.id}`);

    // Step 1: Categorize the incident
    const category = await categorizeIncident(incident);
    
    // Step 2: Find available team members with required skills
    const availableAgents = await findAvailableAgents(category);
    
    // Step 3: Calculate best match based on workload, skills, and past performance
    const bestAgent = await selectBestAgent(availableAgents, incident, category);
    
    // Step 4: Assign incident
    const assignment = await assignIncident(incident, bestAgent, category);

    return {
      success: true,
      assignment: {
        incidentId: incident.IncidentNo || incident.id,
        category: category.category,
        assignedTo: bestAgent.name,
        team: bestAgent.team,
        confidence: category.confidence,
        estimatedResolutionTime: bestAgent.avgResolutionTime,
        priority: incident.Priority || 'Medium',
        escalationPath: ROUTING_RULES[category.category]?.escalationPath || []
      }
    };

  } catch (error) {
    logger.error('Incident routing failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Categorize incident using AI
 */
async function categorizeIncident(incident) {
  try {
    const description = incident.Description || incident.description || '';
    const title = incident.Title || incident.title || '';
    const fullText = `${title} ${description}`;

    const prompt = [
      {
        role: "system",
        content: `You are an IT incident categorization expert. Categorize this incident into one of:
- NETWORK (networking, connectivity, VPN, DNS issues)
- DATABASE (database errors, SQL, queries, performance)
- APPLICATION (application errors, software bugs, crashes)
- SECURITY (security breaches, access issues, authentication)
- HARDWARE (hardware failures, disk, memory, CPU)
- CLOUD (cloud services, AWS, Azure, containers)

Also provide:
- Confidence level (0.0 to 1.0)
- Suggested priority (Critical/High/Medium/Low)
- Key technical terms identified

Respond with JSON:
{
  "category": "NETWORK|DATABASE|APPLICATION|SECURITY|HARDWARE|CLOUD",
  "confidence": 0.0-1.0,
  "suggestedPriority": "Critical|High|Medium|Low",
  "keywords": ["term1", "term2"],
  "reasoning": "brief explanation"
}`
      },
      {
        role: "user",
        content: fullText
      }
    ];

    const result = await client.chat.completions.create({
      messages: prompt,
      max_tokens: 400,
      temperature: 0.2
    });

    const response = result.choices[0].message.content.trim();
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return { category: 'APPLICATION', confidence: 0.5, suggestedPriority: 'Medium' };
  } catch (error) {
    logger.error('Incident categorization failed:', error);
    return { category: 'APPLICATION', confidence: 0.5, suggestedPriority: 'Medium' };
  }
}

/**
 * Find available agents with required skills
 */
async function findAvailableAgents(category) {
  try {
    // In a real system, this would query your user/agent database
    // For now, we'll simulate with mock data
    
    const routingRule = ROUTING_RULES[category.category] || ROUTING_RULES.APPLICATION;
    
    // Mock agents - in production, query from your user management system
    const mockAgents = [
      {
        id: 'agent1',
        name: 'John Smith',
        team: routingRule.teams[0],
        skills: routingRule.skills,
        currentWorkload: 3,
        maxWorkload: 10,
        avgResolutionTime: '4 hours',
        successRate: 0.92,
        available: true
      },
      {
        id: 'agent2',
        name: 'Sarah Johnson',
        team: routingRule.teams[0],
        skills: routingRule.skills,
        currentWorkload: 7,
        maxWorkload: 10,
        avgResolutionTime: '3 hours',
        successRate: 0.95,
        available: true
      },
      {
        id: 'agent3',
        name: 'Mike Davis',
        team: routingRule.teams[0],
        skills: routingRule.skills,
        currentWorkload: 2,
        maxWorkload: 10,
        avgResolutionTime: '5 hours',
        successRate: 0.88,
        available: true
      }
    ];

    return mockAgents.filter(agent => agent.available && agent.currentWorkload < agent.maxWorkload);

  } catch (error) {
    logger.error('Failed to find available agents:', error);
    return [];
  }
}

/**
 * Select best agent based on multiple factors
 */
async function selectBestAgent(agents, incident, category) {
  if (agents.length === 0) {
    return {
      name: 'Unassigned - No available agents',
      team: 'Pending Assignment',
      avgResolutionTime: 'N/A'
    };
  }

  // Calculate score for each agent
  const scoredAgents = agents.map(agent => {
    let score = 0;
    
    // Factor 1: Workload (lower is better)
    const workloadScore = (1 - (agent.currentWorkload / agent.maxWorkload)) * 40;
    score += workloadScore;
    
    // Factor 2: Success rate (higher is better)
    score += agent.successRate * 30;
    
    // Factor 3: Resolution time (faster is better)
    const timeScore = agent.avgResolutionTime.includes('3') ? 20 : 
                      agent.avgResolutionTime.includes('4') ? 15 : 10;
    score += timeScore;
    
    // Factor 4: Priority boost for experienced agents
    if (incident.Priority === 'Critical' || incident.Priority === 'High') {
      score += agent.successRate > 0.9 ? 10 : 0;
    }

    return { ...agent, score };
  });

  // Sort by score and return best match
  scoredAgents.sort((a, b) => b.score - a.score);
  return scoredAgents[0];
}

/**
 * Assign incident to selected agent
 */
async function assignIncident(incident, agent, category) {
  try {
    const assignment = {
      incidentId: incident.IncidentNo || incident.id,
      assignedTo: agent.name,
      assignedToId: agent.id,
      team: agent.team,
      category: category.category,
      assignedAt: new Date(),
      status: 'Assigned',
      priority: incident.Priority || category.suggestedPriority
    };

    // In production, update the incident in your database
    logger.info(`Incident ${assignment.incidentId} assigned to ${agent.name}`);
    
    return assignment;

  } catch (error) {
    logger.error('Incident assignment failed:', error);
    throw error;
  }
}

/**
 * Escalate incident based on rules
 */
async function escalateIncident(incidentId, currentLevel, reason) {
  try {
    logger.info(`Escalating incident ${incidentId} from level ${currentLevel}`);

    // Get incident details
    const incident = await executeQuery('IncidentHistory', 'findOne', { IncidentNo: incidentId });
    
    if (!incident) {
      return { success: false, error: 'Incident not found' };
    }

    // Determine escalation path
    const category = await categorizeIncident(incident);
    const escalationPath = ROUTING_RULES[category.category]?.escalationPath || ['L1 Support', 'L2 Support', 'Manager'];
    
    const currentIndex = escalationPath.findIndex(level => level === currentLevel);
    const nextLevel = escalationPath[currentIndex + 1] || escalationPath[escalationPath.length - 1];

    const escalation = {
      incidentId,
      from: currentLevel,
      to: nextLevel,
      reason,
      escalatedAt: new Date(),
      escalatedBy: 'System',
      priority: 'High' // Auto-escalation increases priority
    };

    logger.info(`Incident ${incidentId} escalated to ${nextLevel}`);

    return {
      success: true,
      escalation,
      message: `Incident escalated from ${currentLevel} to ${nextLevel}`
    };

  } catch (error) {
    logger.error('Escalation failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check for incidents that need auto-escalation
 */
async function checkAutoEscalation() {
  try {
    const now = new Date();
    const thresholds = {
      'Critical': 1 * 60 * 60 * 1000,  // 1 hour
      'High': 4 * 60 * 60 * 1000,      // 4 hours
      'Medium': 24 * 60 * 60 * 1000,   // 24 hours
      'Low': 72 * 60 * 60 * 1000       // 72 hours
    };

    const openIncidents = await executeQuery('IncidentHistory', 'find', {
      Status: { $in: ['Open', 'In Progress', 'Assigned'] }
    });

    const needEscalation = openIncidents.filter(incident => {
      const createdTime = new Date(incident.CreatedTime);
      const elapsed = now - createdTime;
      const threshold = thresholds[incident.Priority] || thresholds['Medium'];
      return elapsed > threshold;
    });

    return {
      success: true,
      count: needEscalation.length,
      incidents: needEscalation.map(inc => ({
        incidentId: inc.IncidentNo,
        priority: inc.Priority,
        age: Math.floor((now - new Date(inc.CreatedTime)) / (60 * 60 * 1000)) + ' hours',
        assignedTo: inc.AssignedTo,
        recommendation: 'Auto-escalate'
      }))
    };

  } catch (error) {
    logger.error('Auto-escalation check failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get routing statistics
 */
async function getRoutingStatistics(timeRangeDays = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRangeDays);

    // Mock statistics - in production, query from assignment logs
    const stats = {
      success: true,
      timeRange: timeRangeDays,
      totalRouted: 1250,
      avgRoutingTime: '2 minutes',
      routingAccuracy: 0.94,
      categorization: {
        'NETWORK': 220,
        'APPLICATION': 450,
        'DATABASE': 180,
        'SECURITY': 120,
        'HARDWARE': 180,
        'CLOUD': 100
      },
      topAgents: [
        { name: 'Sarah Johnson', resolved: 85, avgTime: '3 hours', successRate: 0.95 },
        { name: 'John Smith', resolved: 72, avgTime: '4 hours', successRate: 0.92 },
        { name: 'Mike Davis', resolved: 68, avgTime: '5 hours', successRate: 0.88 }
      ],
      escalationRate: 0.12 // 12% of incidents escalated
    };

    return stats;

  } catch (error) {
    logger.error('Failed to get routing statistics:', error);
    return { success: false, error: error.message };
  }
}

export default {
  routeIncident,
  escalateIncident,
  checkAutoEscalation,
  getRoutingStatistics,
  categorizeIncident,
  ROUTING_RULES
};
