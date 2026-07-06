import { useState } from 'react';

export interface MessagePayload {
  sender: 'user' | 'assistant';
  text: string;
}

export const useGemini = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateResponse = async (
    apiKey: string,
    prompt: string,
    history: MessagePayload[] = []
  ): Promise<string> => {
    setLoading(true);
    setError(null);

    try {
      if (!apiKey) {
        throw new Error("Gemini API key is not configured. Please add it in Settings.");
      }

      // Map roles: 'assistant' -> 'model' for Gemini spec
      const formattedContents = history.map((msg) => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      // Append current prompt
      formattedContents.push({
        role: 'user',
        parts: [{ text: prompt }]
      });

      // We use gemini-3.1-flash-lite as requested by the user
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: formattedContents,
          // Add a system instruction to make the assistant concise and friendly
          systemInstruction: {
            parts: [{ text: "You are AskMe, a helpful, conversational AI companion. Keep your responses engaging and relatively concise so they work well in both text chat and voice synthesis." }]
          }
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `HTTP error! status: ${response.status}`;
        throw new Error(errMsg);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        throw new Error("No response content received from Gemini API.");
      }

      return text;
    } catch (err: any) {
      const msg = err.message || "An error occurred while connecting to Gemini API.";
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  return { generateResponse, loading, error };
};
