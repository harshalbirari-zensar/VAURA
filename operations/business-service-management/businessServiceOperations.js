import { executeQuery, COLLECTIONS } from '../../mongodb.js';

/**
 * Business Service Management Operations
 * Manages business services and their health monitoring
 */

// ============== BUSINESS SERVICE OPERATIONS ==============

/**
 * Get all business services
 */
export async function getBusinessServices(filters = {}) {
  try {
    const query = {};
    
    if (filters.status) query.status = filters.status;
    if (filters.owner) query.owner = new RegExp(filters.owner, 'i');
    if (filters.search) {
      query.$text = { $search: filters.search };
    }
    
    const limit = filters.limit || 100;
    const services = await executeQuery(COLLECTIONS.BUSINESS_SERVICE, 'find', query, { limit });
    
    return {
      success: true,
      count: services.length,
      services
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get business service by ID
 */
export async function getBusinessService(serviceId) {
  try {
    const service = await executeQuery(COLLECTIONS.BUSINESS_SERVICE, 'findOne', { serviceId });
    return { success: true, service };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get service health status
 */
export async function getServiceHealth(serviceId) {
  try {
    const service = await executeQuery(COLLECTIONS.BUSINESS_SERVICE, 'findOne', { serviceId });
    
    if (!service) {
      return { success: false, error: 'Service not found' };
    }
    
    // Get related incidents and events
    const incidents = await executeQuery(COLLECTIONS.INCIDENT_HISTORY, 'find', { serviceId, status: { $ne: 'Closed' } });
    const events = await executeQuery(COLLECTIONS.ALERTS, 'find', { serviceId, status: 'Open' });
    
    const health = {
      serviceId,
      serviceName: service.serviceName,
      status: service.status,
      availability: service.availability || 100,
      openIncidents: incidents.length,
      openEvents: events.length,
      lastChecked: new Date()
    };
    
    return { success: true, health };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  getBusinessServices,
  getBusinessService,
  getServiceHealth
};
