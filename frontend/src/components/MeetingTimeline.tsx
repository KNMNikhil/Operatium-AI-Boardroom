import React, { useEffect, useRef, useState } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { QAModal } from './QAModal';

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function MeetingTimeline() {
  const { currentSpeaker, decisions, timeline, liveMessages, meetingStartTime, meetingEndTime, isMeetingActive, qaState } = useMeetingStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showScrollArrow, setShowScrollArrow] = useState(false);
  const [qaModalContent, setQaModalContent] = useState<string | null>(null);

  useEffect(() => {
    let interval: any;
    if (meetingStartTime && isMeetingActive) {
      interval = setInterval(() => {
        setElapsed(Date.now() - meetingStartTime);
      }, 1000);
    } else if (meetingStartTime && meetingEndTime) {
      setElapsed(meetingEndTime - meetingStartTime);
    }
    return () => clearInterval(interval);
  }, [meetingStartTime, meetingEndTime, isMeetingActive]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [timeline, currentSpeaker]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShowScrollArrow(!isNearBottom);
    }
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="absolute right-6 top-24 bottom-24 w-80 bg-[#FFF4E9] border-2 border-black rounded-lg p-4 flex flex-col pointer-events-auto shadow-[4px_4px_0_rgba(0,0,0,1)] font-['Caveat'] rotate-[1deg]">
      <div className="flex flex-col items-start gap-4 mb-4 border-b-2 border-black border-solid pb-4 relative">
        <div className="w-full flex justify-between items-center">
            <h2 className="text-2xl font-bold text-black tracking-wider">Timeline</h2>
            {meetingStartTime && (
                <div className="text-xl font-bold text-black border-2 border-black px-2 rounded-full bg-white">
                    ⏱ {formatTime(elapsed)}
                </div>
            )}
        </div>
        {currentSpeaker && (
          <div className="self-end px-2 py-1 rounded border-2 border-black text-lg font-bold text-black bg-[#FFF4E9] transform rotate-[-2deg] z-10 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
            {currentSpeaker} Speaking
          </div>
        )}
      </div>

      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto space-y-4 pr-2 scroll-smooth relative">

        {timeline.map((event) => (
          <div key={event.id} className="text-xl border-l-2 border-black pl-3 py-1">
            {event.role && event.role !== 'SYSTEM_EVENT' ? (
                <span className="font-bold text-black mr-2">{event.role}:</span>
            ) : null}
            {event.role === 'SYSTEM_EVENT' ? (
                <div className="text-center font-bold text-black/60 italic border-y-2 border-solid border-black/20 py-2 my-4">
                    {event.text}
                </div>
            ) : event.role === 'CEO' && event.stage === 'followup' ? (
                <div className="mt-2">
                  <span className="text-black/80 block mb-2 font-bold text-lg">I've gathered the team's thoughts.</span>
                  <button 
                    onClick={() => setQaModalContent(event.text)}
                    className="px-4 py-2 border-2 border-black bg-white rounded-lg shadow-[2px_2px_0_rgba(0,0,0,1)] hover:bg-[#FFF4E9] transition-colors flex items-center gap-2 font-bold"
                  >
                    <span>📊</span> View Detailed Answer
                  </button>
                </div>
            ) : (
                <span className="text-black/80">{event.text}</span>
            )}
          </div>
        ))}
        {liveMessages.map((msg, idx) => {
          if (msg.executive === 'CEO' && msg.stage === 'followup') {
            return (
              <div key={`live-${idx}`} className="text-xl border-l-2 border-black pl-3 py-1 bg-white/50">
                <span className="font-bold text-black mr-2">{msg.executive}:</span>
                <span className="text-black/60 italic">Preparing highly detailed response...</span>
                <span className="inline-block w-2 h-4 bg-black/40 ml-1 animate-pulse"></span>
              </div>
            );
          }
          return (
            <div key={`live-${idx}`} className="text-xl border-l-2 border-black pl-3 py-1 bg-white/50">
              <span className="font-bold text-black mr-2">{msg.executive}:</span>
              <span className="text-black/80">{msg.content}</span>
              <span className="inline-block w-2 h-4 bg-black/40 ml-1 animate-pulse"></span>
            </div>
          );
        })}
      </div>

      {showScrollArrow && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#FFF4E9] border-2 border-black rounded-full flex items-center justify-center shadow-[2px_2px_0_rgba(0,0,0,1)] transition-all z-20 pointer-events-auto hover:translate-y-1 hover:shadow-[0px_0px_0_rgba(0,0,0,1)]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M19 12l-7 7-7-7"/>
          </svg>
        </button>
      )}

      {decisions.length > 0 && (
        <div className="mt-4 pt-4 border-t-2 border-black border-solid">
          <h3 className="text-xl font-bold text-black mb-2 underline decoration-wavy">Key Decisions</h3>
          <ul className="space-y-1">
            {decisions.map((decision, idx) => (
              <li key={idx} className="text-xl text-black flex items-center gap-2">
                <span className="text-black font-bold">✓</span> {decision}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The QA Answer Modal */}
      <QAModal 
        isOpen={!!qaModalContent} 
        onClose={() => setQaModalContent(null)} 
        content={qaModalContent || ''} 
      />
    </div>
  );
}
