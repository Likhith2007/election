require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Serve index.html explicitly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- In-Memory Database ---
let candidates = [];
let votes = [];
// votes schema: { userHash, candidateId }

// --- API Endpoints: Election Data ---

// Get Candidates
app.get('/api/candidates', (req, res) => {
    const candidatesWithVotes = candidates.map(c => {
        return {
            ...c,
            votes: votes.filter(v => v.candidateId === c.id).length
        };
    });
    res.json(candidatesWithVotes);
});

// Add Candidate (Admin)
app.post('/api/candidates', (req, res) => {
    const { name, party } = req.body;
    if (!name || !party) return res.status(400).json({ error: "Missing data" });

    const newCandidate = {
        id: Date.now().toString(),
        name,
        party
    };
    candidates.push(newCandidate);
    res.status(201).json({ message: "Candidate added", candidate: newCandidate });
});

// Vote
app.post('/api/vote', (req, res) => {
    const { candidateId, userHash } = req.body;

    if (!candidateId || !userHash) return res.status(400).json({ error: "Missing data" });

    const alreadyVoted = votes.find(v => v.userHash === userHash);
    if (alreadyVoted) {
        return res.status(403).json({ error: "User has already cast their vote." });
    }

    votes.push({ candidateId, userHash });
    res.status(200).json({ message: "Vote successfully cast recorded on the blockchain (mock)!" });
});

// --- Civic AI Assistant ---
const SYSTEM_PROMPT = `You are the Civic AI Assistant, an expert guide on the democratic election process. 
Your goal is to help citizens understand how, when, and where to vote, the requirements for voter registration, and the timeline of the election.
Always respond in a helpful, neutral, and encouraging tone.
Do not support or endorse any political party or candidate. Focus entirely on the civic process, voting rights, and making the process easy to understand.
Keep your answers relatively concise, under 3 paragraphs, using bullet points for readability.`;

app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;
        if (!userMessage) {
            return res.status(400).json({ error: "Message is required" });
        }

        console.log(`Received user message: ${userMessage}`);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ reply: "Gemini API Error: Server is missing GEMINI_API_KEY environment variable." });
        }

        try {
            const ai = new GoogleGenAI({ apiKey });

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro', // Updated to 2.5 Pro as requested
                contents: [
                    { role: 'user', parts: [{ text: userMessage }] }
                ],
                config: {
                    systemInstruction: SYSTEM_PROMPT,
                }
            });

            // Handle different SDK response formats
            let replyText = "";
            if (response.text) {
                replyText = response.text;
            } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
                replyText = response.candidates[0].content.parts[0].text;
            } else {
                replyText = "Sorry, I couldn't generate a response.";
            }

            return res.json({ reply: replyText });

        } catch (geminiErr) {
            console.error("Gemini Error:", geminiErr);
            const errorMessage = geminiErr.message || geminiErr.toString() || "Unknown Gemini Error";
            return res.status(500).json({ reply: `Gemini API Error: ${errorMessage}` });
        }
    } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ reply: "Sorry, I am currently unable to process requests." });
    }
});

app.listen(PORT, () => {
    console.log(`Election Assistant server running at http://localhost:${PORT}`);
    console.log(`Connecting securely to Cloud Gemini via provided API Key.`);
});
