/**
 * AI Auto-Resolution Module
 * Automatically resolves common IT issues without human intervention
 * Similar to Aisera ITOps AI auto-resolution capability
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

// Common auto-resolvable issue patterns
const AUTO_RESOLVABLE_PATTERNS = {
  PASSWORD_RESET: /password.*reset|forgot.*password|reset.*password|can't.*login|cannot.*login/i,
  ACCOUNT_UNLOCK: /account.*locked|locked.*account|unlock.*account|too many.*attempts/i,
  SOFTWARE_INSTALL: /install.*software|need.*software|software.*request|application.*install/i,
  PRINTER_ISSUE: /printer.*not.*working|can't.*print|printer.*offline|print.*problem/i,
  NETWORK_ISSUE: /no.*internet|network.*down|wifi.*not.*working|cannot.*connect/i,
  EMAIL_ISSUE: /email.*not.*working|can't.*send.*email|outlook.*problem|email.*sync/i,
  VPN_ISSUE: /vpn.*not.*connecting|vpn.*problem|can't.*access.*vpn|vpn.*error/i,
  DISK_SPACE: /disk.*full|low.*disk.*space|out.*of.*space|storage.*full/i,
  SLOW_PERFORMANCE: /computer.*slow|laptop.*slow|system.*slow|performance.*issue/i,
  APPLICATION_ERROR: /application.*error|app.*crash|software.*not.*responding|program.*freeze/i
};

// Auto-resolution solutions
const AUTO_SOLUTIONS = {
  PASSWORD_RESET: {
    solution: "Password reset initiated",
    steps: [
      "Navigate to the password reset portal: https://password.vinci.com",
      "Enter your email address",
      "Check your email for the reset link",
      "Follow the link and create a new password",
      "Password must be at least 8 characters with uppercase, lowercase, number, and special character"
    ],
    automationPossible: true,
    estimatedTime: "5 minutes"
  },
  ACCOUNT_UNLOCK: {
    solution: "Account unlocked automatically",
    steps: [
      "Account has been unlocked",
      "Please wait 5 minutes before attempting to login",
      "Ensure Caps Lock is off",
      "If problem persists, initiate password reset"
    ],
    automationPossible: true,
    estimatedTime: "5 minutes"
  },
  PRINTER_ISSUE: {
    solution: "Printer troubleshooting steps",
    steps: [
      "Check if printer is powered on",
      "Verify printer is connected to network",
      "Remove print job from queue",
      "Restart print spooler service",
      "Try printing a test page"
    ],
    automationPossible: false,
    estimatedTime: "10 minutes"
  },
  VPN_ISSUE: {
    solution: "VPN connection troubleshooting",
    steps: [
      "Ensure you have stable internet connection",
      "Close and reopen VPN client",
      "Clear VPN cache and reconnect",
      "Check if VPN credentials are correct",
      "Try connecting to alternate VPN server"
    ],
    automationPossible: false,
    estimatedTime: "10 minutes"
  },
  DISK_SPACE: {
    solution: "Disk space cleanup initiated",
    steps: [
      "Running Disk Cleanup utility",
      "Clearing temporary files",
      "Emptying Recycle Bin",
      "Removing old Windows updates",
      "Compressing old files"
    ],
    automationPossible: true,
    estimatedTime: "15 minutes"
  }
};

/**
 * Analyze incident and determine if it can be auto-resolved
 */
async function analyzeForAutoResolution(incident) {
  try {
    const description = incident.Description || incident.description || '';
    const title = incident.Title || incident.title || '';
    const fullText = `${title} ${description}`.toLowerCase();

    // Check against known patterns
    for (const [issueType, pattern] of Object.entries(AUTO_RESOLVABLE_PATTERNS)) {
      if (pattern.test(fullText)) {
        logger.info(`Auto-resolvable issue detected: ${issueType}`);
        return {
          canAutoResolve: true,
          issueType,
          confidence: 0.85,
          solution: AUTO_SOLUTIONS[issueType]
        };
      }
    }

    // Use AI to analyze complex cases
    const aiAnalysis = await analyzeWithAI(fullText);
    return aiAnalysis;

  } catch (error) {
    logger.error('Error in auto-resolution analysis:', error);
    return { canAutoResolve: false, error: error.message };
  }
}

/**
 * Use AI to analyze incidents that don't match simple patterns
 */
