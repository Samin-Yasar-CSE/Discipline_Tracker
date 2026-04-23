import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyClElgAaNmnYoVxebdMao4jpJ00RW662NE",
    authDomain: "discipline-tracker-c2443.firebaseapp.com",
    projectId: "discipline-tracker-c2443",
    storageBucket: "discipline-tracker-c2443.firebasestorage.app",
    messagingSenderId: "1067814089350",
    appId: "1:1067814089350:web:319d7501fa096bd3d95707",
    measurementId: "G-C9QJDTLY9F"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let plans = [];
let notes = [];
let currentPlanId = null;

const authScreen = document.getElementById('auth-screen');
const mainApp = document.getElementById('main-app');
const bottomNav = document.getElementById('bottom-nav');

document.getElementById('btn-login').addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(error => alert(error.message));
});

document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth);
});

onAuthStateChanged(auth, async(user) => {
    if (user) {
        currentUser = user;
        authScreen.style.display = 'none';
        mainApp.style.display = 'block';
        bottomNav.style.display = 'flex';
        initAppUI();
        await fetchCloudData();
    } else {
        currentUser = null;
        authScreen.style.display = 'flex';
        mainApp.style.display = 'none';
        bottomNav.style.display = 'none';
    }
});

async function fetchCloudData() {
    try {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            plans = data.plans || [];
            notes = data.notes || [];
        } else {
            plans = [];
            notes = [];
        }
        renderHome();
        renderNotes();
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

async function saveToCloud() {
    if (!currentUser) return;
    try {
        const userRef = doc(db, "users", currentUser.uid);
        await setDoc(userRef, { plans: plans, notes: notes }, { merge: true });
    } catch (error) {
        console.error("Error saving to cloud:", error);
        alert("Failed to save to cloud. Check console.");
    }
}

window.changeTheme = (themeName) => {
    document.body.className = themeName;
    localStorage.setItem('trackerTheme', themeName);
};

window.switchPortal = (portal) => {
    document.getElementById('portal-plans').classList.remove('active');
    document.getElementById('portal-notes').classList.remove('active');
    document.getElementById('nav-plans').classList.remove('active');
    document.getElementById('nav-notes').classList.remove('active');
    document.getElementById(`portal-${portal}`).classList.add('active');
    document.getElementById(`nav-${portal}`).classList.add('active');
    if (portal === 'notes') setupNewNote();
};

window.switchPlanView = (viewId) => {
    document.getElementById('home-view').classList.remove('active');
    document.getElementById('create-view').classList.remove('active');
    document.getElementById('detail-view').classList.remove('active');
    document.getElementById(viewId).classList.add('active');
    if (viewId === 'home-view') renderHome();
};

window.addTaskField = () => {
    const container = document.getElementById('tasks-container');
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '10px';
    row.innerHTML = `<input type="text" class="task-input" placeholder="Next task..."><button type="button" class="icon-btn" onclick="this.parentElement.remove()">X</button>`;
    container.appendChild(row);
};

window.savePlan = async() => {
    const name = document.getElementById('plan-name').value;
    const startDate = document.getElementById('plan-date').value;
    const startTime = document.getElementById('plan-time').value;
    const duration = parseInt(document.getElementById('plan-duration').value);
    const taskInputs = document.querySelectorAll('.task-input');
    const tasks = Array.from(taskInputs).map(input => input.value).filter(val => val.trim() !== '');

    if (!name || !startDate || !duration || tasks.length === 0) return alert('Fill all fields.');

    const startObj = new Date(startDate);
    startObj.setDate(startObj.getDate() + duration - 1);
    const endDate = startObj.toISOString().split('T')[0];

    plans.push({ id: Date.now().toString(), name, startDate, startTime, duration, endDate, tasks, records: {} });

    await saveToCloud();

    document.getElementById('plan-name').value = '';
    document.getElementById('plan-duration').value = '';
    document.getElementById('tasks-container').innerHTML = `<div class="row" style="margin-bottom: 10px;"><input type="text" class="task-input" placeholder="e.g., Read 10 pages"></div>`;
    window.switchPlanView('home-view');
};

window.openPlan = (id) => {
    currentPlanId = id;
    document.getElementById('log-date').valueAsDate = new Date();
    window.renderScoringUI();
    window.switchPlanView('detail-view');
};

window.renderScoringUI = () => {
    const plan = plans.find(p => p.id === currentPlanId);
    document.getElementById('detail-title').innerText = plan.name;
    document.getElementById('detail-info').innerHTML = `<strong>Started:</strong> ${plan.startDate} @ ${plan.startTime} <br> <strong>Ends:</strong> ${plan.endDate} (${plan.duration} Days)`;

    const taskList = document.getElementById('detail-task-list');
    taskList.innerHTML = '';
    plan.tasks.forEach(task => taskList.innerHTML += `<li>${task}</li>`);

    const logDate = document.getElementById('log-date').value;
    const existingRecord = plan.records[logDate] || {};
    const container = document.getElementById('scoring-container');
    container.innerHTML = '';

    plan.tasks.forEach((task, index) => {
        const div = document.createElement('div');
        div.className = 'score-row';
        const score = existingRecord[index] !== undefined ? existingRecord[index] : '';
        div.innerHTML = `<span style="font-weight: 500;">${task}</span><input type="number" class="score-input" data-task-index="${index}" placeholder="/ 10" value="${score}" step="0.5" max="10">`;
        container.appendChild(div);
    });

    calculateAndRenderFinalScore(plan);
    renderHistory(plan);
};

window.saveDailyScores = async() => {
    const plan = plans.find(p => p.id === currentPlanId);
    const logDate = document.getElementById('log-date').value;
    if (!logDate) return alert('Select a date.');

    const inputs = document.querySelectorAll('.score-input');
    const dailyRecord = {};
    inputs.forEach(input => {
        const val = parseFloat(input.value);
        if (!isNaN(val)) dailyRecord[input.getAttribute('data-task-index')] = val;
    });

    plan.records[logDate] = dailyRecord;
    await saveToCloud();
    window.renderScoringUI();
};

window.saveNote = async() => {
    const text = document.getElementById('note-text').value;
    if (!text.trim()) return alert('Note cannot be empty.');

    const date = document.getElementById('note-date').value;
    const time = document.getElementById('note-time').value;
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(date).getDay()];

    notes.unshift({ id: Date.now(), date, time, dayName, text });
    await saveToCloud();
    setupNewNote();
    renderNotes();
};

