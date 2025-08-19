import fs from "fs";
import path from "path";
import { Pool } from "pg";

interface DatabaseConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  type: string;
  isActive: boolean;
  schema: any;
  lastConnected: string | null;
}

interface DatabaseConfig {
  users: Record<string, {
    currentConnection: string | null;
    connections: Record<string, DatabaseConnection>;
  }>;
}

const CONFIG_PATH = path.join(process.cwd(), "server/config/database.json");

export class DatabaseConfigService {
  private static instance: DatabaseConfigService;
  private config!: DatabaseConfig;

  constructor() {
    this.loadConfig();
  }

  static getInstance(): DatabaseConfigService {
    if (!DatabaseConfigService.instance) {
      DatabaseConfigService.instance = new DatabaseConfigService();
    }
    return DatabaseConfigService.instance;
  }

  private loadConfig(): void {
    try {
      const configData = fs.readFileSync(CONFIG_PATH, "utf8");
      this.config = JSON.parse(configData);
      
      // Migrate old format to new user-specific format if needed
      if ('currentConnection' in this.config && 'connections' in this.config) {
        const oldConfig: any = this.config;
        this.config = {
          users: {
            'migration': {
              currentConnection: oldConfig.currentConnection,
              connections: oldConfig.connections
            }
          }
        };
        this.saveConfig();
      }
    } catch (error) {
      // If config doesn't exist, create default with user-specific structure
      this.config = {
        users: {}
      };
      this.saveConfig();
    }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("Failed to save database config:", error);
      throw new Error("Could not save database configuration");
    }
  }

  async testConnection(connectionParams: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }): Promise<boolean> {
    console.log("Testing database connection with params:", {
      host: connectionParams.host,
      port: connectionParams.port,
      database: connectionParams.database,
      username: connectionParams.username,
      password: '***'
    });
    
    // Check if this is a cloud database that requires SSL
    const requiresSSL = connectionParams.host.includes('neon.tech') || 
                       connectionParams.host.includes('supabase.') ||
                       connectionParams.host.includes('amazonaws.com') ||
                       connectionParams.host.includes('planetscale.') ||
                       connectionParams.host.includes('railway.');

    const pool = new Pool({
      host: connectionParams.host,
      port: connectionParams.port,
      database: connectionParams.database,
      user: connectionParams.username,
      password: connectionParams.password,
      ssl: requiresSSL ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      max: 1, // Only one connection for testing
      allowExitOnIdle: true,
    });

    let client;
    try {
      client = await pool.connect();
      await client.query("SELECT 1");
      return true;
    } catch (error) {
      console.error("Database connection test failed:", error);
      return false;
    } finally {
      if (client) {
        client.release();
      }
      try {
        await pool.end();
      } catch (endError) {
        console.error("Error ending pool during connection test:", endError);
      }
    }
  }

  async extractSchema(connectionParams: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }): Promise<any> {
    // Check if this is a cloud database that requires SSL
    const requiresSSL = connectionParams.host.includes('neon.tech') || 
                       connectionParams.host.includes('supabase.') ||
                       connectionParams.host.includes('amazonaws.com') ||
                       connectionParams.host.includes('planetscale.') ||
                       connectionParams.host.includes('railway.');

    const pool = new Pool({
      host: connectionParams.host,
      port: connectionParams.port,
      database: connectionParams.database,
      user: connectionParams.username,
      password: connectionParams.password,
      ssl: requiresSSL ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      max: 1, // Only one connection for schema extraction
      allowExitOnIdle: true,
    });

    let client;
    try {
      client = await pool.connect();

      // Get all tables in the database
      const tablesQuery = `
        SELECT 
          table_name,
          table_schema
        FROM information_schema.tables 
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY table_name;
      `;

      const tablesResult = await client.query(tablesQuery);
      const tables = [];

      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.table_name;
        const tableSchema = tableRow.table_schema;

        // Get columns for each table
        const columnsQuery = `
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length,
            numeric_precision,
            numeric_scale
          FROM information_schema.columns 
          WHERE table_name = $1 AND table_schema = $2
          ORDER BY ordinal_position;
        `;

        const columnsResult = await client.query(columnsQuery, [
          tableName,
          tableSchema,
        ]);

        tables.push({
          name: tableName,
          schema: tableSchema,
          columns: columnsResult.rows.map((col) => ({
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable === "YES",
            default: col.column_default,
            maxLength: col.character_maximum_length,
            precision: col.numeric_precision,
            scale: col.numeric_scale,
          })),
        });
      }

      // Format schema to match the existing format expected by the frontend
      const formattedTables: Record<string, any> = {};
      tables.forEach((table: any) => {
        const columns: Record<string, any> = {};
        table.columns.forEach((col: any) => {
          columns[col.name] = {
            type: col.type,
            nullable: col.nullable,
            default: col.default,
          };
        });
        formattedTables[table.name] = { columns };
      });

      return {
        tables: formattedTables,
        extractedAt: new Date().toISOString(),
        totalTables: tables.length,
        rawTables: tables, // Keep original format for reference
      };
    } catch (error) {
      console.error("Schema extraction failed:", error);
      throw new Error("Failed to extract database schema");
    } finally {
      if (client) {
        client.release();
      }
      try {
        await pool.end();
      } catch (endError) {
        console.error("Error ending pool during schema extraction:", endError);
      }
    }
  }

  private findExistingConnection(userId: string, connectionParams: {
    host: string;
    port: number;
    database: string;
    username: string;
  }): string | null {
    if (!this.config.users[userId]?.connections) return null;

    // Look for existing connection with same host, port, database, and username
    for (const [connectionId, connection] of Object.entries(this.config.users[userId].connections)) {
      if (
        connection.host === connectionParams.host &&
        connection.port === connectionParams.port &&
        connection.database === connectionParams.database &&
        connection.username === connectionParams.username
      ) {
        return connectionId;
      }
    }
    return null;
  }

  async addConnection(
    userId: string,
    connectionId: string,
    connectionParams: {
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
    },
  ): Promise<{ success: boolean; schema?: any; error?: string; isExisting?: boolean; existingConnectionId?: string }> {
    try {
      // Test the connection first
      const isValid = await this.testConnection(connectionParams);
      if (!isValid) {
        return {
          success: false,
          error: "Failed to connect to database with provided credentials",
        };
      }

      // Initialize user config if it doesn't exist
      if (!this.config.users[userId]) {
        this.config.users[userId] = {
          currentConnection: null,
          connections: {}
        };
      }

      // Check for existing connection with same database parameters
      const existingConnectionId = this.findExistingConnection(userId, connectionParams);
      
      if (existingConnectionId) {
        // Update existing connection instead of creating duplicate
        console.log(`Found existing connection for ${connectionParams.database} on ${connectionParams.host}, updating it instead of creating duplicate`);
        
        // Deactivate all connections for this user
        Object.keys(this.config.users[userId].connections).forEach((key) => {
          this.config.users[userId].connections[key].isActive = false;
        });

        // Update existing connection with fresh schema and activate it
        console.log(`Extracting fresh schema for existing connection ${existingConnectionId}`);
        const schema = await this.extractSchema(connectionParams);
        console.log(`Fresh schema extracted with ${Object.keys(schema.tables || {}).length} tables`);
        this.config.users[userId].connections[existingConnectionId] = {
          ...connectionParams,
          type: "postgresql",
          isActive: true,
          schema: schema,
          lastConnected: new Date().toISOString(),
        };

        this.config.users[userId].currentConnection = existingConnectionId;
        this.saveConfig();

        return { success: true, schema, isExisting: true, existingConnectionId };
      }

      // Extract schema for new connection
      console.log(`Extracting fresh schema for new connection ${connectionId}`);
      const schema = await this.extractSchema(connectionParams);
      console.log(`Fresh schema extracted with ${Object.keys(schema.tables || {}).length} tables`);

      // Deactivate current active connection for this user
      Object.keys(this.config.users[userId].connections).forEach((key) => {
        this.config.users[userId].connections[key].isActive = false;
      });

      // Add new connection for this user
      this.config.users[userId].connections[connectionId] = {
        ...connectionParams,
        type: "postgresql",
        isActive: true,
        schema: schema,
        lastConnected: new Date().toISOString(),
      };

      this.config.users[userId].currentConnection = connectionId;
      this.saveConfig();

      return { success: true, schema };
    } catch (error) {
      console.error("Failed to add database connection:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  getCurrentConnection(userId: string): DatabaseConnection | null {
    if (!this.config.users[userId]?.currentConnection) return null;
    return this.config.users[userId].connections[this.config.users[userId].currentConnection!] || null;
  }

  getConnectionSchema(userId: string): any {
    const current = this.getCurrentConnection(userId);
    return current?.schema || null;
  }

  getAllConnections(userId: string): Record<string, DatabaseConnection> {
    if (!this.config.users[userId]?.connections) return {};
    
    // Clean up duplicates before returning connections
    this.cleanupDuplicateConnections(userId);
    return this.config.users[userId]?.connections || {};
  }

  private cleanupDuplicateConnections(userId: string): void {
    if (!this.config.users[userId]?.connections) return;

    const connections = this.config.users[userId].connections;
    const seen = new Set<string>();
    const toRemove: string[] = [];

    // Build unique identifier for each connection and track duplicates
    for (const [connectionId, connection] of Object.entries(connections)) {
      const identifier = `${connection.host}:${connection.port}:${connection.database}:${connection.username}`;
      
      if (seen.has(identifier)) {
        // This is a duplicate - mark for removal (keep the first occurrence)
        toRemove.push(connectionId);
        console.log(`Found duplicate connection: ${connectionId} for database ${connection.database}`);
      } else {
        seen.add(identifier);
      }
    }

    // Remove duplicates
    let hasChanges = false;
    for (const connectionId of toRemove) {
      delete this.config.users[userId].connections[connectionId];
      hasChanges = true;
      
      // If this was the current connection, find a replacement
      if (this.config.users[userId].currentConnection === connectionId) {
        const remainingConnections = Object.keys(this.config.users[userId].connections);
        if (remainingConnections.length > 0) {
          this.config.users[userId].currentConnection = remainingConnections[0];
          this.config.users[userId].connections[remainingConnections[0]].isActive = true;
        } else {
          this.config.users[userId].currentConnection = null;
        }
      }
    }

    // Save config if we made changes
    if (hasChanges) {
      this.saveConfig();
      console.log(`Cleaned up ${toRemove.length} duplicate connection(s) for user ${userId}`);
    }
  }

  setActiveConnection(userId: string, connectionId: string): boolean {
    if (!this.config.users[userId]?.connections[connectionId]) return false;

    // Deactivate all connections for this user
    Object.keys(this.config.users[userId].connections).forEach((key) => {
      this.config.users[userId].connections[key].isActive = false;
    });

    // Activate selected connection
    this.config.users[userId].connections[connectionId].isActive = true;
    this.config.users[userId].currentConnection = connectionId;
    this.saveConfig();
    return true;
  }

  removeConnection(userId: string, connectionId: string): boolean {
    if (!this.config.users[userId]?.connections[connectionId]) return false;

    delete this.config.users[userId].connections[connectionId];

    if (this.config.users[userId].currentConnection === connectionId) {
      // Find another connection to set as current, or set to null
      const remainingConnections = Object.keys(this.config.users[userId].connections);
      if (remainingConnections.length > 0) {
        const newCurrentConnection = remainingConnections[0];
        this.config.users[userId].currentConnection = newCurrentConnection;
        this.config.users[userId].connections[newCurrentConnection].isActive = true;
      } else {
        this.config.users[userId].currentConnection = null;
      }
    }

    this.saveConfig();
    return true;
  }
}
