import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { MeetingTimeline } from './components/MeetingTimeline';
import { CommandInput } from './components/CommandInput';
import { AnimatedOfficeSVG } from './components/AnimatedOfficeSVG';
import { NewStartupPage } from './pages/NewStartupPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { useMeetingStore } from './store/useMeetingStore';
import { MeetingWebSocket } from './services/websocket';
import { PostMeetingWorkflow } from './components/PostMeetingWorkflow';
import { api } from './services/api';
import { HomeFooter } from './components/HomeFooter';

// ── Boardroom Home ────────────────────────────────────────────────────────────

function BoardroomHome() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const meetingId = searchParams.get('meetingId');
  const startupId = searchParams.get('startup_id');
  const startupName = searchParams.get('startup_name');
  const description = searchParams.get('description');
  const industry = searchParams.get('industry');
  const execsParam = searchParams.get('execs');

  const {
    currentStage, isMeetingActive,
    startMeeting, setStage, setCurrentSpeakerLive,
    appendToken, finalizeMessage, setMeetingDecisions,
    setReport, enterQAPhase, finishMeeting, setIdea, addTimelineEvent, report, isGeneratingReport, setIsGeneratingReport,
    qaState, setQaState, addSystemMessage, resetMeeting
  } = useMeetingStore();
  const wsRef = useRef<MeetingWebSocket | null>(null);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);

  useEffect(() => {
    if (currentStage === 'complete') {
      // Don't auto-show workflow, wait for user to click Generate Report
    }
  }, [currentStage]);

  useEffect(() => {
    let isCancelled = false;

    if (meetingId && startupId && execsParam) {
      const execs = execsParam.split(',');
      setIdea(startupName || '', description || '');
      startMeeting(meetingId, startupId, startupName || 'New Concept');
      
      wsRef.current?.disconnect();
      const ws = new MeetingWebSocket(meetingId);
      wsRef.current = ws;

      ws.onEvent((event) => {
        if (isCancelled) return;
        switch (event.type) {
          case 'stage_change':
            setStage(event.stage as any);
            break;
          case 'speaking':
            setCurrentSpeakerLive(event.executive || '');
            break;
          case 'token':
            appendToken(event.executive || '', event.stage || '', event.token || '');
            break;
          case 'message_complete':
            finalizeMessage(event.executive || '');
            break;
          case 'meeting_complete':
            if (event.decisions) setMeetingDecisions(event.decisions);
            if (event.report) setReport(event.report as any);
            enterQAPhase();
            break;
          case 'error':
             addTimelineEvent(`Error: ${event.data}`, 'System');
            break;
        }
      });

      ws.connect().then(() => {
        if (isCancelled) {
            ws.disconnect();
            return;
        }
        ws.send({
          startup_id: startupId,
          startup_name: startupName || '',
          startup_description: description || '',
          industry: industry || '',
          executives: execs,
        });
      }).catch(err => {
         if (isCancelled) return;
         addTimelineEvent(`Failed to connect: ${err.message}`, 'System');
      });
      
      return () => {
        isCancelled = true;
        ws.disconnect();
      };
    } else if (!meetingId) {
      resetMeeting();
    }
  }, [meetingId, startupId, execsParam]);

  const handleGenerateReport = async () => {
    if (!meetingId) return;
    if (report && Object.keys(report).length > 0 && report.content) {
      setShowWorkflow(true);
      return;
    }
    try {
      setIsGeneratingReport(true);
      const res = await api.generateReport(meetingId);
      setReport(res.report);
      setShowWorkflow(true);
    } catch (e: any) {
      alert(`Failed to generate report: ${e.message}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleFollowupSubmit = async (text: string) => {
    if (qaState === 'asking_questions') {
      // If it's an actual question, send it.
      if (!wsRef.current) return;
      if (!wsRef.current.isConnected) {
        await wsRef.current.connect();
      }

      if (!useMeetingStore.getState().isMeetingActive) {
        useMeetingStore.getState().resumeMeeting();
      }

      useMeetingStore.getState().addTimelineEvent(text, 'Founder');
      
      wsRef.current.send({
        startup_id: startupId,
        startup_name: startupName || '',
        startup_description: description || '',
        industry: industry || '',
        executives: execsParam?.split(',') || [],
        followup_question: text,
      });
      return;
    }
  };

  return (
    <div style={{
      width: '100vw', height: '100vh',
      position: 'relative', overflow: 'hidden',
      background: '#FFF4E9',
      backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 0, 0, 0.05) 1px, transparent 1px)`,
      backgroundSize: '40px 40px',
      fontFamily: "'Caveat', cursive",
      color: '#000',
    }}>
      {/* Office SVG */}
      <div style={{ position: 'absolute', inset: 0, transform: 'translateY(-5%)' }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AnimatedOfficeSVG />
        </div>
      </div>

      {/* UI Overlay */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>

        {/* Header */}
        {!(currentStage === 'complete' && showWorkflow) && (
          <header style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '20px 24px',
            background: 'transparent',
            pointerEvents: 'none'
          }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', pointerEvents: 'auto' }}
              onClick={() => navigate('/')}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '4px',
                border: '2px solid #000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 18, color: '#000',
                transform: 'rotate(-3deg)'
              }}>O</div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#000', letterSpacing: '0.02em', WebkitTextFillColor: '#000' }}>Operatium</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(0,0,0,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase', WebkitTextFillColor: 'rgba(0,0,0,0.6)' }}>AI Executive Team</div>
                {meetingId && (
                  <div className="mt-1 flex items-center gap-2">
                    {isMeetingActive ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-sm font-bold text-red-600 tracking-wider">MEETING STARTED, LIVE</span>
                      </>
                    ) : (
                      <span className="text-sm font-bold text-green-600 tracking-wider">MEETING ENDED</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}
            >
              <button
                onClick={() => navigate('/workspace')}
                style={{
                  padding: '7px 18px', borderRadius: '4px',
                  border: '2px solid #000', background: 'transparent',
                  cursor: 'pointer', fontSize: 18, fontWeight: 600, color: '#000',
                  fontFamily: "'Caveat', cursive", transform: 'rotate(1deg)',
                  boxShadow: '2px 2px 0 #000',
                  WebkitTextFillColor: '#000'
                }}
              >
                My Startups
              </button>
              <button
                onClick={() => navigate('/new')}
                style={{
                  padding: '7px 18px', borderRadius: '4px',
                  border: '2px solid #000', background: '#000',
                  cursor: 'pointer', fontSize: 20, fontWeight: 700, color: '#FFF4E9',
                  fontFamily: "'Caveat', cursive", transform: 'rotate(-2deg)',
                  boxShadow: '3px 3px 0 rgba(0,0,0,0.4)',
                  WebkitTextFillColor: '#FFF4E9'
                }}
              >
                + New Startup
              </button>
              {(currentStage === 'complete' || currentStage === 'followup') && qaState === 'report_ready' && (
                <>
                  <button
                    onClick={handleGenerateReport}
                    disabled={isGeneratingReport}
                    style={{
                      padding: '7px 18px', borderRadius: '4px',
                      border: '2px solid #000', background: '#000',
                      cursor: isGeneratingReport ? 'wait' : 'pointer', fontSize: 20, fontWeight: 700, color: '#FFF4E9',
                      fontFamily: "'Caveat', cursive", transform: 'rotate(-2deg)',
                      boxShadow: '3px 3px 0 rgba(0,0,0,0.4)',
                      WebkitTextFillColor: '#FFF4E9',
                      opacity: isGeneratingReport ? 0.7 : 1
                    }}
                  >
                    {isGeneratingReport ? 'Generating...' : 'Report Ready'}
                  </button>
                </>
              )}
            </div>
          </header>
        )}

        {/* Team Modal */}
        {showTeamModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-auto font-['Caveat']">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#FFF4E9] border-2 border-black rounded-xl p-8 max-w-2xl w-full shadow-[8px_8px_0_rgba(0,0,0,1)] relative"
            >
              <button 
                onClick={() => setShowTeamModal(false)}
                className="absolute top-4 right-4 text-2xl font-bold hover:opacity-70"
              >
                ✕
              </button>
              <h2 className="text-4xl font-bold mb-6 border-b-2 border-dashed border-black pb-2">AI Executive Team</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { role: 'CEO', desc: 'Chief Executive Officer' },
                  { role: 'CTO', desc: 'Chief Technology Officer' },
                  { role: 'Product Manager', desc: 'Product Strategy' },
                  { role: 'Product Designer', desc: 'UX & Design' },
                  { role: 'Growth & Marketing', desc: 'Acquisition' },
                  { role: 'Finance & Operations', desc: 'Financials' },
                  { role: 'Investor & Risk Advisor', desc: 'Risk Analysis' },
                ].map(member => (
                  <div key={member.role} className="border-2 border-black rounded-lg p-4 bg-white transform rotate-[-0.5deg]">
                    <div className="font-bold text-2xl">{member.role}</div>
                    <div className="text-xl opacity-80">{member.desc}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {/* Side Timeline */}
        <MeetingTimeline />

        {/* Bottom Input or Post-Meeting Workflow */}
        {currentStage === 'complete' && showWorkflow ? (
          <PostMeetingWorkflow onContinueDiscussion={() => {
            setShowWorkflow(false);
          }} />
        ) : (
          meetingId ? <CommandInput 
            onSubmit={handleFollowupSubmit} 
            onGenerateReport={() => {
              setQaState('report_ready');
              finishMeeting();
              addSystemMessage('You can now generate the final report using the button above.');
            }}
          /> : <HomeFooter />
        )}

        {/* About Button */}
        <button
          onClick={() => setShowTeamModal(true)}
          className="absolute bottom-6 left-6 px-4 py-2 bg-[#FFF4E9] border-2 border-black rounded-lg shadow-[4px_4px_0_rgba(0,0,0,1)] font-bold text-xl font-['Caveat'] hover:translate-y-1 hover:shadow-[0px_0px_0_rgba(0,0,0,1)] transition-all z-50 pointer-events-auto rotate-[-2deg]"
        >
          About Us
        </button>
      </div>
    </div>
  );
}

// ── App Router ────────────────────────────────────────────────────────────────

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BoardroomHome />} />
        <Route path="/new" element={<NewStartupPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
