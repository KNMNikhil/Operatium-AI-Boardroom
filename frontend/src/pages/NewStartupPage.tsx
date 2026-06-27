import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';
import { useStartupStore } from '../store/useStartupStore';
import { useMeetingStore } from '../store/useMeetingStore';

const ALL_EXECUTIVES = [
  { id: 'CEO', desc: 'Vision & Strategy' },
  { id: 'CTO', desc: 'Tech & Architecture' },
  { id: 'Product Manager', desc: 'Roadmap & MVP' },
  { id: 'Product Designer', desc: 'UX & Flows' },
  { id: 'Growth & Marketing', desc: 'Launch & Growth' },
  { id: 'Finance & Operations', desc: 'Costs & Revenue' },
  { id: 'Investor & Risk Advisor', desc: 'Risk & Investment' },
];

const INDUSTRIES = [
  'SaaS', 'Marketplace', 'Consumer App', 'FinTech', 'HealthTech',
  'EdTech', 'AI / ML', 'E-commerce', 'Social Network', 'Developer Tools',
  'Climate Tech', 'Enterprise Software', 'Gaming', 'Media & Entertainment',
  'BioTech', 'Hardware', 'Robotics', 'SpaceTech', 'Web3 / Crypto', 'Cybersecurity',
  'Logistics', 'PropTech', 'Other',
];

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  'SaaS': ['saas', 'software', 'subscription', 'cloud', 'b2b', 'platform', 'b2b software', 'service'],
  'Marketplace': ['marketplace', 'peer-to-peer', 'two-sided', 'connect', 'connects', 'buyers', 'sellers', 'exchange', 'hub'],
  'Consumer App': ['consumer', 'b2c', 'mobile', 'app', 'application', 'personal', 'tracker', 'habit', 'lifestyle'],
  'FinTech': ['fintech', 'finance', 'banking', 'payment', 'investing', 'trading', 'loan', 'credit', 'money', 'wallet', 'crypto', 'financial'],
  'HealthTech': ['health', 'medical', 'fitness', 'wellness', 'patient', 'doctor', 'clinic', 'hospital', 'telehealth', 'care', 'therapy'],
  'EdTech': ['education', 'learning', 'students', 'school', 'tutor', 'course', 'university', 'teach', 'teacher', 'academy'],
  'AI / ML': ['ai', 'machine learning', 'artificial intelligence', 'llm', 'generative', 'model', 'neural', 'nlp', 'gpt', 'bot', 'intelligent', 'automate', 'smart'],
  'E-commerce': ['e-commerce', 'ecommerce', 'retail', 'store', 'shop', 'cart', 'checkout', 'dtc', 'd2c', 'buy', 'sell', 'goods', 'products'],
  'Social Network': ['social', 'community', 'network', 'friends', 'creators', 'share', 'chat', 'messaging', 'dating'],
  'Developer Tools': ['developer', 'devtool', 'api', 'sdk', 'ide', 'git', 'coding', 'programmer', 'code', 'devs', 'engineers'],
  'Climate Tech': ['climate', 'sustainability', 'carbon', 'green', 'renewable', 'energy', 'environment', 'eco'],
  'Enterprise Software': ['enterprise', 'corporate', 'large business', 'erp', 'crm', 'hr', 'management', 'b2b enterprise'],
  'Gaming': ['game', 'gaming', 'esports', 'players', 'console', 'play', 'gamers', 'multiplayer'],
  'Media & Entertainment': ['media', 'entertainment', 'content', 'video', 'music', 'streaming', 'podcast', 'creator', 'movies'],
  'BioTech': ['biotech', 'biology', 'genetics', 'pharma', 'drug', 'therapeutics', 'clinical'],
  'Hardware': ['hardware', 'device', 'electronics', 'iot', 'wearable', 'manufacturing', 'physical', 'equipment'],
  'Robotics': ['robot', 'robotics', 'automation', 'drone', 'autonomous', 'machines'],
  'SpaceTech': ['space', 'satellite', 'rocket', 'aerospace', 'orbit'],
  'Web3 / Crypto': ['web3', 'crypto', 'blockchain', 'nft', 'defi', 'token', 'smart contract', 'decentralized', 'web 3'],
  'Cybersecurity': ['security', 'cybersecurity', 'hacker', 'threat', 'firewall', 'auth', 'encryption', 'privacy', 'protect', 'data protection'],
  'Logistics': ['logistics', 'supply chain', 'delivery', 'shipping', 'freight', 'warehouse', 'transport', 'cargo'],
  'PropTech': ['real estate', 'proptech', 'property', 'housing', 'tenant', 'landlord', 'rent', 'lease'],
};

