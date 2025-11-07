/**
 * Sentiment Analysis and User Feedback Module
 * Analyzes user satisfaction and improves responses
 * Similar to Aisera ITOps AI sentiment analysis capability
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
 * Analyze sentiment of user message
 */
async function analyzeSentiment(message, conversationHistory = []) {
  try {
    const prompt = [
      {
        role: "system",
        content: `You are a sentiment analysis expert. Analyze the user's message and determine:
1. Overall sentiment (Positive, Neutral, Negative, Frustrated, Urgent)
2. Emotion intensity (0.0 to 1.0)
3. User satisfaction level (1-5 stars)
4. Key emotional indicators
5. Urgency level (Low, Medium, High, Critical)

Respond with JSON:
{
  "sentiment": "Positive|Neutral|Negative|Frustrated|Urgent",
  "intensity": 0.0-1.0,
  "satisfaction": 1-5,
  "emotions": ["emotion1", "emotion2"],
  "urgency": "Low|Medium|High|Critical",
  "indicators": ["indicator1", "indicator2"],
  "requiresEmpathy": true/false
}`
      },
      {
        role: "user",
        content: `Message: "${message}"\n\nConversation context: ${JSON.stringify(conversationHistory.slice(-2))}`
      }
    ];

    const result = await client.chat.completions.create({
      messages: prompt,
      max_tokens: 300,
      temperature: 0.3
    });

    const response = result.choices[0].message.content.trim();
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      
      // Store sentiment data
      await storeSentimentData({
        message,
        ...analysis,
        timestamp: new Date()
      });
      
      return analysis;
    }

    return { sentiment: 'Neutral', intensity: 0.5, satisfaction: 3, urgency: 'Medium' };
  } catch (error) {
    logger.error('Sentiment analysis failed:', error);
    return { sentiment: 'Neutral', intensity: 0.5, satisfaction: 3, urgency: 'Medium' };
  }
}

/**
 * Store sentiment data for analytics
 */
async function storeSentimentData(sentimentData) {
  try {
    await executeQuery('BotConversation', 'insertOne', {
      ...sentimentData,
      type: 'sentiment_analysis',
      createdAt: new Date()
    });
  } catch (error) {
    logger.error('Failed to store sentiment data:', error);
  }
}

/**
 * Generate empathetic response based on sentiment
 */
async function generateEmpatheticResponse(userMessage, sentiment, originalResponse) {
  try {
    if (sentiment.requiresEmpathy || sentiment.sentiment === 'Frustrated' || sentiment.sentiment === 'Negative') {
      const prompt = [
        {
          role: "system",
          content: `You are an empathetic IT support assistant. Rewrite the response to be more understanding and supportive.

Guidelines:
- Acknowledge user's frustration or concern
- Show understanding and empathy
- Keep technical accuracy
- Offer additional help
- Use positive, supportive language
- Be concise but warm

Sentiment context: ${sentiment.sentiment} (${sentiment.intensity} intensity)
User urgency: ${sentiment.urgency}`
        },
        {
          role: "user",
          content: `User message: "${userMessage}"\n\nOriginal response: "${originalResponse}"\n\nRewrite this to be more empathetic:`
        }
      ];

      const result = await client.chat.completions.create({
        messages: prompt,
        max_tokens: 500,
        temperature: 0.7
      });

      return result.choices[0].message.content.trim();
    }

    return originalResponse;
  } catch (error) {
    logger.error('Failed to generate empathetic response:', error);
    return originalResponse;
  }
}

/**
 * Track user satisfaction trends
 */
