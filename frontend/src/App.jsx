import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StatsGrid from './components/StatsGrid';
import SensorList from './components/SensorList';
import SensorDetailTab from './components/SensorDetailTab';
import YourDataTab from './components/YourDataTab';
import RawAnalysisTab from './components/RawAnalysisTab';
import ForecastPanel from './components/ForecastPanel';
import MapPanel from './components/MapPanel';
import HealthTab from './components/HealthTab';
import { fetchDashboardData, fetchForecast, fetchForecastComparison, fetchDevices, checkHealth } from './api/dashboard';
import ThemeToggle from './components/ThemeToggle';
import './App.css';

/**
 * AQMRG Dashboard — Main Application
 */
console.log("%c [AQMRG] Initializing Build v1.0.1", "color: #3b82f6; font-weight: bold;");

export default function App() {
  const [renderError, setRenderError] = useState(null);

  // Global error handler for uncaught runtime errors during render
  useEffect(() => {
    const handleError = (e) => {
      console.error("Caught global error:", e);
      setRenderError(e.message || "Unknown Runtime Error");
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (renderError) {
    return (
      <div style={{ padding: '40px', color: 'white', background: '#0f172a', height: '100vh' }}>
        <h1>Application Crushed</h1>
        <p>Error: {renderError}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Missing state variables for data fetching
  const [sensors, setSensors] = useState([]);
  const [sensorsCount, setSensorsCount] = useState(0);
  const [timestamp, setTimestamp] = useState(null);
  const [apiStatus, setApiStatus] = useState('connecting');
  const [failCount, setFailCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(true);
  const [showSyncAlert, setShowSyncAlert] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');

  // Sidebar handlers
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);
  // Fetch real sensor data from the database
  const loadDashboardData = useCallback(async () => {
    try {
      const data = await fetchDashboardData(selectedDevice);
      setTimestamp(prev => {
        if (data.timestamp && prev && data.timestamp !== prev) {
          setShowSyncAlert(true);
          setTimeout(() => setShowSyncAlert(false), 5000);
          return data.timestamp;
        }
        return data.timestamp || prev;
      });
      setSensors(data.sensors || []);
      setSensorsCount(data.sensorsCount);
      setApiStatus('connected');
      setFailCount(0);
      setError(null);
    } catch (err) {
      console.error('Dashboard Error:', err);
      setFailCount(prev => {
        const next = prev + 1;
        if (next > 3) {
          setApiStatus('disconnected');
          setError(err.message);
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [selectedDevice]);

  const loadForecast = useCallback(async () => {
    try {
      setForecastLoading(true);
      setComparisonLoading(true);
      
      // Fetch both forecast and comparison in parallel
      const [forecastData, comparisonData] = await Promise.all([
        fetchForecast('Nairobi', 4),
        fetchForecastComparison()
      ]);
      
      setForecast(forecastData);
      setComparison(comparisonData);
      setForecastError(null);
    } catch (err) {
      console.error('Forecast/Comparison Error:', err);
      setForecastError(err.message);
    } finally {
      setForecastLoading(false);
      setComparisonLoading(false);
    }
  }, []);

  const checkApiHealth = useCallback(async () => {
    try {
      await checkHealth();
      setApiStatus('connected');
      setFailCount(0);
      setError(null);
    } catch (err) {
      setFailCount(prev => {
        const next = prev + 1;
        if (next > 3) {
          setApiStatus('disconnected');
          setError('Backend services are temporarily unreachable.');
        }
        return next;
      });
    }
  }, []);

  useEffect(() => {
    // Initial load
    checkApiHealth();
    loadDashboardData();
    loadForecast();
    
    // Function to update device list
    const updateDevices = () => {
      fetchDevices()
        .then(devs => {
          setDevices(devs);
          // Auto-select if only one real device exists and none selected
          if (devs.length === 1 && !selectedDevice) {
            setSelectedDevice(devs[0].device_id);
          }
        })
        .catch(err => console.error('Devices load error:', err));
    };
    
    updateDevices();

    // Setup intervals
    const dashboardInterval = setInterval(loadDashboardData, 5000);
    const forecastInterval = setInterval(loadForecast, 60000);
    const healthInterval = setInterval(checkApiHealth, 15000);
    const deviceInterval = setInterval(updateDevices, 30000);

    return () => {
      clearInterval(dashboardInterval);
      clearInterval(forecastInterval);
      clearInterval(healthInterval);
      clearInterval(deviceInterval);
    };
  }, [loadDashboardData, loadForecast, checkApiHealth, selectedDevice]);
  
  return (
    <div className={`app ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        isOpen={isSidebarOpen} 
        onClose={closeSidebar} 
      />

      <main className="main">
        <button className="mobile-toggle" onClick={toggleSidebar}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <Header
          apiStatus={apiStatus}
          sensorsCount={sensorsCount}
          lastUpdate={timestamp}
          devices={devices}
          selectedDevice={selectedDevice}
          onDeviceChange={setSelectedDevice}
        />

        {apiStatus === 'disconnected' && (
          <div className="connection-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <strong>Connection Issue Detected</strong>
              <p>
                {error || 'The dashboard is currently offline. Please try refreshing or checking your network.'}
              </p>
              <button
                onClick={() => { setApiStatus('connecting'); checkApiHealth(); loadDashboardData(); }}
                style={{
                  marginTop: '10px',
                  padding: '4px 12px',
                  background: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '4px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                Retry Connection
              </button>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' ? (
          <>
            <StatsGrid sensors={sensors} loading={loading} />
            <section className="bottom-row">
              <SensorList sensors={sensors} loading={loading} timestamp={timestamp} />
                <ForecastPanel 
                  forecast={forecast} 
                  comparison={comparison}
                  loading={forecastLoading || comparisonLoading} 
                  error={forecastError} 
                />
            </section>
            <MapPanel sensors={sensors} loading={loading} />
          </>
        ) : activeTab === 'sensors' ? (
          <SensorDetailTab sensors={sensors} loading={loading} />
        ) : activeTab === 'health' ? (
          <HealthTab selectedDevice={selectedDevice} />
        ) : activeTab === 'raw-analysis' ? (
          <RawAnalysisTab selectedDevice={selectedDevice} sensors={sensors} loading={loading} />
        ) : (
          <YourDataTab selectedDevice={selectedDevice} sensors={sensors} loading={loading} />
        )}
        {showSyncAlert && (
          <div className="data-forward-alert">
            <div className="forward-pulse"></div>
            <span>New data entry from controller!</span>
          </div>
        )}
      </main>

      <ThemeToggle />
    </div>
  );
}
