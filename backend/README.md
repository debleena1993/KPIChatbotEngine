# Python Authentication Backend

This backend replaces the Node.js authentication system with Python FastAPI.

## Features

- FastAPI-based authentication server
- JWT token generation and validation  
- Same admin accounts as the original Node.js system:
  - `admin@bank` / `bank123` (bank sector)
  - `admin@ithr` / `ithr123` (ITHR sector)
- Compatible API endpoints with the frontend
- CORS enabled for Replit deployment

## Running the Backend

### Option 1: Direct Python execution
```bash
cd backend
python3 main.py
```

### Option 2: Using the start script
```bash
./backend/start_backend.sh
```

### Option 3: Using uvicorn directly
```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

- `POST /api/login` - User authentication
- `POST /api/logout` - User logout  
- `GET /api/me` - Get current user info
- `GET /` - Health check

## Frontend Integration

The frontend is configured to use this Python backend for authentication:
- Login/logout requests go to `http://localhost:8000/api/`
- Other requests continue to use the Node.js server on port 5000

## Dependencies

All Python dependencies are installed via the project's Python environment:
- FastAPI
- Uvicorn  
- python-jose (JWT handling)
- passlib (password hashing)
- python-multipart (form data)