import { getDb, initializeMongoDB } from './mongodb.js';

async function listCollections() {
  try {
    await initializeMongoDB();
    const db = getDb();
    const collections = await db.listCollections().toArray();
    
    console.log('📋 Available collections:');
    collections.forEach(col => {
      console.log(`  - ${col.name}`);
    });
    
    // Search for collections with "cmdb" or "CI" in the name
    console.log('\n🔍 Collections related to CMDB/CI:');
    const cmdbCollections = collections.filter(c => 
      /cmdb|ci|config/i.test(c.name)
    );
    cmdbCollections.forEach(col => {
      console.log(`  ✓ ${col.name}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

listCollections();
