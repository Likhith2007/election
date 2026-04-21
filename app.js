// DOM Elements
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');

// Simple Markdown parser for AI responses
function parseMarkdown(text) {
    let html = text;
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italics
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Bullet points (simple heuristic)
    html = html.replace(/^\s*\*\s+(.*)/gm, '<ul><li>$1</li></ul>');
    // Merge ul
    html = html.replace(/<\/ul>\n<ul>/g, '\n');
    // Newlines to br where appropriate (outside lists)
    html = html.replace(/\n(?!(<ul|<li|<\/ul>))/g, '<br/>');
    return html;
}

function addMessage(text, sender, isMarkdown = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;

    const contentText = isMarkdown ? parseMarkdown(text) : text;
    msgDiv.innerHTML = `<div class="msg-content">${contentText}</div>`;

    // Remove typing indicator if exists
    const typingInd = document.getElementById('typing-ind');
    if (typingInd && sender === 'ai') {
        typingInd.remove();
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ai`;
    msgDiv.id = 'typing-ind';
    msgDiv.innerHTML = `
        <div class="msg-content" style="padding: 10px 16px;">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function fetchAIResponse(userText) {
    try {
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: userText })
        });

        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }

        const data = await response.json();
        addMessage(data.reply, 'ai', true);

    } catch (err) {
        console.error("Error communicating with AI backend:", err);
        addMessage("I am having trouble connecting to my local models right now. Please ensure the backend server and Ollama are running.", 'ai');
    }
}

function handleSend() {
    const text = chatInput.value.trim();
    if (!text) return;

    addMessage(text, 'user', false);
    chatInput.value = '';

    showTypingIndicator();
    fetchAIResponse(text);
}

// Event Listeners for Chat
sendBtn.addEventListener('click', handleSend);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
});

// Toast notification function (kept for generic alerts if needed)
function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Navigation Logic
const navLinks = document.querySelectorAll('.nav-link');
const pageViews = document.querySelectorAll('.page-view');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        const targetPageId = link.getAttribute('data-page');
        if (!targetPageId) return; // Ignore links like 'admin.html'

        e.preventDefault();

        // Remove active class from all links
        navLinks.forEach(nav => nav.classList.remove('active'));
        // Add active class to clicked link
        link.classList.add('active');

        // Hide all pages
        pageViews.forEach(page => {
            page.style.display = 'none';
        });

        // Show target page
        const targetPage = document.getElementById(targetPageId);
        if (targetPage) {
            targetPage.style.display = targetPageId === 'chat-page' ? 'flex' : 'block';
        }

        // Special load cases
        if (targetPageId === 'candidates-page') {
            fetchCandidates();
        }
    });
});

// Register Now Logic
const registerNowBtn = document.getElementById('register-now-btn');
if (registerNowBtn) {
    registerNowBtn.addEventListener('click', () => {
        window.open('https://voters.eci.gov.in/', '_blank');
    });
}

// --- Dynamic Candidate Loading ---
let fetchedCandidates = [];

async function fetchCandidates() {
    try {
        const response = await fetch('/api/candidates');
        if (!response.ok) throw new Error("Failed to fetch candidates");
        fetchedCandidates = await response.json();

        // Populate Candidates Page
        const publicContainer = document.getElementById('public-candidates-container');
        if (publicContainer && fetchedCandidates.length > 0) {
            publicContainer.innerHTML = '';
            fetchedCandidates.forEach(c => {
                const card = document.createElement('div');
                card.className = 'balance-card glass-panel';
                card.innerHTML = `
                    <div style="display: flex; gap: 15px; align-items: center;">
                        <i class="fa-solid fa-user-tie" style="font-size: 2.5rem; color: var(--primary);"></i>
                        <div>
                            <h2 style="font-size: 1.5rem;">${c.name}</h2>
                            <p style="color: var(--text-muted);">${c.party}</p>
                        </div>
                    </div>
                `;
                publicContainer.appendChild(card);
            });
        }

    } catch (err) {
        console.error(err);
    }
}

// Initial fetch to make sure voting page has candidates available
fetchCandidates();

// --- Biometric Authentication & Voting ---

const startAuthBtn = document.getElementById('start-auth-btn');
const authBtnText = document.getElementById('auth-btn-text');
const modelSpinner = document.getElementById('model-loading-spinner');

