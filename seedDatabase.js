import { initializeMongoDB, executeQuery, COLLECTIONS } from './mongodb.js';

/**
 * Sample data seeder for IT Operations MongoDB collections
 * Run this script to populate the database with test data
 */

async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');
  
  try {
    // Initialize MongoDB connection
    await initializeMongoDB();
    
    // Seed EventHub
    await seedEventHub();
    
    // Seed CMDB
    await seedCMDB();
    
    // Seed Business Services
    await seedBusinessServices();
    
    // Seed Knowledge Hub
    await seedKnowledgeHub();
    
    // Seed Service Catalogs
    await seedServiceCatalogs();
    
    // Seed Incidents
    await seedIncidents();
    
    console.log('\n✅ Database seeding completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Seed EventHub with sample events
async function seedEventHub() {
  console.log('📊 Seeding EventHub...');
  
  const events = [
    {
      eventType: 'Alert',
      severity: 'Critical',
      status: 'Open',
      title: 'Database Connection Timeout',
      description: 'Production database is experiencing connection timeouts',
      serviceId: 'SRV-001',
      timestamp: new Date(),
      createdAt: new Date(),
      source: 'Monitoring System'
    },
    {
      eventType: 'Incident',
      severity: 'High',
      status: 'In Progress',
      title: 'Email Service Down',
      description: 'Exchange server is not responding',
      serviceId: 'SRV-002',
      timestamp: new Date(Date.now() - 3600000),
      createdAt: new Date(Date.now() - 3600000),
      source: 'User Report'
    },
    {
      eventType: 'Change',
      severity: 'Medium',
      status: 'Resolved',
      title: 'Network Switch Upgrade',
      description: 'Core network switch firmware updated',
      serviceId: 'SRV-003',
      timestamp: new Date(Date.now() - 86400000),
      createdAt: new Date(Date.now() - 86400000),
      resolvedAt: new Date(Date.now() - 7200000),
      source: 'Change Management'
    },
    {
      eventType: 'Alert',
      severity: 'Low',
      status: 'Open',
      title: 'Disk Space Warning',
      description: 'Server SRV-WEB-01 disk usage at 75%',
      serviceId: 'SRV-004',
      timestamp: new Date(),
      createdAt: new Date(),
      source: 'Monitoring System'
    }
  ];
  
  for (const event of events) {
    await executeQuery(COLLECTIONS.EVENTHUB, 'insertOne', event);
  }
  
  console.log(`   ✓ Created ${events.length} events`);
}

// Seed CMDB with configuration items
async function seedCMDB() {
  console.log('📊 Seeding CMDB...');
  
  const cis = [
    {
      ciId: 'CI-SRV-001',
      ciType: 'Server',
      name: 'PROD-WEB-01',
      description: 'Production Web Server - Primary',
      status: 'Active',
      owner: 'IT Operations',
      location: 'Datacenter-A Rack-15',
      ipAddress: '192.168.1.10',
      osType: 'Windows Server 2022',
      cpu: '8 cores',
      memory: '32 GB',
      storage: '500 GB SSD',
      relationships: [
        { relatedCiId: 'CI-NET-001', relationshipType: 'Connected To' },
        { relatedCiId: 'CI-APP-001', relationshipType: 'Hosts' }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      ciId: 'CI-NET-001',
      ciType: 'Network',
      name: 'CORE-SWITCH-01',
      description: 'Core Network Switch',
      status: 'Active',
      owner: 'Network Team',
      location: 'Datacenter-A Rack-01',
      model: 'Cisco Catalyst 9500',
      ports: 48,
      relationships: [
        { relatedCiId: 'CI-SRV-001', relationshipType: 'Connects' }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      ciId: 'CI-APP-001',
      ciType: 'Application',
      name: 'Customer Portal',
      description: 'Main customer-facing web application',
      status: 'Active',
      owner: 'Application Team',
      version: '2.5.1',
      technology: 'ASP.NET Core',
      relationships: [
        { relatedCiId: 'CI-SRV-001', relationshipType: 'Runs On' },
        { relatedCiId: 'CI-DB-001', relationshipType: 'Depends On' }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      ciId: 'CI-DB-001',
      ciType: 'Database',
      name: 'PROD-SQL-01',
      description: 'Production SQL Server Database',
      status: 'Active',
      owner: 'Database Team',
      location: 'Datacenter-A Rack-20',
      dbType: 'Microsoft SQL Server',
      version: '2019 Enterprise',
      size: '2 TB',
      relationships: [
        { relatedCiId: 'CI-APP-001', relationshipType: 'Supports' }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  
  for (const ci of cis) {
    await executeQuery(COLLECTIONS.CMDB, 'insertOne', ci);
  }
  
  console.log(`   ✓ Created ${cis.length} configuration items`);
}

// Seed Business Services
async function seedBusinessServices() {
  console.log('📊 Seeding Business Services...');
  
  const services = [
    {
      serviceId: 'SRV-001',
      serviceName: 'Customer Portal Service',
      status: 'Active',
      availability: 99.9,
      owner: 'IT Operations',
      description: 'Public-facing customer portal for account management',
      category: 'Customer Service',
      criticality: 'High',
      supportLevel: '24x7',
      dependencies: ['SRV-003', 'SRV-004'],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      serviceId: 'SRV-002',
      serviceName: 'Email Service',
      status: 'Degraded',
      availability: 95.5,
      owner: 'Communication Team',
      description: 'Corporate email and collaboration platform',
      category: 'Communication',
      criticality: 'High',
      supportLevel: '24x7',
      dependencies: [],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      serviceId: 'SRV-003',
      serviceName: 'Payment Processing',
      status: 'Active',
      availability: 99.99,
      owner: 'Finance IT',
      description: 'Payment gateway and transaction processing',
      category: 'Financial',
      criticality: 'Critical',
      supportLevel: '24x7',
      dependencies: ['SRV-004'],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      serviceId: 'SRV-004',
      serviceName: 'Database Service',
      status: 'Active',
      availability: 99.95,
      owner: 'Database Team',
      description: 'Centralized database services',
      category: 'Infrastructure',
      criticality: 'Critical',
      supportLevel: '24x7',
      dependencies: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  
  for (const service of services) {
    await executeQuery(COLLECTIONS.BUSINESS_SERVICE, 'insertOne', service);
  }
  
  console.log(`   ✓ Created ${services.length} business services`);
}

// Seed Knowledge Hub
async function seedKnowledgeHub() {
  console.log('📊 Seeding Knowledge Hub...');
  
  const articles = [
    {
      articleId: 'KB-001',
      title: 'How to Reset Your Password',
      content: `# Password Reset Guide

## Steps to Reset Your Password:

1. Go to the login page
2. Click "Forgot Password" link
3. Enter your email address
4. Check your email for reset link
5. Click the link and create new password

## Password Requirements:
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

## Need Help?
Contact IT Support at ext. 5555`,
      category: 'Security',
      tags: ['password', 'security', 'authentication', 'account'],
      status: 'Published',
      views: 245,
      helpful: 198,
      notHelpful: 12,
      author: 'IT Security Team',
      createdAt: new Date(Date.now() - 2592000000),
      updatedAt: new Date(Date.now() - 1296000000),
      lastViewed: new Date()
    },
    {
      articleId: 'KB-002',
      title: 'VPN Setup and Configuration',
      content: `# VPN Setup Guide

## For Windows:
1. Download VPN client from IT Portal
2. Run installer as administrator
3. Enter provided credentials
4. Connect to corporate VPN

## For Mac:
1. Download Mac VPN client
2. Install application
3. Configure with your credentials
4. Connect

## Troubleshooting:
- Check internet connection
- Verify credentials
- Restart VPN client
- Contact IT if issues persist`,
      category: 'Networking',
      tags: ['vpn', 'remote access', 'networking', 'security'],
      status: 'Published',
      views: 532,
      helpful: 489,
      notHelpful: 28,
      author: 'Network Team',
      createdAt: new Date(Date.now() - 5184000000),
      updatedAt: new Date(Date.now() - 2592000000),
      lastViewed: new Date()
    },
    {
      articleId: 'KB-003',
      title: 'Email Configuration for Mobile Devices',
      content: `# Mobile Email Setup

## iOS Devices:
1. Open Settings > Mail
2. Add Account > Exchange
3. Enter: email@company.com
4. Server: mail.company.com
5. Enter password

## Android Devices:
1. Open Email app
2. Add Exchange account
3. Enter credentials
4. Configure sync settings

## Common Issues:
- Invalid server address
- Wrong password
- Security certificate errors`,
      category: 'Email',
      tags: ['email', 'mobile', 'configuration', 'exchange'],
      status: 'Published',
      views: 387,
      helpful: 341,
      notHelpful: 19,
      author: 'Support Team',
      createdAt: new Date(Date.now() - 3888000000),
      updatedAt: new Date(Date.now() - 1728000000),
      lastViewed: new Date()
    },
    {
      articleId: 'KB-004',
      title: 'Software Installation Request Process',
      content: `# Software Installation Guide

## How to Request Software:

1. Visit IT Service Portal
2. Go to Service Catalog
3. Select "Software Request"
4. Choose software from list
5. Provide justification
6. Submit request

## Approval Process:
- Manager approval required
- IT Security review
- License verification
- Installation scheduled

## Timeline:
Standard requests: 2-3 business days
Priority requests: Same day (with approval)`,
      category: 'Software',
      tags: ['software', 'installation', 'service request', 'catalog'],
      status: 'Published',
      views: 156,
      helpful: 142,
      notHelpful: 8,
      author: 'Service Desk',
      createdAt: new Date(Date.now() - 1728000000),
      updatedAt: new Date(Date.now() - 864000000),
      lastViewed: new Date()
    }
  ];
  
  for (const article of articles) {
    await executeQuery(COLLECTIONS.KNOWLEDGE_HUB, 'insertOne', article);
  }
  
  console.log(`   ✓ Created ${articles.length} knowledge articles`);
}

// Seed Service Catalogs
async function seedServiceCatalogs() {
  console.log('📊 Seeding Service Catalogs...');
  
  const catalogItems = [
    {
      itemId: 'CAT-001',
      name: 'New Laptop Request',
      description: 'Request a new laptop for employee',
      category: 'Hardware',
      type: 'Standard',
      isActive: true,
      estimatedDelivery: '5-7 business days',
      approvalRequired: true,
      price: 1200,
      specifications: 'Intel i7, 16GB RAM, 512GB SSD',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      itemId: 'CAT-002',
      name: 'Microsoft Office License',
      description: 'Microsoft Office 365 license',
      category: 'Software',
      type: 'Standard',
      isActive: true,
      estimatedDelivery: '1-2 business days',
      approvalRequired: true,
      price: 150,
      specifications: 'Office 365 E3 License',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      itemId: 'CAT-003',
      name: 'VPN Access Request',
      description: 'Request VPN access for remote work',
      category: 'Access',
      type: 'Standard',
      isActive: true,
      estimatedDelivery: 'Same day',
      approvalRequired: true,
      price: 0,
      specifications: 'Corporate VPN with 2FA',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      itemId: 'CAT-004',
      name: 'Additional Monitor',
      description: 'Request additional monitor for workstation',
      category: 'Hardware',
      type: 'Standard',
      isActive: true,
      estimatedDelivery: '3-5 business days',
      approvalRequired: true,
      price: 300,
      specifications: '27-inch 4K Monitor',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      itemId: 'CAT-005',
      name: 'Database Access Request',
      description: 'Request access to specific database',
      category: 'Access',
      type: 'Standard',
      isActive: true,
      estimatedDelivery: '1-2 business days',
      approvalRequired: true,
      price: 0,
      specifications: 'Read/Write access based on role',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      itemId: 'CAT-006',
      name: 'IT Support - Onsite',
      description: 'Request onsite IT support',
      category: 'Support',
      type: 'Expedited',
      isActive: true,
      estimatedDelivery: '2-4 hours',
      approvalRequired: false,
      price: 0,
      specifications: 'Onsite technical assistance',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  
  for (const item of catalogItems) {
    await executeQuery(COLLECTIONS.SERVICE_CATALOGS, 'insertOne', item);
  }
  
  console.log(`   ✓ Created ${catalogItems.length} service catalog items`);
}

// Seed Incidents
async function seedIncidents() {
  console.log('📊 Seeding Incidents...');
  
  const incidents = [
    {
      incidentId: 'INC-001',
      title: 'Unable to access email',
      description: 'User cannot login to email account. Getting authentication error.',
      status: 'New',
      priority: 'Medium',
      serviceId: 'SRV-002',
      category: 'Email',
      assignedTo: 'support@company.com',
      reportedBy: 'john.doe@company.com',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      incidentId: 'INC-002',
      title: 'Application performance degradation',
      description: 'Customer portal is responding slowly. Load times over 10 seconds.',
      status: 'In Progress',
      priority: 'High',
      serviceId: 'SRV-001',
      category: 'Performance',
      assignedTo: 'appteam@company.com',
      reportedBy: 'monitoring@company.com',
      createdAt: new Date(Date.now() - 3600000),
      updatedAt: new Date()
    },
    {
      incidentId: 'INC-003',
      title: 'VPN connection failure',
      description: 'Cannot establish VPN connection from home. Error code 806.',
      status: 'New',
      priority: 'Medium',
      serviceId: 'SRV-003',
      category: 'Network',
      assignedTo: 'network@company.com',
      reportedBy: 'jane.smith@company.com',
      createdAt: new Date(Date.now() - 1800000),
      updatedAt: new Date(Date.now() - 1800000)
    },
    {
      incidentId: 'INC-004',
      title: 'Database backup failed',
      description: 'Nightly database backup job failed with timeout error.',
      status: 'Resolved',
      priority: 'Critical',
      serviceId: 'SRV-004',
      category: 'Database',
      assignedTo: 'dba@company.com',
      reportedBy: 'automation@company.com',
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 7200000),
      resolvedAt: new Date(Date.now() - 7200000),
      resolution: 'Increased timeout value and re-ran backup successfully.'
    }
  ];
  
  for (const incident of incidents) {
    await executeQuery(COLLECTIONS.INCIDENTS, 'insertOne', incident);
  }
  
  console.log(`   ✓ Created ${incidents.length} incidents`);
}

// Run the seeder
seedDatabase();
