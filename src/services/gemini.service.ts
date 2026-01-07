import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

export type TranscriptionMode = 'Clean' | 'Verbatim';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private genAI: GoogleGenAI | null = null;

  initialize(apiKey: string): void {
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async generateLiveTranscript(file: File): Promise<string> {
    if (!this.genAI) {
      console.error('Gemini Service not initialized.');
      return ''; // Return empty string for a smoother UX
    }
    const model = 'gemini-2.5-flash';
    const audioPart = await this.fileToGenerativePart(file);
    const prompt = `You are a real-time transcription service. Transcribe the following audio chunk accurately. Provide only the transcribed words. Do not add any extra text, labels, or formatting. If there is no speech, return an empty string.`;

    try {
      const response = await this.genAI.models.generateContent({
        model: model,
        contents: [
          {
            parts: [{ text: prompt }, audioPart],
          },
        ],
      });
      return response.text.trim();
    } catch (error) {
      console.error('Error during live transcription chunk:', error);
      return ''; // Return empty on error to not break the flow
    }
  }

  async generateTranscription(
    file: File,
    mode: TranscriptionMode
  ): Promise<string> {
    if (!this.genAI) {
      throw new Error('Gemini Service not initialized. Please provide an API key.');
    }
    const model = 'gemini-2.5-flash';
    const audioPart = await this.fileToGenerativePart(file);
    const prompt = this.constructPrompt(mode);

    const response = await this.genAI.models.generateContent({
      model: model,
      contents: [
        {
          parts: [{ text: prompt }, audioPart],
        },
      ],
    });

    return response.text;
  }

  private constructPrompt(mode: TranscriptionMode): string {
    const fidelityInstruction =
      mode === 'Clean'
        ? `Transcribe as a 'Clean Read'. Remove filler words (umms, ahhs), stutters, and false starts. Preserve the core meaning.`
        : `Transcribe exactly as spoken (verbatim), including all filler words, stutters, and repetitions.`;

    return `You are a highly accurate audio transcription and analysis service. Your task is to process the attached audio file and generate a structured report in Markdown format.

Follow these instructions precisely:

1.  **Transcription Style**: ${fidelityInstruction}

2.  **Speaker Identification**: Identify each speaker and label them as 'Speaker 1', 'Speaker 2', and so on.

3.  **Timestamps**: Add a timestamp in [MM:SS] format at the beginning of every sentence and at every speaker change. This is critical for subtitling.

4.  **Output Structure**: The entire output must strictly follow the format below. Do not add any introductory or concluding text outside of this structure.

**Metadata:**
- **File Duration:** [Calculate and insert duration in MM:SS format]
- **Speakers Identified:** [Number of speakers]
- **Language(s) Detected:** [List detected language(s)]

**Executive Summary:**
[Provide a concise, 3-5 sentence summary of the conversation's key points and conclusions.]

**The Transcript:**
[The full, timestamped dialogue. For example:
[00:05] Speaker 1: This is the first sentence.
[00:08] And this is the second one.]

**QA Insights:**
- **Key Decisions Made:**
  - [Bulleted list of key decisions]
- **Action Items Assigned:**
  - [Bulleted list of action items with owners, if mentioned]
- **Pending Questions:**
  - [Bulleted list of unresolved questions]

If a word or phrase is completely unintelligible, mark it as [Inaudible MM:SS]. Now, process the audio.`;
  }

  private async fileToGenerativePart(
    file: File
  ): Promise<{ inlineData: { data: string; mimeType: string } }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64Data = dataUrl.split(',')[1];
        resolve({
          inlineData: {
            data: base64Data,
            mimeType: file.type,
          },
        });
      };
      reader.onerror = (error) => reject(error);
    });
  }
}