const modal = document.getElementById('face-auth-modal');
const cameraFeed = document.getElementById('camera-feed');
const authStatus = document.getElementById('auth-status');
const scannerLine = document.querySelector('.scanner-line');
const faceOutline = document.getElementById('face-outline');
const cancelBtn = document.getElementById('cancel-auth');

let isModelLoaded = false;
let stream = null;
let currentFaceDescriptor = null;
let scanTimeout = null;

// Initialize ML Models
async function initModels() {
    try {
        const modelUrl = 'https://vladmandic.github.io/face-api/model/';
        console.log("Loading face-api models...");

        await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
        await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
        await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);

        console.log("Models loaded successfully");
        isModelLoaded = true;

        if (modelSpinner) modelSpinner.style.display = 'none';
        if (authBtnText) authBtnText.innerText = "Start Camera Verification";

        if (startAuthBtn) {
            startAuthBtn.addEventListener('click', () => {
                initCamera();
            });
        }
    } catch (e) {
        console.error("Failed to load models.", e);
        if (modelSpinner) modelSpinner.className = "fa-solid fa-triangle-exclamation";
        if (authBtnText) authBtnText.innerText = "Model Load Failed";
    }
}
// Automatically init models
if (startAuthBtn) initModels();

async function initCamera() {
    if (!isModelLoaded) return;

    modal.classList.add('active');
    authStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting to camera...';
    authStatus.className = 'auth-status';
    faceOutline.className = 'face-outline';
    scannerLine.style.display = 'block';

    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        cameraFeed.srcObject = stream;

        cameraFeed.onloadedmetadata = () => {
            authStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Please look at the camera for identification...';
            scanLoop();
        };
    } catch (err) {
        console.error("Camera access denied or error:", err);
        authStatus.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:var(--negative)"></i> Camera access denied.';
        scannerLine.style.display = 'none';
    }
}

async function scanLoop() {
    if (!stream) return;

    try {
        const detection = await faceapi.detectSingleFace(cameraFeed, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

        if (detection) {
            // Create a simple hash of the face descriptor array so we can simulate one-person-one-vote
            const faceArray = Array.from(detection.descriptor);
            const basicHash = faceArray.reduce((acc, val) => acc + val, 0).toFixed(5);

            currentFaceDescriptor = "face_id_" + basicHash;

            authStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> Identity Verified';
            authStatus.classList.add('success');
            faceOutline.classList.add('success');
            scannerLine.style.display = 'none';

            setTimeout(() => {
                closeModal();
                unlockVotingBooth();
            }, 1500);
            return; // end loop
        }
    } catch (e) {
        console.error("ML Detection Error:", e);
    }

    // Loop again in ~200ms
    scanTimeout = setTimeout(scanLoop, 200);
}

function closeModal() {
    modal.classList.remove('active');
    if (scanTimeout) clearTimeout(scanTimeout);
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
}

if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
}

function unlockVotingBooth() {
    document.getElementById('identity-unverified').style.display = 'none';
    document.getElementById('identity-verified').style.display = 'block';

    populateBallot();
}

function populateBallot() {
    const list = document.getElementById('ballot-list');
    list.innerHTML = '';

    if (fetchedCandidates.length === 0) {
        list.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No candidates active currently. Check back later.</td></tr>';
        return;
    }

    fetchedCandidates.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${c.name}</strong></td>
            <td>${c.party}</td>
            <td><button class="vote-btn" data-id="${c.id}" style="background: var(--positive); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Cast Vote</button></td>
        `;
        list.appendChild(tr);
    });

    // Attach click listeners to Vote buttons
    document.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const candidateId = e.target.getAttribute('data-id');
            submitVote(candidateId);
        });
    });
}

async function submitVote(candidateId) {
    try {
        const res = await fetch('/api/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidateId, userHash: currentFaceDescriptor })
        });

        const data = await res.json();

        if (res.ok) {
            showToast(data.message);
            // Lock screen after voting
            document.getElementById('identity-verified').innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <i class="fa-solid fa-box-archive" style="font-size: 3rem; color: var(--positive); margin-bottom: 1rem;"></i>
                    <h2>Vote Successfully Cast</h2>
                    <p style="color: var(--text-muted);">Thank you for exercising your democratic right.</p>
                </div>
             `;
        } else {
            showToast(data.error || "Failed to submit vote");
        }

    } catch (err) {
        showToast("Network Error.");
    }
}