async function analyzeWithAI(incidentText) {
  try {
    const prompt = [
      {
        role: "system",
        content: `You are an AI expert in IT incident auto-resolution. Analyze the incident and determine:
1. Can this be automatically resolved? (yes/no)
2. What type of issue is it?
3. Confidence level (0.0 to 1.0)
4. Recommended solution steps
5. Whether automation is possible

Common auto-resolvable issues:
- Password resets
- Account unlocks
- Software installations
- Printer issues
- Basic network troubleshooting
- Email configuration
- VPN issues
- Disk space cleanup
- Cache clearing
- Service restarts

Respond ONLY with JSON:
{
  "canAutoResolve": true/false,
  "issueType": "string",
  "confidence": 0.0-1.0,
  "solution": {
    "solution": "description",
    "steps": ["step1", "step2"],
    "automationPossible": true/false,
    "estimatedTime": "X minutes"
  }
}`
      },
      {
        role: "user",
        content: incidentText
      }
    ];

    const result = await client.chat.completions.create({
      messages: prompt,
      max_tokens: 500,
      temperature: 0.2
    });

    const response = result.choices[0].message.content.trim();
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return { canAutoResolve: false };
  } catch (error) {
    logger.error('AI analysis error:', error);
    return { canAutoResolve: false, error: error.message };
  }
}

/**
 * Attempt to auto-resolve the incident
 */
async function attemptAutoResolution(incidentId, analysis) {
  try {
    logger.info(`Attempting auto-resolution for incident: ${incidentId}`);

    if (!analysis.canAutoResolve || analysis.confidence < 0.7) {
      return {
        success: false,
        reason: 'Confidence too low for auto-resolution',
        requiresHuman: true
      };
    }

    // Log auto-resolution attempt
    const resolutionLog = {
      incidentId,
      timestamp: new Date(),
      issueType: analysis.issueType,
      confidence: analysis.confidence,
      solution: analysis.solution,
      status: 'In Progress'
    };

    // If automation is possible, execute it
    if (analysis.solution.automationPossible) {
      // Here you would integrate with your automation systems
      // For now, we'll simulate the resolution
      await simulateAutomation(analysis.issueType);
      resolutionLog.status = 'Auto-Resolved';
    } else {
      // Provide self-service steps to user
      resolutionLog.status = 'Self-Service Provided';
    }

    // Store resolution log
    await storeResolutionLog(resolutionLog);

    return {
      success: true,
      autoResolved: analysis.solution.automationPossible,
      solution: analysis.solution,
      resolutionLog
    };

  } catch (error) {
    logger.error('Auto-resolution attempt failed:', error);
    return {
      success: false,
      error: error.message,
      requiresHuman: true
    };
  }
}

/**
 * Simulate automation execution
 */
async function simulateAutomation(issueType) {
  // This is where you would integrate with actual automation tools
  // Examples: PowerShell scripts, API calls, RPA tools, etc.
  
  logger.info(`Executing automation for: ${issueType}`);
  
  // Simulate automation delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  logger.info(`Automation completed for: ${issueType}`);
  return true;
}

/**
 * Store resolution log in MongoDB
 */
async function storeResolutionLog(resolutionLog) {
  try {
    await executeQuery('RemediationLogs', 'insertOne', resolutionLog);
    logger.info('Resolution log stored successfully');
  } catch (error) {
    logger.error('Failed to store resolution log:', error);
  }
}

/**
 * Get auto-resolution statistics
 */
async function getAutoResolutionStats(timeRange = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);

    const stats = await executeQuery('RemediationLogs', 'aggregate', [
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$issueType',
          count: { $sum: 1 },
          autoResolved: {
            $sum: { $cond: [{ $eq: ['$status', 'Auto-Resolved'] }, 1, 0] }
          },
          avgConfidence: { $avg: '$confidence' }
        }
      }
    ]);

    return {
      success: true,
      timeRange,
      statistics: stats
    };
  } catch (error) {
    logger.error('Failed to get auto-resolution stats:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Find similar resolved incidents for learning
 */
async function findSimilarResolvedIncidents(incidentDescription, limit = 5) {
  try {
    // Use AI to find semantically similar incidents
    const prompt = [
      {
        role: "system",
        content: "Extract key technical terms and concepts from this incident description. Return only comma-separated keywords."
      },
      {
        role: "user",
        content: incidentDescription
      }
    ];

    const result = await client.chat.completions.create({
      messages: prompt,
      max_tokens: 100,
      temperature: 0.3
    });

    const keywords = result.choices[0].message.content.trim().split(',').map(k => k.trim());
    
    // Search in IncidentHistory for similar resolved incidents
    const searchQuery = keywords.map(k => ({ Description: { $regex: k, $options: 'i' } }));
    
    const similarIncidents = await executeQuery('IncidentHistory', 'find', {
      $and: [
        { Status: 'Resolved' },
        { $or: searchQuery }
      ]
    }, {
      limit,
      sort: { ResolvedDate: -1 }
    });

    return {
      success: true,
      count: similarIncidents.length,
      incidents: similarIncidents
    };
  } catch (error) {
    logger.error('Failed to find similar incidents:', error);
    return { success: false, error: error.message };
  }
}

export default {
  analyzeForAutoResolution,
  attemptAutoResolution,
  getAutoResolutionStats,
  findSimilarResolvedIncidents,
  AUTO_RESOLVABLE_PATTERNS,
  AUTO_SOLUTIONS
};
