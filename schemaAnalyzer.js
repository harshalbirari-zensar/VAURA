import { getDatabase, getCollection, COLLECTIONS } from './mongodb.js';

/**
 * Collection Schema Analyzer
 * Analyzes and documents the structure of MongoDB collections
 */

/**
 * Analyze a collection's schema by sampling documents
 */
export async function analyzeCollectionSchema(collectionName, sampleSize = 10) {
  try {
    const collection = await getCollection(collectionName);
    
    // Get document count
    const count = await collection.countDocuments();
    
    // Sample documents
    const samples = await collection.find({}).limit(sampleSize).toArray();
    
    if (samples.length === 0) {
      return {
        collectionName,
        documentCount: count,
        isEmpty: true,
        schema: {}
      };
    }
    
    // Analyze schema from samples
    const schema = {};
    
    samples.forEach(doc => {
      Object.keys(doc).forEach(key => {
        if (!schema[key]) {
          schema[key] = {
            type: typeof doc[key],
            nullable: false,
            examples: []
          };
        }
        
        // Add example if not already there (max 3 examples)
        if (schema[key].examples.length < 3 && doc[key] !== null && doc[key] !== undefined) {
          const example = typeof doc[key] === 'object' ? 
            JSON.stringify(doc[key]).substring(0, 100) : 
            doc[key];
          
          if (!schema[key].examples.includes(example)) {
            schema[key].examples.push(example);
          }
        }
        
        // Check for nulls
        if (doc[key] === null || doc[key] === undefined) {
          schema[key].nullable = true;
        }
      });
    });
    
    return {
      collectionName,
      documentCount: count,
      isEmpty: false,
      schema,
      sampleSize: samples.length
    };
  } catch (error) {
    return {
      collectionName,
      error: error.message
    };
  }
}

/**
 * Analyze all collections in the database
 */
export async function analyzeAllCollections(sampleSize = 5) {
  try {
    const db = await getDatabase();
    const allCollections = await db.listCollections().toArray();
    
    console.log(`📊 Analyzing ${allCollections.length} collections...`);
    
    const results = {};
    
    for (const col of allCollections) {
      const analysis = await analyzeCollectionSchema(col.name, sampleSize);
      results[col.name] = analysis;
      
      if (!analysis.error && !analysis.isEmpty) {
        console.log(`✅ ${col.name}: ${analysis.documentCount} documents, ${Object.keys(analysis.schema).length} fields`);
      } else if (analysis.isEmpty) {
        console.log(`⚠️  ${col.name}: Empty collection`);
      } else {
        console.log(`❌ ${col.name}: Error - ${analysis.error}`);
      }
    }
    
    return {
      success: true,
      totalCollections: allCollections.length,
      analyses: results,
      timestamp: new Date()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get quick collection stats
 */
export async function getCollectionStats(collectionName) {
  try {
    const collection = await getCollection(collectionName);
    
    const [count, firstDoc, lastDoc] = await Promise.all([
      collection.countDocuments(),
      collection.findOne({}, { sort: { _id: 1 } }),
      collection.findOne({}, { sort: { _id: -1 } })
    ]);
    
    return {
      collectionName,
      documentCount: count,
      fields: firstDoc ? Object.keys(firstDoc) : [],
      firstDocument: firstDoc,
      lastDocument: lastDoc
    };
  } catch (error) {
    return {
      collectionName,
      error: error.message
    };
  }
}

/**
 * Generate collection documentation
 */
export async function generateCollectionDocumentation() {
  try {
    const analysis = await analyzeAllCollections(10);
    
    if (!analysis.success) {
      return { success: false, error: analysis.error };
    }
    
    let documentation = `# VINCI IT Operations - MongoDB Collections Documentation\n\n`;
    documentation += `**Generated:** ${new Date().toLocaleString()}\n`;
    documentation += `**Total Collections:** ${analysis.totalCollections}\n\n`;
    documentation += `---\n\n`;
    
    Object.entries(analysis.analyses).forEach(([collName, data]) => {
      documentation += `## ${collName}\n\n`;
      
      if (data.error) {
        documentation += `**Status:** ❌ Error\n`;
        documentation += `**Error:** ${data.error}\n\n`;
      } else if (data.isEmpty) {
        documentation += `**Status:** ⚠️ Empty Collection\n`;
        documentation += `**Document Count:** 0\n\n`;
      } else {
        documentation += `**Document Count:** ${data.documentCount}\n`;
        documentation += `**Fields:** ${Object.keys(data.schema).length}\n`;
        documentation += `**Sample Size:** ${data.sampleSize}\n\n`;
        
        documentation += `### Schema\n\n`;
        documentation += `| Field | Type | Nullable | Examples |\n`;
        documentation += `|-------|------|----------|----------|\n`;
        
        Object.entries(data.schema).forEach(([field, info]) => {
          const examples = info.examples.length > 0 ? 
            info.examples.map(e => `\`${e}\``).join(', ') : 
            'N/A';
          documentation += `| ${field} | ${info.type} | ${info.nullable ? 'Yes' : 'No'} | ${examples} |\n`;
        });
        
        documentation += `\n`;
      }
      
      documentation += `---\n\n`;
    });
    
    return {
      success: true,
      documentation,
      filename: 'VINCI_COLLECTIONS_SCHEMA.md'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Search for collections by keyword
 */
export async function findCollectionsByKeyword(keyword) {
  try {
    const db = await getDatabase();
    const allCollections = await db.listCollections().toArray();
    
    const matching = allCollections.filter(col => 
      col.name.toLowerCase().includes(keyword.toLowerCase())
    );
    
    const results = [];
    
    for (const col of matching) {
      const stats = await getCollectionStats(col.name);
      results.push(stats);
    }
    
    return {
      success: true,
      keyword,
      matchCount: results.length,
      collections: results
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  analyzeCollectionSchema,
  analyzeAllCollections,
  getCollectionStats,
  generateCollectionDocumentation,
  findCollectionsByKeyword
};