type Step = 1 | 2 | 3;

const TooltipIcon = ({ text }: { text: string }) => (
  <div className="group relative inline-flex items-center ml-2" onClick={e => e.stopPropagation()}>
    <div className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-[12px] font-sans font-extrabold cursor-help opacity-70 group-hover:opacity-100">i</div>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-80 p-4 bg-black text-white text-base font-sans rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-2xl leading-relaxed">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-black"></div>
    </div>
  </div>
);

export function NewStartupPage() {
  const navigate = useNavigate();
  const { startups, addStartup } = useStartupStore();
  const { setIdea } = useMeetingStore();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [industryPrimary, setIndustryPrimary] = useState('');
  const [industrySecondary, setIndustrySecondary] = useState('');
  const [industryThird, setIndustryThird] = useState('');
  const [isSharkTank, setIsSharkTank] = useState(false);
  const [isInvestorLens, setIsInvestorLens] = useState(false);
  const [includeRedTeam, setIncludeRedTeam] = useState(false);
  const [capital, setCapital] = useState('');
  const [stage, setStage] = useState('Idea Stage');
  const [selectedExecs, setSelectedExecs] = useState<string[]>(ALL_EXECUTIVES.map(e => e.id));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [industryManuallySet, setIndustryManuallySet] = useState(false);

  React.useEffect(() => {
    if (industryManuallySet || !description.trim()) return;

    const lowerDesc = description.toLowerCase();
    const scores: { ind: string, score: number }[] = [];

    for (const ind of INDUSTRIES) {
      if (ind === 'Other') continue;
      let score = 0;
      const keywords = INDUSTRY_KEYWORDS[ind] || [];
      for (const kw of keywords) {
        // Use word boundaries so 'ai' doesn't match inside 'main'
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        if (regex.test(lowerDesc)) {
          score += 1;
        }
      }
      if (score > 0) scores.push({ ind, score });
    }

    scores.sort((a, b) => b.score - a.score);

    if (scores.length > 0) setIndustryPrimary(scores[0].ind);
    else setIndustryPrimary('');
    
    if (scores.length > 1) setIndustrySecondary(scores[1].ind);
    else setIndustrySecondary('');
    
    if (scores.length > 2) setIndustryThird(scores[2].ind);
    else setIndustryThird('');
  }, [description, industryManuallySet]);

  const toggleExec = (id: string) => {
    setSelectedExecs(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const handleNext = async () => {
    if (!name.trim() || !description.trim() || !industryPrimary || !industrySecondary) {
      setError('Please fill in all required fields (Name, Description, Primary, and Secondary Industry).');
      return;
    }
    setError('');
    await handleLaunch();
  };

  const handleLaunch = async () => {
    if (selectedExecs.length < 1) {
      setError('Select at least one executive.');
      return;
    }

    const isDuplicate = startups.some(s => s.name.toLowerCase() === name.trim().toLowerCase() && s.description.toLowerCase().includes(description.trim().toLowerCase().substring(0, 20)));
    if (isDuplicate) {
      setError('You already have a startup with this exact idea! Go to your Dashboard to view it.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const combinedIndustry = [industryPrimary, industrySecondary, industryThird].filter(Boolean).join(', ');

      let execs = [...selectedExecs];
      if (includeRedTeam) {
        execs.push("Red Team (Devil's Advocate)");
      }

      const types = [];
      if (isSharkTank) types.push('shark_tank');
      if (isInvestorLens) types.push('investor_lens');
      const finalMeetingType = types.length > 0 ? types.join(',') : 'full_board';

      const startup = await api.createStartup({
        name,
        description: `${description}\n\n[CAPITAL: ${capital || 'Unknown'}]\n[STAGE: ${stage}]`,
        industry: combinedIndustry,
        executives: execs,
      });

      addStartup(startup);
      setIdea(name, description);

      const meeting = await api.createMeeting({
        startup_id: startup.id,
        meeting_type: finalMeetingType,
        executives: execs,
      });

      navigate(`/?meetingId=${meeting.id}&startup_id=${startup.id}&startup_name=${encodeURIComponent(name)}&description=${encodeURIComponent(description)}&industry=${encodeURIComponent(combinedIndustry)}&execs=${encodeURIComponent(execs.join(','))}&meeting_type=${encodeURIComponent(finalMeetingType)}`);
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



      <motion.div key="step1"
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        style={{
          background: '#FFF4E9', border: '2px solid #000', borderRadius: 16,
          padding: '32px 40px', width: 600, boxShadow: '6px 6px 0 #000',
          transform: 'rotate(-0.5deg)',
        }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 4 }}>Your Startup Idea</h1>
        <p style={{ fontSize: 18, color: 'rgba(0,0,0,0.6)', marginBottom: 20 }}>Tell the boardroom what you're building.</p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 18, fontWeight: 700, display: 'block', marginBottom: 4 }}>Startup Name</label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. TravelMind AI"
            style={{
              width: '100%', border: '2px solid #000', borderRadius: 8, padding: '10px 14px',
              fontSize: 18, fontFamily: "'Caveat', cursive", background: 'transparent',
              outline: 'none', boxSizing: 'border-box',
              color: '#000',
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <label style={{ fontSize: 18, fontWeight: 700, display: 'block' }}>Description</label>
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.5)' }}>Max 10,000 chars</span>
          </div>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="e.g. An AI-powered travel planner that builds personalized itineraries..."
            rows={3}
            style={{
              width: '100%', border: '2px solid #000', borderRadius: 8, padding: '10px 14px',
              fontSize: 18, fontFamily: "'Caveat', cursive", background: 'transparent',
              outline: 'none', resize: 'none', boxSizing: 'border-box',
              color: '#000',
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 18, fontWeight: 700, display: 'block', marginBottom: 4 }}>Industry (Select up to 3)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={industryPrimary} onChange={e => { setIndustryPrimary(e.target.value); setIndustryManuallySet(true); }}
              style={{
                flex: '1', minWidth: '120px', border: '2px solid #000', borderRadius: 8, padding: '8px 10px',
                fontSize: 16, fontFamily: "'Caveat', cursive", background: 'transparent',
                outline: 'none', color: '#000', cursor: 'pointer', appearance: 'none'
              }}
            >
              <option value="" disabled>Primary (Required)</option>
              {INDUSTRIES.map(ind => <option key={ind} value={ind} disabled={ind === industrySecondary || ind === industryThird}>{ind}</option>)}
            </select>

            <select
              value={industrySecondary} onChange={e => { setIndustrySecondary(e.target.value); setIndustryManuallySet(true); }}
              style={{
                flex: '1', minWidth: '120px', border: '2px solid #000', borderRadius: 8, padding: '8px 10px',
                fontSize: 16, fontFamily: "'Caveat', cursive", background: 'transparent',
                outline: 'none', color: '#000', cursor: 'pointer', appearance: 'none'
              }}
            >
              <option value="" disabled>Secondary (Required)</option>
              {INDUSTRIES.map(ind => <option key={ind} value={ind} disabled={ind === industryPrimary || ind === industryThird}>{ind}</option>)}
            </select>

            <select
              value={industryThird} onChange={e => { setIndustryThird(e.target.value); setIndustryManuallySet(true); }}
              style={{
                flex: '1', minWidth: '120px', border: '2px solid #000', borderRadius: 8, padding: '8px 10px',
                fontSize: 16, fontFamily: "'Caveat', cursive", background: 'transparent',
                outline: 'none', color: '#000', cursor: 'pointer', appearance: 'none'
              }}
            >
              <option value="">Third (Optional)</option>
              {INDUSTRIES.map(ind => <option key={ind} value={ind} disabled={ind === industryPrimary || ind === industrySecondary}>{ind}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              Startup Stage
              <TooltipIcon text="The current maturity level of your company. This helps executives tailor their advice (e.g., focusing on product-market fit for Idea Stage vs. scaling operations for Series A)." />
            </label>
            <select
              value={stage} onChange={e => setStage(e.target.value)}
              style={{
                width: '100%', border: '2px solid #000', borderRadius: 8, padding: '10px 14px',
                fontSize: 16, fontFamily: "'Caveat', cursive", background: 'transparent',
                outline: 'none', color: '#000', cursor: 'pointer', appearance: 'none'
              }}
            >
              <option value="Idea Stage">Idea Stage</option>
              <option value="Pre-Seed">Pre-Seed</option>
              <option value="Seed">Seed</option>
              <option value="Series A">Series A+</option>
              <option value="Growth / Expansion">Growth / Expansion</option>
              <option value="Established / Profitable">Established / Profitable</option>
            </select>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              Initial Capital / Runway
              <TooltipIcon text="How much funding you have for this startup. Feel free to mention if you are backed by multiple sources (e.g., Zoho for Startups, Amazon for Startups, or Y Combinator). The AI will adapt its advice based on your backing!" />
            </label>
            <input
              value={capital} onChange={e => setCapital(e.target.value)}
              placeholder="e.g. $2M Seed funding, backed by Y Combinator"
              style={{
                width: '100%', border: '2px solid #000', borderRadius: 8, padding: '10px 14px',
                fontSize: 16, fontFamily: "'Caveat', cursive", background: 'transparent',
                outline: 'none', boxSizing: 'border-box', color: '#000',
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: '200px' }}>
            <div style={{ position: 'relative', width: 40, height: 22 }}>
              <input type="checkbox" checked={isSharkTank} onChange={e => setIsSharkTank(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isSharkTank ? '#ef4444' : 'rgba(0,0,0,0.2)', transition: '.4s', borderRadius: 34, border: '2px solid #000' }}>
                <span style={{ position: 'absolute', height: 14, width: 14, left: 2, bottom: 2, backgroundColor: 'white', transition: '.4s', borderRadius: '50%', transform: isSharkTank ? 'translateX(18px)' : 'translateX(0)', border: '2px solid #000' }} />
              </span>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: isSharkTank ? '#ef4444' : '#000', display: 'flex', alignItems: 'center' }}>
                Shark Tank
                <TooltipIcon text="Affects all executives. Abandons polite feedback. They become hostile, skeptical venture capitalists aggressively hunting for flaws and tearing apart weak assumptions." />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>Hostile board</div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: '200px' }}>
            <div style={{ position: 'relative', width: 40, height: 22 }}>
              <input type="checkbox" checked={isInvestorLens} onChange={e => setIsInvestorLens(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isInvestorLens ? '#10b981' : 'rgba(0,0,0,0.2)', transition: '.4s', borderRadius: 34, border: '2px solid #000' }}>
                <span style={{ position: 'absolute', height: 14, width: 14, left: 2, bottom: 2, backgroundColor: 'white', transition: '.4s', borderRadius: '50%', transform: isInvestorLens ? 'translateX(18px)' : 'translateX(0)', border: '2px solid #000' }} />
              </span>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: isInvestorLens ? '#10b981' : '#000', display: 'flex', alignItems: 'center' }}>
                Investor Lens
                <TooltipIcon text="Affects all executives. Evaluates strictly on ROI, market size, and exit strategy. They ignore 'nice-to-haves' and demand proof of massive revenue growth." />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>VC perspective</div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: '200px' }}>
            <div style={{ position: 'relative', width: 40, height: 22 }}>
              <input type="checkbox" checked={includeRedTeam} onChange={e => setIncludeRedTeam(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: includeRedTeam ? '#8b5cf6' : 'rgba(0,0,0,0.2)', transition: '.4s', borderRadius: 34, border: '2px solid #000' }}>
                <span style={{ position: 'absolute', height: 14, width: 14, left: 2, bottom: 2, backgroundColor: 'white', transition: '.4s', borderRadius: '50%', transform: includeRedTeam ? 'translateX(18px)' : 'translateX(0)', border: '2px solid #000' }} />
              </span>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: includeRedTeam ? '#8b5cf6' : '#000', display: 'flex', alignItems: 'center' }}>
                Red Team
                <TooltipIcon text="Adds an 8th executive (Devil's Advocate) who hunts for single points of failure, catastrophic risks, and prevents the board from agreeing in an echo-chamber." />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>Devil's Advocate</div>
            </div>
          </label>
        </div>

        {error && <p style={{ color: '#c0392b', fontSize: 16, marginBottom: 12 }}>{error}</p>}

        <button onClick={handleNext} disabled={isLoading} style={{
          width: '100%', padding: '12px', background: '#000', color: '#FFF4E9',
          border: '2px solid #000', borderRadius: 8, fontSize: 20, fontWeight: 700,
          fontFamily: "'Caveat', cursive", cursor: isLoading ? 'wait' : 'pointer',
          boxShadow: '4px 4px 0 rgba(0,0,0,0.3)', transition: 'transform 0.1s',
          opacity: isLoading ? 0.7 : 1,
        }}>
          {isLoading ? 'Calling the board...' : 'Launch Meeting →'}
        </button>
      </motion.div>
    </div>
  );
}
