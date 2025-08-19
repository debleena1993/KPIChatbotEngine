import { Pool, Client } from "pg";
import { DatabaseConfigService } from "./database-config";

export interface QueryResult {
  table_data: any[];
  chart_data: {
    type: 'bar' | 'line' | 'pie';
    data: any[];
    xAxis: string;
    yAxis: string;
  };
  columns: string[];
  row_count: number;
  execution_time: number;
}

export class QueryExecutor {
  private static instance: QueryExecutor;
  private connectionPools: Map<string, Pool> = new Map();
  
  static getInstance(): QueryExecutor {
    if (!QueryExecutor.instance) {
      QueryExecutor.instance = new QueryExecutor();
    }
    return QueryExecutor.instance;
  }

  private getConnectionPoolKey(connection: any): string {
    return `${connection.host}:${connection.port}/${connection.database}/${connection.username}`;
  }

  private getOrCreatePool(connection: any): Pool {
    const poolKey = this.getConnectionPoolKey(connection);
    
    if (this.connectionPools.has(poolKey)) {
      const existingPool = this.connectionPools.get(poolKey)!;
      // Check if pool is still valid
      if (existingPool.totalCount >= 0) {
        return existingPool;
      } else {
        // Pool was ended, remove it
        this.connectionPools.delete(poolKey);
      }
    }

    // Check if this is a cloud database that requires SSL
    const requiresSSL = connection.host.includes('neon.tech') || 
                       connection.host.includes('supabase.') ||
                       connection.host.includes('amazonaws.com') ||
                       connection.host.includes('planetscale.') ||
                       connection.host.includes('railway.');

    const pool = new Pool({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.username,
      password: connection.password,
      ssl: requiresSSL ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      max: 5, // Maximum number of connections in pool
      allowExitOnIdle: true,
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Pool error:', err);
      this.connectionPools.delete(poolKey);
    });

    this.connectionPools.set(poolKey, pool);
    return pool;
  }

