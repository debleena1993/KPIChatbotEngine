export interface User {
  username: string;
  sector: 'bank' | 'finance' | 'ithr';
  role: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface DatabaseConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface Schema {
  tables: {
    [tableName: string]: {
      columns: {
        [columnName: string]: {
          type: string;
          nullable: boolean;
          default: string | null;
        };
      };
    };
  };
}

export interface KPISuggestion {
  id: string;
  name: string;
  description: string;
  query_template: string;
  category?: string;
}

export interface QueryResult {
  query: string;
  sql_query: string;
  data: any[];
  columns: string[];
  chart_data?: any[];
  chart_config?: {
    type: string;
    x_axis: string;
    y_axis: string;
  };
  langgraph_enhanced?: boolean;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  results?: QueryResult;
}
