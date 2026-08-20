# Whoop Hub — Personal Health & Performance Intelligence Platform

A high-performance editorial PWA and web platform for health telemetry (Whoop / Wearables), AI nutrition scanning with OpenAI Vision, strength training progression, and biohacking rituals.

## 🚀 Quick Setup

1. **Clone repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Add your OpenAI API key:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-5.6
   ```

3. **Start the Application:**
   ```bash
   npm run dev
   ```
   - **Frontend (Vite):** `http://localhost:5173`
   - **Backend Server (Express + SQLite):** `http://localhost:3001`

## 🥗 OpenAI Food Vision Analysis Flow

1. **Capture/Upload Photo:**
   Navigate to the **Food (Питание)** tab. Take a photo or select an image from your gallery.
2. **Add User Context (Optional):**
   Add custom notes or quick tags (e.g., *"одно яйцо"*, *"без масла"*, *"съел половину"*, *"это индейка"*).
3. **Analyze:**
   Tap **Анализировать состав (Analyze)**. The backend sends the image and user context to OpenAI using Structured Outputs (JSON Schema).
4. **Inspect & Correct:**
   Review the detailed breakdown:
   - Total Calories (best estimate & likely range)
   - Macronutrients (Protein, Fat, Carbs, Fiber) & Micronutrients
   - Per-component weights in grams and calories (editable with real-time recalculation)
   - Confidence score and uncertainty factors
5. **Save to Food Log:**
   Click **Сохранить в дневник (Save Meal)** to persist the verified meal into the SQLite database.
