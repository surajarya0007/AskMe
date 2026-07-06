# AskMe 🎙️✨

AskMe is a premium, real-time voice and text conversational assistant web application. Powered by Google's Gemini Multimodal Live API, it offers responsive voice chats, smart text responses, and persistence of conversation history synced with Supabase or LocalStorage fallbacks. 

It is designed with a premium, sleek dark mode theme, featuring smooth micro-interactions, responsive typography, and layout aesthetics inspired by Gemini.

---

## 🚀 Key Features

*   **Real-time Multimodal Voice Session**: Speak naturally with Gemini using a low-latency WebSockets voice connection. Transitions into an elegant inline voice-bar with animated waveforms, mute controls, and live caption streaming.
*   **Intelligent Text Mode**: A clean, centered search-bar style chat layout with auto-expanding input and fluid message bubbles.
*   **State-of-the-Art CSS Transitions**: Directional message bubble entries (spring slide-up for AI, slide-in-right for users), active mic glowing breaths, and smooth toggle animations.
*   **Session Persistence & Reload Recovery**: Synchronizes conversation threads to Supabase (or LocalStorage when in local mode). Your current active conversation stays open even if you refresh the browser page.
*   **Secure Auth-Only Experience**: Completely removes guest sessions to guarantee user separation and data safety. Users are automatically prompted to sign in with Google OAuth on load.
*   **Initials Avatar Fallback**: Automatically generates a beautiful gradient badge fallback using the user's name initial if the avatar image fails to load.

---

## 🛠️ Technology Stack

1.  **Frontend Core**: React 18, TypeScript, Vite 8 (HMR enabled).
2.  **Styling**: Vanilla CSS with Custom Properties, CSS variables, and modern Outfit & Plus Jakarta Sans typography.
3.  **Icons**: Lucide React.
4.  **Database & Authentication**: Supabase (PostgreSQL tables for sessions and message streaming) + Google OAuth integration.
5.  **AI Engine**: Gemini Live WebSocket API (`wss://generativelanguage.googleapis.com`) + Gemini API key fallbacks.

---

## ⚙️ Configuration & Environment Variables

Create a `.env` file in the root directory to configure the application features:

```env
# Gemini API Key
VITE_GEMINI_API_KEY=YOUR_GEMINI_API_KEY

# Google Sign-in Credentials
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID

# Supabase Credentials (optional, falls back to LocalStorage)
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

---

## 🗄️ Database Schema (Supabase)

If you are using Supabase for cloud persistence, execute the following SQL scripts in your Supabase SQL editor:

```sql
-- 1. Create Sessions Table
CREATE TABLE sessions (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL UNIQUE,
  titles TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Messages Table
CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  chat_title TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_email, chat_title)
);
```

---

## 📦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for Production
```bash
npm run build
```
The compiled static assets will be outputted to the `dist/` directory.

---

## 🔒 Security & Safe Commits
A custom `.gitignore` is configured to prevent committing `.env` configuration files containing active keys. Always keep client secrets out of source control.
