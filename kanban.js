// kanban.js
// ----------------------------------------------------
// 업무 현황 (칸반, 달력, 간트)
// ----------------------------------------------------
let selectedAssignees = [];
let modalSelectedAssignees = [];
let selectedDateForCreation = '';

async function addTask() {
    const input = document.getElementById('taskInput');
    const title = input.value.trim();
    const assignee = selectedAssignees.join(', ');
    const priorityInput = document.getElementById('priorityInput');
    const priority = priorityInput.value;

    if (!(await checkAuth('관리자의 승인 후 업무를 추가할 수 있습니다.'))) return;
    if (!title) return await customAlert('업무 내용을 입력해주세요!');

    const currentUser = auth.currentUser;
    const authorName = currentUser ? currentUser.displayName : '익명';
    const today = new Date();
    const startDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const newTaskRef = db.ref('tasks').push();
    await newTaskRef.set({ id: newTaskRef.key, title: title, status: 'todo', author: authorName, assignee: assignee, priority: priority, startDate: startDateString });

    // 담당자에게 알림 발송
    selectedAssignees.forEach(name => {
        const targetUser = Object.values(AppStore.getUsers()).find(u => u.displayName === name);
        if (targetUser) {
            sendNotification(targetUser.uid, {
                title: "새로운 업무 할당",
                message: `"${title}" 업무의 담당자로 지정되었습니다.`,
                type: 'task',
                link: 'task',
                targetId: newTaskRef.key
            });
        }
    });

    input.value = '';
    selectedAssignees = [];
    renderAssigneeTags();
    priorityInput.value = 'medium';
    document.getElementById('searchAssignee').value = '';
    document.getElementById('dateFilter').value = 'all';

    if (AppStore.getViewMode() === 'calendar') {
        document.getElementById('viewMode').value = 'status';
        toggleViewMode();
        customAlert("달력에는 마감일이 있는 업무만 표시됩니다. \n방금 추가한 업무 확인을 위해 '상태별 보기'로 전환했습니다!");
    } else {
        filterTasks();
    }
}

document.getElementById('taskInput').addEventListener('keydown', function (e) { if (e.isComposing) return; if (e.key === 'Enter') addTask(); });
document.getElementById('assigneeInput').addEventListener('keydown', function (e) { if (e.isComposing) return; if (e.key === 'Enter') addTask(); });

async function deleteTask(id) {
    if (!(await checkAuth('승인된 사용자만 삭제할 수 있습니다.'))) return;
    if (await customConfirm('이 업무를 삭제할까요?')) { db.ref('tasks/' + id).remove(); }
}

function allowDrop(ev) {
    ev.preventDefault();
    // 마우스가 위치한 가장 가까운 컬럼을 찾아 하이라이트 효과 적용
    const col = ev.target.closest('.column');
    document.querySelectorAll('.column').forEach(c => {
        if (c !== col) c.classList.remove('drag-over');
    });
    if (col && !col.classList.contains('drag-over')) col.classList.add('drag-over');
}

function drag(ev, id) {
    ev.dataTransfer.setData("text", id);
    // 애니메이션이 부드럽게 먹히도록 setTimeout 사용 (드래그 시작 즉시 투명도 적용)
    setTimeout(() => { if (ev.target && ev.target.classList) ev.target.classList.add('is-dragging'); }, 0);
}

async function drop(ev, newStatus) {
    ev.preventDefault();
    document.querySelectorAll('.column').forEach(c => c.classList.remove('drag-over'));
    const taskId = ev.dataTransfer.getData("text");
    if (taskId) {
        if (!(await checkAuth('승인된 사용자만 상태를 변경할 수 있습니다.'))) return;
        db.ref('tasks/' + taskId).update({ status: newStatus }).catch(async (error) => await customAlert("상태 변경 실패: " + error.message));
    }
}

function filterTasks() {
    const searchInput = document.getElementById('searchAssignee');
    const dateFilterInput = document.getElementById('dateFilter');
    if (!searchInput || !dateFilterInput) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const dateFilter = dateFilterInput.value;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const counts = { todo: 0, doing: 0, done: 0, week: 0, month: 0, later: 0 };

    document.querySelectorAll('.task-card').forEach(card => {
        const assignee = (card.dataset.assignee || '').toLowerCase();
        const dueDateStr = card.dataset.dueDate;
        let nameMatch = assignee.includes(searchTerm);
        let dateMatch = true;

        if (dateFilter !== 'all') {
            if (!dueDateStr) dateMatch = false;
            else {
                const taskDate = new Date(dueDateStr); taskDate.setHours(0, 0, 0, 0);
                if (dateFilter === 'today') dateMatch = taskDate <= today;
                else if (dateFilter === 'week') dateMatch = taskDate <= endOfWeek;
                else if (dateFilter === 'month') dateMatch = taskDate <= endOfMonth;
            }
        }
        if (nameMatch && dateMatch) {
            card.style.display = 'flex';
            if (card.parentElement) {
                const colId = card.parentElement.id.replace('-list', '');
                if (counts[colId] !== undefined) counts[colId]++;
            }
        } else { card.style.display = 'none'; }
    });

    Object.keys(counts).forEach(col => {
        const badge = document.getElementById(`count-${col}`);
        if (badge) badge.textContent = counts[col];
    });

    document.querySelectorAll('.calendar-task').forEach(taskEl => {
        const assignee = (taskEl.dataset.assignee || '').toLowerCase();
        if (assignee.includes(searchTerm)) taskEl.style.display = 'block';
        else taskEl.style.display = 'none';
    });

    document.querySelectorAll('.gantt-row').forEach(row => {
        const tripGroups = row.querySelectorAll('.gantt-trip-group');
        if (tripGroups.length > 0) {
            let rowHasVisibleTrip = false;
            tripGroups.forEach(bar => {
                if ((bar.dataset.assignee || '').toLowerCase().includes(searchTerm)) {
                    bar.style.display = 'flex'; rowHasVisibleTrip = true;
                } else bar.style.display = 'none';
            });
            row.style.display = rowHasVisibleTrip ? 'flex' : 'none';
        } else {
            if ((row.dataset.assignee || '').toLowerCase().includes(searchTerm)) row.style.display = 'flex';
            else row.style.display = 'none';
        }
    });

    document.querySelectorAll('.trip-card').forEach(card => {
        const assignee = (card.dataset.assignee || '').toLowerCase();
        const dateStr = card.dataset.date;
        let nameMatch = assignee.includes(searchTerm);
        let dateMatch = true;

        if (dateFilter !== 'all') {
            if (!dateStr) dateMatch = false;
            else {
                const tripDate = new Date(dateStr); tripDate.setHours(0, 0, 0, 0);
                if (dateFilter === 'today') dateMatch = tripDate <= today;
                else if (dateFilter === 'week') dateMatch = tripDate <= endOfWeek;
                else if (dateFilter === 'month') dateMatch = tripDate <= endOfMonth;
            }
        }
        if (nameMatch && dateMatch) card.style.display = 'flex';
        else card.style.display = 'none';
    });
}

let currentModalTaskId = null;
let currentModalTaskStatus = 'todo';

function setModalTaskStatus(status) {
    currentModalTaskStatus = status;
    document.querySelectorAll('.status-chip').forEach(btn => {
        btn.style.borderColor = 'var(--border-color)';
        btn.style.background = 'var(--col-bg)';
        btn.style.color = 'var(--text-main)';
    });
    const activeChip = document.getElementById('status-chip-' + status);
    if (activeChip) {
        activeChip.style.borderColor = 'var(--primary)';
        activeChip.style.background = 'var(--primary)';
        activeChip.style.color = '#FFFFFF';
    }
}

function openModal(taskId, title, description, dueDate, startDate, type = 'task') {
    currentModalTaskId = taskId;
    document.getElementById('modalTitleInput').value = title;
    document.getElementById('modalDescription').value = description || '';
    document.getElementById('modalStartDate').value = startDate || '';
    document.getElementById('modalDueDate').value = dueDate || '';

    const task = AppStore.getTasks()[taskId] || (AppStore.getExternalEvents() ? AppStore.getExternalEvents()[taskId] : null);

    const resolvedType = task && task.type ? task.type : type;
    const taskTypeSelect = document.getElementById('modalTaskType');
    if (taskTypeSelect) {
        taskTypeSelect.value = resolvedType;
    }

    currentModalTaskStatus = task && task.status ? task.status : 'todo';
    setModalTaskStatus(currentModalTaskStatus);

    document.getElementById('taskAuthorDisplay').textContent = task && task.author ? `등록: ${task.author}` : '';

    // 담당자 로드
    modalSelectedAssignees = task && task.assignee ? task.assignee.split(',').map(a => a.trim()).filter(a => a) : [];
    renderModalAssigneeTags();

    // 관리자이거나 본인이 작성한 업무, 혹은 외부 연동 일정이면 삭제 버튼 표시
    const delBtn = document.getElementById('modalDeleteBtn');
    if (delBtn) {
        const isAdmin = auth.currentUser && ADMIN_UIDS.includes(auth.currentUser.uid);
        const isAuthor = task && task.author === (AppStore.getCurrentUser() ? AppStore.getCurrentUser().displayName : '');
        const isExternal = !!(AppStore.getExternalEvents() && AppStore.getExternalEvents()[taskId]);
        delBtn.style.display = (isAdmin || isAuthor || isExternal) ? 'inline-block' : 'none';
    }

    document.getElementById('taskModal').style.display = 'flex';
}

function closeModal() { document.getElementById('taskModal').style.display = 'none'; currentModalTaskId = null; }

