// config.js
// ----------------------------------------------------
// 전역 변수 (Global Variables)
// ----------------------------------------------------
const ADMIN_UIDS = ["jaGugunGReXytCgbqYwQUybxyJL2", "hiPMcfj1OvWuq6PjedfPFvOLxlp2"]; 

const AppStore = {
    state: {
        currentUserProfile: null,
        tasks: {},
        trips: {},
        leaves: {},
        users: {},
        notices: {},
        dailyTasks: {},
        dailyLogs: {},
        notifications: {},
        externalEvents: {},
        meetingFeeds: {},
        viewMode: 'status'
    },
    getCurrentUser: function() { return this.state.currentUserProfile; },
    setCurrentUser: function(profile) { this.state.currentUserProfile = profile; },
    getTasks: function() { return this.state.tasks; },
    setTasks: function(newData) {
        this.state.tasks = newData;
        setTimeout(() => {
            try { if(typeof renderTasks === 'function') renderTasks(); } catch(e){}
            try { if(typeof renderMyPage === 'function') renderMyPage(); } catch(e){}
            try {
                const calTab = document.getElementById('tab-calendar');
                if (calTab && calTab.style.display !== 'none' && typeof renderTabCalendar === 'function') renderTabCalendar();
            } catch(e){}
        }, 0);
    },
    mergeTasks: function(newData, status) {
        Object.keys(this.state.tasks).forEach(key => {
            if (this.state.tasks[key].status === status) {
                delete this.state.tasks[key];
            }
        });
        Object.assign(this.state.tasks, newData);
        setTimeout(() => {
            try { if(typeof renderTasks === 'function') renderTasks(); } catch(e){}
            try { if(typeof renderMyPage === 'function') renderMyPage(); } catch(e){}
            try {
                const calTab = document.getElementById('tab-calendar');
                if (calTab && calTab.style.display !== 'none' && typeof renderTabCalendar === 'function') renderTabCalendar();
            } catch(e){}
        }, 0);
    },
    getTrips: function() { return this.state.trips; },
    setTrips: function(newData) {
        this.state.trips = newData;
        setTimeout(() => {
            try { if(typeof renderTasks === 'function') renderTasks(); } catch(e){}
            try { if(typeof renderMyPage === 'function') renderMyPage(); } catch(e){}
            try { if(typeof renderTripList === 'function') renderTripList(); } catch(e){}
            try {
                const calTab = document.getElementById('tab-calendar');
                if (calTab && calTab.style.display !== 'none' && typeof renderTabCalendar === 'function') renderTabCalendar();
            } catch(e){}
        }, 0);
    },
    getLeaves: function() { return this.state.leaves; },
    setLeaves: function(newData) {
        this.state.leaves = newData;
        setTimeout(() => {
            try { if(typeof renderTasks === 'function') renderTasks(); } catch(e){}
            try { if(typeof renderLeaveUI === 'function') renderLeaveUI(); } catch(e){}
            try { if(typeof renderMyPage === 'function') renderMyPage(); } catch(e){}
            const user = firebase.auth().currentUser;
            try { if(user && ADMIN_UIDS.includes(user.uid) && typeof renderAdminLeaves === 'function') renderAdminLeaves(); } catch(e){}
            try {
                const calTab = document.getElementById('tab-calendar');
                if (calTab && calTab.style.display !== 'none' && typeof renderTabCalendar === 'function') renderTabCalendar();
            } catch(e){}
        }, 0);
    },
    getUsers: function() { return this.state.users; },
    setUsers: function(newData) {
        this.state.users = newData;
        if(typeof renderMembersDirectory === 'function') renderMembersDirectory();
        if(typeof renderChatList === 'function') renderChatList();
        if(typeof setupPrivateChatNotificationListeners === 'function') setupPrivateChatNotificationListeners();
        const user = firebase.auth().currentUser;
        if(user && ADMIN_UIDS.includes(user.uid) && typeof renderAdminLeaves === 'function') renderAdminLeaves();
    },
    getNotices: function() { return this.state.notices; },
    setNotices: function(newData) {
        this.state.notices = newData;
        if(typeof renderNotices === 'function') renderNotices();
    },
    getMeetingFeeds: function() { return this.state.meetingFeeds || {}; },
    setMeetingFeeds: function(newData) {
        this.state.meetingFeeds = newData;
        setTimeout(() => {
            try { if (typeof renderMeetingFeedUI === 'function') renderMeetingFeedUI(); } catch(e){}
        }, 0);
    },
    getViewMode: function() { return this.state.viewMode; },
    setViewMode: function(mode) {
        this.state.viewMode = mode;
        if(typeof renderTasks === 'function') renderTasks();
    },
    getDailyTasks: function() { return this.state.dailyTasks; },
    setDailyTasks: function(newData) {
        this.state.dailyTasks = newData;
        if(typeof renderDailyTasks === 'function') renderDailyTasks();
    },
    getDailyLogs: function() { return this.state.dailyLogs; },
    setDailyLogs: function(newData) {
        this.state.dailyLogs = newData;
        if(typeof renderDailyTasks === 'function') renderDailyTasks();
    },
    getNotifications: function() { return this.state.notifications; },
    setNotifications: function(newData) {
        this.state.notifications = newData;
        if(typeof renderNotifications === 'function') renderNotifications();
    },
    getExternalEvents: function() { return this.state.externalEvents; },
    setExternalEvents: function(newData) {
        this.state.externalEvents = newData;
        setTimeout(() => {
            try { if(typeof renderTasks === 'function') renderTasks(); } catch(e){}
            try {
                const calTab = document.getElementById('tab-calendar');
                if(calTab && calTab.style.display !== 'none' && typeof renderTabCalendar === 'function') renderTabCalendar();
            } catch(e){}
        }, 0);
    }
};

