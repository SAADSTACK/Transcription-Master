import { ChangeDetectionStrategy, Component, computed, signal, WritableSignal, effect, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService, TranscriptionMode } from './services/gemini.service';

interface ParsedResult {
  metadata: string;
  summary: string;
  transcript: string;
  insights: string;
}

interface TranscriptLine {
  time: number; // in seconds
  text: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class AppComponent implements OnDestroy {
  @ViewChild('audioPlayer') audioPlayer!: ElementRef<HTMLAudioElement>;

  // Auth state
  apiKey = signal<string | null>(null);
  apiKeyInput = signal('');

  // App state
  audioFile: WritableSignal<File | null> = signal(null);
  audioUrl = signal<string | null>(null);
  transcriptionMode: WritableSignal<TranscriptionMode> = signal('Clean');
  isLoading: WritableSignal<boolean> = signal(false);
  result: WritableSignal<string | null> = signal(null);
  error: WritableSignal<string | null> = signal(null);
  showFullReport = signal(false);
  
  // Recording state
  isRecording = signal(false);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  recordingTime = signal(0);
  private recordingInterval: any;

  // Real-time transcript state
  realtimeTranscript = signal('');
  timedTranscript = signal<TranscriptLine[] | null>(null);
  currentSubtitleLine = signal<TranscriptLine | null>(null);


  loadingMessage = signal('Initializing transcription...');
  private loadingMessages = [
      'Analyzing audio nuances...',
      'Identifying distinct speakers...',
      'Cross-referencing technical jargon...',
      'Applying linguistic models...',
      'Generating executive summary...',
      'Finalizing QA insights...'
  ];
  private loadingInterval: any;

  fileName = computed(() => this.audioFile()?.name);

  parsedResult = computed(() => {
    const res = this.result();
    if (!res) return null;
    return this.parseTranscriptionResult(res);
  });
  
  constructor(private geminiService: GeminiService) {
    const savedKey = sessionStorage.getItem('gemini-api-key');
    if (savedKey) {
      this.apiKey.set(savedKey);
      this.geminiService.initialize(savedKey);
    }

    effect(() => {
      if (this.isLoading()) {
        this.startLoadingMessages();
      } else {
        this.stopLoadingMessages();
      }
    });
  }

  ngOnDestroy() {
    this.stopLoadingMessages();
    this.stopRecordingTimer();
    const url = this.audioUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  handleLogin(): void {
    const key = this.apiKeyInput().trim();
    if (!key) {
      this.error.set('Please enter a valid Gemini API key.');
      return;
    }
    this.apiKey.set(key);
    sessionStorage.setItem('gemini-api-key', key);
    this.geminiService.initialize(key);
    this.apiKeyInput.set('');
    this.error.set(null);
  }

  logout(): void {
    this.apiKey.set(null);
    sessionStorage.removeItem('gemini-api-key');
    this.resetState();
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.resetState();
      const file = input.files[0];
      this.audioFile.set(file);
      this.audioUrl.set(URL.createObjectURL(file));
      this.transcribe();
    }
  }
  
  resetState(): void {
    const url = this.audioUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.audioFile.set(null);
    this.audioUrl.set(null);
    this.result.set(null);
    this.error.set(null);
    this.isRecording.set(false);
    this.realtimeTranscript.set('');
    this.timedTranscript.set(null);
    this.currentSubtitleLine.set(null);
    this.showFullReport.set(false);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.stopRecordingTimer();
    this.recordingTime.set(0);
  }

  async startRecording(): Promise<void> {
    this.resetState();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.isRecording.set(true);
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          const chunkFile = new File([event.data], `chunk-${Date.now()}.webm`, { type: 'audio/webm' });
          this.geminiService.generateLiveTranscript(chunkFile).then(text => {
            if (text) {
              this.realtimeTranscript.update(current => current + text + ' ');
            }
          });
        }
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        if (audioBlob.size > 0) {
          const audio_file = new File([audioBlob], `recording-${new Date().toISOString()}.webm`, {type: 'audio/webm'});
          this.audioFile.set(audio_file);
          this.transcribe();
        } else {
          this.resetState();
        }
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start(4000);
      this.startRecordingTimer();
    } catch (err) {
      console.error('Error starting recording:', err);
      this.error.set('Could not start recording. Please ensure microphone permissions are granted.');
      this.isRecording.set(false);
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.isRecording.set(false);
    this.stopRecordingTimer();
  }

  private startRecordingTimer(): void {
    this.recordingTime.set(0);
    this.recordingInterval = setInterval(() => {
      this.recordingTime.update(t => t + 1);
    }, 1000);
  }

