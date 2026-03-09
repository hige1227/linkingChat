import { useState, useEffect, useRef, useCallback } from 'react';

interface SearchResult {
  id: string;
  content: string;
  converseId: string;
  authorId: string;
  author?: {
    username?: string;
    displayName?: string;
  };
  createdAt: string;
}

interface SearchPanelProps {
  converseId?: string; // undefined = global search
  onClose: () => void;
  onResultClick: (converseId: string, messageId: string) => void;
}

export function SearchPanel({ converseId, onClose, onResultClick }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length === 0) {
      setResults([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    try {
      const token = await window.electronAPI.getToken();
      if (!token) return;

      let url = `http://localhost:3008/api/v1/messages/search?query=${encodeURIComponent(q)}&limit=20&offset=0`;
      if (converseId) url += `&converseId=${converseId}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setLoading(false);
    }
  }, [converseId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const highlightText = (text: string, q: string) => {
    if (!q.trim()) return text;
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase()
        ? <mark key={i} style={{ background: 'rgba(79, 195, 247, 0.3)', color: '#e0e0e0' }}>{part}</mark>
        : part
    );
  };

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <input
          ref={inputRef}
          className="search-panel-input"
          placeholder="Search messages..."
          value={query}
          onChange={handleChange}
        />
        <button className="search-panel-close" onClick={onClose}>&times;</button>
      </div>
      <div className="search-panel-results">
        {loading && results.length === 0 && (
          <div className="search-panel-status">Searching...</div>
        )}
        {!loading && query.length > 0 && results.length === 0 && (
          <div className="search-panel-status">No messages found</div>
        )}
        {results.map((r) => (
          <div
            key={r.id}
            className="search-result-item"
            onClick={() => onResultClick(r.converseId, r.id)}
          >
            <div className="search-result-content">
              {highlightText(r.content, query)}
            </div>
            <div className="search-result-meta">
              <span>{r.author?.displayName ?? r.author?.username ?? 'Unknown'}</span>
              <span>{formatDate(r.createdAt)}</span>
            </div>
          </div>
        ))}
        {total > 0 && (
          <div className="search-panel-status" style={{ fontSize: '0.72rem' }}>
            {total} result{total !== 1 ? 's' : ''} found
          </div>
        )}
      </div>
    </div>
  );
}
