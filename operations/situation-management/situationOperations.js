import { executeQuery, COLLECTIONS } from '../../mongodb.js';

/**
 * Situation Management Operations
 * Manages situations and their related data
 */

// ============== SITUATION MANAGEMENT ==============

/**
 * Search situations with flexible filtering
 */
export async function searchSituations(filters = {}) {
  try {
    const query = {};
    
    // Flexible SituationID search
    if (filters.situationId || filters.SituationID) {
      const situationId = filters.situationId || filters.SituationID;
      query.$or = [
        { SituationID: situationId },
        { situationId: situationId },
        { SituationID: new RegExp(situationId, 'i') },
        { situationId: new RegExp(situationId, 'i') }
      ];
    }
    
    // Flexible status search
    if (filters.status) {
      query.$or = query.$or || [];
      const statusConditions = [
        { Status: filters.status },
        { status: filters.status },
        { IncidentStatus: filters.status },
        { incidentStatus: filters.status }
      ];
      if (query.$or.length > 0) {
        query.$and = [{ $or: query.$or }, { $or: statusConditions }];
        delete query.$or;
      } else {
        query.$or = statusConditions;
      }
    }
    
    const limit = filters.limit || 100;
    const sort = { CreatedDate: -1, CreatedTime: -1 };
    const situations = await executeQuery(COLLECTIONS.SITUATIONS, 'find', query, { limit, sort });
    
    return {
      success: true,
      count: situations.length,
      situations,
      message: situations.length === 0 ? 'No situations found matching the criteria' : `Found ${situations.length} situation(s)`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get situation details with all related data
 */
export async function getSituationDetails(situationId) {
  try {
    // Try different field name variations
    let situation = await executeQuery(COLLECTIONS.SITUATIONS, 'findOne', { SituationID: situationId });
    
    if (!situation) {
      situation = await executeQuery(COLLECTIONS.SITUATIONS, 'findOne', { situationId: situationId });
    }
    
    if (!situation) {
      situation = await executeQuery(COLLECTIONS.SITUATIONS, 'findOne', { 
        $or: [
          { SituationID: new RegExp(`^${situationId}$`, 'i') },
          { situationId: new RegExp(`^${situationId}$`, 'i') }
        ]
      });
    }
    
    if (!situation) {
      return { 
        success: false, 
        error: `Situation "${situationId}" not found`,
        suggestions: [
          'Try listing all situations: "show all situations"',
          'Check recent situations: "get recent situations"'
        ]
      };
    }
    
    // Get related solution details
    let solutionDetails = [];
    try {
      solutionDetails = await executeQuery(
        'SituationSolutionDetails',
        'find',
        { 
          $or: [
            { SituationID: situationId },
            { situationId: situationId }
          ]
        }
      );
    } catch (e) {
      console.log('No solution details found');
    }
    
    // Get related alerts
    let relatedAlerts = [];
    try {
      if (situation.AlertReferenceId && situation.AlertReferenceId.length > 0) {
        relatedAlerts = await executeQuery(
          COLLECTIONS.ALERTS,
          'find',
          { 
            $or: [
              { AlertID: { $in: situation.AlertReferenceId } },
              { alertId: { $in: situation.AlertReferenceId } }
            ]
          }
        );
      }
    } catch (e) {
      console.log('No related alerts found');
    }
    
    // Get KI details
    let kiDetails = [];
    try {
      kiDetails = await executeQuery(
        COLLECTIONS.KI_DETAILS,
        'find',
        { 
          $or: [
            { SituationID: situationId },
            { situationId: situationId }
          ]
        }
      );
    } catch (e) {
      console.log('No KI details found');
    }
    
    return {
      success: true,
      situation,
      solutionDetails,
      relatedAlerts,
      kiDetails,
      
      summary: {
        situationId: situation.SituationID || situation.situationId,
        status: situation.Status || situation.status,
        severity: situation.SeverityDetails?.Severity || 'Unknown',
        description: situation.SituationDescription || situation.description,
        entityName: situation.ManagedObjectDetails?.EntityName || 'N/A',
        incidentNo: situation.IncidentDetails?.IncidentNo || 'N/A',
        createdDate: situation.RowCreatedTimeStamp || situation.createdDate,
        modifiedDate: situation.RowModifiedTimeStamp || situation.modifiedDate
      },
      
      detailSections: {
        incidentDetails: situation.IncidentDetails,
        severityDetails: situation.SeverityDetails,
        priorityDetails: situation.PriorityDetails,
        assignmentGroupDetails: situation.AssignmentGroupDetails,
        locationDetails: situation.LocationDetails,
        customerDetails: situation.CustomerDetails,
        managedObjectDetails: situation.ManagedObjectDetails,
        policyDetails: situation.PolicyDetails,
        workflowDetails: situation.WorkflowDetails,
        knowledgeManagementDetails: situation.KnowledgeManagementDetails,
        monitoringToolDetails: situation.MonitoringToolDetails
      },
      
      relatedDataCount: {
        solutions: solutionDetails.length,
        alerts: relatedAlerts.length,
        kiArticles: kiDetails.length
      },
      
      suggestedQuestions: [
        `Show incidents related to ${situationId}`,
        `Get knowledge articles for ${situationId}`,
        `Show all open situations`,
        `Find similar situations to ${situationId}`
      ]
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  searchSituations,
  getSituationDetails
};