async function saveDescription() {
    if (!(await checkAuth('승인된 사용자만 저장할 수 있습니다.'))) return;
    if (!currentModalTaskId) return;

    const newTitle = document.getElementById('modalTitleInput').value.trim();
    if (!newTitle) return await customAlert('업무 제목을 입력해주세요.');

    const taskTypeSelect = document.getElementById('modalTaskType');
    const typeValue = taskTypeSelect ? taskTypeSelect.value : 'task';

    const isExternal = !!(AppStore.getExternalEvents() && AppStore.getExternalEvents()[currentModalTaskId]);
    const isNewTask = !isExternal && (!AppStore.getTasks() || !AppStore.getTasks()[currentModalTaskId]);
    const updateData = {
        title: newTitle,
        description: document.getElementById('modalDescription').value.trim(),
        startDate: document.getElementById('modalStartDate').value,
        dueDate: document.getElementById('modalDueDate').value,
        assignee: modalSelectedAssignees.join(', '),
        status: currentModalTaskStatus,
        type: typeValue
    };

    if (isNewTask) {
        const currentUser = auth.currentUser;
        updateData.id = currentModalTaskId;
        updateData.author = currentUser ? currentUser.displayName : '익명';
        updateData.priority = 'medium'; // 기본값: 보통
    }

    const refPath = isExternal ? 'external_events/' : 'tasks/';

    db.ref(refPath + currentModalTaskId).update(updateData).then(async () => {
        if (isExternal) {
            // Google Calendar 연동 정보가 있고 외부 일정인 경우 구글에도 업데이트 반영 시도
            if (typeof syncExternalEventToGoogleCalendar === 'function') {
                await syncExternalEventToGoogleCalendar({
                    id: currentModalTaskId,
                    title: newTitle,
                    description: updateData.description,
                    startDate: updateData.startDate,
                    dueDate: updateData.dueDate
                });
            }
        } else {
            // 담당자 지정 알림 발송
            modalSelectedAssignees.forEach(name => {
                const targetUser = Object.values(AppStore.getUsers()).find(u => u.displayName === name);
                if (targetUser) {
                    sendNotification(targetUser.uid, {
                        title: isNewTask ? "새로운 업무 할당" : "업무 담당자 지정/변경",
                        message: isNewTask ? `"${newTitle}" 업무의 담당자로 지정되었습니다.` : `"${newTitle}" 업무의 담당자 정보를 확인하세요.`,
                        type: 'task',
                        link: 'task',
                        targetId: currentModalTaskId
                    });
                }
            });
        }
        closeModal();
    }).catch(async error => await customAlert("저장 실패: " + error.message));
}

document.getElementById('taskModal').addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); saveDescription(); }
});

async function deleteCurrentTask() {
    if (!currentModalTaskId) return;
    const isExternal = !!(AppStore.getExternalEvents() && AppStore.getExternalEvents()[currentModalTaskId]);
    if (await customConfirm(isExternal ? '이 연동 일정을 완전히 삭제하시겠습니까?' : '이 업무를 완전히 삭제하시겠습니까?')) {
        const refPath = isExternal ? 'external_events/' : 'tasks/';
        db.ref(refPath + currentModalTaskId).remove().then(async () => {
            if (isExternal && typeof deleteGoogleCalendarEvent === 'function') {
                await deleteGoogleCalendarEvent(currentModalTaskId);
            }
            closeModal();
        }).catch(async error => await customAlert("삭제 실패: " + error.message));
    }
}

function openCommonCalendarModal() { document.getElementById('commonCalendarModal').style.display = 'flex'; renderModalCalendar(); }
function closeCommonCalendarModal() { document.getElementById('commonCalendarModal').style.display = 'none'; }
function changeModalMonth(offset) { currentDateForModalCalendar.setMonth(currentDateForModalCalendar.getMonth() + offset); renderModalCalendar(); }

function buildCalendarGrid(gridId, titleId, dateObj, isMyPage, renderCallback) {
    const grid = document.getElementById(gridId); if (!grid) return; grid.innerHTML = '';

    // 마이페이지인 경우 미니 스타일 클래스 추가
    if (isMyPage) grid.classList.add('mypage-calendar-grid');
    else grid.classList.remove('mypage-calendar-grid');

    const year = dateObj.getFullYear(), month = dateObj.getMonth();

    // [안전 장치] 제목 엘리먼트가 있을 때만 텍스트 설정
    const titleEl = document.getElementById(titleId);
    if (titleEl) titleEl.textContent = `${year}년 ${month + 1}월`;

    const firstDay = new Date(year, month, 1).getDay(), daysInMonth = new Date(year, month + 1, 0).getDate();
    ['일', '월', '화', '수', '목', '금', '토'].forEach((day, index) => {
        const h = document.createElement('div'); h.className = `calendar-day-header ${index === 0 ? 'sun' : index === 6 ? 'sat' : ''}`;
        if (isMyPage) { h.style.padding = '0.4rem'; h.style.fontSize = '0.8rem'; }
        h.textContent = day; grid.appendChild(h);
    });

    let currentDay = 1, nextMonthDay = 1, today = new Date();
    for (let i = 0; i < 42; i++) {
        const cell = document.createElement('div'); cell.className = 'calendar-day' + (isMyPage ? ' mypage-calendar-day' : '');
        let cellDate;
        if (i < firstDay) { cell.classList.add('other-month'); const d = new Date(year, month, 0).getDate() - firstDay + i + 1; cell.innerHTML = `<div class="calendar-date"${isMyPage ? ' style="font-size:0.75rem;"' : ''}>${d}</div>`; cellDate = new Date(year, month - 1, d); }
        else if (currentDay <= daysInMonth) { if (year === today.getFullYear() && month === today.getMonth() && currentDay === today.getDate()) cell.classList.add('today'); cell.innerHTML = `<div class="calendar-date"${isMyPage ? ' style="font-size:0.75rem;"' : ''}>${currentDay}</div>`; cellDate = new Date(year, month, currentDay); currentDay++; }
        else { cell.classList.add('other-month'); cell.innerHTML = `<div class="calendar-date"${isMyPage ? ' style="font-size:0.75rem;"' : ''}>${nextMonthDay}</div>`; cellDate = new Date(year, month + 1, nextMonthDay); nextMonthDay++; }

        const dateString = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;

        // 날짜 셀 클릭 시 상세 보기 연결
        cell.onclick = (e) => {
            // 내부 일정 바(Bar) 클릭 시 중복 실행 방지
            if (e.target.classList.contains('calendar-task')) return;
            showDayDetail(dateString);
        };

        renderCallback(cell, dateString, !cell.classList.contains('other-month'));
        grid.appendChild(cell);
    }
}

/**
 * [신규] 독립 메뉴용 캘린더 상태 및 로직
 */
let currentDateForTabCalendar = new Date();
let currentCalendarFilter = 'all';

function renderTabCalendar() {
    const gridId = 'calendar-grid-main';
    const grid = document.getElementById(gridId);
    if (!grid) return;

    // 즉시 그리드를 비우고 로딩 준비 (잔상 제거)
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px;">일정을 불러오고 있습니다...</div>';

    // [신규] 연도/월 선택창 업데이트 및 동기화
    populateYearMonthSelectors();

    // 1. 최신 데이터 정렬 (AppStore에서 직접 참조)
    const tasksArray = Object.values(AppStore.getTasks() || {});
    const tripsArray = Object.values(AppStore.getTrips() || {}).map(t => {
        let s = t.date; let e = t.date;
        if (t.date && t.date.includes(' to ')) { const p = t.date.split(' to '); s = p[0]; e = p[1]; }
        return { ...t, isTrip: true, title: `[출장] ${t.name}`, startDate: s, dueDate: e };
    });
    const leavesArray = Object.values(AppStore.getLeaves() || {}).filter(l => l.status === 'approved').map(l => ({ id: l.id, isLeave: true, title: `[휴가] ${l.userName}`, assignee: l.userName, startDate: l.date, dueDate: l.date }));
    const externalArray = Object.values(AppStore.getExternalEvents() || {}).map(e => ({ ...e, title: e.title ? e.title.replace(/🌐\s*/g, '') : e.title }));

    // 2. 필터 적용
    let filtered = [];
    if (currentCalendarFilter === 'all') {
        filtered = [...tasksArray, ...tripsArray, ...leavesArray, ...externalArray];
    } else if (currentCalendarFilter === 'task') {
        filtered = tasksArray.filter(t => t.type !== 'schedule');
    } else if (currentCalendarFilter === 'schedule') {
        filtered = tasksArray.filter(t => t.type === 'schedule');
    } else if (currentCalendarFilter === 'trip') {
        filtered = tripsArray;
    } else if (currentCalendarFilter === 'leave') {
        filtered = leavesArray;
    } else if (currentCalendarFilter === 'external') {
        filtered = externalArray;
    }

    // 3. 그리드 생성
    buildCalendarGrid(gridId, null, currentDateForTabCalendar, false, (cell, dateString) => {
        // 해당 날짜에 포함되는 모든 일정 필터링 (정확 일치 + 범위 포함)
        filtered.filter(item => {
            // 정확 일치 (원본 로직 - 안정적)
            if (item.dueDate === dateString || item.date === dateString || item.startDate === dateString) return true;
            // 범위 체크 (시작일~종료일 사이의 날짜도 포함)
            if (item.startDate && item.dueDate && item.startDate !== item.dueDate) {
                const t = new Date(dateString).setHours(0, 0, 0, 0);
                const s = new Date(item.startDate).setHours(0, 0, 0, 0);
                const e = new Date(item.dueDate).setHours(0, 0, 0, 0);
                return t >= s && t <= e;
            }
            return false;
        }).forEach(task => {
            const el = document.createElement('div');
            el.className = 'calendar-task';
            el.title = task.title;

            let statusIcon = task.isLeave ? '🌴 ' : (task.isTrip ? '⚑ ' : (task.isExternal ? '🌐 ' : (task.type === 'schedule' ? '📅 ' : (task.status === 'done' ? '✓ ' : ''))));

            // [신규] 일정 충돌 검사 및 배지 표시
            const assignee = task.assignee || '미지정';
            const hasConflict = (task.isTrip || (!task.isLeave && !task.isExternal && task.type !== 'schedule')) &&
                typeof checkTripTaskConflicts === 'function' &&
                checkTripTaskConflicts(assignee, dateString);

            if (hasConflict) {
                statusIcon = '🚨 ' + statusIcon;
                el.title = `[🚨 일정 충돌 경고: 출장과 업무 기한 중복] ${task.title}`;
                el.style.border = '2px solid var(--danger)';
                el.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.6)';
            }

            el.textContent = statusIcon + task.title;

            // 타입 및 우선순위별 스타일 클래스 바인딩 (인라인 백그라운드 제거)
            if (task.isLeave) el.classList.add('task-leave');
            else if (task.isTrip) el.classList.add('task-trip');
            else if (task.isExternal) el.classList.add('task-external');
            else if (task.type === 'schedule') el.classList.add('task-schedule');
            else {
                const priorityClass = task.priority === 'high' ? 'task-high' : (task.priority === 'low' ? 'task-low' : 'task-medium');
                el.classList.add(priorityClass);
            }
            if (task.status === 'done' && !task.isTrip) el.classList.add('task-done-style');

            el.onclick = (e) => {
                e.stopPropagation();
                if (task.isLeave) openLeaveDetailModal(task.id);
                else if (task.isTrip) openTripModal(task.id, task.name, task.date, task.assignee, task.contact, task.address, task.scheduleUrl, task.schedulePath, task.qrUrl || '', task.qrPath || '', task.roomType, task.bookedHotel);
                else if (task.isExternal) {
                    openModal(task.id, task.title, task.description || '', task.dueDate, task.startDate, 'external');
                }
                else openModal(task.id, task.title, task.description, task.dueDate, task.startDate);
            };
            cell.appendChild(el);
        });
    });
}

