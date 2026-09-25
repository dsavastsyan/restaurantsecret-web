import { useState, useMemo, useRef, useEffect } from 'react';
import { buildMetroLineGroups, normalizeMetroStationName } from '@/lib/metroSelection';

export default function MetroFilter({
    metroData,
    selectedStationNames = [],
    onChange,
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedLineIds, setExpandedLineIds] = useState(() => new Set());
    const containerRef = useRef(null);

    const lines = metroData.lines || [];
    const stations = metroData.stations || [];
    const lineGroups = useMemo(() => buildMetroLineGroups(lines, stations), [lines, stations]);
    const selectedKeys = useMemo(
        () => new Set(selectedStationNames.map(normalizeMetroStationName).filter(Boolean)),
        [selectedStationNames]
    );
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredLines = useMemo(() => {
        if (!normalizedQuery) return lineGroups;

        return lineGroups
            .map((line) => {
                if (line.name_ru.toLowerCase().includes(normalizedQuery)) return line;
                return {
                    ...line,
                    stations: line.stations.filter((station) =>
                        station.name_ru.toLowerCase().includes(normalizedQuery)
                    ),
                };
            })
            .filter((line) => line.stations.length > 0);
    }, [lineGroups, normalizedQuery]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const emitSelection = (nextKeys) => {
        const namesByKey = new Map();
        lineGroups.forEach((line) => {
            line.stations.forEach((station) => namesByKey.set(station.key, station.name_ru));
        });
        const nextNames = Array.from(nextKeys)
            .map((key) => namesByKey.get(key))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'ru'));
        if (typeof onChange === 'function') onChange(nextNames);
    };

    const toggleStation = (station) => {
        const nextKeys = new Set(selectedKeys);
        if (nextKeys.has(station.key)) nextKeys.delete(station.key);
        else nextKeys.add(station.key);
        emitSelection(nextKeys);
    };

    const toggleLine = (line) => {
        const nextKeys = new Set(selectedKeys);
        const lineKeys = line.stations.map((station) => station.key);
        const isFullySelected = lineKeys.every((key) => nextKeys.has(key));
        lineKeys.forEach((key) => {
            if (isFullySelected) nextKeys.delete(key);
            else nextKeys.add(key);
        });
        emitSelection(nextKeys);
    };

    const toggleExpandedLine = (lineId) => {
        setExpandedLineIds((current) => {
            const next = new Set(current);
            if (next.has(lineId)) next.delete(lineId);
            else next.add(lineId);
            return next;
        });
    };

    const clearAll = (event) => {
        event.stopPropagation();
        if (typeof onChange === 'function') onChange([]);
    };

    const selectedCount = selectedKeys.size;
    const triggerText = selectedCount === 0
        ? 'Станции метро'
        : selectedCount === 1
            ? selectedStationNames[0]
            : `Выбрано станций: ${selectedCount}`;

    return (
        <div className="metro-filter-container" ref={containerRef} style={{ zIndex: isOpen ? 90 : 1 }}>
            <button
                type="button"
                className={`filter-trigger ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
            >
                <div className="trigger-text-wrapper">
                    <span className="metro-icon">🚇</span>
                    <span className="placeholder-text">{triggerText}</span>
                </div>
                <span className={`chevron ${isOpen ? 'up' : 'down'}`}></span>
            </button>

            {isOpen && (
                <div className="filter-dropdown">
                    <div className="search-box">
                        <div className="search-input-wrapper">
                            <span className="search-icon">🔍</span>
                            <input
                                type="text"
                                placeholder="Поиск станции..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                        </div>
                        {selectedCount > 0 && (
                            <button
                                type="button"
                                className="clear-filter-btn"
                                onClick={clearAll}
                            >
                                Сбросить фильтр
                            </button>
                        )}
                    </div>

                    <div className="options-list">
                        {filteredLines.length === 0 ? (
                            <div className="no-results">Ничего не найдено</div>
                        ) : (
                            filteredLines.map((line) => {
                                const completeLine = lineGroups.find((candidate) => candidate.id === line.id) || line;
                                const selectedOnLine = completeLine.stations.filter((station) => selectedKeys.has(station.key)).length;
                                const isFullySelected = selectedOnLine === completeLine.stations.length;
                                const isPartiallySelected = selectedOnLine > 0 && !isFullySelected;
                                const isExpanded = Boolean(normalizedQuery) || expandedLineIds.has(line.id);

                                return (
                                    <div key={line.id} className="metro-line-group">
                                        <div className="metro-line-row">
                                            <button
                                                className={`metro-line-select ${isFullySelected || isPartiallySelected ? 'selected' : ''}`}
                                                type="button"
                                                onClick={() => toggleLine(completeLine)}
                                                aria-pressed={isFullySelected}
                                            >
                                                <span className={`metro-checkbox ${isPartiallySelected ? 'partial' : ''}`}>
                                                    {isFullySelected ? '✓' : isPartiallySelected ? '−' : ''}
                                                </span>
                                                <span className="metro-line-color" style={{ '--metro-line-color': line.color }}></span>
                                                <span className="metro-line-name">{line.name_ru}</span>
                                                {selectedOnLine > 0 && (
                                                    <span className="metro-line-count">{selectedOnLine}/{completeLine.stations.length}</span>
                                                )}
                                            </button>
                                            <button
                                                className={`metro-line-expand ${isExpanded ? 'expanded' : ''}`}
                                                type="button"
                                                onClick={() => toggleExpandedLine(line.id)}
                                                aria-label={`${isExpanded ? 'Скрыть' : 'Показать'} станции линии ${line.name_ru}`}
                                                aria-expanded={Boolean(isExpanded)}
                                            >
                                                <span className="chevron"></span>
                                            </button>
                                        </div>
                                        {isExpanded && (
                                            <div className="metro-stations-list">
                                                {line.stations.map((station) => {
                                                    const isSelected = selectedKeys.has(station.key);
                                                    return (
                                                        <button
                                                            key={station.key}
                                                            className={`metro-station-option ${isSelected ? 'selected' : ''}`}
                                                            type="button"
                                                            onClick={() => toggleStation(station)}
                                                            aria-pressed={isSelected}
                                                        >
                                                            <span className="metro-checkbox">{isSelected ? '✓' : ''}</span>
                                                            <span className="station-name">{station.name_ru}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            <style>{`
                .metro-filter-container {
                    position: relative;
                    margin: 0 16px 16px;
                    width: 300px;
                    z-index: 1001;
                    font-family: inherit;
                }
                .filter-trigger {
                    width: 100%;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 14px;
                    background: var(--app-surface, #fff);
                    border: 1px solid var(--app-border, #e2e8f0);
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    user-select: none;
                    min-height: 44px;
                    font-family: inherit;
                    text-align: left;
                }
                .filter-trigger:hover {
                    border-color: #cbd5e1;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
                }
                .filter-trigger.active {
                    border-color: var(--rs-accent, #2f8f5b);
                    box-shadow: 0 0 0 3px rgba(47, 143, 91, 0.1);
                    background: var(--app-surface, #fff);
                }
                .trigger-text-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    overflow: hidden;
                    flex: 1;
                }
                .metro-icon {
                    font-size: 16px;
                    flex-shrink: 0;
                }
                .placeholder-text {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--app-text, #1e293b);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .chevron {
                    width: 10px;
                    height: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                }
                .chevron::before {
                    content: '';
                    width: 6px;
                    height: 6px;
                    border-right: 2px solid #94a3b8;
                    border-bottom: 2px solid #94a3b8;
                    transform: rotate(45deg);
                    transition: all 0.3s ease;
                    margin-top: -2px;
                }
                .filter-trigger.active .chevron::before {
                    transform: rotate(-135deg);
                    margin-top: 4px;
                    border-color: var(--rs-accent, #2f8f5b);
                }
                .filter-dropdown {
                    position: absolute;
                    top: calc(100% + 8px);
                    left: 0;
                    right: 0;
                    background: color-mix(in srgb, var(--app-surface, #fff) 96%, transparent);
                    backdrop-filter: blur(10px);
                    border: 1px solid var(--app-border, #e2e8f0);
                    border-radius: 16px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.15);
                    overflow: hidden;
                    animation: dropdownIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    transform-origin: top center;
                }
                @keyframes dropdownIn {
                    from { opacity: 0; transform: scale(0.95) translateY(-10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .search-box {
                    padding: 12px;
                    border-bottom: 1px solid var(--app-border, #f1f5f9);
                }
                .clear-filter-btn {
                    margin-top: 8px;
                    border: 1px solid var(--app-border, #cbd5e1);
                    background: var(--app-surface, #fff);
                    color: var(--app-text, #334155);
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    padding: 6px 10px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .clear-filter-btn:hover {
                    border-color: #94a3b8;
                    color: #0f172a;
                    background: rgba(148, 163, 184, 0.12);
                }
                .search-input-wrapper {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                .search-icon {
                    position: absolute;
                    left: 10px;
                    font-size: 14px;
                    color: #94a3b8;
                }
                .search-box input {
                    width: 100%;
                    padding: 9px 12px 9px 34px;
                    border: 1px solid var(--app-border, #e2e8f0);
                    border-radius: 10px;
                    font-size: 14px;
                    outline: none;
                    background: var(--app-surface-2, #f8fafc);
                    transition: all 0.2s ease;
                }
                .search-box input:focus {
                    border-color: var(--rs-accent, #2f8f5b);
                    background: var(--app-surface, #fff);
                    box-shadow: 0 0 0 3px rgba(47, 143, 91, 0.08);
                }
                .options-list {
                    max-height: min(420px, 60vh);
                    overflow-y: auto;
                    padding: 6px;
                }
                .options-list::-webkit-scrollbar {
                    width: 6px;
                }
                .options-list::-webkit-scrollbar-thumb {
                    background: var(--app-border, #e2e8f0);
                    border-radius: 10px;
                }
                .metro-line-group {
                    border-bottom: 1px solid color-mix(in srgb, var(--app-border, #e2e8f0) 72%, transparent);
                }
                .metro-line-group:last-child {
                    border-bottom: 0;
                }
                .metro-line-row {
                    display: flex;
                    align-items: center;
                    border-radius: 10px;
                }
                .metro-line-row:hover {
                    background: var(--app-surface-2, #f1f5f9);
                }
                .metro-line-select,
                .metro-station-option,
                .metro-line-expand {
                    border: 0;
                    background: transparent;
                    color: inherit;
                    font-family: inherit;
                    cursor: pointer;
                }
                .metro-line-select {
                    min-width: 0;
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 11px 6px 11px 10px;
                    text-align: left;
                }
                .metro-line-expand {
                    width: 38px;
                    align-self: stretch;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .metro-line-expand .chevron::before {
                    transform: rotate(45deg);
                }
                .metro-line-expand.expanded .chevron::before {
                    transform: rotate(-135deg);
                    margin-top: 4px;
                }
                .metro-checkbox {
                    width: 18px;
                    height: 18px;
                    border: 1px solid var(--app-border, #cbd5e1);
                    border-radius: 5px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    color: #fff;
                    font-size: 12px;
                    font-weight: 800;
                }
                .selected > .metro-checkbox,
                .metro-checkbox.partial {
                    border-color: var(--rs-accent, #2f8f5b);
                    background: var(--rs-accent, #2f8f5b);
                }
                .metro-line-color {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    flex-shrink: 0;
                    background: var(--metro-line-color, #94a3b8);
                    box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.14);
                }
                .metro-line-name {
                    min-width: 0;
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: var(--app-text, #1e293b);
                    font-size: 14px;
                    font-weight: 650;
                }
                .metro-line-count {
                    flex-shrink: 0;
                    color: var(--app-muted, #64748b);
                    font-size: 11px;
                    font-variant-numeric: tabular-nums;
                }
                .metro-stations-list {
                    padding: 0 6px 7px 38px;
                }
                .metro-station-option {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 10px;
                    border-radius: 8px;
                    text-align: left;
                }
                .metro-station-option:hover,
                .metro-station-option.selected {
                    background: var(--app-surface-2, #f1f5f9);
                }
                .station-name {
                    font-size: 14px;
                    color: var(--app-muted, #475569);
                    font-weight: 500;
                    flex: 1;
                }
                .no-results {
                    padding: 30px 20px;
                    text-align: center;
                    color: #94a3b8;
                    font-size: 14px;
                    font-style: italic;
                }
            `}</style>
        </div>
    );
}
