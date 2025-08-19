import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || "" });

export interface KPISuggestion {
  id: string;
  name: string;
  description: string;
  query_template: string;
  category: string;
}

export async function generateKPISuggestions(
  schema: any,
  sector: string
): Promise<KPISuggestion[]> {
  try {
    const schemaText = JSON.stringify(schema, null, 2);
    
    const systemPrompt = `You are an expert data analyst who generates KPI (Key Performance Indicator) suggestions based on database schemas.

Given a database schema and business sector, analyze the tables, columns, and relationships to suggest relevant KPIs.

Rules:
1. Generate exactly 5 practical KPI suggestions
2. Focus on measurable business metrics relevant to the sector
3. Consider common patterns like totals, counts, averages, trends, and ratios
4. Include natural language query templates that users can ask
5. Categorize KPIs (e.g., Financial, Operational, Customer, Performance)
6. Make suggestions specific to the actual data structure available

Respond with JSON array in this exact format:
[
  {
    "id": "unique_kpi_id",
    "name": "Human-readable KPI Name",
    "description": "What this KPI measures and why it's useful",
    "query_template": "Natural language question a user would ask",
    "category": "Category name"
  }
]`;

    const prompt = `Business Sector: ${sector}

Database Schema:
${schemaText}

Based on this database schema for a ${sector} business, generate relevant KPI suggestions that can be calculated from the available data.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: prompt,
    });

    const rawJson = response.text;
    console.log(`Generated KPI suggestions: ${rawJson}`);

    if (rawJson) {
      const suggestions: KPISuggestion[] = JSON.parse(rawJson);
      
      // Validate and clean the suggestions
      return suggestions.filter(suggestion => 
        suggestion.id && 
        suggestion.name && 
        suggestion.description && 
        suggestion.query_template &&
        suggestion.category
      ).slice(0, 5); // Limit to 5 suggestions
    }

    return getFallbackSuggestions(sector);
  } catch (error) {
    console.error("Failed to generate KPI suggestions with AI:", error);
    return getFallbackSuggestions(sector);
  }
}

function getFallbackSuggestions(sector: string): KPISuggestion[] {
  const fallbackSuggestions: Record<string, KPISuggestion[]> = {
    bank: [
      {
        id: "total_loan_portfolio",
        name: "Total Loan Portfolio Value",
        description: "Sum of all loan amounts currently in the system",
        query_template: "What is the total value of all loans in our portfolio?",
        category: "Financial"
      },
      {
        id: "loan_by_type_breakdown",
        name: "Loan Portfolio by Type",
        description: "Distribution of loan amounts by loan type",
        query_template: "Show me the breakdown of loans by type",
        category: "Portfolio"
      },
      {
        id: "monthly_payment_collections",
        name: "Monthly Payment Collections",
        description: "Total payments received each month over the last year",
        query_template: "Show me the monthly payment collection trends",
        category: "Financial"
      },
      {
        id: "customer_loan_analysis",
        name: "Customer Loan Statistics",
        description: "Number of customers with active loans",
        query_template: "How many customers have loans with us?",
        category: "Customer"
      },
      {
        id: "loan_status_distribution",
        name: "Loan Status Overview",
        description: "Distribution of loans by their current status",
        query_template: "What is the status breakdown of all loans?",
        category: "Operations"
      }
    ],
    finance: [
      {
        id: "revenue_growth",
        name: "Revenue Growth",
        description: "Revenue growth rate over time periods",
        query_template: "Show me quarterly revenue growth",
        category: "Financial"
      },
      {
        id: "profit_margins",
        name: "Profit Margins",
        description: "Profit margin analysis by product or service",
        query_template: "What are the profit margins by product category?",
        category: "Financial"
      },
      {
        id: "client_portfolio_value",
        name: "Client Portfolio Value",
        description: "Total value of client portfolios",
        query_template: "Show me client portfolio value distributions",
        category: "Financial"
      },
      {
        id: "investment_performance",
        name: "Investment Performance",
        description: "Performance metrics of investment portfolios",
        query_template: "What is the average return on our investment portfolios?",
        category: "Performance"
      },
      {
        id: "client_acquisition",
        name: "Client Acquisition Rate",
        description: "Rate of new client acquisitions over time",
        query_template: "How many new clients did we acquire this quarter?",
        category: "Growth"
      }
    ],
    ithr: [
      {
        id: "employee_turnover",
        name: "Employee Turnover Rate",
        description: "Employee turnover rate by department",
        query_template: "What is the employee turnover rate by department?",
        category: "HR Metrics"
      },
      {
        id: "hiring_metrics",
        name: "Hiring Efficiency",
        description: "Time to hire and hiring success rates",
        query_template: "Show me average time to hire by position level",
        category: "HR Metrics"
      },
      {
        id: "performance_ratings",
        name: "Performance Ratings",
        description: "Employee performance rating distributions",
        query_template: "What are the performance rating trends?",
        category: "Performance"
      },
      {
        id: "employee_headcount",
        name: "Employee Headcount",
        description: "Total number of employees by department",
        query_template: "How many employees do we have in each department?",
        category: "Workforce"
      },
      {
        id: "average_salary",
        name: "Average Salary Analysis",
        description: "Average salary by department and position",
        query_template: "What is the average salary by department?",
        category: "Compensation"
      }
    ]
  };

  const suggestions = fallbackSuggestions[sector] || fallbackSuggestions.finance;
  return suggestions.slice(0, 5);
}

export async function generateSQLFromQuery(
  naturalLanguageQuery: string,
  schema: any,
  sector: string
): Promise<string> {
  try {
    const schemaText = JSON.stringify(schema, null, 2);
    
    const systemPrompt = `You are an expert SQL generator for ${sector} business data analysis.

Rules:
1. Generate safe, read-only SELECT queries only
2. Use proper PostgreSQL syntax
3. Include appropriate WHERE clauses for filtering
4. Use aggregate functions when appropriate (COUNT, SUM, AVG, etc.)
5. Add ORDER BY and LIMIT when helpful
6. Consider the business context of ${sector}
7. Return ONLY the SQL query with no markdown formatting, no explanations, no code blocks
8. Start the response directly with "SELECT" keyword
9. IMPORTANT: Always use NULLIF or CASE statements to prevent division by zero errors
10. For percentage calculations, use: (numerator * 100.0) / NULLIF(denominator, 0)
11. For ratios, use: numerator / NULLIF(denominator, 0)

Available schema:
${schemaText}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: systemPrompt,
      },
      contents: `Generate SQL for: ${naturalLanguageQuery}

Remember: Return ONLY the SQL query starting with SELECT, no code blocks or explanations.

Additional context: If calculating averages, include COUNT to show data availability. For personal loans this year, use WHERE conditions to filter properly.`,
    });

    const rawSQL = response.text || "";
    console.log('Generated raw SQL:', rawSQL);
    
    // Clean up the response to ensure it's just SQL
    let cleanSQL = rawSQL.trim();
    
    // Remove any markdown formatting
    if (cleanSQL.includes('```')) {
      const sqlMatch = cleanSQL.match(/```(?:sql)?\s*(SELECT[\s\S]*?)\s*```/i);
      if (sqlMatch) {
        cleanSQL = sqlMatch[1].trim();
      }
    }
    
    // Remove any leading/trailing whitespace and ensure it starts with SELECT
    cleanSQL = cleanSQL.replace(/^[^S]*SELECT/i, 'SELECT');
    
    // Ensure proper spacing around SQL keywords
    cleanSQL = cleanSQL
      .replace(/\bFROM\b/gi, ' FROM ')
      .replace(/\bWHERE\b/gi, ' WHERE ')
      .replace(/\bGROUP BY\b/gi, ' GROUP BY ')
      .replace(/\bORDER BY\b/gi, ' ORDER BY ')
      .replace(/\bHAVING\b/gi, ' HAVING ')
      .replace(/\bJOIN\b/gi, ' JOIN ')
      .replace(/\bLEFT JOIN\b/gi, ' LEFT JOIN ')
      .replace(/\bRIGHT JOIN\b/gi, ' RIGHT JOIN ')
      .replace(/\bINNER JOIN\b/gi, ' INNER JOIN ')
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
    
    console.log('Cleaned SQL:', cleanSQL);
    return cleanSQL;
  } catch (error) {
    console.error("Failed to generate SQL from query:", error);
    
    // Fallback to basic SQL generation based on common patterns
    return generateFallbackSQL(naturalLanguageQuery, schema);
  }
}