function setCalendarFilter(filter, btn) {
    currentCalendarFilter = filter;

    // 버튼 UI 업데이트
    document.querySelectorAll('.cal-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    renderTabCalendar();
}

function changeCalendarMonth(delta) {
    currentDateForTabCalendar.setMonth(currentDateForTabCalendar.getMonth() + delta);
    renderTabCalendar();
}

/**
 * 연도/월 선택기(Picker) 생성 및 업데이트 (안정성 강화)
 */
function populateYearMonthSelectors() {
    const yearSelect = document.getElementById('calendar-year-select');
    const monthSelect = document.getElementById('calendar-month-select');
    if (!yearSelect || !monthSelect) return;

    const currentYear = currentDateForTabCalendar.getFullYear();
    const currentMonth = currentDateForTabCalendar.getMonth();

    // [버그 수정] 매번 연도 목록을 현재 날짜 기준 +/- 5년으로 동적 갱신
    yearSelect.innerHTML = '';
    for (let y = currentYear - 5; y <= currentYear + 5; y++) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = `${y}년`;
        yearSelect.appendChild(opt);
    }
    yearSelect.value = currentYear;

    // 월 목록 생성 (최초 1회만 생성으로 유지)
    if (monthSelect.options.length === 0) {
        for (let m = 0; m < 12; m++) {
            const opt = document.createElement('option');
            opt.value = m; opt.textContent = `${m + 1}월`;
            monthSelect.appendChild(opt);
        }
    }
    monthSelect.value = currentMonth;
}

/**
 * 선택한 연도/월로 즉시 이동
 */
function jumpToSelectedDate() {
    const yearEl = document.getElementById('calendar-year-select');
    const monthEl = document.getElementById('calendar-month-select');
    if (!yearEl || !monthEl) return;

    const year = parseInt(yearEl.value);
    const month = parseInt(monthEl.value);

    currentDateForTabCalendar = new Date(year, month, 1);
    renderTabCalendar();
}

/**
 * 특정 날짜의 모든 일정을 모아 보여주는 상세 창 제어
 */
function showDayDetail(dateString) {
    const overlay = document.getElementById('day-detail-overlay');
    const listEl = document.getElementById('day-detail-list');
    const dateText = document.getElementById('selected-date-text');
    const dayLabel = document.getElementById('selected-day-label');

    if (!overlay || !listEl) return;

    selectedDateForCreation = dateString;

    // 1. 날짜 텍스트 설정
    const dateObj = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

    dateText.textContent = dateObj.toLocaleDateString('ko-KR', options);
    dayLabel.textContent = dayNames[dateObj.getDay()];

    // 2. 해당 날짜 일정 필터링 (업무, 출장, 휴가, 외부 연동)
    const tasks = Object.values(AppStore.getTasks() || {}).filter(t => t.dueDate === dateString || t.startDate === dateString);
    const trips = Object.values(AppStore.getTrips() || {}).filter(t => {
        let s = t.date; let e = t.date;
        if (t.date && t.date.includes(' to ')) { const p = t.date.split(' to '); s = p[0]; e = p[1]; }
        return dateString >= s && dateString <= e;
    });
    const leaves = Object.values(AppStore.getLeaves() || {}).filter(l => l.date === dateString && l.status === 'approved');
    const externals = Object.values(AppStore.getExternalEvents() || {}).map(e => ({ ...e, title: e.title ? e.title.replace(/🌐\s*/g, '') : e.title })).filter(e => e.dueDate === dateString || e.startDate === dateString);

    listEl.innerHTML = '';

    const combined = [
        ...tasks.map(t => ({ ...t, type: t.type || 'task' })),
        ...trips.map(t => ({ ...t, type: 'trip', title: `[출장] ${t.name}` })),
        ...leaves.map(l => ({ ...l, type: 'leave', title: `[휴가] ${l.userName}` })),
        ...externals.map(e => ({ ...e, type: 'external' }))
    ];

    if (combined.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">이 날은 등록된 일정이 없습니다.</div>';
    } else {
        combined.forEach(item => {
            const div = document.createElement('div');
            div.className = 'day-item';

            let icon = 'event_note';
            let color = '#4F46E5';
            let category = '업무';

            if (item.type === 'trip') { icon = 'flight_takeoff'; color = '#8B5CF6'; category = '출장'; }
            else if (item.type === 'leave') { icon = 'beach_access'; color = '#10B981'; category = '휴가'; }
            else if (item.type === 'external') { icon = 'sync'; color = '#2DB400'; category = '외부 연동'; }
            else if (item.type === 'schedule') { icon = 'calendar_month'; color = '#F43F5E'; category = '일정'; }

            // 일정 시간 파싱 및 제목 클렌징 (예: "[10:00] 제목" -> "오전/오후 10:00" & "제목")
            let timeText1 = "종일";
            let timeText2 = "";
            let displayTitle = item.title || "";

            const timeRegex = /\[(\d{2}):(\d{2})\]/;
            const match = displayTitle.match(timeRegex);
            if (match) {
                const hour = parseInt(match[1]);
                const minute = match[2];
                const ampm = hour >= 12 ? "오후" : "오전";
                const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);

                timeText1 = ampm;
                timeText2 = `${displayHour}:${minute}`;

                displayTitle = displayTitle.replace(timeRegex, "").trim();
            }

            // 일정 충돌 검증 및 상세 정보 바인딩
            const assignee = item.assignee || item.userName || '';
            const hasConflict = (item.type === 'task' || item.type === 'trip') &&
                typeof checkTripTaskConflicts === 'function' &&
                checkTripTaskConflicts(assignee, dateString);

            let conflictMsgHtml = '';
            if (hasConflict) {
                const conflictDetails = getConflictingItems(assignee, dateString);
                const taskTitles = conflictDetails.tasks.map(t => `"${t.title}"`).join(', ');
                const tripTitles = conflictDetails.trips.map(t => `"${t.name}"`).join(', ');
                conflictMsgHtml = `<div style="color:var(--danger); font-size:0.75rem; font-weight:bold; margin-top:6px; display:flex; align-items:center; gap:4px; line-height:1.4;"><span class="material-symbols-rounded" style="font-size:1.15rem; vertical-align:middle; color:var(--danger);">warning</span> 일정 충돌 경고: [업무] ${taskTitles} 와(과) [출장] ${tripTitles} 가 겹칩니다!</div>`;

                div.style.border = '1px solid #FCA5A5';
                div.style.backgroundColor = '#FEF2F2';
            }

            div.innerHTML = `
                <div class="day-item-time-col">
                    <div class="time-primary">${timeText1}</div>
                    ${timeText2 ? `<div class="time-secondary">${timeText2}</div>` : ''}
                </div>
                <div class="day-item-bar" style="background-color: ${color};"></div>
                <div class="day-item-icon" style="background-color: ${color}20; color: ${color};">
                    <span class="material-symbols-rounded">${icon}</span>
                </div>
                <div class="day-item-info" style="flex:1;">
                    <div class="day-item-title">${displayTitle}</div>
                    <div class="day-item-meta">${category} • ${item.assignee || item.userName || '전체'}</div>
                    ${conflictMsgHtml}
                </div>
                <span class="material-symbols-rounded" style="color:var(--border-color);">chevron_right</span>
            `;

            div.onclick = () => {
                closeDayDetail();
                if (item.type === 'leave') openLeaveDetailModal(item.id);
                else if (item.type === 'trip') openTripModal(item.id, item.name, item.date, item.assignee, item.contact, item.address, item.scheduleUrl, item.schedulePath, item.qrUrl || '', item.qrPath || '', item.roomType, item.bookedHotel);
                else if (item.type === 'task' || item.type === 'schedule') openModal(item.id, item.title, item.description, item.dueDate, item.startDate);
                else if (item.type === 'external') {
                    openModal(item.id, item.title, item.description || '', item.dueDate, item.startDate, 'external');
                }
            };

            listEl.appendChild(div);
        });
    }

    overlay.style.display = 'flex';
}

