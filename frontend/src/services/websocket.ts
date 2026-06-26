const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8000';

export type WSEventType =
  | 'speaking'
  | 'token'
  | 'message_complete'
  | 'stage_change'
  | 'meeting_complete'
  | 'error';

export interface WSEvent {
  type: WSEventType;
  executive?: string;
  stage?: string;
  token?: string;
  report?: Record<string, any>;
  decisions?: any[];
  data?: string;
}

export type WSEventHandler = (event: WSEvent) => void;

export class MeetingWebSocket {
  private ws: WebSocket | null = null;
  private handlers: WSEventHandler[] = [];
  private meetingId: string;

  constructor(meetingId: string) {
    this.meetingId = meetingId;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/api/meetings/ws/${this.meetingId}`);

      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error('WebSocket connection failed'));

      this.ws.onmessage = (event) => {
        try {
          const data: WSEvent = JSON.parse(event.data);
          this.handlers.forEach((h) => h(data));
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };

      this.ws.onclose = () => {
        this.handlers.forEach((h) =>
          h({ type: 'meeting_complete' })
        );
      };
    });
  }

  send(data: Record<string, any>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  onEvent(handler: WSEventHandler): void {
    this.handlers.push(handler);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
