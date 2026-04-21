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
// votes schema: { userId/faceDescriptorId, candidateId }

// --- API Endpoints: Election Data ---

// Get Candidates
app.get('/api/candidates', (req, res) => {
    // Map votes to candidates
    const candidatesWithVotes = candidates.map(c => {
        return {
            ...c,
            votes: votes.filter(v => v.candidateId === c.id).length
        }
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

    // Simple verification (in a real app this is much more secure)
    if (!candidateId || !userHash) return res.status(400).json({ error: "Missing data" });

    // Check if user already voted
    const alreadyVoted = votes.find(v => v.userHash === userHash);
    if (alreadyVoted) {
        return res.status(403).json({ error: "User has already cast their vote." });
    }

    votes.push({ candidateId, userHash });
    res.status(200).json({ message: "Vote successfully cast recorded on the blockchain (mock)!" });
});


// System Prompt configuring the behavior of the Election Assistant
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

        const hardcodedKey = "AIzaSyCV2m5E-vUL5dUVwfHJlJL2koD7pfdNaYc";

        try {
            const ai = new GoogleGenAI({ apiKey: hardcodedKey });

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    { role: 'user', parts: [{ text: userMessage }] }
                ],
                config: {
                    systemInstruction: SYSTEM_PROMPT,
                }
            });

            return res.json({ reply: response.text });

        } catch (geminiErr) {
            console.error("Gemini Error:", geminiErr);
            // Return the actual error message to help debug
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