  async executeQuery(sqlQuery: string, userId: string): Promise<QueryResult> {
    const startTime = Date.now();
    const dbService = DatabaseConfigService.getInstance();
    const currentConnection = dbService.getCurrentConnection(userId);

    if (!currentConnection) {
      throw new Error("No active database connection");
    }

    const pool = this.getOrCreatePool(currentConnection);
    let client;

    try {
      client = await pool.connect();
      
      // Sanitize SQL query - extract and validate SELECT statements
      let sanitizedQuery = sqlQuery.trim();
      
      // Remove code block formatting if present
      if (sanitizedQuery.startsWith('```sql') || sanitizedQuery.startsWith('```')) {
        const lines = sanitizedQuery.split('\n');
        const sqlLines = lines.slice(1, -1); // Remove first and last lines (```sql and ```)
        sanitizedQuery = sqlLines.join(' ').trim(); // Join with space instead of newline
      }
      
      // Remove any remaining markdown or extra formatting
      sanitizedQuery = sanitizedQuery.replace(/^```sql\s*/i, '').replace(/\s*```$/, '');
      
      // Ensure proper SQL formatting with correct spacing
      sanitizedQuery = sanitizedQuery
        .replace(/\s+/g, ' ') // Replace multiple spaces/newlines with single space
        .replace(/\bFROM\b/gi, ' FROM ')
        .replace(/\bWHERE\b/gi, ' WHERE ')
        .replace(/\bGROUP BY\b/gi, ' GROUP BY ')
        .replace(/\bORDER BY\b/gi, ' ORDER BY ')
        .replace(/\bHAVING\b/gi, ' HAVING ')
        .replace(/\bJOIN\b/gi, ' JOIN ')
        .replace(/\bLEFT JOIN\b/gi, ' LEFT JOIN ')
        .replace(/\bRIGHT JOIN\b/gi, ' RIGHT JOIN ')
        .replace(/\bINNER JOIN\b/gi, ' INNER JOIN ')
        .replace(/\s+/g, ' ') // Clean up any double spaces
        .trim();
      
      // Log the sanitized query for debugging
      console.log('Original SQL:', sqlQuery);
      console.log('Sanitized SQL:', sanitizedQuery);
      
      if (!sanitizedQuery.toLowerCase().startsWith('select')) {
        throw new Error(`Only SELECT queries are allowed for security reasons. Received: ${sanitizedQuery.substring(0, 100)}...`);
      }

      const result = await client.query(sanitizedQuery);
      
      // Handle null values in results more intelligently
      const cleanedRows = result.rows.map(row => {
        const cleanedRow: any = {};
        for (const [key, value] of Object.entries(row)) {
          // Only convert null to 0 for chart processing, preserve nulls for display
          if (value === null) {
            // For averages, counts, sums - preserve null to show "No data"
            if (key.toLowerCase().includes('avg') || key.toLowerCase().includes('average')) {
              cleanedRow[key] = null;
            } else {
              cleanedRow[key] = 0;
            }
          } else {
            cleanedRow[key] = value;
          }
        }
        return cleanedRow;
      });
      
      const executionTime = (Date.now() - startTime) / 1000;
      const columns = result.fields.map(field => field.name);

      // Generate chart data based on the cleaned results
      const chartData = this.generateChartData(cleanedRows, columns);

      return {
        table_data: cleanedRows,
        chart_data: chartData,
        columns: columns,
        row_count: cleanedRows.length,
        execution_time: executionTime
      };

    } catch (error) {
      console.error("Query execution error:", error);
      throw new Error(`Query execution failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  // Clean up all connection pools
  async cleanup(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];
    
    this.connectionPools.forEach((pool, key) => {
      cleanupPromises.push(
        pool.end().catch(err => {
          console.error(`Error closing pool ${key}:`, err);
        })
      );
    });
    
    await Promise.allSettled(cleanupPromises);
    this.connectionPools.clear();
  }

  private generateChartData(rows: any[], columns: string[]): {
    type: 'bar' | 'line' | 'pie';
    data: any[];
    xAxis: string;
    yAxis: string;
  } {
    if (rows.length === 0 || columns.length === 0) {
      return {
        type: 'bar',
        data: [],
        xAxis: '',
        yAxis: ''
      };
    }

    // Find numeric and text columns
    const numericColumns = columns.filter(col => {
      const sampleValue = rows[0]?.[col];
      return typeof sampleValue === 'number' || (!isNaN(parseFloat(sampleValue)) && isFinite(parseFloat(sampleValue)));
    });

    const textColumns = columns.filter(col => {
      const sampleValue = rows[0]?.[col];
      return typeof sampleValue === 'string' && isNaN(parseFloat(sampleValue));
    });

    const dateColumns = columns.filter(col => {
      const sampleValue = rows[0]?.[col];
      return sampleValue instanceof Date || (typeof sampleValue === 'string' && !isNaN(Date.parse(sampleValue)));
    });

    // Determine chart type and axes
    let chartType: 'bar' | 'line' | 'pie' = 'bar';
    let xAxis = columns[0];
    let yAxis = columns[1] || columns[0];

    // If we have date columns, prefer line chart
    if (dateColumns.length > 0 && numericColumns.length > 0) {
      chartType = 'line';
      xAxis = dateColumns[0];
      yAxis = numericColumns[0];
    }
    // If we have text and numeric columns, use bar chart
    else if (textColumns.length > 0 && numericColumns.length > 0) {
      chartType = 'bar';
      xAxis = textColumns[0];
      yAxis = numericColumns[0];
    }
    // If we have only a few rows with categories, use pie chart
    else if (rows.length <= 10 && textColumns.length > 0 && numericColumns.length > 0) {
      chartType = 'pie';
      xAxis = textColumns[0];
      yAxis = numericColumns[0];
    }

    // Process data for chart
    const chartData = rows.map(row => {
      const processedRow: any = {};
      
      // Convert numeric strings to numbers for better charting
      for (const [key, value] of Object.entries(row)) {
        if (numericColumns.includes(key) && typeof value === 'string') {
          processedRow[key] = parseFloat(value);
        } else {
          processedRow[key] = value;
        }
      }
      
      return processedRow;
    });

    return {
      type: chartType,
      data: chartData,
      xAxis,
      yAxis
    };
  }
}