function closeDayDetail() {
    const overlay = document.getElementById('day-detail-overlay');
    if (overlay) overlay.style.display = 'none';
}

function addScheduleFromCalendar(type) {
    if (!selectedDateForCreation) return;
    closeDayDetail();

    if (type === 'task') {
        const newKey = db.ref('tasks').push().key;
        openModal(newKey, '', '', selectedDateForCreation, selectedDateForCreation, 'schedule');

        // flatpickr의 날짜 선택 값을 명시적으로 갱신
        setTimeout(() => {
            const startInput = document.getElementById('modalStartDate');
            const dueInput = document.getElementById('modalDueDate');
            if (startInput && startInput._flatpickr) {
                startInput._flatpickr.setDate(selectedDateForCreation);
            }
            if (dueInput && dueInput._flatpickr) {
                dueInput._flatpickr.setDate(selectedDateForCreation);
            }
        }, 150);
    } else if (type === 'trip') {
        if (typeof openTripModal === 'function') {
            openTripModal(null, '', selectedDateForCreation);
        }

        // flatpickr의 날짜 선택 값을 명시적으로 갱신
        setTimeout(() => {
            const tripDateInput = document.getElementById('tripDate');
            if (tripDateInput && tripDateInput._flatpickr) {
                tripDateInput._flatpickr.setDate(selectedDateForCreation);
            }
        }, 150);
    }
}

function renderModalCalendar() {
    const priorityWeight = { 'high': 3, 'medium': 2, 'low': 1 };
    const tasksArray = Object.values(AppStore.getTasks()).sort((a, b) => (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2));
    const tripsArray = Object.values(AppStore.getTrips()).map(t => {
        let reqGender = t.requiredGender || (t.requiresFemale ? 'female' : 'any');
        let badge = reqGender === 'female' ? ' 👩‍💼' : (reqGender === 'male' ? ' 👨‍💼' : '');
        let reqPers = t.requiredPersonnel || 1;
        let s = t.date; let e = t.date;
        if (t.date && t.date.includes(' to ')) { const p = t.date.split(' to '); s = p[0]; e = p[1]; }
        return { ...t, isTrip: true, title: `[출장] ${t.name} [${reqPers}명]${badge}`, startDate: s, dueDate: e, status: 'todo' };
    });
    const leavesArray = Object.values(AppStore.getLeaves()).filter(l => l.status === 'approved').map(l => ({ id: l.id, uid: l.uid, isLeave: true, title: `[휴가] ${l.userName}`, name: `[휴가] ${l.userName}`, assignee: l.userName, startDate: l.date, dueDate: l.date, status: 'todo', priority: 'medium' }));

    // 외부 일정 가져오기
    const externalArray = Object.values(AppStore.getExternalEvents()).map(e => ({ ...e, title: e.title ? e.title.replace(/🌐\s*/g, '') : e.title }));

    const combinedArray = [...tasksArray, ...tripsArray, ...leavesArray, ...externalArray];

    buildCalendarGrid('modal-calendar-grid', 'modal-calendar-month-year', currentDateForModalCalendar, false, (cell, dateString) => {
        const dayItems = [];
        combinedArray.forEach(task => {
            let isIncluded = false;
            if (task.isTrip && task.startDate && task.dueDate) {
                if (dateString >= task.startDate && dateString <= task.dueDate) isIncluded = true;
            } else {
                if (task.dueDate === dateString || task.date === dateString || task.startDate === dateString) isIncluded = true;
            }
            if (isIncluded) {
                dayItems.push(task);
                const el = document.createElement('div'); el.className = 'calendar-task'; el.title = task.title;
                let statusIcon = task.isLeave ? '🌴 ' : (task.isTrip ? '⚑ ' : (task.isExternal ? '🌐 ' : (task.type === 'schedule' ? '📅 ' : (!task.isTrip && task.status === 'done' ? '✓ ' : ''))));

                // [신규] 일정 충돌 감지 및 UI 표시
                const assignee = task.assignee || '미지정';
                const hasConflict = (task.isTrip || (!task.isLeave && !task.isExternal && task.type !== 'schedule')) &&
                    typeof checkTripTaskConflicts === 'function' &&
                    checkTripTaskConflicts(assignee, dateString);

                if (hasConflict) {
                    statusIcon = '🚨 ' + statusIcon;
                    el.title = `[🚨 일정 충돌 경고: 출장과 업무 기한 중복] ${task.title}`;
                    el.style.border = '2px solid var(--danger)';
                    el.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.6)';
                }

                el.textContent = statusIcon + task.title;

                // 타입 및 우선순위별 스타일 클래스 바인딩 (인라인 백그라운드 제거)
                if (task.isLeave) el.classList.add('task-leave');
                else if (task.isTrip) el.classList.add('task-trip');
                else if (task.isExternal) el.classList.add('task-external');
                else if (task.type === 'schedule') el.classList.add('task-schedule');
                else {
                    const priorityClass = task.priority === 'high' ? 'task-high' : (task.priority === 'low' ? 'task-low' : 'task-medium');
                    el.classList.add(priorityClass);
                }
                if (task.status === 'done' && !task.isTrip) el.classList.add('task-done-style');

                el.onclick = () => {
                    if (task.isLeave) openLeaveDetailModal(task.id);
                    else if (task.isTrip) { closeCommonCalendarModal(); openTripModal(task.id, task.name, task.date, task.assignee, task.contact, task.address, task.scheduleUrl, task.schedulePath, task.qrUrl || '', task.qrPath || '', task.roomType, task.bookedHotel); }
                    else if (task.isExternal) {
                        closeCommonCalendarModal();
                        openModal(task.id, task.title, task.description || '', task.dueDate, task.startDate, 'external');
                    }
                    else { closeCommonCalendarModal(); openModal(task.id, task.title, task.description, task.dueDate, task.startDate); }
                };
                cell.appendChild(el);
            }
        });
        const dateHeader = cell.querySelector('.calendar-date');
        if (dateHeader) {
            dateHeader.classList.add('clickable-date');
            dateHeader.title = '클릭하여 전체 일정 보기';
            dateHeader.onclick = (e) => {
                e.stopPropagation();
                if (dayItems.length > 0) openTripGroupModal(`🗓 ${dateString} 전체 일정`, dayItems);
                else showToast('이 날짜에는 등록된 일정이 없습니다.', 'info');
            };
        }
    });
}

function toggleViewMode() {
    AppStore.setViewMode(document.getElementById('viewMode').value);
    ['board-status', 'board-timeline', 'board-calendar', 'board-gantt'].forEach(id => document.getElementById(id).style.display = 'none');
    document.getElementById(`board-${AppStore.getViewMode()}`).style.display = AppStore.getViewMode() === 'gantt' ? 'block' : 'flex';
}
function changeMonth(offset) { currentDateForCalendar.setMonth(currentDateForCalendar.getMonth() + offset); renderTasks(); }
function changeGanttMonth(offset) { currentDateForGantt.setMonth(currentDateForGantt.getMonth() + offset); renderTasks(); }

