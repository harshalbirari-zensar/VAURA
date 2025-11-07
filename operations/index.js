/**
 * IT Operations Module - Unified Export
 * 
 * This module provides a centralized export for all IT operations modules:
 * - Event & Alert Management
 * - CMDB (Configuration Management Database)
 * - Business Service Management
 * - Situation Management
 * - Knowledge Management
 * - Incident Management
 * - Service Request Management
 * - Change Management
 * - Dashboard & Reporting
 */

// Event & Alert Management
import * as eventOps from './event-alert-management/eventOperations.js';
import * as predictiveOps from './event-alert-management/predictiveAnalytics.js';

// CMDB
import * as cmdbOps from './cmdb/cmdbOperations.js';

// Business Service Management
import * as businessServiceOps from './business-service-management/businessServiceOperations.js';

// Situation Management
import * as situationOps from './situation-management/situationOperations.js';

// Knowledge Management
import * as knowledgeOps from './knowledge-management/knowledgeOperations.js';

// Incident Management
import * as incidentOps from './incident-management/incidentOperations.js';

// Service Request Management
import * as serviceRequestOps from './service-request-management/serviceRequestOperations.js';

// Change Management
import * as changeOps from './change-management/changeOperations.js';

// Dashboard
import * as dashboardOps from './dashboardOperations.js';

// Export all operations with organized namespaces
export const EventAlertManagement = {
  ...eventOps.default,
  ...predictiveOps
};

export const CMDB = cmdbOps.default;
export const BusinessService = businessServiceOps.default;
export const Situation = situationOps.default;
export const Knowledge = knowledgeOps.default;
export const Incident = incidentOps.default;
export const ServiceRequest = serviceRequestOps.default;
export const Change = changeOps.default;
export const Dashboard = dashboardOps.default;

// Legacy compatibility - export individual functions for backward compatibility
export const {
  searchEvents,
  createEvent,
  updateEventStatus
} = eventOps;

export const {
  searchCMDB,
  getCMDBItem,
  addCMDBItem,
  updateCMDBItem,
  getCMDBRelationships,
  getNoisyCIs,
  getNoisyCIDetails
} = cmdbOps;

export const {
  getBusinessServices,
  getBusinessService,
  getServiceHealth
} = businessServiceOps;

export const {
  searchSituations,
  getSituationDetails
} = situationOps;

export const {
  searchKnowledge,
  getKnowledgeArticle,
  createKnowledgeArticle,
  getRelatedArticles
} = knowledgeOps;

export const {
  getIncidents,
  createIncident,
  updateIncident
} = incidentOps;

export const {
  getServiceCatalog,
  getCatalogItem,
  requestService,
  getServiceCategories
} = serviceRequestOps;

export const {
  getITOperationsDashboard
} = dashboardOps;

// Default export with all modules and legacy flat functions
export default {
  // Namespace exports
  EventAlertManagement,
  CMDB,
  BusinessService,
  Situation,
  Knowledge,
  Incident,
  ServiceRequest,
  Change,
  Dashboard,
  
  // Legacy flat exports for backward compatibility
  searchEvents,
  createEvent,
  updateEventStatus,
  searchCMDB,
  getCMDBItem,
  addCMDBItem,
  updateCMDBItem,
  getCMDBRelationships,
  getNoisyCIs,
  getNoisyCIDetails,
  getBusinessServices,
  getBusinessService,
  getServiceHealth,
  searchSituations,
  getSituationDetails,
  searchKnowledge,
  getKnowledgeArticle,
  createKnowledgeArticle,
  getRelatedArticles,
  getIncidents,
  createIncident,
  updateIncident,
  getServiceCatalog,
  getCatalogItem,
  requestService,
  getServiceCategories,
  getITOperationsDashboard
};
