import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StatsGrid from './components/StatsGrid';
import SensorList from './components/SensorList';
import SensorDetailTab from './components/SensorDetailTab';
import YourDataTab from './components/YourDataTab';
import RawAnalysisTab from './components/RawAnalysisTab';
import ForecastPanel from './components/ForecastPanel';
import { fetchDashboardData, fetchForecast, checkHealth } from './api/dashboard';
import './App.css';

/**
 * AQMRG Dashboard — Main Application
 */
export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Fetch real sensor data from the database
  const loadDashboardData = useCallback(async () => {
    try {
      const data = await fetchDashboardData();
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
  }, []);

  const loadForecast = useCallback(async () => {
    try {
      setForecastLoading(true);
      const data = await fetchForecast('Nairobi', 4);
      setForecast(data);
      setForecastError(null);
    } catch (err) {
      console.error('Forecast Error:', err);
      setForecastError(err.message);
    } finally {
      setForecastLoading(false);
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
    checkApiHealth();
    loadDashboardData();
    loadForecast();
    const dashboardInterval = setInterval(loadDashboardData, 5000);
    const forecastInterval = setInterval(loadForecast, 60000);
    const healthInterval = setInterval(checkApiHealth, 15000);
    return () => {
      clearInterval(dashboardInterval);
      clearInterval(forecastInterval);
      clearInterval(healthInterval);
    };
  }, [loadDashboardData, loadForecast, checkApiHealth]);
  
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

        <Header apiStatus={apiStatus} sensorsCount={sensorsCount} lastUpdate={timestamp} />

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
              <ForecastPanel forecast={forecast} loading={forecastLoading} error={forecastError} />
            </section>
          </>
        ) : activeTab === 'sensors' ? (
          <SensorDetailTab sensors={sensors} loading={loading} />
        ) : activeTab === 'raw-analysis' ? (
          <RawAnalysisTab sensors={sensors} loading={loading} />
        ) : (
          <YourDataTab sensors={sensors} loading={loading} />
        )}
        {showSyncAlert && (
          <div className="data-forward-alert">
            <div className="forward-pulse"></div>
            <span>New data entry from controller!</span>
          </div>
        )}
      </main>
    </div>
  );
}
