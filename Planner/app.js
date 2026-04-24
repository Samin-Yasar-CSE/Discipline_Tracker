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

// --- Helper: Local Date to YYYY-MM-DD ---
function getLocalDateString(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- Helper: Local Timezone Today String ---
function getLocalTodayStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- Helper: Date Formatting (23rd April, 2026 (Thursday)) ---
function formatDateFriendly(dateStr) {
    if (!dateStr) return "";
    const dateObj = new Date(dateStr + "T00:00:00");
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const day = dateObj.getDate();
    const dayName = days[dateObj.getDay()];
    const monthName = months[dateObj.getMonth()];
    const year = dateObj.getFullYear();

    let suffix = 'th';
    if (day === 1 || day === 21 || day === 31) suffix = 'st';
    else if (day === 2 || day === 22) suffix = 'nd';
    else if (day === 3 || day === 23) suffix = 'rd';

    return `${day}${suffix} ${monthName}, ${year} (${dayName})`;
}

// --- Auth Logic ---
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
        alert("Failed to save to cloud.");
    }
}

// --- Navigation & HASH-BASED Back Button Logic ---
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
    window.location.hash = viewId;
};

window.addEventListener('hashchange', () => {
    let viewId = window.location.hash.substring(1);
    if (!['home-view', 'create-view', 'detail-view', 'edit-view'].includes(viewId)) {
        viewId = 'home-view'; // default fallback
    }

    const views = ['home-view', 'create-view', 'detail-view', 'edit-view'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.remove('active');
    });

    document.getElementById(viewId).classList.add('active');
    if (viewId === 'home-view') renderHome();
});


window.addTaskField = () => {
    const container = document.getElementById('tasks-container');
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '10px';
    row.innerHTML = `<input type="text" class="task-input" placeholder="Next task..."><button type="button" class="icon-btn" onclick="this.parentElement.remove()">X</button>`;
    container.appendChild(row);
};

