export interface MockResponse {
  keywords: string[];
  response: string;
}

const MOCK_RESPONSES: MockResponse[] = [
  {
    keywords: ["hello", "hi", "hey", "greetings"],
    response: "Hello! I'm your AI assistant. How can I help you today? You can type a message or start a live voice call with me!"
  },
  {
    keywords: ["voice", "call", "audio", "speak", "talk", "listening"],
    response: "To start a voice call, click the microphone button in the input bar. We can have a real-time conversation. I will listen to your speech and talk back using the browser's Web Speech API!"
  },
  {
    keywords: ["supabase", "database", "save", "persist"],
    response: "This app supports Supabase! Go to Settings (the gear icon in the bottom-left sidebar) to enter your Supabase URL and Anon Key. Once configured, all your chat sessions and histories will sync with your PostgreSQL cloud database."
  },
  {
    keywords: ["gemini", "api", "google", "ai"],
    response: "You can connect me to Google's real Gemini API! Just open the Settings panel, toggle 'Use Gemini API', and paste your Gemini API key. I'll start generating actual LLM responses instead of using mock replies."
  },
  {
    keywords: ["help", "what can you do", "features"],
    response: "Here's what I can do:\n1. **Text Chat**: Real-time conversation with session history.\n2. **Voice Call**: Immersive full-screen calling experience with live speech visualizers.\n3. **Supabase Integration**: Cloud sync for session history.\n4. **Gemini AI**: Direct connection to state-of-the-art AI model. \n\nHow would you like to proceed?"
  },
  {
    keywords: ["project", "assignment", "code", "react"],
    response: "This project is built with React 19, TypeScript, and Vite. It features a fully custom CSS design system using glassmorphic cards, CSS animations, and direct integrations with Web Speech and Supabase APIs."
  }
];

export const getMockReply = (message: string): string => {
  const normalized = message.toLowerCase();
  
  for (const item of MOCK_RESPONSES) {
    if (item.keywords.some(keyword => normalized.includes(keyword))) {
      return item.response;
    }
  }
  
  // Generic responses
  const fallbacks = [
    "That's an interesting point! In a real scenario, I would query the Gemini API to give you a detailed answer. What else would you like to test?",
    "I understand. Let's explore that further. You can toggle Gemini Mode in the Settings to get a real AI response to this query!",
    "Got it. Feel free to try out the Voice Call mode by clicking the microphone icon at the bottom of your screen to see the voice-to-text live visualizer!",
    "That makes sense. If you have Supabase configured, this message will be securely stored in your Postgres database.",
    "Awesome! Feel free to ask more, or test the responsive design by resizing your window or checking out the session management."
  ];
  
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
};