let currentDateForCalendar = new Date();
let currentDateForGantt = new Date();
let currentDateForModalCalendar = new Date();
let currentDateForMyPageCalendar = new Date();

// ----------------------------------------------------
// 유틸리티 (Utilities)
// ----------------------------------------------------
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);
const checkAuth = async (msg = '승인된 사용자만 이용할 수 있습니다.') => {
    const profile = AppStore.getCurrentUser();
    if (!profile || !profile.approved) { await customAlert(msg); return false; }
    return true;
};
const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ----------------------------------------------------
// Firebase 설정
// ----------------------------------------------------
// 주의: GitHub Pages(ryu303.github.io) 호스팅 환경은 /__/auth/* 경로를 처리할 수 없으므로,
// authDomain은 반드시 원래의 firebaseapp.com 도메인으로 고정해야 합니다.
const firebaseConfig = {
    apiKey: "AIzaSyBOIugED48GlLzHytc6p4XDbrJVzouA4Q8",
    authDomain: "coworking-tool.firebaseapp.com",
    projectId: "coworking-tool",
    storageBucket: "coworking-tool.firebasestorage.app",
    messagingSenderId: "614190014572",
    appId: "1:614190014572:web:ef61d476457cdc1ef27849",
    measurementId: "G-B4RSYQ38P8"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
const db = firebase.database();
const storage = firebase.storage();
const functions = firebase.app().functions('asia-northeast3');

// ----------------------------------------------------
// 다크 모드 & 테마 & 달력 설정
// ----------------------------------------------------
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-toggle').innerHTML = savedTheme === 'dark' ? '<span class="material-symbols-rounded">light_mode</span>' : '<span class="material-symbols-rounded">dark_mode</span>';
    const flatpickrTheme = document.getElementById('flatpickr-theme');
    if (savedTheme === 'dark' && flatpickrTheme) {
        flatpickrTheme.href = "https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css";
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    document.getElementById('theme-toggle').innerHTML = newTheme === 'dark' ? '<span class="material-symbols-rounded">light_mode</span>' : '<span class="material-symbols-rounded">dark_mode</span>';
    const flatpickrTheme = document.getElementById('flatpickr-theme');
    if (flatpickrTheme) {
        flatpickrTheme.href = newTheme === 'dark' ? "https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css" : "https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css";
    }
}

initTheme();

const fpConfig = {
    locale: "ko",
    dateFormat: "Y-m-d",
    disableMobile: true,
    monthSelectorType: "static"
};
flatpickr("#modalStartDate", fpConfig);
flatpickr("#modalDueDate", fpConfig);
flatpickr("#tripDate", Object.assign({}, fpConfig, { mode: "range" }));
flatpickr("#leaveStartDate", fpConfig);
flatpickr("#leaveEndDate", fpConfig);
flatpickr("#mapStartDate", fpConfig);
flatpickr("#mapEndDate", fpConfig);

// ----------------------------------------------------
// 공통 알림 모달 & 토스트 알림
// ----------------------------------------------------
function customModalAction(type, message, defaultValue = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('alertModal');
        const msgEl = document.getElementById('alertMessage');
        const inputEl = document.getElementById('alertInput');
        const confirmBtn = document.getElementById('alertConfirmBtn');
        const cancelBtn = document.getElementById('alertCancelBtn');

        msgEl.textContent = message;
        modal.style.display = 'flex';

        if (type === 'prompt') {
            inputEl.style.display = 'block';
            inputEl.value = defaultValue;
            setTimeout(() => inputEl.focus(), 10);
        } else {
            inputEl.style.display = 'none';
        }

        cancelBtn.style.display = type === 'alert' ? 'none' : 'block';
        cancelBtn.style.flex = '1';

        confirmBtn.onclick = () => {
            modal.style.display = 'none';
            resolve(type === 'prompt' ? inputEl.value : true);
        };

        cancelBtn.onclick = () => {
            modal.style.display = 'none';
            resolve(type === 'prompt' ? null : false);
        };
    });
}
const customAlert = (msg) => customModalAction('alert', msg);
const customConfirm = (msg) => customModalAction('confirm', msg);
const customPrompt = (msg, def) => customModalAction('prompt', msg, def);

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'info';
    let iconColor = 'var(--primary)';
    if (type === 'warning') {
        icon = 'notifications_active';
        iconColor = '#F59E0B';
    }
    
    toast.innerHTML = `
        <span class="material-symbols-rounded" style="color: ${iconColor}; font-size: 1.8rem;">${icon}</span>
        <span style="font-size: 0.95rem; font-weight: 600; line-height: 1.5; white-space: pre-wrap;">${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 5000);
}

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    
    if (element) element.classList.add('active');
    document.getElementById(tabId).style.display = 'block';
    
    // 탭 전환 시 화면을 강제로 최신화하여 즉각 반영 (F5 방지)
    if (tabId === 'tab-admin' && auth.currentUser && ADMIN_UIDS.includes(auth.currentUser.uid)) {
        if (typeof renderAdminLeaves === 'function') renderAdminLeaves();
    } else if (tabId === 'tab-leaves') {
        if (typeof renderLeaveUI === 'function') renderLeaveUI();
    } else if (tabId === 'tab-calendar') {
        // [개선] 탭 전환 후 DOM이 안정화될 때까지 아주 잠시 기다린 후 렌더링 (순차 노출 문제 해결)
        setTimeout(() => {
            if (typeof renderTabCalendar === 'function') {
                renderTabCalendar();
            }
        }, 50);
    } else if (tabId === 'tab-tasks') {
        if (typeof renderTasks === 'function') renderTasks();
    } else if (tabId === 'tab-meeting-feed') {
        if (typeof renderMeetingFeedUI === 'function') renderMeetingFeedUI();
    } else if (tabId === 'tab-mypage') {
        if (typeof renderMyPage === 'function') renderMyPage();
    } else if (tabId === 'tab-docs') {
        if (typeof initPdfToolSettings === 'function') initPdfToolSettings();
        if (typeof loadProposalSettings === 'function') loadProposalSettings();
    }
}

// 카카오내비 전송을 위한 SDK 초기화
if (typeof Kakao !== 'undefined' && !Kakao.isInitialized()) {
    Kakao.init('49567b3deb7ec9afb54384571d730980'); // 카카오 앱 키
}