import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMeetingStore } from '../store/useMeetingStore';

export function PostMeetingWorkflow({ onContinueDiscussion, isSharkTank, isInvestorLens, isRedTeam }: { onContinueDiscussion: () => void; isSharkTank?: boolean; isInvestorLens?: boolean; isRedTeam?: boolean }) {
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

  const handleDownloadPDF = async () => {
    // @ts-ignore
    const html2pdf = (await import('html2pdf.js')).default;
    const element = document.getElementById('report-content');
    if (!element) return;
    const opt: any = {
      margin:       0.5,
      filename:     `${ideaTitle.replace(/\s+/g, '_')}_Report.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  const handlePivot = async () => {
    if (!report?.meeting_id) return;
    try {
      const { api } = await import('../services/api');
      const res = await api.pivotMeeting(report.meeting_id);
      if (res.startup_id) {
        window.location.href = `/?startup_id=${res.startup_id}&execs=CEO,CTO,Product Manager,Product Designer,Growth & Marketing,Finance & Operations,Investor & Risk Advisor&startup_name=${encodeURIComponent(res.name)}&description=${encodeURIComponent(res.description)}`;
      }
    } catch (e: any) {
      alert(`Failed to pivot: ${e.message}`);
    }
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
      <div id="report-content" className="max-w-6xl mx-auto space-y-12 pb-24 relative">
        <button 
          onClick={onContinueDiscussion}
          className="absolute -top-4 left-0 px-4 py-2 bg-white border-2 border-black rounded-lg text-xl font-bold shadow-[3px_3px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-[1px_1px_0_rgba(0,0,0,1)] transition-all flex items-center gap-2"
        >
          <span>←</span> Return to Room
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
          
          {(isSharkTank || isInvestorLens || isRedTeam) && (
            <div className="flex justify-center gap-2 mt-2">
              {isSharkTank && <span className="bg-red-500 text-white px-2 py-1 rounded text-sm font-bold border border-black">SHARK TANK</span>}
              {isInvestorLens && <span className="bg-yellow-500 text-black px-2 py-1 rounded text-sm font-bold border border-black">INVESTOR LENS</span>}
              {isRedTeam && <span className="bg-red-900 text-white px-2 py-1 rounded text-sm font-bold border border-black">RED TEAM</span>}
            </div>
          )}

          {elevatorPitch && (
            <div className="mt-8 max-w-3xl mx-auto border-2 border-black bg-[#FFEBDB] p-6 rounded-xl shadow-[4px_4px_0_rgba(0,0,0,1)] transform rotate-[0.5deg]">
              <h3 className="text-2xl font-bold mb-2 uppercase tracking-widest text-black/70">Elevator Pitch</h3>
              <p className="text-3xl font-bold leading-tight whitespace-pre-wrap">{renderWithTooltips(stripMd(elevatorPitch.replace(/[#*`~]/g, '')))}</p>
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

        {/* NEW SECTIONS GRID */}
        {(content.assumptions?.length > 0 || content.kill_criteria?.length > 0 || content.burn_rate_calc) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            
            {/* Assumptions & Kill Criteria */}
            <div className="border-2 border-black bg-red-50 rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] transform rotate-[0.5deg]">
              <h2 className="text-3xl font-bold mb-6 underline decoration-wavy text-red-900">Assumptions & Kill Criteria</h2>
              
              {content.assumptions?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-3 flex items-center gap-2">🧠 Key Assumptions</h3>
                  <ul className="space-y-3">
                    {content.assumptions.map((a: string, i: number) => (
                      <li key={i} className="flex gap-2 text-xl">
                        <span className="font-bold text-black/50">#{i+1}</span>
                        <span>{renderWithTooltips(a)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {content.kill_criteria?.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold mb-3 flex items-center gap-2">☠️ Kill Criteria (When to Stop)</h3>
                  <ul className="space-y-3">
                    {content.kill_criteria.map((kc: string, i: number) => (
                      <li key={i} className="flex gap-2 text-xl bg-red-100 p-3 rounded border border-red-200">
                        <span className="font-bold text-red-600">☠️</span>
                        <span>{renderWithTooltips(kc)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Burn Rate Calculator */}
            {content.burn_rate_calc && (
              <div className="border-2 border-black bg-green-50 rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] transform rotate-[-0.5deg]">
                <h2 className="text-3xl font-bold mb-6 underline decoration-wavy text-green-900">Burn Rate & Runway</h2>
                <div className="text-xl whitespace-pre-wrap leading-relaxed">
                  {renderWithTooltips(content.burn_rate_calc)}
                </div>
              </div>
            )}
          </div>
        )}

        {(content.interview_playbook || content.competitor_threats) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            {/* Interview Playbook */}
            {content.interview_playbook && (
              <div className="border-2 border-black bg-blue-50 rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] transform rotate-[-0.5deg]">
                <h2 className="text-3xl font-bold mb-6 underline decoration-wavy text-blue-900">Customer Interview Playbook</h2>
                <div className="text-xl whitespace-pre-wrap leading-relaxed">
                  {renderWithTooltips(content.interview_playbook)}
                </div>
              </div>
            )}

            {/* Competitor Threat Assessment */}
            {content.competitor_threats && (
              <div className="border-2 border-black bg-purple-50 rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] transform rotate-[0.5deg]">
                <h2 className="text-3xl font-bold mb-6 underline decoration-wavy text-purple-900">Competitor Threat Matrix</h2>
                <div className="text-xl whitespace-pre-wrap leading-relaxed">
                  {renderWithTooltips(content.competitor_threats)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* NEW SECTIONS GRID */}
        {(content.assumptions?.length > 0 || content.kill_criteria?.length > 0 || content.burn_rate_calc) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            
            {/* Assumptions & Kill Criteria */}
            <div className="border-2 border-black bg-red-50 rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] transform rotate-[0.5deg]">
              <h2 className="text-3xl font-bold mb-6 underline decoration-wavy text-red-900">Assumptions & Kill Criteria</h2>
              
              {content.assumptions?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-3 flex items-center gap-2">🧠 Key Assumptions</h3>
                  <ul className="space-y-3">
                    {content.assumptions.map((a: string, i: number) => (
                      <li key={i} className="flex gap-2 text-xl">
                        <span className="font-bold text-black/50">#{i+1}</span>
                        <span>{renderWithTooltips(a)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {content.kill_criteria?.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold mb-3 flex items-center gap-2">☠️ Kill Criteria (When to Stop)</h3>
                  <ul className="space-y-3">
                    {content.kill_criteria.map((kc: string, i: number) => (
                      <li key={i} className="flex gap-2 text-xl bg-red-100 p-3 rounded border border-red-200">
                        <span className="font-bold text-red-600">☠️</span>
                        <span>{renderWithTooltips(kc)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Burn Rate Calculator */}
            {content.burn_rate_calc && (
              <div className="border-2 border-black bg-green-50 rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] transform rotate-[-0.5deg]">
                <h2 className="text-3xl font-bold mb-6 underline decoration-wavy text-green-900">Burn Rate & Runway</h2>
                <div className="text-xl whitespace-pre-wrap leading-relaxed">
                  {renderWithTooltips(content.burn_rate_calc)}
                </div>
              </div>
            )}
          </div>
        )}

        {(content.interview_playbook || content.competitor_threats) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            {/* Interview Playbook */}
            {content.interview_playbook && (
              <div className="border-2 border-black bg-blue-50 rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] transform rotate-[-0.5deg]">
                <h2 className="text-3xl font-bold mb-6 underline decoration-wavy text-blue-900">Customer Interview Playbook</h2>
                <div className="text-xl whitespace-pre-wrap leading-relaxed">
                  {renderWithTooltips(content.interview_playbook)}
                </div>
              </div>
            )}

            {/* Competitor Threat Assessment */}
            {content.competitor_threats && (
              <div className="border-2 border-black bg-purple-50 rounded-xl p-8 shadow-[6px_6px_0_rgba(0,0,0,1)] transform rotate-[0.5deg]">
                <h2 className="text-3xl font-bold mb-6 underline decoration-wavy text-purple-900">Competitor Threat Matrix</h2>
                <div className="text-xl whitespace-pre-wrap leading-relaxed">
                  {renderWithTooltips(content.competitor_threats)}
                </div>
              </div>
            )}
          </div>
        )}

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
              📥 Download Report (MD)
            </button>
            <button 
              onClick={handleDownloadPDF}
              className="p-6 border-2 border-black rounded-lg bg-red-600 text-white text-2xl font-bold shadow-[4px_4px_0_rgba(0,0,0,0.4)] transform hover:translate-y-1 hover:shadow-[2px_2px_0_rgba(0,0,0,0.4)] transition-all"
            >
              📄 Download PDF
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

            {validationScore < 40 && (
              <button 
                onClick={handlePivot}
                className="col-span-full mt-4 p-6 border-4 border-red-500 rounded-lg bg-red-100 text-red-700 text-3xl font-bold shadow-[0_0_20px_rgba(239,68,68,0.5)] transform hover:scale-105 transition-all animate-pulse"
              >
                🔀 Pivot Idea Automatically
              </button>
            )}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
