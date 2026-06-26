import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMeetingStore } from '../store/useMeetingStore';

export function PostMeetingWorkflow({ onContinueDiscussion }: { onContinueDiscussion: () => void }) {
  const navigate = useNavigate();
  const { ideaTitle, meetingDecisions, report, resetMeeting } = useMeetingStore();

  const content = report?.content?.content || report?.content || {};

  const validationScore = content.validation_score ?? 0;
  const dashboard = content.dashboard || {};
  const strengths = content.strengths || [];
  const risks = content.risks || [];
  const recommendations = content.recommendations || [];

  const analysis = content.analysis || {};
  const elevatorPitch = content.elevator_pitch || '';

  const stripMd = (str: string) => str ? str.replace(/\*\*/g, '') : '';

  const renderWithTooltips = (text: string) => {
    if (!text) return null;
    // Strip markdown bold asterisks first so they don't break regex
    const cleanText = text.replace(/\*\*/g, '');
    const parts = cleanText.split(/\[\[(.*?)\|(.*?)\]\]/g);
    
    return parts.map((part, i) => {
      // Normal text
      if (i % 3 === 0) return <span key={i}>{part}</span>;
      // Term (at index 1, 4, 7...)
      if (i % 3 === 1) {
        const explanation = parts[i + 1];
        return (
          <span key={i} className="group relative inline-block border-b-[3px] border-dotted border-blue-600 cursor-help font-bold text-blue-900 z-10 transition-colors hover:bg-blue-100">
            {part}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-[#0F172A] text-white text-base font-sans rounded-lg shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3)] opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none transform group-hover:-translate-y-1">
              <div className="font-bold mb-1 border-b border-white/20 pb-1">{part}</div>
              <div className="font-normal opacity-90">{explanation}</div>
              {/* Arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-[#0F172A]"></div>
            </div>
          </span>
        );
      }
      // Explanation is already handled
      return null;
    });
  };

  const handleDownload = () => {
    const reportText = `# ${ideaTitle} - Meeting Report
Validation Score: ${validationScore}/100

## Executive Summary
Market Potential: ${dashboard["Market Potential"]}/10
Technical Feasibility: ${dashboard["Technical Feasibility"]}/10
Revenue Potential: ${dashboard["Revenue Potential"]}/10
Execution Difficulty: ${dashboard["Execution Difficulty"]}/10
Investor Readiness: ${dashboard["Investor Readiness"]}/10

## Key Decisions
${meetingDecisions.map((d: any) => `- ${stripMd(d.decision_text || String(d))}`).join('\n')}

## Strengths
${strengths.map((s: string) => `- ${stripMd(s)}`).join('\n')}

## Risks
${risks.map((r: string) => `- ${stripMd(r)}`).join('\n')}

## Recommendations
${recommendations.map((r: string) => `- ${stripMd(r)}`).join('\n')}

## Executive Blueprints
${Object.entries(analysis).map(([role, text]) => `### ${role}\n${stripMd(text as string)}`).join('\n\n')}
`;
    const blob = new Blob([reportText.trim()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ideaTitle.replace(/\s+/g, '_')}_Report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="absolute inset-0 z-50 overflow-y-auto bg-[#FFF4E9] font-['Caveat'] text-black p-8 pointer-events-auto"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(0, 0, 0, 0.05) 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }}
    >
      <div className="max-w-6xl mx-auto space-y-12 pb-24 relative">
        <button 
          onClick={() => {
            resetMeeting();
            navigate('/');
          }}
          className="absolute -top-4 left-0 px-4 py-2 bg-white border-2 border-black rounded-lg text-xl font-bold shadow-[3px_3px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-[1px_1px_0_rgba(0,0,0,1)] transition-all flex items-center gap-2"
        >
          <span>←</span> Back to Dashboard
        </button>
        
        {/* STEP 1: Meeting Completion */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold">Meeting Completed</h1>
          <div className="text-2xl opacity-80">
            Startup Name: <span className="font-bold">{ideaTitle}</span>
          </div>
          <div className="text-2xl">
            Validation Score: <span className="font-bold text-3xl">{validationScore} / 100</span>
          </div>
          <div className="text-xl px-4 py-1 border-2 border-black rounded-full inline-block bg-black text-[#FFF4E9] shadow-[3px_3px_0_rgba(0,0,0,0.3)]">
            Status: Ready For Next Steps
          </div>

          {elevatorPitch && (
            <div className="mt-8 max-w-3xl mx-auto border-2 border-black bg-[#FFEBDB] p-6 rounded-xl shadow-[4px_4px_0_rgba(0,0,0,1)] transform rotate-[0.5deg]">
              <h3 className="text-2xl font-bold mb-2 uppercase tracking-widest text-black/70">Elevator Pitch</h3>
              <p className="text-3xl font-bold leading-tight">{renderWithTooltips(elevatorPitch)}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* STEP 2: Final Decision Ledger */}
          <div className="border-2 border-black bg-white rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] transform rotate-[-0.5deg]">
            <h2 className="text-3xl font-bold mb-6 underline decoration-wavy">Meeting Decisions</h2>
            <ul className="space-y-4">
              {(content.decisions?.length > 0 ? content.decisions : meetingDecisions).map((d: any, i: number) => (
                <li key={i} className="text-2xl flex items-start gap-3">
                  <span className="font-bold text-green-600 mt-1">✓</span>
                  <span>{renderWithTooltips(d.decision_text || String(d))}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* STEP 3: Executive Summary Dashboard */}
          <div className="border-2 border-black bg-white rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] transform rotate-[0.5deg]">
            <h2 className="text-3xl font-bold mb-6 underline decoration-wavy">Executive Summary</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-8 text-xl">
              <div className="flex justify-between border-b-2 border-dashed border-black/20 pb-2">
                <span>Market Potential</span> <span className="font-bold">{dashboard["Market Potential"] ?? '-'} / 10</span>
              </div>
              <div className="flex justify-between border-b-2 border-dashed border-black/20 pb-2">
                <span>Technical Feasibility</span> <span className="font-bold">{dashboard["Technical Feasibility"] ?? '-'} / 10</span>
              </div>
              <div className="flex justify-between border-b-2 border-dashed border-black/20 pb-2">
                <span>Revenue Potential</span> <span className="font-bold">{dashboard["Revenue Potential"] ?? '-'} / 10</span>
              </div>
              <div className="flex justify-between border-b-2 border-dashed border-black/20 pb-2">
                <span>Execution Difficulty</span> <span className="font-bold">{dashboard["Execution Difficulty"] ?? '-'} / 10</span>
              </div>
              <div className="flex justify-between border-b-2 border-dashed border-black/20 pb-2">
                <span>Investor Readiness</span> <span className="font-bold">{dashboard["Investor Readiness"] ?? '-'} / 10</span>
              </div>
            </div>

            <div className="space-y-6 text-xl">
              <div>
                <h3 className="font-bold mb-2 flex items-center gap-2"><span className="text-2xl">🔥</span> Strengths</h3>
                <ul className="space-y-2">
                  {strengths.map((s: any, i: number) => (
                    <li key={i} className="flex gap-2"><span className="text-green-600 font-bold">✓</span><span>{renderWithTooltips(s)}</span></li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-bold mb-2 flex items-center gap-2"><span className="text-2xl">⚠️</span> Risks</h3>
                <ul className="space-y-2">
                  {risks.map((r: any, i: number) => (
                    <li key={i} className="flex gap-2"><span className="text-red-600 font-bold">⚠</span><span>{renderWithTooltips(r)}</span></li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-bold mb-2 flex items-center gap-2"><span className="text-2xl">💡</span> Recommendations</h3>
                <ul className="space-y-2">
                  {recommendations.length > 0 ? (
                    recommendations.map((r: any, i: number) => (
                      <li key={i} className="flex gap-2"><span className="text-blue-600 font-bold">→</span><span>{renderWithTooltips(r)}</span></li>
                    ))
                  ) : (
                    <div className="text-xl opacity-70 italic">Pending further analysis...</div>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {content.qa_history && content.qa_history.length > 0 && (
          <div className="mt-8 border-2 border-black bg-white rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] transform rotate-[-0.5deg]">
            <h2 className="text-3xl font-bold mb-6 underline decoration-wavy">Q&A History</h2>
            <div className="space-y-6 text-xl">
              {content.qa_history.map((qa: any, i: number) => (
                <div key={i} className="border-l-4 border-black pl-4 py-2">
                  <div className="font-bold mb-2 text-black/80">Q: {qa.question}</div>
                  <div className="text-black/70">A: {renderWithTooltips(qa.answer)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3.5: Executive Blueprints */}
        {Object.keys(analysis).length > 0 && (
          <div className="border-2 border-black bg-white rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)]">
            <h2 className="text-3xl font-bold mb-6 underline decoration-wavy">Executive Blueprints</h2>
            <div className="space-y-8">
              {Object.entries(analysis).map(([role, text], i) => (
                <div key={i} className="border-l-4 border-black pl-6 py-2">
                  <h3 className="text-2xl font-bold mb-3 uppercase tracking-wider">{role}</h3>
                  <div className="text-xl opacity-90 whitespace-pre-wrap leading-relaxed">{renderWithTooltips(text as string)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4 & 5: Action Center / Continue Building */}
        <div className="border-2 border-black bg-white rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] text-center">
          <h2 className="text-4xl font-bold mb-4">Your meeting is complete.</h2>
          <p className="text-2xl opacity-80 mb-8">What would you like to do next?</p>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Active Buttons */}
            <button 
              onClick={handleDownload}
              className="p-6 border-2 border-black rounded-lg bg-blue-600 text-white text-2xl font-bold shadow-[4px_4px_0_rgba(0,0,0,0.4)] transform hover:translate-y-1 hover:shadow-[2px_2px_0_rgba(0,0,0,0.4)] transition-all"
            >
              📥 Download Report
            </button>
            <button 
              onClick={onContinueDiscussion}
              className="p-6 border-2 border-black rounded-lg bg-black text-[#FFF4E9] text-2xl font-bold shadow-[4px_4px_0_rgba(0,0,0,0.4)] transform hover:translate-y-1 hover:shadow-[2px_2px_0_rgba(0,0,0,0.4)] transition-all"
            >
              💬 Continue Discussion
            </button>
            <button 
              onClick={() => {
                resetMeeting();
                navigate('/');
              }}
              className="p-6 border-2 border-black rounded-lg bg-[#FFF4E9] text-black text-2xl font-bold shadow-[4px_4px_0_rgba(0,0,0,1)] transform hover:translate-y-1 hover:shadow-[2px_2px_0_rgba(0,0,0,1)] transition-all"
            >
              💾 Save And Exit
            </button>

            {/* Placeholder Buttons for Future Features */}
            <button className="p-6 border-2 border-black/30 rounded-lg bg-gray-100 text-black/50 text-xl font-bold border-dashed cursor-not-allowed">
              ⚡ Create Version 2
            </button>
            <button className="p-6 border-2 border-black/30 rounded-lg bg-gray-100 text-black/50 text-xl font-bold border-dashed cursor-not-allowed">
              🎯 Validate Another Assumption
            </button>
            <button className="p-6 border-2 border-black/30 rounded-lg bg-gray-100 text-black/50 text-xl font-bold border-dashed cursor-not-allowed">
              🚀 Simulate Future
            </button>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
