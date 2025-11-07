import { executeQuery, COLLECTIONS } from '../../mongodb.js';

/**
 * Event & Alert Management Operations
 * Handles EventHub operations for managing events and alerts
 */

// ============== EVENT HUB OPERATIONS ==============

/**
 * Search events in EventHub
 */
export async function searchEvents(filters = {}) {
  try {
    const query = {};
    
    if (filters.eventType) query.eventType = new RegExp(filters.eventType, 'i');
    if (filters.severity) query.severity = filters.severity;
    if (filters.status) query.status = filters.status;
    if (filters.fromDate) query.timestamp = { $gte: new Date(filters.fromDate) };
    if (filters.toDate) query.timestamp = { ...query.timestamp, $lte: new Date(filters.toDate) };
    
    const limit = filters.limit || 50;
    const events = await executeQuery(COLLECTIONS.ALERTS, 'find', query, { limit, sort: { timestamp: -1 } });
    
    return {
      success: true,
      count: events.length,
      events
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create new event in EventHub
 */
export async function createEvent(eventData) {
  try {
    const event = {
      ...eventData,
      timestamp: new Date(),
      createdAt: new Date(),
      status: eventData.status || 'Open'
    };
    
    const result = await executeQuery(COLLECTIONS.ALERTS, 'insertOne', event);
    return { success: true, eventId: result.insertedId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update event status
 */
export async function updateEventStatus(eventId, status, resolution = null) {
  try {
    const update = {
      $set: {
        status,
        updatedAt: new Date(),
        ...(resolution && { resolution })
      }
    };
    
    const result = await executeQuery(
      COLLECTIONS.ALERTS,
      'updateOne',
      { _id: eventId },
      update
    );
    
    return { success: true, modifiedCount: result.modifiedCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  searchEvents,
  createEvent,
  updateEventStatus
};
