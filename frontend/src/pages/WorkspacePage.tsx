import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../services/api';
import { useStartupStore } from '../store/useStartupStore';

const STAGE_COLORS: Record<string, string> = {
  idea: '#94a3b8',
  research: '#60a5fa',
  validation: '#facc15',
  mvp: '#fb923c',
  testing: '#c084fc',
  launch: '#4ade80',
  scaling: '#f43f5e',
};

const STAGE_ORDER = ['idea', 'research', 'validation', 'mvp', 'testing', 'launch', 'scaling'];

export function WorkspacePage() {
  const navigate = useNavigate();
  const { startups, setStartups, setLoading, isLoading, error, setError } = useStartupStore();

  useEffect(() => {
    setLoading(true);
    api.listStartups()
      .then(setStartups)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this startup?")) {
      try {
        await api.deleteStartup(id);
        setStartups(startups.filter(s => s.id !== id));
      } catch (err: any) {
        alert(`Failed to delete startup: ${err.message}`);
      }
    }
  };

  const handleOpenStartup = async (id: string) => {
    setLoading(true);
    try {
      const fullStartup = await api.getStartup(id);
      if (fullStartup.meetings && fullStartup.meetings.length > 0) {
        const latestMeeting = fullStartup.meetings[0];
        const execs = fullStartup.executives?.join(',') || '';
        navigate(`/?meetingId=${latestMeeting.id}&startup_id=${fullStartup.id}&execs=${execs}&startup_name=${encodeURIComponent(fullStartup.name)}&description=${encodeURIComponent(fullStartup.description)}`);
      } else {
        alert("This startup has no meetings yet.");
      }
    } catch (err: any) {
      alert(`Failed to open startup: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: '100vw', minHeight: '100vh',
      background: '#FFF4E9',
      backgroundImage: `linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)`,
      backgroundSize: '40px 40px',
      fontFamily: "'Caveat', cursive",
      color: '#000',
    }}>

      {/* Header */}
      <div style={{
        padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '2px solid rgba(0,0,0,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} style={{
            background: 'transparent', border: '2px solid #000', borderRadius: 8,
            padding: '6px 14px', cursor: 'pointer', fontSize: 18,
            fontFamily: "'Caveat', cursive", fontWeight: 600,
            boxShadow: '3px 3px 0 #000',
            color: '#000',
          }}>← Home</button>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>Your Startups</h1>
            <p style={{ fontSize: 18, color: 'rgba(0,0,0,0.5)', margin: 0 }}>{startups.length} startup{startups.length !== 1 ? 's' : ''} in your workspace</p>
          </div>
        </div>
        <button onClick={() => navigate('/new')} style={{
          padding: '12px 24px', background: '#000', color: '#FFF4E9',
          border: '2px solid #000', borderRadius: 10, fontSize: 20, fontWeight: 700,
          fontFamily: "'Caveat', cursive", cursor: 'pointer',
          boxShadow: '4px 4px 0 rgba(0,0,0,0.3)', transform: 'rotate(-1deg)',
        }}>
          + New Startup
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '40px' }}>
        {isLoading && (
          <div style={{ textAlign: 'center', fontSize: 24, color: 'rgba(0,0,0,0.4)', paddingTop: 80 }}>
            Loading your startups...
          </div>
        )}

        {error && (
          <div style={{
            padding: 20, background: 'rgba(239,68,68,0.1)',
            border: '2px solid rgba(239,68,68,0.3)', borderRadius: 12,
            color: '#c0392b', fontSize: 18, marginBottom: 24,
          }}>
            ⚠️ {error} — Make sure the backend is running.
          </div>
        )}

        {!isLoading && startups.length === 0 && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center', paddingTop: 100 }}
          >
            <div style={{ fontSize: 72, marginBottom: 16 }}>🏛️</div>
            <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>No startups yet</h2>
            <p style={{ fontSize: 22, color: 'rgba(0,0,0,0.5)', marginBottom: 32 }}>
              Your first idea is waiting to meet the board.
            </p>
            <button onClick={() => navigate('/new')} style={{
              padding: '14px 32px', background: '#000', color: '#FFF4E9',
              border: '2px solid #000', borderRadius: 10, fontSize: 22, fontWeight: 700,
              fontFamily: "'Caveat', cursive", cursor: 'pointer',
              boxShadow: '4px 4px 0 rgba(0,0,0,0.3)',
            }}>
              Launch Your First Meeting
            </button>
          </motion.div>
        )}

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 24,
        }}>
          {startups.map((startup, i) => (
            <motion.div
              key={startup.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                background: '#FFF4E9', border: '2px solid #000', borderRadius: 16,
                padding: '28px',
                boxShadow: '5px 5px 0 #000',
                transform: `rotate(${i % 2 === 0 ? '-0.5' : '0.5'}deg)`,
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'pointer'
              }}
              onClick={() => handleOpenStartup(startup.id)}
              whileHover={{ scale: 1.02, y: -4 }}
            >
              {/* Stage badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: 16, fontWeight: 700,
                      background: STAGE_COLORS[startup.stage] || '#94a3b8',
                      color: '#0a0a0f', textTransform: 'capitalize',
                    }}>
                      {startup.stage}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button 
                        onClick={(e) => handleDelete(e, startup.id)}
                        style={{
                            background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, padding: 0
                        }}
                        title="Delete Startup"
                    >
                        🗑️
                    </button>
                    <span style={{ fontSize: 24, fontWeight: 800, color: startup.validation_score > 60 ? '#16a34a' : startup.validation_score > 40 ? '#b45309' : '#000' }}>
                      {startup.validation_score > 0 ? `${startup.validation_score}/100` : '—'}
                    </span>
                </div>
              </div>

              <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>{startup.name}</h2>
              <p style={{ fontSize: 18, color: 'rgba(0,0,0,0.6)', marginBottom: 16, lineHeight: 1.5 }}>
                {startup.description.slice(0, 120)}{startup.description.length > 120 ? '...' : ''}
              </p>

              {/* Stage progress */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                {STAGE_ORDER.map((s) => (
                  <div key={s} style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: STAGE_ORDER.indexOf(s) <= STAGE_ORDER.indexOf(startup.stage)
                      ? '#000' : 'rgba(0,0,0,0.1)',
                  }} />
                ))}
              </div>

              {/* Meta */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: 'rgba(0,0,0,0.5)' }}>
                <span>🏭 {startup.industry}</span>
                <span>📅 {startup.meeting_count} meeting{startup.meeting_count !== 1 ? 's' : ''}</span>
                <span>👥 {startup.executives?.length || 7} execs</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