function generateFallbackSQL(query: string, schema: any): string {
  const lowerQuery = query.toLowerCase();
  const tables = Object.keys(schema.tables || {});
  
  if (tables.length === 0) {
    throw new Error("No tables available for querying");
  }

  // Enhanced fallback patterns based on actual database structure
  if (lowerQuery.includes("total") && lowerQuery.includes("loan")) {
    if (tables.includes("loans")) {
      return "SELECT SUM(COALESCE(loan_amount, 0)) AS total_loan_amount, COUNT(*) AS total_loans FROM loans WHERE loan_amount IS NOT NULL;";
    }
  }
  
  if (lowerQuery.includes("loan") && lowerQuery.includes("approval")) {
    if (tables.includes("loans") && tables.includes("loan_status")) {
      return "SELECT (COUNT(CASE WHEN ls.status IN ('Approved', 'Active') THEN 1 END) * 100.0) / NULLIF(COUNT(*), 0) AS approval_rate, COUNT(*) AS total_applications FROM loans l LEFT JOIN loan_status ls ON l.loan_id = ls.loan_id;";
    }
  }
  
  if (lowerQuery.includes("payment") && (lowerQuery.includes("month") || lowerQuery.includes("trend"))) {
    if (tables.includes("payments")) {
      return "SELECT TO_CHAR(payment_date, 'YYYY-MM') AS month, SUM(COALESCE(amount_paid, 0)) AS total_payments FROM payments WHERE payment_date >= CURRENT_DATE - INTERVAL '12 months' GROUP BY month ORDER BY month;";
    }
  }
  
  if (lowerQuery.includes("customer") && lowerQuery.includes("loan")) {
    if (tables.includes("customers") && tables.includes("loans")) {
      return "SELECT COUNT(DISTINCT c.customer_id) AS customers_with_loans, COUNT(l.loan_id) AS total_loans FROM customers c LEFT JOIN loans l ON c.customer_id = l.customer_id WHERE l.loan_id IS NOT NULL;";
    }
  }
  
  if (lowerQuery.includes("loan") && lowerQuery.includes("type")) {
    if (tables.includes("loans")) {
      return "SELECT COALESCE(loan_type, 'Unknown') AS loan_type, COUNT(*) AS loan_count, SUM(COALESCE(loan_amount, 0)) AS total_amount FROM loans GROUP BY loan_type ORDER BY loan_count DESC;";
    }
  }
  
  if (lowerQuery.includes("default") && lowerQuery.includes("rate")) {
    if (tables.includes("loans") && tables.includes("loan_status")) {
      return "SELECT (COUNT(CASE WHEN ls.status IN ('Default', 'Defaulted') THEN 1 END) * 100.0) / NULLIF(COUNT(*), 0) AS default_rate FROM loans l LEFT JOIN loan_status ls ON l.loan_id = ls.loan_id;";
    }
  }
  
  if (lowerQuery.includes("recent") || lowerQuery.includes("new")) {
    if (tables.includes("loans")) {
      return "SELECT COUNT(*) AS recent_loans, SUM(COALESCE(loan_amount, 0)) AS recent_loan_amount FROM loans WHERE start_date >= CURRENT_DATE - INTERVAL '30 days';";
    }
  }
  
  if (lowerQuery.includes("approval") && lowerQuery.includes("rate")) {
    if (tables.includes("loans") || tables.includes("loan_applications")) {
      const table = tables.includes("loan_applications") ? "loan_applications" : "loans";
      return `SELECT 
        (COUNT(CASE WHEN status = 'approved' THEN 1 END) * 100.0) / NULLIF(COUNT(*), 0) AS approval_rate,
        COUNT(*) AS total_applications,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved_count
        FROM ${table};`;
    }
  }

  // Enhanced default fallback based on available tables
  if (tables.includes("loans")) {
    return "SELECT COUNT(*) AS total_loans, SUM(COALESCE(loan_amount, 0)) AS total_loan_value, AVG(COALESCE(loan_amount, 0)) AS average_loan_amount FROM loans WHERE loan_amount > 0;";
  }
  
  if (tables.includes("payments")) {
    return "SELECT COUNT(*) AS total_payments, SUM(COALESCE(amount_paid, 0)) AS total_amount_collected FROM payments WHERE amount_paid > 0;";
  }
  
  if (tables.includes("customers")) {
    return "SELECT COUNT(*) AS total_customers FROM customers;";
  }
  
  // Final fallback - show data from the first available table
  const firstTable = tables[0];
  const columns = Object.keys(schema.tables[firstTable].columns || {});
  const limitedColumns = columns.slice(0, 5).join(", ");
  
  return `SELECT ${limitedColumns} FROM ${firstTable} LIMIT 10;`;
}