async function getSatisfactionTrends(timeRangeDays = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRangeDays);

    const sentiments = await executeQuery('BotConversation', 'find', {
      type: 'sentiment_analysis',
      timestamp: { $gte: startDate }
    });

    if (sentiments.length === 0) {
      return {
        success: false,
        message: 'No sentiment data available for the specified time range'
      };
    }

    const totalSentiments = sentiments.length;
    const avgSatisfaction = sentiments.reduce((sum, s) => sum + (s.satisfaction || 3), 0) / totalSentiments;
    
    const sentimentBreakdown = {
      Positive: sentiments.filter(s => s.sentiment === 'Positive').length,
      Neutral: sentiments.filter(s => s.sentiment === 'Neutral').length,
      Negative: sentiments.filter(s => s.sentiment === 'Negative').length,
      Frustrated: sentiments.filter(s => s.sentiment === 'Frustrated').length,
      Urgent: sentiments.filter(s => s.sentiment === 'Urgent').length
    };

    const satisfactionScore = (avgSatisfaction / 5 * 100).toFixed(1);
    const positiveRate = ((sentimentBreakdown.Positive / totalSentiments) * 100).toFixed(1);

    return {
      success: true,
      timeRange: timeRangeDays,
      totalInteractions: totalSentiments,
      averageSatisfaction: avgSatisfaction.toFixed(2),
      satisfactionScore: `${satisfactionScore}%`,
      positiveRate: `${positiveRate}%`,
      sentimentBreakdown,
      trend: avgSatisfaction > 3.5 ? 'Improving' : avgSatisfaction > 2.5 ? 'Stable' : 'Declining',
      recommendation: avgSatisfaction < 3 ? 
        'User satisfaction is low. Review recent interactions and improve response quality.' :
        'User satisfaction is good. Continue current approach.'
    };

  } catch (error) {
    logger.error('Failed to get satisfaction trends:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Collect user feedback
 */
async function collectFeedback(conversationId, rating, comment = '', metadata = {}) {
  try {
    const feedback = {
      conversationId,
      rating, // 1-5 stars
      comment,
      metadata,
      timestamp: new Date(),
      type: 'user_feedback'
    };

    await executeQuery('BotConversation', 'insertOne', feedback);

    logger.info(`Feedback collected: ${rating} stars for conversation ${conversationId}`);

    return {
      success: true,
      message: 'Thank you for your feedback!',
      feedback
    };

  } catch (error) {
    logger.error('Failed to collect feedback:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Analyze feedback patterns
 */
async function analyzeFeedbackPatterns(timeRangeDays = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRangeDays);

    const feedbacks = await executeQuery('BotConversation', 'find', {
      type: 'user_feedback',
      timestamp: { $gte: startDate }
    });

    if (feedbacks.length === 0) {
      return {
        success: false,
        message: 'No feedback data available'
      };
    }

    const avgRating = feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length;
    
    const ratingDistribution = {
      5: feedbacks.filter(f => f.rating === 5).length,
      4: feedbacks.filter(f => f.rating === 4).length,
      3: feedbacks.filter(f => f.rating === 3).length,
      2: feedbacks.filter(f => f.rating === 2).length,
      1: feedbacks.filter(f => f.rating === 1).length
    };

    // Extract common themes from comments using AI
    const comments = feedbacks.filter(f => f.comment).map(f => f.comment);
    const themes = await extractCommonThemes(comments);

    return {
      success: true,
      timeRange: timeRangeDays,
      totalFeedbacks: feedbacks.length,
      averageRating: avgRating.toFixed(2),
      ratingDistribution,
      positiveRate: `${((ratingDistribution[4] + ratingDistribution[5]) / feedbacks.length * 100).toFixed(1)}%`,
      negativeRate: `${((ratingDistribution[1] + ratingDistribution[2]) / feedbacks.length * 100).toFixed(1)}%`,
      commonThemes: themes,
      recommendation: avgRating >= 4 ? 'Excellent performance' : 
                     avgRating >= 3 ? 'Good, but room for improvement' :
                     'Needs significant improvement'
    };

  } catch (error) {
    logger.error('Failed to analyze feedback patterns:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Extract common themes from feedback comments
 */
async function extractCommonThemes(comments) {
  if (comments.length === 0) return [];

  try {
    const prompt = [
      {
        role: "system",
        content: `Analyze these user feedback comments and extract 3-5 common themes or topics.
For each theme, provide:
- Theme name
- Frequency (how often mentioned)
- Sentiment (Positive/Negative)

Respond with JSON array:
[
  {"theme": "string", "frequency": "High|Medium|Low", "sentiment": "Positive|Negative"}
]`
      },
      {
        role: "user",
        content: comments.join('\n---\n')
      }
    ];

    const result = await client.chat.completions.create({
      messages: prompt,
      max_tokens: 400,
      temperature: 0.3
    });

    const response = result.choices[0].message.content.trim();
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return [];
  } catch (error) {
    logger.error('Failed to extract themes:', error);
    return [];
  }
}

/**
 * Get real-time sentiment dashboard
 */
async function getSentimentDashboard() {
  try {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentSentiments = await executeQuery('BotConversation', 'find', {
      type: 'sentiment_analysis',
      timestamp: { $gte: last24Hours }
    });

    const recentFeedbacks = await executeQuery('BotConversation', 'find', {
      type: 'user_feedback',
      timestamp: { $gte: last24Hours }
    });

    const avgSentimentScore = recentSentiments.length > 0 ?
      recentSentiments.reduce((sum, s) => sum + (s.satisfaction || 3), 0) / recentSentiments.length : 3;

    const avgFeedbackRating = recentFeedbacks.length > 0 ?
      recentFeedbacks.reduce((sum, f) => sum + f.rating, 0) / recentFeedbacks.length : 3;

    return {
      success: true,
      period: 'Last 24 Hours',
      sentiment: {
        totalInteractions: recentSentiments.length,
        averageScore: avgSentimentScore.toFixed(2),
        positive: recentSentiments.filter(s => s.sentiment === 'Positive').length,
        negative: recentSentiments.filter(s => s.sentiment === 'Negative' || s.sentiment === 'Frustrated').length,
        neutral: recentSentiments.filter(s => s.sentiment === 'Neutral').length
      },
      feedback: {
        totalFeedbacks: recentFeedbacks.length,
        averageRating: avgFeedbackRating.toFixed(2),
        distribution: {
          5: recentFeedbacks.filter(f => f.rating === 5).length,
          4: recentFeedbacks.filter(f => f.rating === 4).length,
          3: recentFeedbacks.filter(f => f.rating === 3).length,
          2: recentFeedbacks.filter(f => f.rating === 2).length,
          1: recentFeedbacks.filter(f => f.rating === 1).length
        }
      },
      overallHealth: avgSentimentScore > 3.5 && avgFeedbackRating > 3.5 ? 'Excellent' :
                     avgSentimentScore > 2.5 && avgFeedbackRating > 2.5 ? 'Good' : 'Needs Attention'
    };

  } catch (error) {
    logger.error('Failed to get sentiment dashboard:', error);
    return { success: false, error: error.message };
  }
}

export default {
  analyzeSentiment,
  generateEmpatheticResponse,
  getSatisfactionTrends,
  collectFeedback,
  analyzeFeedbackPatterns,
  getSentimentDashboard
};
