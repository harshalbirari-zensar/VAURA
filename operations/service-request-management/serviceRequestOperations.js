import { executeQuery, COLLECTIONS } from '../../mongodb.js';

/**
 * Service Request Management Operations
 * Manages service catalog and service requests
 */

// ============== SERVICE CATALOG OPERATIONS ==============

/**
 * Get service catalog items
 */
export async function getServiceCatalog(filters = {}) {
  try {
    const query = { isActive: true };
    
    if (filters.category) query.category = filters.category;
    if (filters.type) query.type = filters.type;
    if (filters.search) {
      query.$or = [
        { name: new RegExp(filters.search, 'i') },
        { description: new RegExp(filters.search, 'i') }
      ];
    }
    
    const limit = filters.limit || 100;
    const items = await executeQuery(COLLECTIONS.SERVICE_CATALOGS, 'find', query, { limit });
    
    return {
      success: true,
      count: items.length,
      catalogItems: items
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get service catalog item by ID
 */
export async function getCatalogItem(itemId) {
  try {
    const item = await executeQuery(COLLECTIONS.SERVICE_CATALOGS, 'findOne', { itemId });
    return { success: true, item };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Request a service from catalog
 */
export async function requestService(itemId, requestData) {
  try {
    const catalogItem = await executeQuery(COLLECTIONS.SERVICE_CATALOGS, 'findOne', { itemId });
    
    if (!catalogItem) {
      return { success: false, error: 'Catalog item not found' };
    }
    
    const serviceRequest = {
      catalogItemId: itemId,
      catalogItemName: catalogItem.name,
      requestedBy: requestData.requestedBy,
      requestedFor: requestData.requestedFor || requestData.requestedBy,
      requestDetails: requestData.details || {},
      status: 'Submitted',
      priority: requestData.priority || 'Medium',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await executeQuery(COLLECTIONS.SERVICE_REQUEST, 'insertOne', serviceRequest);
    
    return {
      success: true,
      requestId: result.insertedId,
      message: 'Service request submitted successfully'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get service categories
 */
export async function getServiceCategories() {
  try {
    const categories = await executeQuery(
      COLLECTIONS.SERVICE_CATALOGS,
      'aggregate',
      [
        { $match: { isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]
    );
    
    return {
      success: true,
      categories: categories.map(c => ({ name: c._id, count: c.count }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  getServiceCatalog,
  getCatalogItem,
  requestService,
  getServiceCategories
};