function renderCalendar(tasksArray) {
    buildCalendarGrid('calendar-grid', 'calendar-month-year', currentDateForCalendar, false, (cell, dateString) => {
        const dayItems = [];
        tasksArray.forEach(task => {
            let isIncluded = false;
            if (task.isTrip && task.startDate && task.dueDate) {
                if (dateString >= task.startDate && dateString <= task.dueDate) isIncluded = true;
            } else {
                if (task.dueDate === dateString || task.date === dateString || task.startDate === dateString) isIncluded = true;
            }
            if (isIncluded) {
                dayItems.push(task);
                const el = document.createElement('div'); el.className = 'calendar-task'; el.title = task.title; el.dataset.assignee = task.assignee || '미지정';

                // [신규] 일정 충돌 검증 및 배지 표시
                const assignee = task.assignee || '미지정';
                const hasConflict = (task.isTrip || (!task.isLeave && !task.isExternal && task.type !== 'schedule')) &&
                    typeof checkTripTaskConflicts === 'function' &&
                    checkTripTaskConflicts(assignee, dateString);

                let warningIconHtml = '';
                if (hasConflict) {
                    warningIconHtml = '<span class="material-symbols-rounded" style="font-size:1.1em; margin-right:4px; color:#EF4444; font-weight:bold; vertical-align:middle;">warning</span>';
                    el.title = `[🚨 일정 충돌 경고: 출장과 업무 기한 중복] ${task.title}`;
                    el.style.border = '2px solid var(--danger)';
                    el.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.6)';
                }

                el.innerHTML = warningIconHtml + (task.isLeave ? '<span class="material-symbols-rounded" style="font-size:1.1em; margin-right:4px;">beach_access</span>' :
                    (task.isTrip ? '<span class="material-symbols-rounded" style="font-size:1.1em; margin-right:4px;">flight_takeoff</span>' :
                        (task.isExternal ? '<span class="material-symbols-rounded" style="font-size:1.1em; margin-right:4px;">sync</span>' :
                            (task.type === 'schedule' ? '<span class="material-symbols-rounded" style="font-size:1.1em; margin-right:4px;">calendar_month</span>' :
                                (task.status === 'done' ? '<span class="material-symbols-rounded" style="font-size:1.1em; margin-right:4px;">check_circle</span>' : '')))));
                el.appendChild(document.createTextNode(task.title));

                // 타입 및 우선순위별 스타일 클래스 바인딩 (인라인 백그라운드 제거)
                if (task.isLeave) el.classList.add('task-leave');
                else if (task.isTrip) el.classList.add('task-trip');
                else if (task.isExternal) el.classList.add('task-external');
                else if (task.type === 'schedule') el.classList.add('task-schedule');
                else {
                    const priorityClass = task.priority === 'high' ? 'task-high' : (task.priority === 'low' ? 'task-low' : 'task-medium');
                    el.classList.add(priorityClass);
                }
                if (task.status === 'done' && !task.isTrip) el.classList.add('task-done-style');

                el.onclick = () => {
                    if (task.isLeave) openLeaveDetailModal(task.id);
                    else if (task.isTrip) openTripModal(task.id, task.name, task.date, task.assignee, task.contact, task.address, task.scheduleUrl, task.schedulePath, task.qrUrl || '', task.qrPath || '', task.roomType, task.bookedHotel);
                    else if (task.isExternal) {
                        openModal(task.id, task.title, task.description || '', task.dueDate, task.startDate, 'external');
                    }
                    else openModal(task.id, task.title, task.description, task.dueDate, task.startDate);
                };
                cell.appendChild(el);
            }
        });
        const dateHeader = cell.querySelector('.calendar-date');
        if (dateHeader) {
            dateHeader.classList.add('clickable-date');
            dateHeader.title = '클릭하여 전체 일정 보기';
            dateHeader.onclick = (e) => {
                e.stopPropagation();
                if (dayItems.length > 0) openTripGroupModal(`🗓 ${dateString} 전체 일정`, dayItems);
                else showToast('이 날짜에는 등록된 일정이 없습니다.', 'info');
            };
        }
    });
}

function openTripGroupModal(titleText, items) {
    document.getElementById('tripGroupTitle').textContent = titleText;
    const listEl = document.getElementById('tripGroupList'); listEl.innerHTML = '';
    items.forEach(item => {
        const li = document.createElement('li'); li.style.cursor = 'pointer';
        let icon = item.isLeave ? 'beach_access' : (item.isTrip ? 'flight_takeoff' : 'radio_button_unchecked');
        if (!item.isTrip && !item.isLeave) { if (item.status === 'doing') icon = 'pending'; if (item.status === 'done') icon = 'check_circle'; }
        const color = item.isLeave ? '#10B981' : (item.isTrip ? '#8B5CF6' : 'var(--text-main)');
        const titleToDisplay = item.isLeave || item.isTrip ? item.name : item.title;
        const subtitle = item.isLeave || item.isTrip ? `<span class="material-symbols-rounded" style="font-size:1.1em;">person</span> ${item.assignee || '미지정'} | <span class="material-symbols-rounded" style="font-size:1.1em;">location_on</span> ${item.address || '주소 미입력'}` : `<span class="material-symbols-rounded" style="font-size:1.1em;">person</span> ${item.assignee || '미지정'} | 중요도: ${item.priority === 'high' ? '높음' : (item.priority === 'low' ? '낮음' : '보통')}`;

        li.innerHTML = `<div style="display: flex; flex-direction: column; gap: 0.3rem;"><span style="color: ${color}; font-size: 0.95rem; font-weight: 600; display:flex; align-items:center;"><span class="material-symbols-rounded" style="font-size:1.2em; margin-right:4px;">${icon}</span> ${titleToDisplay}</span><span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">${subtitle}</span></div>`;
        li.onclick = () => {
            if (item.isLeave) openLeaveDetailModal(item.id);
            else if (item.isTrip) { closeTripGroupModal(); openTripModal(item.id, item.name, item.date, item.assignee, item.contact, item.address, item.scheduleUrl, item.schedulePath, item.qrUrl || '', item.qrPath || '', item.roomType, item.bookedHotel); }
            else { closeTripGroupModal(); openModal(item.id, item.title, item.description, item.dueDate, item.startDate); }
        };
        listEl.appendChild(li);
    });
    document.getElementById('tripGroupModal').style.display = 'flex';
}
function closeTripGroupModal() { document.getElementById('tripGroupModal').style.display = 'none'; }

function renderGantt(tasksArray) {
    const header = document.getElementById('gantt-header'), body = document.getElementById('gantt-body');
    const todayTime = new Date().setHours(0, 0, 0, 0);
    header.innerHTML = '<div class="gantt-row-label" style="border-right: 2px solid var(--border-color); border-bottom: none; background-color: var(--card-bg); z-index: 20;">업무명</div>';
    body.innerHTML = '';

    const year = currentDateForGantt.getFullYear(), month = currentDateForGantt.getMonth();
    document.getElementById('gantt-month-year').textContent = `${year}년 ${month + 1}월`;
    const startDay = new Date(year, month, 1), endDay = new Date(year, month + 1, 0);
    const timelineWidth = endDay.getDate() * 40;

    for (let i = 1; i <= endDay.getDate(); i++) {
        const d = new Date(year, month, i), dayEl = document.createElement('div');
        dayEl.className = 'gantt-day'; if (d.setHours(0, 0, 0, 0) === todayTime) dayEl.classList.add('today');
        dayEl.textContent = i; header.appendChild(dayEl);
    }

    const undatedItems = tasksArray.filter(t => t.isTrip ? !t.startDate : (t.isLeave ? false : (!t.startDate && !t.dueDate)));
    const datedTrips = tasksArray.filter(t => t.isTrip && t.startDate);
    const datedLeaves = tasksArray.filter(t => t.isLeave && t.startDate);
    const datedExternal = tasksArray.filter(t => t.isExternal && (t.startDate || t.dueDate));
    const datedTasks = tasksArray.filter(t => !t.isTrip && !t.isLeave && !t.isExternal && (t.startDate || t.dueDate));

    if (undatedItems.length > 0) {
        const row = document.createElement('div'); row.className = 'gantt-row';
        const label = document.createElement('div'); label.className = 'gantt-row-label'; label.style.color = 'var(--text-muted)'; label.innerHTML = '<span class="material-symbols-rounded" style="font-size:1.2em; margin-right:6px;">calendar_today</span> 날짜 미지정 (통합)'; row.appendChild(label);
        const barArea = document.createElement('div'); barArea.className = 'gantt-bar-area'; barArea.style.width = `${timelineWidth}px`;
        const bar = document.createElement('div'); bar.className = 'gantt-bar gantt-trip-group'; bar.dataset.assignee = undatedItems.map(t => t.assignee || '').join(' ').toLowerCase();
        bar.style.left = `${Math.round((todayTime - startDay.getTime()) / 86400000) * 40}px`; bar.style.width = `40px`; bar.style.backgroundColor = 'var(--text-muted)';
        bar.title = undatedItems.map(t => `${t.isTrip || t.isLeave ? t.name : t.title} (${t.assignee || '미지정'})`).join('\n');
        if (undatedItems.length > 1) { bar.textContent = `${undatedItems.length}건`; bar.onclick = () => openTripGroupModal(`🗓 날짜 미지정 목록`, undatedItems); }
        else { bar.textContent = undatedItems[0].assignee || '미지정'; bar.onclick = () => undatedItems[0].isTrip ? openTripModal(undatedItems[0].id, undatedItems[0].name, undatedItems[0].date, undatedItems[0].assignee, undatedItems[0].contact, undatedItems[0].address, undatedItems[0].scheduleUrl, undatedItems[0].schedulePath, undatedItems[0].qrUrl || '', undatedItems[0].qrPath || '', undatedItems[0].roomType, undatedItems[0].bookedHotel) : openModal(undatedItems[0].id, undatedItems[0].title, undatedItems[0].description, undatedItems[0].dueDate, undatedItems[0].startDate); }
        barArea.appendChild(bar); row.appendChild(barArea); body.appendChild(row);
    }

    datedTasks.forEach(task => {
        let startT = todayTime; if (task.startDate) { const p = new Date(task.startDate).setHours(0, 0, 0, 0); if (!isNaN(p)) startT = p; }
        let dueT = startT; if (task.dueDate) { const p = new Date(task.dueDate).setHours(0, 0, 0, 0); if (!isNaN(p)) dueT = p; }
        if (dueT < startT) dueT = startT;
        const startIndex = Math.round((startT - startDay.getTime()) / 86400000);
        const duration = Math.round((dueT - startT) / 86400000) + 1;

        const row = document.createElement('div'); row.className = 'gantt-row'; row.dataset.assignee = task.assignee || '미지정';
        const label = document.createElement('div'); label.className = 'gantt-row-label';
        let statusIcon = task.status === 'todo' ? 'radio_button_unchecked' : (task.status === 'doing' ? 'pending' : 'check_circle');
        label.innerHTML = `<span class="material-symbols-rounded" style="font-size:1.1em; margin-right:4px;">${statusIcon}</span>`; label.appendChild(document.createTextNode(task.title)); label.title = task.title;

        const barArea = document.createElement('div'); barArea.className = 'gantt-bar-area'; barArea.style.width = `${timelineWidth}px`;
        const bar = document.createElement('div'); bar.className = 'gantt-bar'; bar.style.left = `${startIndex * 40}px`; bar.style.width = `${duration * 40}px`;
        bar.style.backgroundColor = task.priority === 'high' ? 'var(--danger)' : (task.priority === 'low' ? '#10B981' : '#F59E0B');
        if (task.status === 'done') bar.classList.add('task-done-style');
        bar.textContent = task.assignee || '미지정';

        // 마우스 오버 시 표시될 상세 툴팁(title) 추가
        let priorityLabel = task.priority === 'high' ? '높음' : (task.priority === 'low' ? '낮음' : '보통');
        let statusLabel = task.status === 'todo' ? '해야 할 일' : (task.status === 'doing' ? '진행 중' : '완료');
        let tooltipText = `[${statusLabel}] ${task.title}\n담당자: ${task.assignee || '미지정'}\n중요도: ${priorityLabel}\n일정: ${task.startDate || '미정'} ~ ${task.dueDate || '미정'}`;
        if (task.description) tooltipText += `\n상세: ${task.description}`;
        bar.title = tooltipText;

        bar.onclick = () => openModal(task.id, task.title, task.description, task.dueDate, task.startDate);
        barArea.appendChild(bar); row.appendChild(label); row.appendChild(barArea); body.appendChild(row);
    });

    // 외부 일정 렌더링
    datedExternal.forEach(task => {
        let startT = todayTime; if (task.startDate) { const p = new Date(task.startDate).setHours(0, 0, 0, 0); if (!isNaN(p)) startT = p; }
        let dueT = startT; if (task.dueDate) { const p = new Date(task.dueDate).setHours(0, 0, 0, 0); if (!isNaN(p)) dueT = p; }
        const startIndex = Math.round((startT - startDay.getTime()) / 86400000);
        const duration = Math.round((dueT - startT) / 86400000) + 1;

        const row = document.createElement('div'); row.className = 'gantt-row'; row.dataset.assignee = '외부 일정';
        const label = document.createElement('div'); label.className = 'gantt-row-label';
        label.innerHTML = `<span class="material-symbols-rounded" style="font-size:1.1em; margin-right:4px; color:#2DB400;">sync</span> ${task.title}`;
        label.title = task.title;

        const barArea = document.createElement('div'); barArea.className = 'gantt-bar-area'; barArea.style.width = `${timelineWidth}px`;
        const bar = document.createElement('div'); bar.className = 'gantt-bar';
        bar.style.left = `${startIndex * 40}px`; bar.style.width = `${duration * 40}px`;
        bar.style.backgroundColor = '#2DB400';
        bar.textContent = '외부 연동';
        bar.title = `${task.title}\n일정: ${task.startDate || '미정'} ~ ${task.dueDate || '미정'}\n상세: 구글/네이버 동기화 일정입니다.`;
        bar.onclick = () => showToast('외부 일정은 원본 앱에서 수정 가능합니다.', 'info');

        barArea.appendChild(bar); row.appendChild(label); row.appendChild(barArea); body.appendChild(row);
    });
}

