export default function Sidebar({ activeTab, onTabChange, isOpen, onClose }) {
    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <button className="sidebar-close" onClick={onClose}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
            
            <div className="sidebar-brand">
                <div className="brand-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                    </svg>
                </div>
                <span className="brand-text">AQMRG</span>
            </div>

            <nav className="sidebar-nav">
                <a
                    href="#"
                    className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); onTabChange('dashboard'); onClose(); }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    <span>Dashboard</span>
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTab === 'your-data' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); onTabChange('your-data'); onClose(); }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                    <span>Your Data</span>
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTab === 'raw-analysis' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); onTabChange('raw-analysis'); onClose(); }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                    </svg>
                    <span>Raw Analysis</span>
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTab === 'sensors' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); onTabChange('sensors'); onClose(); }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                    </svg>
                    <span>Sensors</span>
                </a>
            </nav>

            <div className="sidebar-footer">
                <div className="user-avatar">AQ</div>
                <div className="user-info">
                    <span className="user-name">AQMRG</span>
                    <span className="user-role">Admin</span>
                </div>
            </div>
        </aside>
    );
}
