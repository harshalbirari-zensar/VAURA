import { executeQuery, COLLECTIONS } from '../../mongodb.js';

/**
 * Knowledge Management Operations
 * Manages knowledge base articles and search
 */

// ============== KNOWLEDGE HUB OPERATIONS ==============

/**
 * Search knowledge articles
 */
export async function searchKnowledge(searchTerm, filters = {}) {
  try {
    const query = {
      $text: { $search: searchTerm }
    };
    
    if (filters.category) query.category = filters.category;
    if (filters.tags) query.tags = { $in: filters.tags };
    if (filters.status) query.status = filters.status;
    
    const limit = filters.limit || 20;
    const articles = await executeQuery(
      COLLECTIONS.KB_ARTICLE_DETAILS,
      'find',
      query,
      { limit, sort: { score: { $meta: 'textScore' } } }
    );
    
    return {
      success: true,
      count: articles.length,
      articles
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get knowledge article by ID
 */
export async function getKnowledgeArticle(articleId) {
  try {
    const article = await executeQuery(COLLECTIONS.KB_ARTICLE_DETAILS, 'findOne', { articleId });
    
    if (article) {
      // Increment view count
      await executeQuery(
        COLLECTIONS.KB_ARTICLE_DETAILS,
        'updateOne',
        { articleId },
        { $inc: { views: 1 }, $set: { lastViewed: new Date() } }
      );
    }
    
    return { success: true, article };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create knowledge article
 */
export async function createKnowledgeArticle(articleData) {
  try {
    const article = {
      ...articleData,
      createdAt: new Date(),
      updatedAt: new Date(),
      views: 0,
      helpful: 0,
      notHelpful: 0,
      status: articleData.status || 'Draft'
    };
    
    const result = await executeQuery(COLLECTIONS.KB_ARTICLE_DETAILS, 'insertOne', article);
    return { success: true, articleId: result.insertedId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get related knowledge articles
 */
export async function getRelatedArticles(articleId, limit = 5) {
  try {
    const article = await executeQuery(COLLECTIONS.KB_ARTICLE_DETAILS, 'findOne', { articleId });
    
    if (!article) {
      return { success: false, error: 'Article not found' };
    }
    
    // Find related articles by tags and category
    const query = {
      articleId: { $ne: articleId },
      $or: [
        { category: article.category },
        { tags: { $in: article.tags || [] } }
      ]
    };
    
    const related = await executeQuery(COLLECTIONS.KB_ARTICLE_DETAILS, 'find', query, { limit });
    
    return { success: true, relatedArticles: related };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  searchKnowledge,
  getKnowledgeArticle,
  createKnowledgeArticle,
  getRelatedArticles
};
