# KPI Chart Generation Process

## Complete Flow: From Natural Language to Interactive Charts

### 1. **User Input** 📝
- User types natural language query: "What is the loan approval rate for the last 6 months?"
- Input goes to ChatbotInterface component

### 2. **AI SQL Generation** 🧠 
- **Google Gemini AI** receives:
  - Natural language query
  - Database schema (extracted from connected DB)
  - Sector context (bank/HR)
- **Gemini generates SQL**: 
  ```sql
  SELECT 
    DATE_TRUNC('month', application_date) as month,
    COUNT(CASE WHEN status = 'approved' THEN 1 END) * 100.0 / COUNT(*) as approval_rate
  FROM loan_applications 
  WHERE application_date >= NOW() - INTERVAL '6 months'
  GROUP BY month
  ORDER BY month;
  ```

### 3. **Database Execution** 💾
- QueryExecutor runs SQL against user's connected database
- Returns raw data: `[{month: '2024-08', approval_rate: 85.5}, ...]`

### 4. **LangGraph Chart Intelligence** 🎯
- **Data Analysis**: Examines data structure, types, relationships
- **Chart Type Selection**: 
  - Date columns + numeric → Line chart (trends over time)
  - Categories + numeric → Bar chart (comparisons)
  - Small categorical dataset → Pie chart (proportions)
- **Configuration Enhancement**: Colors, styling, responsive settings
- **Insight Generation**: Trend analysis, outlier detection

### 5. **Frontend Rendering** 🎨
- **ResultsDisplay** component receives enhanced data
- **Recharts** renders visualization with:
  - PWC color palette (#FD5108, #FE7C39, ...)
  - Responsive containers
  - Interactive tooltips
  - Export capabilities

## Current Enhancement: LangGraph Integration

**Before**: Simple pattern-based chart selection
**Now**: Intelligent AI-driven chart recommendations with:
- Context-aware chart type selection
- Advanced data pattern recognition  
- Real-time insights generation
- Fallback system for reliability

## Data Flow Architecture

```
User Query → Gemini AI → SQL → Database → LangGraph Agent → Chart Config → Recharts → Visual
     ↓           ↓         ↓        ↓           ↓              ↓           ↓         ↓
Natural    Smart SQL   Execute   Raw Data   AI Analysis   Enhanced     Render   Interactive
Language   Generation              Query                  Config               Chart
```

## Key Benefits

1. **Intelligent Chart Selection**: AI chooses optimal visualization based on data characteristics
2. **Context Awareness**: Considers business sector and query intent
3. **Real-time Insights**: Generates meaningful observations about data patterns
4. **Professional Styling**: Consistent PWC branding and responsive design
5. **Graceful Fallbacks**: Works even when AI services are unavailable