/**
 * Format Situation Response in Vinci Web Style
 * This module formats situation data with all nested details for rich display
 */

export function formatSituationDetails(data) {
  const summary = data.summary || {};
  const sections = data.detailSections || {};
  
  let responseText = `🎯 **Situation Details: ${summary.situationId}**\n\n`;
  
  // === MAIN SUMMARY ===
  responseText += `📋 **Status:** ${summary.status}\n`;
  responseText += `⚠️ **Severity:** ${summary.severity}\n`;
  responseText += `📝 **Description:** ${summary.description}\n`;
  responseText += `🖥️ **Entity:** ${summary.entityName}\n`;
  responseText += `🎫 **Incident #:** ${summary.incidentNo || 'Not Created'}\n`;
  responseText += `📅 **Created:** ${summary.createdDate ? new Date(summary.createdDate).toLocaleString() : 'N/A'}\n`;
  responseText += `🔄 **Modified:** ${summary.modifiedDate ? new Date(summary.modifiedDate).toLocaleString() : 'N/A'}\n\n`;
  
  // === RELATED DATA COUNTS ===
  if (data.relatedDataCount) {
    responseText += `📊 **Related Information:**\n`;
    responseText += `   • Solution Details: ${data.relatedDataCount.solutions}\n`;
    responseText += `   • Related Alerts: ${data.relatedDataCount.alerts}\n`;
    responseText += `   • KI Articles: ${data.relatedDataCount.kiArticles}\n\n`;
  }
  
  // === KEY DETAILS SECTIONS ===
  if (sections.incidentDetails && sections.incidentDetails.IncidentNo) {
    responseText += `🎫 **Incident Information:**\n`;
    responseText += `   • Incident #: ${sections.incidentDetails.IncidentNo}\n`;
    responseText += `   • ITSM ID: ${sections.incidentDetails.ItsmID || 'N/A'}\n`;
    responseText += `   • Status: ${sections.incidentDetails.IncidentStatus || 'N/A'}\n`;
    responseText += `   • Summary: ${sections.incidentDetails.IncidentSummary || 'N/A'}\n\n`;
  }
  
  if (sections.assignmentGroupDetails && sections.assignmentGroupDetails.AssignmentGroupName) {
    responseText += `👥 **Assignment:**\n`;
    responseText += `   • Group: ${sections.assignmentGroupDetails.AssignmentGroupName}\n`;
    responseText += `   • Assigned To: ${sections.assignmentGroupDetails.AssignedTo || 'Unassigned'}\n\n`;
  }
  
  if (sections.customerDetails) {
    responseText += `🏢 **Customer:**\n`;
    responseText += `   • ${sections.customerDetails.CustomerName || 'N/A'}\n\n`;
  }
  
  if (sections.monitoringToolDetails) {
    responseText += `🔧 **Monitoring Tool:**\n`;
    responseText += `   • Tool: ${sections.monitoringToolDetails.MonitoringToolName || 'N/A'}\n`;
    responseText += `   • Connector: ${sections.monitoringToolDetails.ConnectorName || 'N/A'}\n\n`;
  }
  
  responseText += `📋 View complete details with all nested objects in the table below.`;
  
  return responseText;
}

export function formatSituationList(situations, count) {
  let responseText = `📋 **Found ${count} Situation(s)**\n\n`;
  
  if (count === 0) {
    responseText += `No situations found matching your criteria.\n\n`;
    responseText += `💡 **Try:**\n`;
    responseText += `• "show all situations"\n`;
    responseText += `• "list open situations"\n`;
    responseText += `• "get situation SID1 details"\n`;
  } else {
    responseText += `View the situations list in the table below.`;
  }
  
  return responseText;
}