  private stopRecordingTimer(): void {
    clearInterval(this.recordingInterval);
  }

  formatTime(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }


  async transcribe(): Promise<void> {
    const file = this.audioFile();
    if (!file) {
      this.error.set('Please select or record an audio file first.');
      return;
    }
     if (!this.apiKey()) {
      this.error.set('API Key is not set. Please log in again.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.result.set(null);
    this.loadingMessage.set('Preparing your audio transcript...');

    try {
      const transcription = await this.geminiService.generateTranscription(
        file,
        this.transcriptionMode()
      );
      this.result.set(transcription);
      this.timedTranscript.set(this.parseTimedTranscript(transcription));

    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      this.error.set(`Failed to transcribe audio. ${errorMessage}`);
    } finally {
      this.isLoading.set(false);
    }
  }

  handleTimeUpdate(event: Event): void {
    const audio = event.target as HTMLAudioElement;
    const currentTime = audio.currentTime;
    const timedLines = this.timedTranscript();
    if (!timedLines || !timedLines.length) return;

    const currentLine = timedLines.slice().reverse().find(line => line.time <= currentTime);
    this.currentSubtitleLine.set(currentLine || null);
  }

  downloadTranscription(): void {
    const rawResult = this.result();
    const originalFileName = this.fileName() || 'audio';
    
    if (!rawResult) {
      return;
    }
    
    const blob = new Blob([rawResult], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseFileName = originalFileName.includes('.') ? originalFileName.split('.').slice(0, -1).join('.') : originalFileName;
    a.download = `${baseFileName}_transcription.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  private startLoadingMessages(): void {
    let index = 0;
    this.loadingMessage.set(this.loadingMessages[index]);
    this.loadingInterval = setInterval(() => {
        index = (index + 1) % this.loadingMessages.length;
        this.loadingMessage.set(this.loadingMessages[index]);
    }, 2500);
  }

  private stopLoadingMessages(): void {
    clearInterval(this.loadingInterval);
  }

  private parseTimedTranscript(text: string): TranscriptLine[] {
    const transcriptMatch = text.match(/\*\*The Transcript:\*\*\s*([\s\S]*?)\s*\*\*QA Insights:\*\*/);
    if (!transcriptMatch) return [];

    const transcriptBlock = transcriptMatch[1];
    const lines = transcriptBlock.split('\n');
    const timedLines: TranscriptLine[] = [];
    const regex = /\[(\d{2}):(\d{2})\]\s*(.*)/;

    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const time = minutes * 60 + seconds;
        const text = match[3];
        timedLines.push({ time, text });
      }
    }
    return timedLines;
  }

  private parseTranscriptionResult(text: string): ParsedResult | null {
    try {
      const metadataMatch = text.match(/\*\*Metadata:\*\*\s*([\s\S]*?)\s*\*\*Executive Summary:\*\*/);
      const summaryMatch = text.match(/\*\*Executive Summary:\*\*\s*([\s\S]*?)\s*\*\*The Transcript:\*\*/);
      const transcriptMatch = text.match(/\*\*The Transcript:\*\*\s*([\s\S]*?)\s*\*\*QA Insights:\*\*/);
      const insightsMatch = text.match(/\*\*QA Insights:\*\*\s*([\s\S]*)/);

      if (!metadataMatch || !summaryMatch || !transcriptMatch || !insightsMatch) {
          if (text.includes('Metadata:') && text.includes('Executive Summary:')) {
            const metadata = this.extractSection(text, 'Metadata:', 'Executive Summary:');
            const summary = this.extractSection(text, 'Executive Summary:', 'The Transcript:');
            const transcript = this.extractSection(text, 'The Transcript:', 'QA Insights:');
            const insights = this.extractSection(text, 'QA Insights:', null);
             return { metadata, summary, transcript, insights };
          }
          throw new Error('Could not parse the transcription result structure.');
      }
      
      return {
        metadata: metadataMatch[1].trim(),
        summary: summaryMatch[1].trim(),
        transcript: transcriptMatch[1].trim(),
        insights: insightsMatch[1].trim(),
      };

    } catch (err) {
      console.error('Error parsing transcription result:', err);
      this.error.set('The AI response was not in the expected format. Displaying raw output.');
      return {
        metadata: 'Could not parse.',
        summary: 'Could not parse.',
        transcript: text,
        insights: 'Could not parse.',
      };
    }
  }

  private extractSection(text: string, start: string, end: string | null): string {
    const startIndex = text.indexOf(start) + start.length;
    let endIndex;
    if (end) {
      endIndex = text.indexOf(end, startIndex);
    } else {
      endIndex = text.length;
    }
    return text.substring(startIndex, endIndex).trim();
  }
}