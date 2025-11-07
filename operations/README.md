# IT Operations Modules

This directory contains organized modules for all IT Operations Management functionalities.

## Directory Structure

```
operations/
├── event-alert-management/      # Event & Alert Management
│   ├── eventOperations.js       # Event/Alert CRUD operations
│   └── predictiveAnalytics.js   # Predictive analytics & trend analysis
│
├── cmdb/                        # Configuration Management Database
│   ├── cmdbOperations.js        # CMDB operations & CI management
│   ├── testCMDB.js              # CMDB testing utilities
│   └── testNoisyCI.js           # Noisy CI testing utilities
│
├── business-service-management/ # Business Service Management
│   └── businessServiceOperations.js  # Service health & monitoring
│
├── situation-management/        # Situation Management
│   ├── situationOperations.js   # Situation CRUD & queries
│   └── formatSituationResponse.js  # Situation response formatting
│
├── knowledge-management/        # Knowledge Management
│   └── knowledgeOperations.js   # Knowledge base article operations
│
├── incident-management/         # Incident Management
│   ├── incidentOperations.js    # Incident CRUD operations
│   ├── aiAutoResolution.js      # AI-powered auto-resolution
│   ├── intelligentRouting.js    # Smart incident routing & escalation
│   └── sentimentAnalysis.js     # User sentiment analysis
│
├── service-request-management/  # Service Request Management
│   └── serviceRequestOperations.js  # Service catalog & requests
│
├── change-management/           # Change Management
│   └── changeOperations.js      # Change request operations (placeholder)
│
├── dashboardOperations.js       # Cross-module dashboard & reporting
└── index.js                     # Unified export of all operations
```

## Usage

### Import All Operations
```javascript
import operations from './operations/index.js';

// Use organized namespaces
const incidents = await operations.Incident.getIncidents();
const cmdbItems = await operations.CMDB.searchCMDB({ status: 'Active' });
```

### Import Specific Module
```javascript
import { Incident, CMDB } from './operations/index.js';

const incidents = await Incident.getIncidents();
const cmdbItems = await CMDB.searchCMDB({ status: 'Active' });
```

### Import Individual Functions (Legacy Compatibility)
```javascript
import { searchCMDB, getIncidents } from './operations/index.js';

const cmdbItems = await searchCMDB({ status: 'Active' });
const incidents = await getIncidents();
```

## Modules Overview

### ✅ Event & Alert Management
- Search, create, and update events/alerts
- Predictive analytics for proactive issue detection
- Alert trend analysis
- Anomaly detection

### ✅ CMDB (Configuration Management Database)
- Configuration Item (CI) management
- CI relationships tracking
- Noisy CI identification (high alert generators)
- CI lifecycle management

### ✅ Business Service Management
- Business service catalog
- Service health monitoring
- Service availability tracking
- Impact analysis

### ✅ Situation Management
- Situation search and retrieval
- Detailed situation information with related data
- Solution details integration
- Alert correlation

### ✅ Knowledge Management
- Knowledge article search
- Article creation and management
- Related article suggestions
- View tracking and analytics

### ✅ Incident Management
- Incident lifecycle management
- AI-powered auto-resolution
- Intelligent routing and escalation
- Sentiment analysis for user satisfaction

### ✅ Service Request Management
- Service catalog browsing
- Service request submission
- Category management
- Request tracking

### ✅ Change Management
- Change request operations (Coming soon)
- Change approval workflow (Planned)
- Impact assessment (Planned)

### ✅ Dashboard & Reporting
- Cross-module metrics
- Real-time operational overview
- KPI tracking

## Testing

Each module includes test utilities where applicable:

```bash
# Test CMDB operations
node operations/cmdb/testCMDB.js

# Test Noisy CI detection
node operations/cmdb/testNoisyCI.js
```

## Module Dependencies

All modules depend on:
- `mongodb.js` - Database connection and query execution
- `logger.js` - Centralized logging

AI-powered modules additionally require:
- Azure OpenAI endpoint configuration
- Environment variables in `.env`

## Contributing

When adding new operations:
1. Place files in the appropriate module folder
2. Export functions from the module's operation file
3. Update `operations/index.js` to include new exports
4. Add documentation to this README

## Migration Notes

This structure replaces the monolithic `itOperations.js` file with:
- Better organization by business domain
- Easier maintenance and testing
- Clear separation of concerns
- Improved code reusability
