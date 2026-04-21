from app import create_app
import os

app = create_app()

if __name__ == '__main__':
    # Running on port 5001 to avoid common conflicts
    port = int(os.environ.get('PORT', 5001))
    
    print(f"AQMRG Local Sensor Receiver starting on port {port}...")
    print(f"Configuration: {app.config['DASHBOARD_URL']}")
    print(f"Swagger UI available at: http://localhost:{port}/apidocs")
    
    app.run(host='0.0.0.0', port=port, debug=True)