// --- Plan Logic ---
window.savePlan = async() => {
    const name = document.getElementById('plan-name').value;
    const startDate = document.getElementById('plan-date').value;
    const startTime = document.getElementById('plan-time').value;
    const duration = parseInt(document.getElementById('plan-duration').value);
    const taskInputs = document.querySelectorAll('.task-input');
    const tasks = Array.from(taskInputs).map(input => input.value).filter(val => val.trim() !== '');

    if (isNaN(duration) || duration < 1) return alert('Duration must be at least 1 day.');
    if (!name || !startDate || tasks.length === 0) return alert('Fill all fields.');

    const startObj = new Date(startDate + "T00:00:00");
    startObj.setDate(startObj.getDate() + duration - 1);
    const endDate = getLocalDateString(startObj);

    const records = {};
    const todayStr = getLocalTodayStr();
    const today = new Date(todayStr + "T00:00:00");

    let loopDate = new Date(startDate + "T00:00:00");

    if (loopDate < today) {
        const diffTime = Math.abs(today - loopDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const wantPerfectScores = confirm(`This plan started ${diffDays} days ago.\n\nDo you want to automatically log PERFECT scores (10/10) for all those missed days?`);
        const defaultScore = wantPerfectScores ? 10 : 0;

        while (loopDate < today) {
            const dateStr = getLocalDateString(loopDate);
            records[dateStr] = {};
            tasks.forEach((_, index) => { records[dateStr][index] = defaultScore; });
            loopDate.setDate(loopDate.getDate() + 1);
        }
    }

    plans.push({ id: Date.now().toString(), name, startDate, startTime, duration, endDate, tasks, records: records });
    await saveToCloud();

    document.getElementById('plan-name').value = '';
    document.getElementById('plan-duration').value = '';
    document.getElementById('tasks-container').innerHTML = `<div class="row" style="margin-bottom: 10px;"><input type="text" class="task-input" placeholder="e.g., Read 10 pages"></div>`;
    window.switchPlanView('home-view');
};

window.openPlan = (id) => {
    currentPlanId = id;
    const plan = plans.find(p => p.id === id);
    const logDateEl = document.getElementById('log-date');
    const todayStr = getLocalTodayStr();

    logDateEl.max = todayStr;
    logDateEl.min = plan.startDate;

    if (todayStr < plan.startDate) {
        logDateEl.value = plan.startDate;
    } else {
        logDateEl.value = todayStr;
    }

    window.renderScoringUI();
    window.switchPlanView('detail-view');
};

window.renderScoringUI = () => {
    const plan = plans.find(p => p.id === currentPlanId);
    if (!plan) return;

    document.getElementById('detail-title').innerText = plan.name;
    document.getElementById('detail-info').innerHTML = `<strong>Started:</strong> ${formatDateFriendly(plan.startDate)} <br> <strong>Ends:</strong> ${formatDateFriendly(plan.endDate)}`;

    const taskList = document.getElementById('detail-task-list');
    taskList.innerHTML = '';
    plan.tasks.forEach(task => taskList.innerHTML += `<li>${task}</li>`);

    const logDateEl = document.getElementById('log-date');
    const logDate = logDateEl.value;
    const existingRecord = plan.records[logDate] || {};
    const container = document.getElementById('scoring-container');
    container.innerHTML = '';

    const todayStr = getLocalTodayStr();

    const isFuture = logDate > todayStr;
    const isBeforeStart = logDate < plan.startDate;
    const hasAllocatedPoints = Object.keys(existingRecord).length > 0;
    const isPastLocked = (logDate < todayStr) && hasAllocatedPoints;

    const disableInputs = isFuture || isBeforeStart || isPastLocked;

    plan.tasks.forEach((task, index) => {
        const div = document.createElement('div');
        div.className = 'score-row';
        const score = existingRecord[index] !== undefined ? existingRecord[index] : '';
        div.innerHTML = `<span style="font-weight: 500;">${task}</span><input type="number" class="score-input" data-task-index="${index}" placeholder="/ 10" value="${score}" step="0.5" max="10" ${disableInputs ? 'disabled' : ''}>`;
        container.appendChild(div);
    });

    const saveBtn = document.querySelector('button[onclick="saveDailyScores()"]');
    if (saveBtn) {
        if (disableInputs) {
            saveBtn.style.display = 'none';
            let msgText = '';
            if (isBeforeStart) msgText = `Plan starts on ${formatDateFriendly(plan.startDate)}. Allocation unlocks then.`;
            else if (isPastLocked) msgText = `Points for this past date have already been locked.`;
            else if (isFuture) msgText = `Cannot allocate points for future dates.`;

            if (msgText) {
                container.innerHTML += `<p style="color: var(--primary); text-align: center; margin-top: 15px; font-weight: bold;">🔒 ${msgText}</p>`;
            }
        } else {
            saveBtn.style.display = 'block';
        }
    }

    calculateAndRenderFinalScore(plan);
    renderHistory(plan);
};

// --- Clone/Copy Plan Logic ---
window.cloneCurrentPlan = () => {
    const plan = plans.find(p => p.id === currentPlanId);
    if (!plan) return;

    window.switchPlanView('create-view');
    document.getElementById('plan-name').value = plan.name + " (Copy)";
    document.getElementById('plan-duration').value = plan.duration;
    document.getElementById('plan-date').value = getLocalTodayStr();

    const container = document.getElementById('tasks-container');
    container.innerHTML = '';
    plan.tasks.forEach(task => {
        const row = document.createElement('div');
        row.className = 'row';
        row.style.marginBottom = '10px';
        row.innerHTML = `<input type="text" class="task-input" value="${task}"><button type="button" class="icon-btn" onclick="this.parentElement.remove()">X</button>`;
        container.appendChild(row);
    });
};

// --- Edit Logic ---
window.openEditView = () => {
    const plan = plans.find(p => p.id === currentPlanId);
    document.getElementById('edit-plan-name').value = plan.name;
    document.getElementById('edit-plan-date').value = plan.startDate;
    document.getElementById('edit-plan-time').value = plan.startTime;
    document.getElementById('edit-plan-duration').value = plan.duration;

    const container = document.getElementById('edit-tasks-container');
    container.innerHTML = '';
    plan.tasks.forEach(task => {
        const row = document.createElement('div');
        row.className = 'row';
        row.style.marginBottom = '10px';
        row.innerHTML = `<input type="text" class="edit-task-input" value="${task}"><button type="button" class="icon-btn" onclick="this.parentElement.remove()">X</button>`;
        container.appendChild(row);
    });
    window.switchPlanView('edit-view');
};

window.addEditTaskField = () => {
    const container = document.getElementById('edit-tasks-container');
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '10px';
    row.innerHTML = `<input type="text" class="edit-task-input" placeholder="Next task..."><button type="button" class="icon-btn" onclick="this.parentElement.remove()">X</button>`;
    container.appendChild(row);
};

window.saveEditedPlan = async() => {
    const plan = plans.find(p => p.id === currentPlanId);
    plan.name = document.getElementById('edit-plan-name').value;
    plan.startDate = document.getElementById('edit-plan-date').value;
    plan.startTime = document.getElementById('edit-plan-time').value;
    const newDuration = parseInt(document.getElementById('edit-plan-duration').value);

    if (isNaN(newDuration) || newDuration < 1) return alert('Duration must be at least 1 day.');
    plan.duration = newDuration;

    const taskInputs = document.querySelectorAll('.edit-task-input');
    plan.tasks = Array.from(taskInputs).map(input => input.value).filter(val => val.trim() !== '');

    const startObj = new Date(plan.startDate + "T00:00:00");
    startObj.setDate(startObj.getDate() + plan.duration - 1);
    plan.endDate = getLocalDateString(startObj);

    await saveToCloud();
    window.openPlan(currentPlanId);
};

window.deleteCurrentPlan = async() => {
    if (confirm("Are you sure? All history will be lost.")) {
        plans = plans.filter(p => p.id !== currentPlanId);
        await saveToCloud();
        window.switchPlanView('home-view');
    }
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

// --- Notes Logic ---
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

// --- Rendering Helpers ---
function initAppUI() {
    const savedTheme = localStorage.getItem('trackerTheme') || 'theme-dark';
    document.getElementById('theme-select').value = savedTheme;
    window.changeTheme(savedTheme);

    const todayStr = getLocalTodayStr();
    document.getElementById('plan-date').value = todayStr;
    document.getElementById('plan-time').value = new Date().toTimeString().slice(0, 5);
    document.getElementById('log-date').value = todayStr;

    window.location.hash = 'home-view';
}

function renderHome() {
    const list = document.getElementById('plans-list');
    list.innerHTML = '';
    if (plans.length === 0) {
        list.innerHTML = `<div class="card" style="text-align:center;"><p>No plans active.</p></div>`;
        return;
    }

    plans.forEach(plan => {
        const div = document.createElement('div');
        div.className = 'card plan-card';
        div.innerHTML = `<h3 style="margin:0;">${plan.name}</h3>
                         <p style="margin-top: 5px; font-size: 0.9em;">
                         Ends: ${formatDateFriendly(plan.endDate)} <br> (${plan.duration} Days)
                         </p>`;
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
        div.innerHTML = `<div class="note-header"><span>${formatDateFriendly(note.date)}</span><span>${note.time}</span></div>
                         <div style="white-space: pre-wrap; line-height: 1.5;">${note.text}</div>
                         <button class="secondary" style="padding: 5px 10px; font-size: 0.8em; width: auto; margin-top: 15px;" onclick="deleteNote(${note.id})">Delete</button>`;
        container.appendChild(div);
    });
}

function setupNewNote() {
    const todayStr = getLocalTodayStr();
    document.getElementById('note-date').value = todayStr;
    document.getElementById('note-time').value = new Date().toTimeString().slice(0, 5);
    document.getElementById('note-text').value = '';
}

function calculateAndRenderFinalScore(plan) {
    const scoreContainer = document.getElementById('final-score-container');
    const todayStr = getLocalTodayStr();

    if (todayStr < plan.startDate) {
        scoreContainer.innerHTML = `<div class="locked-score"><div style="font-size: 2em; margin-bottom: 10px;">⏳</div><h3>Plan Not Started</h3><p>Starts on <strong>${formatDateFriendly(plan.startDate)}</strong>.</p></div>`;
        return;
    }

    const hasLoggedLastDay = plan.records[plan.endDate] !== undefined && Object.keys(plan.records[plan.endDate]).length > 0;
    const isFinishedAndSaved = (todayStr > plan.endDate) || (todayStr === plan.endDate && hasLoggedLastDay);

    if (!isFinishedAndSaved) {
        const todayDate = new Date(todayStr + "T00:00:00");
        const endDateObj = new Date(plan.endDate + "T00:00:00");
        let diffDays = Math.ceil((endDateObj - todayDate) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) diffDays = 0;

        let lockMsg = `Revealed in <strong>${diffDays} days</strong>.`;
        if (diffDays === 0) lockMsg = `Revealed as soon as you save today's final points.`;
        if (todayStr > plan.endDate && !hasLoggedLastDay) lockMsg = `You missed the final day! Log points for ${formatDateFriendly(plan.endDate)} to unlock your final score.`;

        scoreContainer.innerHTML = `<div class="locked-score"><div style="font-size: 2em; margin-bottom: 10px;">🔒</div><h3>Score Locked</h3><p>${lockMsg}</p></div>`;
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
        scoreContainer.innerHTML = `<div class="unlocked-score"><h3>Final Plan Score</h3><h1>${finalScore.toFixed(1)} <span style="font-size: 0.4em;">/ 100</span></h1></div>`;
    }
}

function renderHistory(plan) {
    const container = document.getElementById('history-container');
    container.innerHTML = '';
    const dates = Object.keys(plan.records).sort((a, b) => new Date(b) - new Date(a));
    if (dates.length === 0) {
        container.innerHTML = `<p>No history yet.</p>`;
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
        div.innerHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <strong>${formatDateFriendly(date)}</strong>
                            <strong style="color: var(--primary);">Avg: ${avg.toFixed(1)}/10</strong>
                         </div>`;

        plan.tasks.forEach((task, index) => {
            const score = record[index] !== undefined ? record[index] : '-';
            div.innerHTML += `<div style="font-size: 0.9em; padding: 4px 0; border-top: 1px dashed var(--border); display: flex; justify-content: space-between;">
                                <span>${task}</span><strong>${score}</strong>
                             </div>`;
        });
        container.appendChild(div);
    });
}
