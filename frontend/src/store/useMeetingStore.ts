import { create } from 'zustand';
import type { MeetingMessage, Decision, Report } from '../services/api';

export type MeetingStage = 'idle' | 'analysis' | 'debate' | 'decision' | 'report' | 'complete' | 'followup';
export type QaState = 'idle' | 'asking_questions' | 'asking_report' | 'report_ready';

export interface LiveMessage {
  executive: string;
  stage: string;
  content: string;
  isStreaming: boolean;
}

interface MeetingState {
  // Legacy (boardroom animation)
  ideaTitle: string;
  ideaDescription: string;
  validationScore: number;
  currentDecision: string;
  currentSpeaker: string | null;
  decisions: string[];
  timeline: { id: string; text: string; role?: string; stage?: string; timestamp: Date }[];

  // New meeting state
  meetingId: string | null;
  startupId: string | null;
  currentStage: MeetingStage;
  liveMessages: LiveMessage[];
  completedMessages: MeetingMessage[];
  meetingDecisions: Decision[];
  report: Report | null;
  isMeetingActive: boolean;
  qaState: QaState;
  followUpInput: string;
  isGeneratingReport: boolean;
  meetingStartTime: number | null;
  meetingEndTime: number | null;

  // Legacy actions
  setIdea: (title: string, description: string) => void;
  setCurrentSpeaker: (role: string | null) => void;
  addDecision: (decision: string) => void;
  addTimelineEvent: (text: string, role?: string) => void;
  addSystemMessage: (text: string) => void;

  // New actions
  startMeeting: (meetingId: string, startupId: string, startupName?: string) => void;
  setStage: (stage: MeetingStage) => void;
  setCurrentSpeakerLive: (executive: string) => void;
  appendToken: (executive: string, stage: string, token: string) => void;
  finalizeMessage: (executive: string) => void;
  setMeetingDecisions: (decisions: Decision[]) => void;
  setReport: (report: Report) => void;
  enterQAPhase: () => void;
  finishMeeting: () => void;
  resumeMeeting: () => void;
  resetMeeting: () => void;
  setQaState: (state: QaState) => void;
  setFollowUpInput: (val: string) => void;
  setIsGeneratingReport: (val: boolean) => void;
}

