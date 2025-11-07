/**
 * Predictive Analytics Module
 * Proactively detects issues before they occur
 * Similar to Aisera ITOps AI predictive capabilities
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

/**
 * Predict potential issues based on current metrics and trends
 */
async function predictPotentialIssues(lookAheadHours = 24) {
  try {
    logger.info(`Predicting potential issues for next ${lookAheadHours} hours`);

    // Get prediction data from PredictMetric collection
    const predictions = await executeQuery('PredictMetric', 'find', {
      PredictionTime: {
        $gte: new Date(),
        $lte: new Date(Date.now() + lookAheadHours * 60 * 60 * 1000)
      }
    });

    if (!predictions || predictions.length === 0) {
      return {
        success: true,
        message: 'No predictions available for the specified time range',
        predictions: []
      };
    }

    // Analyze predictions using AI
    const analysisPrompt = `Analyze these predicted metrics and identify potential issues:
${JSON.stringify(predictions, null, 2)}

Provide:
1. Top 3 potential issues
2. Severity level for each
3. Recommended preventive actions
4. Estimated time to occurrence`;

    const completion = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: "system", content: "You are a predictive analytics expert for IT operations." },
        { role: "user", content: analysisPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    return {
      success: true,
      rawPredictions: predictions,
      analysis: completion.choices[0].message.content,
      lookAheadHours
    };
  } catch (error) {
    logger.error('Predictive analytics error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Analyze alert trends
 */
async function analyzeAlertTrends(days = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const alerts = await executeQuery(COLLECTIONS.ALERTS, 'find', {
      timestamp: { $gte: startDate }
    }, {
      sort: { timestamp: -1 }
    });

    if (!alerts || alerts.length === 0) {
      return {
        success: true,
        message: 'No alerts found in the specified time range',
        trends: []
      };
    }

    // Group by severity and day
    const trendData = {};
    alerts.forEach(alert => {
      const day = new Date(alert.timestamp).toDateString();
      if (!trendData[day]) {
        trendData[day] = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
      }
      const severity = (alert.severity || 'medium').toLowerCase();
      trendData[day][severity] = (trendData[day][severity] || 0) + 1;
      trendData[day].total++;
    });

    return {
      success: true,
      days,
      totalAlerts: alerts.length,
      trends: trendData,
      avgAlertsPerDay: (alerts.length / days).toFixed(2)
    };
  } catch (error) {
    logger.error('Alert trend analysis error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Detect anomalies in system behavior
 */
async function detectAnomalies() {
  try {
    logger.info('Detecting anomalies in system behavior');

    // Get recent alerts
    const recentAlerts = await executeQuery(COLLECTIONS.ALERTS, 'find', {
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    // Get baseline (last 30 days)
    const baselineAlerts = await executeQuery(COLLECTIONS.ALERTS, 'find', {
      timestamp: { 
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lt: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    });

    const recentCount = recentAlerts.length;
    const baselineAvg = baselineAlerts.length / 29; // 29 days

    const deviation = ((recentCount - baselineAvg) / baselineAvg) * 100;

    return {
      success: true,
      anomalyDetected: Math.abs(deviation) > 20,
      recentCount,
      baselineAverage: baselineAvg.toFixed(2),
      deviationPercent: deviation.toFixed(2),
      severity: Math.abs(deviation) > 50 ? 'High' : Math.abs(deviation) > 20 ? 'Medium' : 'Low',
      recommendation: deviation > 20 
        ? '⚠️ Alert volume is significantly higher than baseline. Investigate potential issues.'
        : deviation < -20
        ? '📉 Alert volume is significantly lower than baseline. Verify monitoring systems.'
        : '✅ Alert volume is within normal range.'
    };
  } catch (error) {
    logger.error('Anomaly detection error:', error);
    return { success: false, error: error.message };
  }
}

export default {
  predictPotentialIssues,
  analyzeAlertTrends,
  detectAnomalies
};

export { predictPotentialIssues, analyzeAlertTrends, detectAnomalies };
