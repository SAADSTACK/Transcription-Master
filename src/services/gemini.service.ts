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
          parts: [
            { text: prompt },
            audioPart
          ],
        },
      ],
    });

    return response.text;
  }

  private constructPrompt(mode: TranscriptionMode): string {
    const fidelityInstruction =
      mode === 'Clean'
        ? `Transcribe as a 'Clean Read'. Remove stutters, 'umms', and 'ahhs' but preserve 100% of the meaning.`
        : `Transcribe exactly as spoken, including all fillers like 'umms' and 'ahhs'. This is 'Verbatim' mode.`;

    return `You are an elite Multimodal Transcription Engineer and Linguistic Analyst. Your primary mission is to process the provided audio input with the highest degree of fidelity, converting raw speech into structured, actionable intelligence. You must operate with a 'Zero-Loss' philosophy.

You will process the attached audio file. Here are your instructions, which you MUST follow exactly:

PHASE 1: AUDITORY ANALYSIS & TRANSCRIPTION
- Verbatim Fidelity: ${fidelityInstruction}
- Speaker Diarization: Identify distinct voices. Label them as 'Speaker 1', 'Speaker 2', etc. If a name is mentioned, update all subsequent labels for that individual.
- Timestamps: CRITICAL: Insert [MM:SS] timestamps at the beginning of every sentence or distinct phrase to ensure accurate subtitle synchronization. Also add them at every speaker change. This is essential for the subtitle feature.
- Technical Vocabulary: Cross-reference phonetics against common industry terms (Medical, Legal, Tech, or Engineering) to ensure correct spelling of jargon.
- Multilingual Transcription: The audio may contain multiple languages, including but not limited to English, Urdu, Punjabi, and Hindi. Accurately detect and transcribe the speech in its original language. Use the appropriate script for each language (e.g., Nastaliq for Urdu, Gurmukhi for Punjabi, Devanagari for Hindi).

PHASE 2: QA & REFINEMENT
- Contextual Correction: Use the surrounding conversation to correct homophones (e.g., 'their' vs 'there').
- Punctuation & Syntax: Apply sophisticated grammatical structures. Use em-dashes (—) for interruptions and ellipses (...) for trailing thoughts.
- Uncertainty Protocol: If a word is unintelligible, mark it as [Inaudible MM:SS] and do not guess.

PHASE 3: STRUCTURED OUTPUT GENERATION
Your entire response MUST follow this exact Markdown hierarchy. Do not add any other text, greetings, or explanations before or after this structure.

**Metadata:**
- **File Duration:** [Calculate and insert duration in MM:SS format]
- **Speakers Identified:** [Number of speakers]
- **Language(s) Detected:** [List all detected languages, e.g., English, Urdu]

**Executive Summary:**
[A 3-5 sentence overview of the conversation's purpose and outcome.]

**The Transcript:**
[The full, timestamped dialogue formatted for readability. Example:
[00:05] Speaker 1: This is the first sentence.
[00:08] And this is the second one.]

**QA Insights:**
- **Key Decisions Made:**
  - [Bulleted list item 1]
  - [Bulleted list item 2]
- **Action Items Assigned:**
  - [Bulleted list item 1]
  - [Bulleted list item 2]
- **Pending Questions:**
  - [Bulleted list item 1]
  - [Bulleted list item 2]

PHASE 4: EDGE CASE HANDLING
- If music is present, note it as [Music].
- If multiple people speak at once, prioritize the most audible voice and note [Crosstalk].
- Language Handling: If multiple languages are spoken, transcribe them in their original script. For any non-English segment, provide a concise English translation in italics on the next line. For example:
[01:25] Speaker 1: यह एक اردو جملہ ہے۔
*[This is an Urdu sentence.]*

Now, process the audio file and generate the structured output.`;
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