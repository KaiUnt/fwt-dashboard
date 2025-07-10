#!/usr/bin/env python3
"""
FWT Dashboard Startup Script
Starts both the backend API and frontend development servers
"""
import subprocess
import sys
import os
import time
import signal
from pathlib import Path

def run_backend():
    """Start the FastAPI backend server."""
    print("🚀 Starting Backend API on http://localhost:8000")
    return subprocess.Popen([
        sys.executable, "backend_api.py"
    ], cwd=".")

def run_frontend():
    """Start the Next.js frontend development server."""
    print("🌐 Starting Frontend on http://localhost:3000")
    frontend_dir = Path("frontend")
    if not frontend_dir.exists():
        print("❌ Frontend directory not found!")
        return None
    
    return subprocess.Popen([
        "npm", "run", "dev"
    ], cwd=frontend_dir, shell=True)

def install_backend_deps():
    """Install Python backend dependencies."""
    print("📦 Installing Python dependencies...")
    subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])

def install_frontend_deps():
    """Install Node.js frontend dependencies."""
    print("📦 Installing Node.js dependencies...")
    frontend_dir = Path("frontend")
    if frontend_dir.exists():
        subprocess.run(["npm", "install"], cwd=frontend_dir, shell=True)

def main():
    print("🏔️  FWT Dashboard - Development Setup")
    print("=" * 50)
    
    # Install dependencies
    install_backend_deps()
    install_frontend_deps()
    
    # Start servers
    backend_process = None
    frontend_process = None
    
    try:
        backend_process = run_backend()
        time.sleep(3)  # Give backend time to start
        
        frontend_process = run_frontend()
        
        print("\n✅ Both servers are starting...")
        print("🔧 Backend API: http://localhost:8000")
        print("🌐 Frontend: http://localhost:3000")
        print("\n💡 Press Ctrl+C to stop both servers")
        
        # Wait for processes
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n🛑 Shutting down servers...")
        
        if backend_process:
            backend_process.terminate()
            backend_process.wait()
            
        if frontend_process:
            frontend_process.terminate()
            frontend_process.wait()
            
        print("✅ Servers stopped successfully")

if __name__ == "__main__":
    main() 