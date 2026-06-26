import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';
import { useStartupStore } from '../store/useStartupStore';
import { useMeetingStore } from '../store/useMeetingStore';

const ALL_EXECUTIVES = [
  { id: 'CEO', icon: '👑', desc: 'Vision & Strategy' },
  { id: 'CTO', icon: '⚙️', desc: 'Tech & Architecture' },
  { id: 'Product Manager', icon: '🗺️', desc: 'Roadmap & MVP' },
  { id: 'Product Designer', icon: '🎨', desc: 'UX & Flows' },
  { id: 'Growth & Marketing', icon: '📈', desc: 'Launch & Growth' },
  { id: 'Finance & Operations', icon: '💰', desc: 'Costs & Revenue' },
  { id: 'Investor & Risk Advisor', icon: '🎯', desc: 'Risk & Investment' },
];

const INDUSTRIES = [
  'SaaS', 'Marketplace', 'Consumer App', 'FinTech', 'HealthTech',
  'EdTech', 'AI / ML', 'E-commerce', 'Social', 'Developer Tools',
  'Climate Tech', 'Enterprise', 'Gaming', 'Media', 'Other',
];

type Step = 1 | 2 | 3;

export function NewStartupPage() {
  const navigate = useNavigate();
  const { addStartup } = useStartupStore();
  const { setIdea } = useMeetingStore();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [industryPrimary, setIndustryPrimary] = useState('');
  const [industrySecondary, setIndustrySecondary] = useState('');
  const [industryThird, setIndustryThird] = useState('');
  const [meetingType, setMeetingType] = useState<'full_board' | 'custom'>('full_board');
  const [selectedExecs, setSelectedExecs] = useState<string[]>(ALL_EXECUTIVES.map(e => e.id));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleExec = (id: string) => {
    setSelectedExecs(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim() || !description.trim() || !industryPrimary || !industrySecondary) {
        setError('Please fill in all required fields (Name, Description, Primary, and Secondary Industry).');
        return;
      }
      setError('');
      setStep(2);
    } else if (step === 2) {
      if (meetingType === 'full_board') {
        setSelectedExecs(ALL_EXECUTIVES.map(e => e.id));
      }
      setStep(3);
    }
  };

  const handleLaunch = async () => {
    if (selectedExecs.length < 1) {
      setError('Select at least one executive.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const combinedIndustry = [industryPrimary, industrySecondary, industryThird].filter(Boolean).join(', ');

      const startup = await api.createStartup({
        name,
        description,
        industry: combinedIndustry,
        executives: selectedExecs,
      });

      addStartup(startup);
      setIdea(name, description);

      const meeting = await api.createMeeting({
        startup_id: startup.id,
        meeting_type: meetingType,
        executives: selectedExecs,
      });

      navigate(`/?meetingId=${meeting.id}&startup_id=${startup.id}&startup_name=${encodeURIComponent(name)}&description=${encodeURIComponent(description)}&industry=${encodeURIComponent(combinedIndustry)}&execs=${encodeURIComponent(selectedExecs.join(','))}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create startup. Check if the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      width: '100vw', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', boxSizing: 'border-box', overflowX: 'hidden',
      background: '#FFF4E9',
      backgroundImage: `linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)`,
      backgroundSize: '40px 40px',
      fontFamily: "'Caveat', cursive",
      color: '#000',
    }}>

      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        style={{
          position: 'absolute', top: 24, left: 24,
          background: 'transparent', border: '2px solid #000', borderRadius: 8,
          padding: '6px 16px', cursor: 'pointer', fontSize: 18,
          fontFamily: "'Caveat', cursive", fontWeight: 600,
          boxShadow: '3px 3px 0 #000',
          transform: 'rotate(-1deg)',
          color: '#000',
        }}
      >
        ← Back
      </button>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '2px solid #000',
            background: step >= s ? '#000' : 'transparent',
            color: step >= s ? '#FFF4E9' : '#000',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700,
            boxShadow: step === s ? '3px 3px 0 rgba(0,0,0,0.3)' : 'none',
            transition: 'all 0.3s',
          }}>{s}</div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1"
            initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.35 }}
            style={{
              background: '#FFF4E9', border: '2px solid #000', borderRadius: 16,
              padding: '48px 56px', width: 560, boxShadow: '6px 6px 0 #000',
              transform: 'rotate(-0.5deg)', maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Your Startup Idea</h1>
            <p style={{ fontSize: 20, color: 'rgba(0,0,0,0.6)', marginBottom: 32 }}>Tell the boardroom what you're building.</p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 20, fontWeight: 700, display: 'block', marginBottom: 8 }}>Startup Name</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. TravelMind AI"
                style={{
                  width: '100%', border: '2px solid #000', borderRadius: 8, padding: '12px 16px',
                  fontSize: 22, fontFamily: "'Caveat', cursive", background: 'transparent',
                  outline: 'none', boxSizing: 'border-box',
                  color: '#000',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <label style={{ fontSize: 20, fontWeight: 700, display: 'block' }}>Description</label>
                <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.5)' }}>Max 10,000 chars (~1,500 words)</span>
              </div>
              <textarea
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="e.g. An AI-powered travel planner that builds personalized itineraries based on your budget, preferences, and travel style."
                rows={4}
                style={{
                  width: '100%', border: '2px solid #000', borderRadius: 8, padding: '12px 16px',
                  fontSize: 20, fontFamily: "'Caveat', cursive", background: 'transparent',
                  outline: 'none', resize: 'none', boxSizing: 'border-box',
                  color: '#000',
                }}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ fontSize: 20, fontWeight: 700, display: 'block', marginBottom: 8 }}>Industry (Select up to 3)</label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <select
                  value={industryPrimary} onChange={e => setIndustryPrimary(e.target.value)}
                  style={{
                    flex: '1 1 140px', border: '2px solid #000', borderRadius: 8, padding: '12px 16px',
                    fontSize: 20, fontFamily: "'Caveat', cursive", background: 'transparent',
                    outline: 'none', color: '#000', cursor: 'pointer', appearance: 'none', minWidth: '140px'
                  }}
                >
                  <option value="" disabled>Primary (Required)</option>
                  {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>

                <select
                  value={industrySecondary} onChange={e => setIndustrySecondary(e.target.value)}
                  style={{
                    flex: '1 1 140px', border: '2px solid #000', borderRadius: 8, padding: '12px 16px',
                    fontSize: 20, fontFamily: "'Caveat', cursive", background: 'transparent',
                    outline: 'none', color: '#000', cursor: 'pointer', appearance: 'none', minWidth: '140px'
                  }}
                >
                  <option value="" disabled>Secondary (Required)</option>
                  {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>

                <select
                  value={industryThird} onChange={e => setIndustryThird(e.target.value)}
                  style={{
                    flex: '1 1 140px', border: '2px solid #000', borderRadius: 8, padding: '12px 16px',
                    fontSize: 20, fontFamily: "'Caveat', cursive", background: 'transparent',
                    outline: 'none', color: '#000', cursor: 'pointer', appearance: 'none', minWidth: '140px'
                  }}
                >
                  <option value="">Third (Optional)</option>
                  {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>
              </div>
            </div>

            {error && <p style={{ color: '#c0392b', fontSize: 18, marginBottom: 12 }}>{error}</p>}

            <button onClick={handleNext} style={{
              width: '100%', padding: '14px', background: '#000', color: '#FFF4E9',
              border: '2px solid #000', borderRadius: 8, fontSize: 22, fontWeight: 700,
              fontFamily: "'Caveat', cursive", cursor: 'pointer',
              boxShadow: '4px 4px 0 rgba(0,0,0,0.3)', transition: 'transform 0.1s',
            }}>
              Next: Choose Meeting Type →
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2"
            initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.35 }}
            style={{
              background: '#FFF4E9', border: '2px solid #000', borderRadius: 16,
              padding: '48px 56px', width: 560, boxShadow: '6px 6px 0 #000',
              transform: 'rotate(0.5deg)', maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Meeting Type</h1>
            <p style={{ fontSize: 20, color: 'rgba(0,0,0,0.6)', marginBottom: 32 }}>Who should attend the boardroom?</p>

            {[
              { id: 'full_board', label: 'Full Executive Board', desc: 'All 7 executives analyze your idea — the complete boardroom experience.', icon: '🏛️' },
              { id: 'custom', label: 'Custom Board', desc: 'Select which executives to include. Great for focused reviews.', icon: '⚡' },
            ].map(opt => (
              <button key={opt.id} onClick={() => setMeetingType(opt.id as any)} style={{
                width: '100%', padding: '20px 24px', marginBottom: 16,
                border: `2px solid #000`, borderRadius: 12,
                background: meetingType === opt.id ? '#000' : 'transparent',
                color: meetingType === opt.id ? '#FFF4E9' : '#000',
                textAlign: 'left', cursor: 'pointer',
                boxShadow: meetingType === opt.id ? '4px 4px 0 rgba(0,0,0,0.3)' : '2px 2px 0 rgba(0,0,0,0.1)',
                transition: 'all 0.2s', fontFamily: "'Caveat', cursive",
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{opt.icon} <strong style={{ fontSize: 22 }}>{opt.label}</strong></div>
                <div style={{ fontSize: 18, opacity: 0.8 }}>{opt.desc}</div>
              </button>
            ))}

            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <button onClick={() => setStep(1)} style={{
                flex: 1, padding: '14px', background: 'transparent', color: '#000',
                border: '2px solid #000', borderRadius: 8, fontSize: 20, fontWeight: 600,
                fontFamily: "'Caveat', cursive", cursor: 'pointer',
              }}>← Back</button>
              <button onClick={handleNext} style={{
                flex: 2, padding: '14px', background: '#000', color: '#FFF4E9',
                border: '2px solid #000', borderRadius: 8, fontSize: 22, fontWeight: 700,
                fontFamily: "'Caveat', cursive", cursor: 'pointer',
                boxShadow: '4px 4px 0 rgba(0,0,0,0.3)',
              }}>
                {meetingType === 'full_board' ? 'Launch Meeting →' : 'Select Executives →'}
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step3"
            initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.35 }}
            style={{
              background: '#FFF4E9', border: '2px solid #000', borderRadius: 16,
              padding: '48px 56px', width: 600, boxShadow: '6px 6px 0 #000',
              transform: 'rotate(-0.5deg)', maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Select Your Board</h1>
            <p style={{ fontSize: 20, color: 'rgba(0,0,0,0.6)', marginBottom: 24 }}>Choose which executives join the meeting.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
              {ALL_EXECUTIVES.map(exec => {
                const selected = selectedExecs.includes(exec.id);
                return (
                  <button key={exec.id} onClick={() => toggleExec(exec.id)} style={{
                    padding: '16px', border: '2px solid #000', borderRadius: 12,
                    background: selected ? '#000' : 'transparent',
                    color: selected ? '#FFF4E9' : '#000',
                    textAlign: 'left', cursor: 'pointer', fontFamily: "'Caveat', cursive",
                    boxShadow: selected ? '3px 3px 0 rgba(0,0,0,0.3)' : '2px 2px 0 rgba(0,0,0,0.1)',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ fontSize: 22 }}>{exec.icon} <strong style={{ fontSize: 18 }}>{exec.id}</strong></div>
                    <div style={{ fontSize: 16, opacity: 0.75 }}>{exec.desc}</div>
                  </button>
                );
              })}
            </div>

            <p style={{ fontSize: 18, color: 'rgba(0,0,0,0.6)', marginBottom: 16 }}>
              {selectedExecs.length} executive{selectedExecs.length !== 1 ? 's' : ''} selected
            </p>

            {error && <p style={{ color: '#c0392b', fontSize: 18, marginBottom: 12 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep(2)} style={{
                flex: 1, padding: '14px', background: 'transparent', color: '#000',
                border: '2px solid #000', borderRadius: 8, fontSize: 20, fontWeight: 600,
                fontFamily: "'Caveat', cursive", cursor: 'pointer',
              }}>← Back</button>
              <button onClick={handleLaunch} disabled={isLoading} style={{
                flex: 2, padding: '14px', background: '#000', color: '#FFF4E9',
                border: '2px solid #000', borderRadius: 8, fontSize: 22, fontWeight: 700,
                fontFamily: "'Caveat', cursive", cursor: isLoading ? 'wait' : 'pointer',
                boxShadow: '4px 4px 0 rgba(0,0,0,0.3)', opacity: isLoading ? 0.7 : 1,
              }}>
                {isLoading ? 'Calling the board...' : '🚀 Launch Meeting'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
