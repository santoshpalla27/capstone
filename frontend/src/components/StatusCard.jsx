function StatusCard({ name, status, lastCheck, message }) {
    const getStatusClass = () => {
        if (!status) return 'unknown'
        return status.toLowerCase()
    }

    const formatTime = (timestamp) => {
        if (!timestamp) return 'Never'
        const date = new Date(timestamp)
        return date.toLocaleTimeString()
    }

    return (
        <div className="glass-card component-card">
            <div className="header-row">
                <h3>{name}</h3>
                <span className={`status-badge ${getStatusClass()}`}>
                    <span className={`status-dot ${getStatusClass()}`}></span>
                    {status || 'Unknown'}
                </span>
            </div>
            <div className="meta">
                <p>Last check: {formatTime(lastCheck)}</p>
                {message && <p style={{ marginTop: 4 }}>{message}</p>}
            </div>
        </div>
    )
}

export default StatusCard
