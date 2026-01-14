function SafeModeBanner({ safeMode, onResolve }) {
    const formatDuration = (seconds) => {
        if (!seconds) return ''
        if (seconds < 60) return `${seconds}s`
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    }

    return (
        <div className="safe-mode-banner">
            <span className="icon">🚨</span>
            <div className="content">
                <h3>Safe Mode Active</h3>
                <p>
                    {safeMode.reason}
                    {safeMode.duration && ` • Active for ${formatDuration(safeMode.duration)}`}
                </p>
            </div>
            <button className="btn btn-primary" onClick={onResolve}>
                Resolve
            </button>
        </div>
    )
}

export default SafeModeBanner