function renderTasks() {
    ['todo-list', 'doing-list', 'done-list', 'week-list', 'month-list', 'later-list'].forEach(id => { if (document.getElementById(id)) document.getElementById(id).innerHTML = ''; });
    const tasksData = AppStore.getTasks();
    if (!tasksData) return;

    const priorityWeight = { 'high': 3, 'medium': 2, 'low': 1 };
    const tasksArray = Object.values(tasksData).sort((a, b) => (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2));
    const activeTasks = tasksArray.filter(t => t.type !== 'schedule');

    const progressFill = document.getElementById('progress-fill'), progressText = document.getElementById('progress-text');
    if (progressFill && progressText) {
        const p = activeTasks.length === 0 ? 0 : Math.round((activeTasks.filter(t => t.status === 'done').length / activeTasks.length) * 100);
        progressFill.style.width = p + '%'; progressText.textContent = p + '%';
    }

    const tripsArray = Object.values(AppStore.getTrips()).map(t => {
        let reqGender = t.requiredGender || (t.requiresFemale ? 'female' : 'any');
        let reqPers = t.requiredPersonnel || 1;

        let htmlBadges = `<span style="font-size:0.65rem; background-color:var(--col-bg); color:var(--text-muted); padding:2px 4px; border-radius:4px; margin-left:6px; font-weight:bold; vertical-align:middle; border:1px solid var(--border-color);">${reqPers}명</span>`;
        if (reqGender === 'female') htmlBadges += `<span style="font-size:0.65rem; background-color:#FCE7F3; color:#EC4899; padding:2px 4px; border-radius:4px; margin-left:4px; font-weight:bold; vertical-align:middle;">👩‍💼 여성</span>`;
        else if (reqGender === 'male') htmlBadges += `<span style="font-size:0.65rem; background-color:#E0F2FE; color:#3B82F6; padding:2px 4px; border-radius:4px; margin-left:4px; font-weight:bold; vertical-align:middle;">👨‍💼 남성</span>`;

        // 카테고리 배지 (칸반 보드용)
        const checkStr = t.category ? t.category : t.name;
        if (checkStr) {
            if (checkStr.includes('텔러스헬스')) htmlBadges += `<span style="font-size:0.65rem; background-color:#EFF6FF; color:#2563EB; padding:2px 4px; border-radius:4px; margin-left:4px; font-weight:bold; vertical-align:middle; border:1px solid #BFDBFE;">🏥 텔러스헬스</span>`;
            else if (checkStr.includes('휴노')) htmlBadges += `<span style="font-size:0.65rem; background-color:#F0FDF4; color:#16A34A; padding:2px 4px; border-radius:4px; margin-left:4px; font-weight:bold; vertical-align:middle; border:1px solid #BBF7D0;">🌿 휴노</span>`;
            else if (t.category && t.category.toUpperCase().startsWith('VIP')) htmlBadges += `<span style="font-size:0.65rem; background-color:#FFFBEB; color:#F59E0B; padding:2px 4px; border-radius:4px; margin-left:4px; font-weight:bold; vertical-align:middle; border:1px solid #FEF3C7;">⭐ VIP</span>`;
        }

        let s = t.date; let e = t.date;
        if (t.date && t.date.includes(' to ')) { const p = t.date.split(' to '); s = p[0]; e = p[1]; }
        return { ...t, isTrip: true, title: `[출장] ${t.name}`, badgesHtml: htmlBadges, startDate: s, dueDate: e, status: 'todo' };
    });
    const leavesArray = Object.values(AppStore.getLeaves()).filter(l => l.status === 'approved').map(l => ({ id: l.id, uid: l.uid, isLeave: true, title: `[휴가] ${l.userName}`, assignee: l.userName, startDate: l.date, dueDate: l.date, status: 'todo', priority: 'medium' }));

    // 외부 일정 가져오기
    const externalArray = Object.values(AppStore.getExternalEvents()).map(e => ({ ...e, title: e.title ? e.title.replace(/🌐\s*/g, '') : e.title }));

    const combinedArray = [...tasksArray, ...tripsArray, ...leavesArray, ...externalArray];

    if (AppStore.getViewMode() === 'calendar') { renderCalendar(combinedArray); filterTasks(); return; }
    if (AppStore.getViewMode() === 'gantt') { renderGantt(combinedArray); filterTasks(); return; }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    activeTasks.forEach(task => {
        const div = document.createElement('div'); div.className = 'task-card';
        // 마감 임박 (2일 이하 & 완료 안 된 업무) 경고 애니메이션 효과 추가
        if (task.dueDate && task.status !== 'done') {
            const taskDate = new Date(task.dueDate); taskDate.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 2) {
                div.className += ' deadline-warning';
            }
        }
        div.title = task.author ? `등록자: ${task.author}` : '';
        if (AppStore.getViewMode() === 'status') {
            div.draggable = true;
            div.ondragstart = (e) => drag(e, task.id);
            // 카드를 놓거나 드래그가 취소될 때 효과 원상복구
            div.ondragend = (e) => { e.target.classList.remove('is-dragging'); document.querySelectorAll('.column').forEach(c => c.classList.remove('drag-over')); };
        }
        div.onclick = (e) => { if (!e.target.closest('.delete-btn') && !e.target.closest('.archive-btn')) openModal(task.id, task.title, task.description, task.dueDate, task.startDate); };
        div.dataset.assignee = task.assignee || '미지정'; div.dataset.dueDate = task.dueDate || '';

        let priorityLabel = task.priority === 'high' ? '높음' : (task.priority === 'low' ? '낮음' : '보통');
        let priorityColor = task.priority === 'high' ? '#EF4444' : (task.priority === 'low' ? '#10B981' : '#F59E0B');
        const descIcon = task.description ? '<span style="font-size: 0.7rem; margin-right: 6px; padding: 2px 4px; background-color: var(--col-bg); border-radius: 4px; color: var(--text-muted);">상세</span>' : '';
        let dueBadge = '';
        if (task.dueDate) {
            const taskDate = new Date(task.dueDate); taskDate.setHours(0, 0, 0, 0);
            const isOverdue = taskDate < today && task.status !== 'done';
            dueBadge = `<span style="font-size: 0.75rem; color: ${isOverdue ? 'var(--danger)' : 'var(--text-main)'}; font-weight: 600;">${isOverdue ? '마감지연' : '마감일'} ${task.dueDate}</span>`;
        }

        const archiveBtnHtml = (task.status === 'done' && !task.isTrip && !task.isLeave) ? `<button class="archive-btn" onclick="archiveSingleTask(event, '${task.id}')" title="보관함으로 이동" style="padding:0.2rem; background:transparent; border:none; cursor:pointer; color:var(--text-muted);"><span class="material-symbols-rounded" style="font-size:1.1em;">inventory_2</span></button>` : '';
        const assigneeList = task.assignee ? task.assignee.split(',').map(a => a.trim()).filter(a => a) : ['미지정'];
        const assigneeHtml = assigneeList.map(a => `
            <div class="assignee-chip">
                <span class="material-symbols-rounded">person</span>
                ${a}
            </div>
        `).join('');

        div.innerHTML = `<div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <span style="font-weight: 500; font-size: 0.95rem; word-break: break-all;">${task.title}${task.badgesHtml || ''}</span>
                <div style="display: flex; gap: 2px; flex-shrink: 0; margin-left: 0.5rem;">
                    ${archiveBtnHtml}
                    <button class="delete-btn" onclick="deleteTask('${task.id}')" title="삭제" style="padding:0.2rem;"><span class="material-symbols-rounded" style="font-size:1.1em;">close</span></button>
                </div>
            </div>
            ${(descIcon || dueBadge) ? `<div style="display: flex; align-items: center; margin-top: -0.2rem;">${descIcon}${dueBadge}</div>` : ''}
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem;">
                <div style="display: flex; flex-wrap: wrap; gap: 2px;">${assigneeHtml}</div>
                <span style="background-color: ${priorityColor}15; color: ${priorityColor}; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600;">${priorityLabel}</span>
            </div>
        </div>`;

        if (AppStore.getViewMode() === 'status') { const el = document.getElementById(`${task.status}-list`); if (el) el.appendChild(div); }
        else {
            let targetList = 'later-list';
            if (task.dueDate) {
                const d = new Date(task.dueDate); d.setHours(0, 0, 0, 0);
                if (d <= endOfWeek) targetList = 'week-list'; else if (d <= endOfMonth) targetList = 'month-list';
            }
            const el = document.getElementById(targetList); if (el) el.appendChild(div);
        }
    });
    filterTasks();
    if (typeof generateAiBriefing === 'function') generateAiBriefing();
}

