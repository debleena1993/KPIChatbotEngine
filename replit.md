# Overview

This is a Multi-Sector AI-Powered KPI Chatbot application designed for different business sectors (Banking, Finance, and IT HR). The application allows sector-specific administrators to connect to their databases, automatically extract schemas, and query KPIs using natural language through Google Gemini AI integration. Results are displayed in both tabular format and interactive charts.

The system is built as a full-stack web application with a React frontend and Node.js/Express backend. The application features automatic database configuration management that updates config files when users input database credentials and automatically extracts schemas from connected databases.

## Recent Changes (August 2025)
- ✓ Implemented automatic database configuration system with persistent JSON configuration files
- ✓ Added real-time schema extraction from PostgreSQL databases using proper SQL introspection
- ✓ Created DatabaseConfigService for managing multiple database connections per user session
- ✓ Built comprehensive Database Configuration UI showing active connections, schema details, and management controls
- ✓ Enhanced authentication system with proper JWT token handling and bcrypt password security
- ✓ Integrated dynamic database switching capabilities allowing users to manage multiple connections
- ✓ **AI-Powered KPI Suggestions** - Implemented Google Gemini AI integration to dynamically generate KPI suggestions based on actual database schema instead of hardcoded suggestions
- ✓ **Smart SQL Generation** - Added natural language to SQL conversion using Gemini AI with schema-aware context
- ✓ **FIXED: PostgreSQL Connection Issues** - Resolved connection pool management problems that were causing app crashes
- ✓ **FIXED: SQL Query Validation** - Enhanced SQL sanitization to handle AI-generated queries with markdown formatting
- ✓ **Added: Intelligent Fallback System** - Implemented pattern-based SQL generation when AI services are unavailable
- ✓ **Added: Graceful Shutdown** - Added proper cleanup handling for database connections
- ✓ **MIGRATION COMPLETED** - Successfully migrated from Replit agent to Replit environment with full functionality
- ✓ **GOOGLE API KEY CONFIGURED** - Added Google Gemini API key for AI-powered features including KPI suggestions and natural language to SQL conversion
- ✓ **FIXED: Google API Integration** - Corrected API key configuration for Google Gemini AI services
- ✓ **FIXED: SQL Fallback Queries** - Resolved GROUP BY issues in fallback SQL query generation
- ✓ **UI UPDATES** - Removed Finance sector from login page and updated "IT HR Portal" to "HR Portal" for simplified interface
- ✓ **AUTO-FILL CREDENTIALS** - Added automatic pre-filling of demo credentials when selecting sectors in login page
- ✓ **USER-SPECIFIC DATABASE CONFIG** - Implemented user-isolated database configurations so bank and HR admins see only their own connections
- ✓ **EXPANDABLE SQL QUERY DISPLAY** - Enhanced ResultsDisplay component with collapsible SQL query section including copy functionality and formatted display
- ✓ **COMPLETE PWC BRANDING** - Implemented comprehensive PWC color scheme (#FD5108 orange, grey palette) across all components including logo integration, theming, and chart colors
- ✓ **REPLIT ENVIRONMENT MIGRATION** - Successfully migrated project from Replit agent to standard Replit environment with clean architecture
- ✓ **LOGIN PAGE BEAUTIFICATION** - Redesigned login page with modern compact layout, removed card style and sidebar, eliminated decorative elements, enhanced PWC branding and responsive design for clean user experience
- ✓ **PROJECT IMPORT COMPLETED** - Successfully completed migration from Replit Agent to Replit environment with all packages installed, workflow running on port 5000, and application fully functional (August 18, 2025)
- ✓ **PWC BRANDING UPDATED** - Removed "PWC" from header text, changing "PWC KPI Chatbot" to simply "KPI Chatbot" for cleaner branding (August 18, 2025)
- ✓ **SCHEMA CACHING ISSUE FIXED** - Resolved database connection issue where new databases were showing cached schemas from previous connections by implementing proper session clearing and fresh schema extraction (August 18, 2025)
- ✓ **DATABASE CONNECTION UI IMPROVED** - Modified connection interface so connect button only shows for active databases and switch button only shows for inactive databases, with proper loading state showing spinner instead of disappearing icon (August 18, 2025)
- ✓ **KPI SUGGESTIONS LIMITED** - Updated both Google Gemini AI and fallback systems to generate exactly 5 KPI suggestions instead of 8 for cleaner interface (August 18, 2025)
- ✓ **REPLIT MIGRATION COMPLETED** - Successfully migrated project from Replit Agent to standard Replit environment with all packages installed, workflows configured, and Google API key integrated for full AI functionality (August 18, 2025)
- ✓ **LANGGRAPH CHART INTELLIGENCE INTEGRATED** - Added LangGraph-powered intelligent chart generation that analyzes data patterns, recommends optimal chart types, and provides AI-driven insights for better KPI visualization (August 18, 2025)
- ✓ **CRITICAL SQL FIXES IMPLEMENTED** - Fixed division by zero errors and null value handling in SQL generation and chart processing, added NULLIF and COALESCE protections for robust query execution (August 18, 2025)
- ✓ **KPI SUGGESTIONS OPTIMIZED** - Updated fallback KPI suggestions to match actual database schema (customers, loans, loan_status, payments tables) ensuring queries return meaningful results instead of "no data" (August 18, 2025)
- ✓ **REPLIT ENVIRONMENT MIGRATION COMPLETED** - Successfully completed full migration from Replit Agent to standard Replit environment, removed all unused Python files, configured Google API key, and verified application functionality (August 19, 2025)
- ✓ **PYTHON FILES CLEANED UP** - Removed unused Python backend files (main.py, gemini.py, auth.py, database.py, models.py, requirements.txt, pyproject.toml) since application runs entirely on Node.js/TypeScript stack (August 19, 2025)
- ✓ **DATABASE RECONNECTION MODAL CREATED** - Replaced browser prompt with professional modal for database reconnection featuring password visibility toggle, form validation, connection details display, and loading states (August 19, 2025)
- ✓ **SQL QUERY VISIBILITY IMPROVED** - Modified ResultsDisplay component to show SQL queries expanded by default instead of requiring user to click expand button for better transparency (August 19, 2025)
- ✓ **BACKEND CONVERTED TO PYTHON** - Successfully converted entire backend from Node.js/Express to Python/FastAPI while preserving all functionality including authentication, database management, and AI integration (August 19, 2025)
- ✓ **PYTHON SERVER MANAGER CREATED** - Built comprehensive Python-based server management system in services/index.py that coordinates both FastAPI backend (port 5001) and Vite frontend (port 5000) with automatic proxy setup (August 19, 2025)

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/UI components built on top of Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **State Management**: React Query (TanStack Query) for server state management with local React state for UI state
- **Routing**: Wouter for client-side routing
- **Charts**: Recharts library for data visualization (bar, line, and pie charts)
- **Form Handling**: React Hook Form with Zod validation

## Backend Architecture
The project shows evidence of both Node.js and Python backend implementations:

### Node.js/Express Backend
- **Framework**: Express.js with TypeScript
- **Development**: Vite integration for hot reload in development
- **Storage Interface**: Abstract storage interface with in-memory implementation
- **Session Management**: Basic session handling structure

### Python FastAPI Backend (Primary)
- **Framework**: FastAPI for REST API endpoints running on port 5001
- **Authentication**: JWT tokens with bcrypt password hashing
- **Database**: PostgreSQL with psycopg2 for database connections
- **AI Integration**: Google Gemini API for natural language to SQL conversion
- **Session Storage**: In-memory session storage for database connections and schemas
- **Server Management**: Python-based server manager (services/index.py) coordinates backend and frontend
- **Process Coordination**: Manages both FastAPI backend and Vite frontend with automatic proxy setup

## Database Design
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Definition**: Comprehensive schema including users, sessions, chat messages, and KPI suggestions
- **Migration System**: Drizzle Kit for database migrations
- **Connection Strategy**: Automatic database configuration management with persistent JSON config files
- **Schema Extraction**: Real-time introspection of connected databases using SQL information_schema queries
- **Multi-Database Support**: Users can configure and switch between multiple database connections
- **Configuration Persistence**: Database credentials and extracted schemas stored in `server/config/database.json`

## Authentication & Authorization
- **Multi-Sector Login**: Predefined admin accounts for three sectors (bank, finance, ithr)
- **Password Security**: Bcrypt hashing for password storage
- **Session Management**: JWT tokens with configurable expiration
- **Role-Based Access**: Sector-specific access control

## AI Integration
- **Natural Language Processing**: Google Gemini AI for converting natural language queries to SQL
- **Schema Awareness**: Dynamic schema extraction and context provision to AI model
- **Query Safety**: Parameterized queries and restrictions on destructive operations
- **Sector Context**: AI responses tailored to specific business sector contexts
- **Dynamic KPI Generation**: AI analyzes actual database structure to suggest relevant KPIs instead of using hardcoded suggestions
- **Intelligent Query Suggestions**: Context-aware query templates generated based on available data patterns

## Data Visualization
- **Dual Display Modes**: Toggle between tabular and chart views
- **Chart Types**: Support for bar charts, line charts, and pie charts
- **Export Functionality**: CSV export capability for tabular data
- **Responsive Design**: Mobile-optimized layouts with collapsible sidebars

## Security Considerations
- **SQL Injection Prevention**: Parameterized queries and AI-generated query validation
- **Authentication Flow**: Secure login with JWT token management
- **Session Isolation**: Database connections and schemas isolated per user session
- **CORS Configuration**: Properly configured cross-origin resource sharing

# External Dependencies

## AI Services
- **Google Gemini API**: Natural language to SQL query generation with schema context awareness

## Database Services
- **PostgreSQL**: Primary database for application data
- **Neon Database**: Serverless PostgreSQL provider integration
- **User-Connected Databases**: Dynamic connections to customer databases for KPI extraction

## Frontend Libraries
- **Radix UI**: Comprehensive set of low-level UI primitives for accessibility
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Recharts**: React charting library built on D3
- **React Hook Form**: Performant forms with easy validation
- **Zod**: TypeScript-first schema validation

## Backend Libraries
- **Drizzle ORM**: Type-safe SQL toolkit and ORM
- **FastAPI**: Modern Python web framework for building APIs
- **psycopg2**: PostgreSQL adapter for Python
- **python-jose**: JWT token handling for Python
- **passlib**: Password hashing utilities

## Development Tools
- **Vite**: Fast build tool with hot module replacement
- **TypeScript**: Static type checking
- **ESBuild**: Fast JavaScript bundler for production builds
- **Replit**: Cloud development environment integration