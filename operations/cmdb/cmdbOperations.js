import { executeQuery, COLLECTIONS } from '../../mongodb.js';

/**
 * CMDB (Configuration Management Database) Operations
 * Manages Configuration Items (CIs) and their relationships
 */

// ============== CMDB OPERATIONS ==============

/**
 * Search Configuration Items (CI) in CMDB
 */
export async function searchCMDB(filters = {}) {
  try {
    const query = {};
    
    if (filters.ciType) query.ciType = filters.ciType;
    if (filters.status) query.status = filters.status;
    if (filters.owner) query.owner = new RegExp(filters.owner, 'i');
    if (filters.location) query.location = new RegExp(filters.location, 'i');
    
    // Use regex search instead of $text to avoid index requirement
    if (filters.search) {
      query.$or = [
        { EntityName: new RegExp(filters.search, 'i') },
        { CIName: new RegExp(filters.search, 'i') },
        { HostName: new RegExp(filters.search, 'i') },
        { CIType: new RegExp(filters.search, 'i') },
        { Description: new RegExp(filters.search, 'i') }
      ];
    }
    
    // Search by CI name if provided
    if (filters.ciName) {
      query.$or = [
        { EntityName: new RegExp(filters.ciName, 'i') },
        { CIName: new RegExp(filters.ciName, 'i') },
        { HostName: new RegExp(filters.ciName, 'i') }
      ];
    }
    
    const limit = filters.limit || 50;
    const items = await executeQuery(COLLECTIONS.CMDB_STORE, 'find', query, { limit });
    
    return {
      success: true,
      count: items.length,
      configurationItems: items
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get CI by ID
 */
export async function getCMDBItem(ciId) {
  try {
    const item = await executeQuery(COLLECTIONS.CMDB_STORE, 'findOne', { ciId });
    return { success: true, item };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get top noisy CIs (high-frequency alert generators)
 */
export async function getNoisyCIs(limit = 5) {
  try {
    // NoisyCI collection has a unique structure with a 'source' array
    const result = await executeQuery(COLLECTIONS.NOISY_CI, 'findOne', {});
    
    if (!result || !result.source || !Array.isArray(result.source)) {
      return {
        success: false,
        error: 'No noisy CI data available'
      };
    }
    
    // Sort by alert count (y field) and get top N
    const topCIs = result.source
      .sort((a, b) => (b.y || 0) - (a.y || 0))
      .slice(0, limit);
    
    return {
      success: true,
      count: topCIs.length,
      noisyCIs: topCIs.map(ci => ({
        ciName: ci.name || 'Unknown',
        alertCount: ci.y || 0,
        description: ci.view || 'No description',
        severity: ci.y > 100 ? 'Critical' : ci.y > 20 ? 'High' : 'Medium'
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get specific CI details by name from NoisyCI data
 */
export async function getNoisyCIDetails(ciName) {
  try {
    const result = await executeQuery(COLLECTIONS.NOISY_CI, 'findOne', {});
    
    if (!result || !result.source || !Array.isArray(result.source)) {
      return {
        success: false,
        error: 'No noisy CI data available'
      };
    }
    
    // Search for the specific CI by name
    const ci = result.source.find(item => 
      item.name && item.name.toUpperCase().includes(ciName.toUpperCase())
    );
    
    if (!ci) {
      return {
        success: false,
        error: `CI '${ciName}' not found in noisy CI data`
      };
    }
    
    return {
      success: true,
      ci: {
        ciName: ci.name,
        alertCount: ci.y || 0,
        description: ci.view || 'No description',
        severity: ci.y > 100 ? 'Critical' : ci.y > 20 ? 'High' : 'Medium',
        status: 'Generating High Alert Volume',
        recommendation: ci.y > 100 
          ? '🚨 CRITICAL: Immediate attention required. This CI is generating excessive alerts.'
          : ci.y > 20
          ? '⚠️ HIGH: This CI requires investigation to reduce alert volume.'
          : '📊 MEDIUM: Monitor this CI for alert patterns.'
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Add new CI to CMDB
 */
export async function addCMDBItem(ciData) {
  try {
    const ci = {
      ...ciData,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: ciData.status || 'Active'
    };
    
    const result = await executeQuery(COLLECTIONS.CMDB_STORE, 'insertOne', ci);
    return { success: true, ciId: result.insertedId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update CI in CMDB
 */
export async function updateCMDBItem(ciId, updates) {
  try {
    const update = {
      $set: {
        ...updates,
        updatedAt: new Date()
      }
    };
    
    const result = await executeQuery(
      COLLECTIONS.CMDB_STORE,
      'updateOne',
      { ciId },
      update
    );
    
    return { success: true, modifiedCount: result.modifiedCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get CI relationships
 */
export async function getCMDBRelationships(ciId) {
  try {
    const pipeline = [
      { $match: { ciId } },
      {
        $lookup: {
          from: COLLECTIONS.CMDB_STORE,
          localField: 'relationships.relatedCiId',
          foreignField: 'ciId',
          as: 'relatedItems'
        }
      }
    ];
    
    const result = await executeQuery(COLLECTIONS.CMDB_STORE, 'aggregate', pipeline);
    return { success: true, relationships: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  searchCMDB,
  getCMDBItem,
  addCMDBItem,
  updateCMDBItem,
  getCMDBRelationships,
  getNoisyCIs,
  getNoisyCIDetails
};