db.ref('tasks').orderByChild('status').equalTo('todo').on('value', (s) => {
    const data = s.val() || {};
    AppStore.mergeTasks(data, 'todo');
});

db.ref('tasks').orderByChild('status').equalTo('doing').on('value', (s) => {
    const data = s.val() || {};
    AppStore.mergeTasks(data, 'doing');
});

db.ref('tasks').orderByChild('status').equalTo('done').limitToLast(50).on('value', (s) => {
    const data = s.val() || {};
    AppStore.mergeTasks(data, 'done');
});

// ----------------------------------------------------
// 보관함 (Archive) 기능
// ----------------------------------------------------

async function archiveSingleTask(e, id) {
    e.stopPropagation();
    if (await customConfirm('이 작업을 보관함으로 이동할까요?')) {
        db.ref('tasks/' + id).update({ status: 'archived' })
            .then(() => showToast('작업이 보관함으로 이동되었습니다.', 'info'))
            .catch(async (error) => await customAlert("보관 실패: " + error.message));
    }
}

async function archiveAllDoneTasks() {
    if (!(await checkAuth('승인된 사용자만 상태를 변경할 수 있습니다.'))) return;
    const doneList = document.getElementById('done-list');
    if (!doneList || doneList.children.length === 0) return showToast('보관할 완료된 작업이 없습니다.', 'info');

    if (await customConfirm('현재 완료된 모든 작업을 보관함으로 이동할까요?')) {
        const tasks = AppStore.getTasks();
        const updates = {};
        let count = 0;
        Object.values(tasks).forEach(t => {
            if (t.status === 'done') {
                updates[t.id + '/status'] = 'archived';
                count++;
            }
        });
        if (count > 0) {
            db.ref('tasks').update(updates)
                .then(() => showToast(`${count}개의 작업이 보관함으로 이동되었습니다.`, 'info'))
                .catch(async (error) => await customAlert("보관 실패: " + error.message));
        }
    }
}

function openArchiveModal() {
    document.getElementById('archiveModal').style.display = 'flex';
    const listEl = document.getElementById('archived-task-list');
    listEl.innerHTML = '<li style="justify-content:center; color:var(--text-muted);">불러오는 중...</li>';

    // archived 상태인 작업들을 가져옵니다. (최신 100개 제한)
    db.ref('tasks').orderByChild('status').equalTo('archived').limitToLast(100).once('value', (s) => {
        listEl.innerHTML = '';
        const data = s.val() || {};
        const archivedArray = Object.values(data).sort((a, b) => {
            // 마감일이 있으면 마감일 순, 없으면 키(id) 순으로 대략 정렬
            if (a.dueDate && b.dueDate) return new Date(b.dueDate) - new Date(a.dueDate);
            return 0;
        });

        if (archivedArray.length === 0) {
            listEl.innerHTML = '<li style="justify-content:center; color:var(--text-muted);">보관된 작업이 없습니다.</li>';
            return;
        }

        archivedArray.forEach(task => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '0.8rem';
            li.style.borderBottom = '1px dashed var(--border-color)';

            li.innerHTML = `
                <div style="flex:1; cursor:pointer;" onclick="openModal('${task.id}', '${task.title.replace(/'/g, "\\'")}', '${(task.description || '').replace(/'/g, "\\'")}', '${task.dueDate || ''}', '${task.startDate || ''}')">
                    <div style="font-weight:600; color:var(--text-main);">${task.title}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.2rem;">담당: ${task.assignee || '미지정'} | 마감: ${task.dueDate || '미정'}</div>
                </div>
                <div style="display:flex; gap:0.5rem; flex-shrink:0;">
                    <button onclick="restoreArchivedTask('${task.id}')" title="칸반보드 완료 컬럼으로 복구" style="background:var(--col-bg); color:var(--primary); border:1px solid var(--border-color); padding:0.3rem 0.6rem; font-size:0.8rem;"><span class="material-symbols-rounded" style="font-size:1.1em; vertical-align:middle;">restore</span> 복구</button>
                    <button onclick="deleteArchivedTask('${task.id}')" title="영구 삭제" style="background:var(--danger); padding:0.3rem 0.6rem; font-size:0.8rem;"><span class="material-symbols-rounded" style="font-size:1.1em; vertical-align:middle;">delete</span> 삭제</button>
                </div>
            `;
            listEl.appendChild(li);
        });
    });
}

function closeArchiveModal() {
    document.getElementById('archiveModal').style.display = 'none';
}

async function restoreArchivedTask(id) {
    if (!(await checkAuth('승인된 사용자만 복구할 수 있습니다.'))) return;
    db.ref('tasks/' + id).update({ status: 'done' }).then(() => {
        showToast('작업이 복구되었습니다.', 'info');
        openArchiveModal(); // 목록 새로고침
    }).catch(async (error) => await customAlert("복구 실패: " + error.message));
}

async function deleteArchivedTask(id) {
    if (!(await checkAuth('승인된 사용자만 삭제할 수 있습니다.'))) return;
    if (await customConfirm('이 작업을 영구적으로 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)')) {
        db.ref('tasks/' + id).remove().then(() => {
            showToast('작업이 영구 삭제되었습니다.', 'info');
            openArchiveModal(); // 목록 새로고침
        }).catch(async (error) => await customAlert("삭제 실패: " + error.message));
    }
}

// ----------------------------------------------------
// 데일리 루틴 (Daily Tasks) 기능
// ----------------------------------------------------

async function addDailyTask() {
    const input = document.getElementById('dailyTaskInput');
    const title = input.value.trim();
    if (!(await checkAuth())) return;
    if (!title) return await customAlert('데일리 업무 내용을 입력해주세요.');

    const newRef = db.ref('tasks/dailyRoutine/settings').push();
    newRef.set({ id: newRef.key, title: title, createdAt: Date.now() })
        .then(() => { input.value = ''; })
        .catch(async error => await customAlert("추가 실패: " + error.message));
}

async function deleteDailyTask(id) {
    if (!(await checkAuth())) return;
    if (await customConfirm('이 데일리 업무 설정을 삭제하시겠습니까?')) {
        db.ref('tasks/dailyRoutine/settings/' + id).remove();
    }
}

async function toggleDailyTask(taskId) {
    if (!(await checkAuth())) return;
    const today = getTodayStr();
    const isCompleted = AppStore.getDailyLogs()[taskId] === true;

    db.ref(`tasks/dailyRoutine/logs/${today}/${taskId}`).set(isCompleted ? null : true)
        .catch(async error => await customAlert("상태 변경 실패: " + error.message));
}

function renderDailyTasks() {
    const listEl = document.getElementById('daily-task-list');
    const progressEl = document.getElementById('daily-progress-text');
    if (!listEl) return;

    const tasks = AppStore.getDailyTasks();
    const logs = AppStore.getDailyLogs();
    const tasksArray = Object.values(tasks).sort((a, b) => a.createdAt - b.createdAt);

    listEl.innerHTML = '';
    let completedCount = 0;

    tasksArray.forEach(task => {
        const isDone = logs[task.id] === true;
        if (isDone) completedCount++;

        const div = document.createElement('div');
        div.className = `daily-item ${isDone ? 'completed' : ''}`;
        div.innerHTML = `
            <div class="daily-checkbox" onclick="toggleDailyTask('${task.id}')">
                ${isDone ? '<span class="material-symbols-rounded" style="font-size:1.2rem;">check</span>' : ''}
            </div>
            <div class="daily-title" onclick="toggleDailyTask('${task.id}')">${task.title}</div>
            <button class="daily-delete-btn" onclick="deleteDailyTask('${task.id}')">
                <span class="material-symbols-rounded" style="font-size:1.1rem;">delete</span>
            </button>
        `;
        listEl.appendChild(div);
    });

    const total = tasksArray.length;
    const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);
    if (progressEl) {
        progressEl.textContent = `오늘 완료: ${completedCount}/${total} (${percent}%)`;
    }
}

