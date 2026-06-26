import React, { useRef, useState, useEffect } from 'react';
import './AnimatedOfficeSVG.css';
import { useMeetingStore } from '../store/useMeetingStore';
import officeSvgRaw from '../assets/OFFICE-FINAL.svg?raw';

const roles = [
  { match: 'CEO', label: 'CEO' },
  { match: 'CTO', label: 'CTO', exclude: 'VECTOR' },
  { match: 'MANAGER', label: 'Product Manager' },
  { match: 'DESIGNER', label: 'Product Designer' },
  { match: 'GROWTH', label: 'Growth & Marketing' },
  { match: 'SALES', label: 'Sales' },
  { match: 'FINANCE', label: 'Finance & Operations' },
  { match: 'INVESTOR', label: 'Investor & Risk Advisor' }
];

export function AnimatedOfficeSVG() {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorPos, setIndicatorPos] = useState<{x: number, y: number} | null>(null);
  
  const ideaTitle = useMeetingStore(state => state.ideaTitle);
  const currentSpeaker = useMeetingStore(state => state.currentSpeaker);
  const isBuildingIdea = ideaTitle !== "Waiting for idea...";
  const speakerClass = currentSpeaker ? `speaker-${currentSpeaker.replace(/[\s&]+/g, '-').toUpperCase()}` : '';

  let cleanedSvg = officeSvgRaw.replace(/<svg\s+([^>]*?)width="[^"]*"\s+([^>]*?)height="[^"]*"/, '<svg $1 $2');
  cleanedSvg = cleanedSvg.replace(/<title>.*?<\/title>/gi, '');
  const svgContent = cleanedSvg;

  if (!svgContent) {
    return <div>Loading Office...</div>;
  }

  const displayTitle = ideaTitle === "Waiting for idea..." ? "YOUR APP" : ideaTitle;
  const renderedSvgContent = svgContent.replace(/APP-NAME/g, displayTitle);

  const handleMouseMove = (e: React.MouseEvent) => {
    const target = e.target as Element;
    let el: Element | null = target;
    let foundRole = null;
    
    while (el && el.tagName !== 'svg' && el.tagName !== 'DIV') {
      if (el.id) {
        const idUpper = el.id.toUpperCase();
        const matchedRole = roles.find(r => 
          idUpper.includes(r.match) && (!r.exclude || !idUpper.includes(r.exclude))
        );
        if (matchedRole) {
          foundRole = matchedRole.label;
          break;
        }
      }
      el = el.parentElement;
    }

    if (tooltipRef.current) {
      if (foundRole) {
        tooltipRef.current.textContent = foundRole;
        tooltipRef.current.style.opacity = '1';
        tooltipRef.current.style.left = `${e.clientX}px`;
        tooltipRef.current.style.top = `${e.clientY - 40}px`;
      } else {
        tooltipRef.current.style.opacity = '0';
      }
    }
  };

  const handleMouseLeave = () => {
    if (tooltipRef.current) {
      tooltipRef.current.style.opacity = '0';
    }
  };

  useEffect(() => {
    if (!currentSpeaker || !containerRef.current) {
      setIndicatorPos(null);
      return;
    }

    const updatePos = () => {
      const roleObj = roles.find(r => r.label === currentSpeaker);
      if (!roleObj) return;

      const svgEl = containerRef.current?.querySelector('svg');
      if (!svgEl) return;

      const groups = Array.from(svgEl.querySelectorAll('g'));
      const speakerGroup = groups.find(el => {
        const id = el.id?.toUpperCase() || '';
        return id.includes(roleObj.match) && (!roleObj.exclude || !id.includes(roleObj.exclude));
      });

      if (speakerGroup) {
        const rect = speakerGroup.getBoundingClientRect();
        
        const x = rect.left + rect.width / 2;
        const y = rect.top - 10;
        
        setIndicatorPos({ x, y });
      }
    };

    const timeout = setTimeout(updatePos, 50);
    window.addEventListener('resize', updatePos);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', updatePos);
    };
  }, [currentSpeaker, isBuildingIdea]);

  return (
    <>
      <div 
        ref={containerRef}
        className={`animated-office-container ${isBuildingIdea ? 'idea-building' : ''}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        dangerouslySetInnerHTML={{ __html: renderedSvgContent }}
      />
      
      {indicatorPos && (
        <div 
          style={{
            position: 'fixed',
            left: indicatorPos.x,
            top: indicatorPos.y,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            zIndex: 1000
          }}
        >
          <div className="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
      )}
      
      <div 
        ref={tooltipRef}
        className="role-tooltip"
        style={{
          position: 'fixed',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: 1000,
          transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: 'translateX(-50%)'
        }}
      />
    </>
  );
}