export const useMeetingStore = create<MeetingState>((set) => ({
  // Legacy
  ideaTitle: "Waiting for idea...",
  ideaDescription: "",
  validationScore: 0,
  currentDecision: "None",
  currentSpeaker: null,
  decisions: [],
  timeline: [{ id: '1', text: 'The Executive Board is assembled. Awaiting your startup concept...', timestamp: new Date() }],

  // New
  meetingId: null,
  startupId: null,
  currentStage: 'idle',
  liveMessages: [],
  completedMessages: [],
  meetingDecisions: [],
  report: null,
  isMeetingActive: false,
  qaState: 'idle',
  followUpInput: '',
  isGeneratingReport: false,
  meetingStartTime: null,
  meetingEndTime: null,

  // Legacy actions
  setIdea: (title, description) => set({ ideaTitle: title, ideaDescription: description }),
  setCurrentSpeaker: (role) => set({ currentSpeaker: role }),
  addDecision: (decision) => set((state) => ({
    decisions: [...state.decisions, decision],
    currentDecision: decision
  })),
  addTimelineEvent: (text, role) => set((state) => ({
    timeline: [...state.timeline, { id: Date.now().toString(), text, role, timestamp: new Date() }]
  })),
  addSystemMessage: (text) => set((state) => ({
    timeline: [...state.timeline, { id: Date.now().toString(), text, role: 'SYSTEM_EVENT', timestamp: new Date() }]
  })),

  // New actions
  startMeeting: (meetingId, startupId, startupName = 'New Concept') => set((state) => ({
    meetingId,
    startupId,
    ideaTitle: startupName || state.ideaTitle,
    isMeetingActive: true,
    currentStage: 'analysis',
    liveMessages: [],
    completedMessages: [],
    meetingDecisions: [],
    report: null,
    meetingStartTime: Date.now(),
    meetingEndTime: null,
    timeline: [
      { id: Date.now().toString() + '1', text: `The Executive Board is assembled and ready to evaluate: ${startupName}.`, timestamp: new Date() },
      { id: Date.now().toString() + '2', text: 'Meeting Started', role: 'SYSTEM_EVENT', timestamp: new Date() }
    ],
  })),

  setStage: (stage) => set({ currentStage: stage }),

  setCurrentSpeakerLive: (executive) => set((state) => {
    // Add a new streaming message for this executive
    const exists = state.liveMessages.some(m => m.executive === executive && m.isStreaming);
    if (exists) return state;
    return {
      currentSpeaker: executive,
      liveMessages: [...state.liveMessages, {
        executive,
        stage: state.currentStage,
        content: '',
        isStreaming: true,
      }]
    };
  }),

  appendToken: (executive, stage, token) => set((state) => ({
    liveMessages: state.liveMessages.map((m) =>
      m.executive === executive && m.isStreaming
        ? { ...m, content: m.content + token }
        : m
    ),
  })),

  finalizeMessage: (executive) => set((state) => {
    const msg = state.liveMessages.find(m => m.executive === executive && m.isStreaming);
    return {
      currentSpeaker: null,
      liveMessages: state.liveMessages.filter((m) => !(m.executive === executive && m.isStreaming)),
      timeline: msg ? [...state.timeline, {
        id: Date.now().toString(),
        text: msg.content,
        role: executive,
        stage: msg.stage,
        timestamp: new Date(),
      }] : state.timeline,
    };
  }),

  setMeetingDecisions: (meetingDecisions) => set({ meetingDecisions }),

  setReport: (report) => set({
    report,
    validationScore: report.content?.validation_score ?? 0,
  }),

  enterQAPhase: () => set((state) => {
    if (state.currentStage === 'followup') {
      const lastMsg = state.timeline[state.timeline.length - 1];
      if (lastMsg && lastMsg.text === 'Any questions?') {
        return state;
      }
      return {
        ...state,
        timeline: [
          ...state.timeline,
          { id: Date.now().toString(), text: 'Any questions?', role: 'SYSTEM_EVENT', timestamp: new Date() }
        ]
      };
    }
    return {
      isMeetingActive: true, // Keep timer running!
      currentStage: 'followup',
      currentSpeaker: null,
      qaState: 'asking_questions',
      timeline: [
        ...state.timeline, 
        { id: Date.now().toString() + '1', text: 'Any questions?', role: 'SYSTEM_EVENT', timestamp: new Date() }
      ]
    };
  }),

  finishMeeting: () => set((state) => {
    if (state.currentStage === 'complete') return state;
    return {
      isMeetingActive: false,
      currentStage: 'complete',
      meetingEndTime: Date.now(),
      timeline: [
        ...state.timeline, 
        { id: Date.now().toString(), text: 'Meeting Ended', role: 'SYSTEM_EVENT', timestamp: new Date() }
      ]
    };
  }),

  resumeMeeting: () => set((state) => {
    if (state.isMeetingActive || !state.meetingEndTime || !state.meetingStartTime) return state;
    const pausedDuration = Date.now() - state.meetingEndTime;
    return {
      isMeetingActive: true,
      currentStage: 'followup', // transition out of complete
      meetingStartTime: state.meetingStartTime + pausedDuration,
      meetingEndTime: null,
      timeline: [
        ...state.timeline,
        { id: Date.now().toString(), text: 'Meeting Resumed', role: 'SYSTEM_EVENT', timestamp: new Date() }
      ]
    };
  }),

  resetMeeting: () => set({
    meetingId: null,
    startupId: null,
    currentStage: 'idle',
    liveMessages: [],
    completedMessages: [],
    meetingDecisions: [],
    report: null,
    isMeetingActive: false,
    qaState: 'idle',
    currentSpeaker: null,
    ideaTitle: "Waiting for idea...",
    ideaDescription: "",
    validationScore: 0,
    currentDecision: "None",
    decisions: [],
    meetingStartTime: null,
    meetingEndTime: null,
    timeline: [{ id: '1', text: 'The Executive Board is assembled. Awaiting your startup concept...', timestamp: new Date() }],
  }),

  setQaState: (qaState) => set({ qaState }),

  setFollowUpInput: (val) => set({ followUpInput: val }),
  setIsGeneratingReport: (isGeneratingReport) => set({ isGeneratingReport }),
}));