// 리스너 설정
db.ref('tasks/dailyRoutine/settings').on('value', (s) => {
    AppStore.setDailyTasks(s.val() || {});
});

const todayStr = getTodayStr();
db.ref(`tasks/dailyRoutine/logs/${todayStr}`).on('value', (s) => {
    AppStore.setDailyLogs(s.val() || {});
});

// 엔터키 처리
document.getElementById('dailyTaskInput')?.addEventListener('keydown', function (e) {
    if (e.isComposing) return;
    if (e.key === 'Enter') addDailyTask();
});

// ----------------------------------------------------
// 담당자 태그 관리
// ----------------------------------------------------
function addAssigneeTag(selectEl) {
    const val = selectEl.value;
    if (val && !selectedAssignees.includes(val)) {
        selectedAssignees.push(val);
        renderAssigneeTags();
    }
    selectEl.value = '';
}

function removeAssigneeTag(name) {
    selectedAssignees = selectedAssignees.filter(a => a !== name);
    renderAssigneeTags();
}

function renderAssigneeTags() {
    const container = document.getElementById('assignee-tags-container');
    if (!container) return;

    // 기존 태그 제거 (select 엘리먼트와 라벨은 제외)
    container.querySelectorAll('.assignee-tag').forEach(t => t.remove());

    const selectEl = document.getElementById('assigneeInput');

    selectedAssignees.forEach(name => {
        const tag = document.createElement('div');
        tag.className = 'assignee-tag';
        tag.style = 'display:flex; align-items:center; gap:4px; background:var(--primary); color:white; padding:2px 8px; border-radius:12px; font-size:0.8rem; font-weight:600; margin: 2px 0;';
        tag.innerHTML = `${name} <span class="material-symbols-rounded" style="font-size:1rem; cursor:pointer;" onclick="removeAssigneeTag('${name}')">close</span>`;
        container.insertBefore(tag, selectEl);
    });
}

// 모달용 담당자 태그 관리
function addModalAssigneeTag(selectEl) {
    const val = selectEl.value;
    if (val && !modalSelectedAssignees.includes(val)) {
        modalSelectedAssignees.push(val);
        renderModalAssigneeTags();
    }
    selectEl.value = '';
}

function removeModalAssigneeTag(name) {
    modalSelectedAssignees = modalSelectedAssignees.filter(a => a !== name);
    renderModalAssigneeTags();
}

function renderModalAssigneeTags() {
    const container = document.getElementById('modal-assignee-tags-container');
    if (!container) return;

    container.querySelectorAll('.assignee-tag').forEach(t => t.remove());
    const selectEl = document.getElementById('modalAssigneeInput');

    modalSelectedAssignees.forEach(name => {
        const tag = document.createElement('div');
        tag.className = 'assignee-tag';
        tag.style = 'display:flex; align-items:center; gap:4px; background:var(--primary); color:white; padding:2px 8px; border-radius:12px; font-size:0.8rem; font-weight:600; margin: 2px 0;';
        tag.innerHTML = `${name} <span class="material-symbols-rounded" style="font-size:1rem; cursor:pointer;" onclick="removeModalAssigneeTag('${name}')">close</span>`;
        container.insertBefore(tag, selectEl);
    });
}

let isGeneratingBriefing = false;
async function generateAiBriefing() {
    const userProfile = AppStore.getCurrentUser();
    const container = document.getElementById('ai-briefing-container');
    const textEl = document.getElementById('briefing-text');
    if (!userProfile || !container || !textEl) {
        if (container) container.style.display = 'none';
        return;
    }

    if (isGeneratingBriefing) return;
    isGeneratingBriefing = true;

    try {
        container.style.display = 'block';

        const tasks = Object.values(AppStore.getTasks());
        const myTasks = tasks.filter(t => t.assignee && t.assignee.toLowerCase().includes(userProfile.displayName.toLowerCase()));
        const activeTasks = myTasks.filter(t => t.status === 'todo' || t.status === 'doing');

        const todayStr = getTodayStr();
        const todayTasks = activeTasks.filter(t => t.dueDate === todayStr);
        const overdueTasks = activeTasks.filter(t => t.dueDate && t.dueDate < todayStr);

        const trips = Object.values(AppStore.getTrips());
        const myTrips = trips.filter(t => t.assignee && t.assignee.toLowerCase().includes(userProfile.displayName.toLowerCase()));
        const upcomingTrips = myTrips.filter(t => t.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));

        let used = 0;
        const myLeaves = Object.values(AppStore.getLeaves()).filter(l => l.uid === auth.currentUser.uid);
        myLeaves.forEach(l => { if (l.status === 'approved' || l.status === 'pending' || l.status === 'cancel_requested') used += l.type; });
        const remainLeaves = ((userProfile.leaveTotal || 15) - used).toFixed(1);

        let comms = [];
        try {
            const commSnap = await db.ref('businessCommunications').orderByChild('timestamp').limitToLast(5).once('value');
            if (commSnap.exists()) {
                comms = Object.values(commSnap.val()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            }
        } catch (commErr) {
            console.error('업무 소통 요약 로드 중 에러:', commErr);
        }

        let htmlContent = `
            <div style="font-size: 0.92rem; line-height: 1.7; color: var(--text-main);">
                <p style="margin-bottom: 0.8rem; font-size: 1.02rem;">
                    안녕하세요, <strong style="color: var(--primary); font-weight: 700;">${userProfile.displayName}</strong>님! 오늘 하루도 스마트한 업무 협업을 위한 핵심 요약을 전해드립니다.
                </p>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 0.8rem;">
                    <div style="background: rgba(79, 70, 229, 0.05); padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(79, 70, 229, 0.1);">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-weight: 700; font-size: 0.85rem; color: var(--primary);">
                            <span class="material-symbols-rounded" style="font-size: 1.15rem;">task_alt</span> 내 할당 업무
                        </div>
                        <div style="font-size: 0.88rem; font-weight: 600;">
                            진행 중인 업무 <span style="color: var(--primary);">${activeTasks.length}</span>건 
                            ${todayTasks.length > 0 ? `<br><span style="color: var(--danger); font-size: 0.8rem; display: inline-flex; align-items: center; gap: 2px;">⏰ 오늘 마감 ${todayTasks.length}건</span>` : ''}
                            ${overdueTasks.length > 0 ? `<br><span style="color: var(--danger); font-size: 0.8rem; display: inline-flex; align-items: center; gap: 2px;">⚠️ 마감 지연 ${overdueTasks.length}건</span>` : ''}
                        </div>
                    </div>
                    <div style="background: rgba(139, 92, 246, 0.05); padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.1);">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-weight: 700; font-size: 0.85rem; color: #8B5CF6;">
                            <span class="material-symbols-rounded" style="font-size: 1.15rem;">flight_takeoff</span> 출장 일정
                        </div>
                        <div style="font-size: 0.88rem; font-weight: 600;">
                            ${upcomingTrips.length > 0 ? `예정된 출장 <span style="color: #8B5CF6;">${upcomingTrips.length}</span>건<br><span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">• ${upcomingTrips[0].date}: ${upcomingTrips[0].name}</span>` : '예정된 출장 일정이 없습니다.'}
                        </div>
                    </div>
                    <div style="background: rgba(16, 185, 129, 0.05); padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.1);">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-weight: 700; font-size: 0.85rem; color: #10B981;">
                            <span class="material-symbols-rounded" style="font-size: 1.15rem;">beach_access</span> 연차 사용 현황
                        </div>
                        <div style="font-size: 0.88rem; font-weight: 600;">
                            올해 잔여 연차: <span style="color: #10B981;">${remainLeaves}</span>일<br>
                            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">• 총 15일 중 ${used.toFixed(1)}일 사용</span>
                        </div>
                    </div>
                </div>
                
                ${comms.length > 0 ? `
                <div style="margin-top: 1rem; border-top: 1px dashed rgba(226, 232, 240, 0.8); padding-top: 12px;">
                    <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.85rem; color: var(--text-main); margin-bottom: 8px;">
                        <span class="material-symbols-rounded" style="font-size: 1.15rem; color: var(--primary);">mail</span> 최근 중요 사내 메일 피드
                    </div>
                    <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px;">
                        ${comms.slice(0, 2).map(c => `
                            <li style="font-size: 0.82rem; display: flex; justify-content: space-between; align-items: center; background: var(--col-bg); padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
                                <span style="font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 70%;" title="${c.title}">${c.title}</span>
                                <span style="font-size: 0.75rem; color: var(--text-muted);">${c.sender || '미상'}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>
        `;

        textEl.innerHTML = htmlContent;
    } catch (e) {
        console.error('브리핑 생성 중 에러:', e);
        textEl.textContent = '브리핑 정보 로드 중 에러가 발생했습니다.';
    } finally {
        isGeneratingBriefing = false;
    }
}

function toggleBriefingContent() {
    const card = document.querySelector('.briefing-card');
    if (card) {
        card.classList.toggle('collapsed');
    }
}