window.deleteNote = async(id) => {
    if (confirm("Delete this note?")) {
        notes = notes.filter(n => n.id !== id);
        await saveToCloud();
        renderNotes();
    }
};

function initAppUI() {
    const savedTheme = localStorage.getItem('trackerTheme') || 'theme-dark';
    document.getElementById('theme-select').value = savedTheme;
    window.changeTheme(savedTheme);
    const now = new Date();
    document.getElementById('plan-date').valueAsDate = now;
    document.getElementById('plan-time').value = now.toTimeString().slice(0, 5);
    document.getElementById('log-date').valueAsDate = now;
}

function renderHome() {
    const list = document.getElementById('plans-list');
    list.innerHTML = '';
    if (plans.length === 0) {
        list.innerHTML = `<div class="card" style="text-align:center;"><p>No plans active. Start building discipline today.</p></div>`;
        return;
    }

    plans.forEach(plan => {
        const div = document.createElement('div');
        div.className = 'card plan-card';
        div.innerHTML = `<h3 style="margin:0;">${plan.name}</h3><p style="margin-top: 5px; font-size: 0.9em;">Starts: ${plan.startDate} at ${plan.startTime}<br>Ends: ${plan.endDate} (${plan.duration} Days)</p>`;
        div.onclick = () => window.openPlan(plan.id);
        list.appendChild(div);
    });
}

function renderNotes() {
    const container = document.getElementById('notes-history-container');
    container.innerHTML = '';
    if (notes.length === 0) {
        container.innerHTML = `<p>No notes saved yet.</p>`;
        return;
    }

    notes.forEach(note => {
        const div = document.createElement('div');
        div.className = 'card note-card';
        div.innerHTML = `<div class="note-header"><span>${note.date} (${note.dayName})</span><span>${note.time}</span></div><div style="white-space: pre-wrap; line-height: 1.5;">${note.text}</div><button class="secondary" style="padding: 5px 10px; font-size: 0.8em; width: auto; margin-top: 15px;" onclick="deleteNote(${note.id})">Delete</button>`;
        container.appendChild(div);
    });
}

function setupNewNote() {
    const now = new Date();
    document.getElementById('note-date').valueAsDate = now;
    document.getElementById('note-time').value = now.toTimeString().slice(0, 5);
    document.getElementById('note-text').value = '';
}

function calculateAndRenderFinalScore(plan) {
    const scoreContainer = document.getElementById('final-score-container');
    const todayDate = new Date(new Date().toISOString().split('T')[0]);
    const endDate = new Date(plan.endDate);

    if (todayDate < endDate) {
        const diffDays = Math.ceil(Math.abs(endDate - todayDate) / (1000 * 60 * 60 * 24));
        scoreContainer.innerHTML = `<div class="locked-score"><div style="font-size: 2em; margin-bottom: 10px;">🔒</div><h3>Score Locked</h3><p>Keep grinding. Revealed in <strong>${diffDays} days</strong>.</p></div>`;
    } else {
        let totalAvgSum = 0;
        for (let date in plan.records) {
            let dailySum = 0,
                taskCount = 0;
            for (let key in plan.records[date]) {
                dailySum += plan.records[date][key];
                taskCount++;
            }
            totalAvgSum += taskCount === 0 ? 0 : (dailySum / plan.tasks.length);
        }
        let finalScore = (totalAvgSum / plan.duration) * 10;
        scoreContainer.innerHTML = `<div class="unlocked-score"><h3>Final Plan Score</h3><h1>${finalScore.toFixed(1)} <span style="font-size: 0.4em;">/ 100</span></h1><p>Duration Completed!</p></div>`;
    }
}

function renderHistory(plan) {
    const container = document.getElementById('history-container');
    container.innerHTML = '';
    const dates = Object.keys(plan.records).sort((a, b) => new Date(b) - new Date(a));
    if (dates.length === 0) {
        container.innerHTML = `<p>No history recorded yet.</p>`;
        return;
    }

    dates.forEach(date => {
        const record = plan.records[date];
        let sum = 0,
            count = 0;
        for (let key in record) {
            sum += record[key];
            count++;
        }
        let avg = count === 0 ? 0 : (sum / plan.tasks.length);

        const div = document.createElement('div');
        div.className = 'card';
        div.style.padding = '15px';
        div.innerHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 10px;"><strong>${date}</strong><strong style="color: var(--primary);">Avg: ${avg.toFixed(1)} / 10</strong></div>`;

        plan.tasks.forEach((task, index) => {
            const score = record[index] !== undefined ? record[index] : '-';
            div.innerHTML += `<div style="font-size: 0.9em; padding: 4px 0; border-top: 1px dashed var(--border); display: flex; justify-content: space-between;"><span>${task}</span> <strong>${score}</strong></div>`;
        });
        container.appendChild(div);
    });
}