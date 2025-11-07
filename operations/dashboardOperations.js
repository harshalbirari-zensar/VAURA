import { executeQuery, COLLECTIONS } from '../mongodb.js';

/**
 * Dashboard & Reporting Operations
 * Provides overview and metrics across all IT operations
 */

// ============== DASHBOARD & REPORTING ==============

/**
 * Get IT Operations Dashboard
 */
export async function getITOperationsDashboard() {
  try {
    // Get counts from various collections
    const [
      openIncidents,
      openEvents,
      activeServices,
      pendingRequests,
      activeCIs,
      knowledgeArticles
    ] = await Promise.all([
      executeQuery(COLLECTIONS.INCIDENT_HISTORY, 'count', { status: { $ne: 'Closed' } }),
      executeQuery(COLLECTIONS.ALERTS, 'count', { status: 'Open' }),
      executeQuery(COLLECTIONS.BUSINESS_SERVICE, 'count', { status: 'Active' }),
      executeQuery(COLLECTIONS.SERVICE_REQUEST, 'count', { status: { $in: ['Submitted', 'In Progress'] } }),
      executeQuery(COLLECTIONS.CMDB_STORE, 'count', { status: 'Active' }),
      executeQuery(COLLECTIONS.KB_ARTICLE_DETAILS, 'count', { status: 'Published' })
    ]);
    
    return {
      success: true,
      dashboard: {
        incidents: {
          open: openIncidents,
          title: 'Open Incidents'
        },
        events: {
          open: openEvents,
          title: 'Active Events'
        },
        services: {
          active: activeServices,
          title: 'Active Services'
        },
        requests: {
          pending: pendingRequests,
          title: 'Pending Requests'
        },
        cmdb: {
          active: activeCIs,
          title: 'Active Configuration Items'
        },
        knowledge: {
          articles: knowledgeArticles,
          title: 'Knowledge Articles'
        },
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  getITOperationsDashboard
};
