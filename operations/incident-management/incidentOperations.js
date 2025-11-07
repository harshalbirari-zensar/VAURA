import { executeQuery, COLLECTIONS } from '../../mongodb.js';

/**
 * Incident Management Operations
 * Manages incidents, their lifecycle, and resolution
 */

// ============== INCIDENT MANAGEMENT ==============

/**
 * Get incidents
 */
export async function getIncidents(filters = {}) {
  try {
    const query = {};
    
    if (filters.status) query.IncidentStatus = filters.status;
    if (filters.priority) query['PriorityDetails.PriorityName'] = filters.priority;
    if (filters.assignedTo) query['AssignmentGroupDetails.AssignedTo'] = filters.assignedTo;
    
    const limit = filters.limit || 50;
    const incidents = await executeQuery(COLLECTIONS.INCIDENT_HISTORY, 'find', query, { limit, sort: { RowCreatedTimeStamp: -1 } });
    
    return {
      success: true,
      count: incidents.length,
      incidents
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create new incident
 */
export async function createIncident(incidentData) {
  try {
    const incident = {
      ...incidentData,
      IncidentStatus: incidentData.status || 'New',
      PriorityDetails: {
        PriorityName: incidentData.priority || 'Medium'
      },
      RowCreatedTimeStamp: new Date(),
      RowModifiedTimeStamp: new Date()
    };
    
    const result = await executeQuery(COLLECTIONS.INCIDENT_HISTORY, 'insertOne', incident);
    return { success: true, incidentId: result.insertedId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update incident
 */
export async function updateIncident(incidentId, updates) {
  try {
    const update = {
      $set: {
        ...updates,
        RowModifiedTimeStamp: new Date()
      }
    };
    
    const result = await executeQuery(
      COLLECTIONS.INCIDENT_HISTORY,
      'updateOne',
      { _id: incidentId },
      update
    );
    
    return { success: true, modifiedCount: result.modifiedCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  getIncidents,
  createIncident,
  updateIncident
};
