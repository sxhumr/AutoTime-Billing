require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
// Make sure your .env file has a valid MONGO_URI
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ghostpractice')
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Schema Definition
const timeEntrySchema = new mongoose.Schema({
  appName: { type: String, required: true },
  windowTitle: { type: String, required: true },
  durationSeconds: { type: Number, required: true },
  matter: { type: String, default: "Unassigned" },
  status: { type: String, default: 'Pending' },
  timestamp: { type: Date, default: Date.now }
});

const TimeEntry = mongoose.model('TimeEntry', timeEntrySchema);

// Helper: Classification Logic
const classifyMatter = (title) => {
  const t = title.toLowerCase();
  if (t.includes("dlamini")) return "Matter 1042 - Dlamini";
  if (t.includes("excel")) return "Matter 1045 - Financial Audit";
  if (t.includes("word") || t.includes("draft")) return "Matter 1048 - Legal Drafting";
  return "General Admin";
};

// API Routes
// 1. Receive activity log (with Deduplication & Aggregation)
app.post('/api/activity', async (req, res) => {
  // DEBUG LOG: This will print every time the C# Agent sends data
  console.log("🔥 SERVER RECEIVED DATA:", JSON.stringify(req.body, null, 2));

  try {
    const { appName, windowTitle, durationSeconds } = req.body;
    
    // Validation: Ensure we actually got data
    if (!windowTitle) {
      return res.status(400).json({ error: "Missing windowTitle" });
    }

    const matter = classifyMatter(windowTitle);

    // Look for a session in the last 20 seconds to aggregate time
    const timeThreshold = new Date(Date.now() - 20000); 
    
    const recentEntry = await TimeEntry.findOne({
      windowTitle: windowTitle,
      timestamp: { $gte: timeThreshold }
    }).sort({ timestamp: -1 });

    if (recentEntry) {
      console.log(`⚡ Aggregating: Adding ${durationSeconds}s to ${windowTitle}`);
      recentEntry.durationSeconds += durationSeconds;
      await recentEntry.save();
      res.status(200).json({ message: "Duration updated", entry: recentEntry });
    } else {
      console.log(`🆕 Creating New Session: ${windowTitle}`);
      const newEntry = new TimeEntry({
        appName,
        windowTitle,
        durationSeconds,
        matter,
        status: 'Pending'
      });
      await newEntry.save();
      res.status(201).json({ message: "New session started", entry: newEntry });
    }
  } catch (error) {
    console.error("❌ Error processing activity:", error);
    res.status(500).json({ error: "Failed to process activity" });
  }
});

// 2. Fetch entries for React Dashboard
app.get('/api/entries', async (req, res) => {
  try {
    const entries = await TimeEntry.find().sort({ timestamp: -1 });
    res.status(200).json(entries);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch entries" });
  }
});

// 3. Update entry status
app.patch('/api/entries/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const updatedEntry = await TimeEntry.findByIdAndUpdate(
      req.params.id, 
      { status }, 
      { new: true }
    );
    res.status(200).json(updatedEntry);
  } catch (error) {
    res.status(500).json({ error: "Failed to update entry" });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});