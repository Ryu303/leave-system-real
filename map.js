// map.js
// ----------------------------------------------------
// 출장 관리 & 스마트 동선 최적화 (지도 및 TSP 알고리즘)
// ----------------------------------------------------
const CHEAPEST_STATIONS_DB = [
    { brand: 'sk', name: 'SK에너지 셀프 도신주유소', region: '서울', lat: 37.508, lng: 126.903, price: 1545 },
    { brand: 'gs', name: 'GS칼텍스 서해대로주유소', region: '경기/인천', lat: 37.450, lng: 126.630, price: 1520 },
    { brand: 's-oil', name: 'S-OIL 대성셀프주유소', region: '충청', lat: 36.350, lng: 127.385, price: 1515 },
    { brand: 'oilbank', name: 'HD현대오일뱅크 삼미주유소', region: '강원', lat: 37.885, lng: 127.730, price: 1530 },
    { brand: 'altteul', name: '알뜰주유소 행복셀프주유소', region: '영남', lat: 35.870, lng: 128.600, price: 1485 },
    { brand: 'altteul', name: '알뜰 광주공항주유소', region: '호남', lat: 35.140, lng: 126.810, price: 1490 }
];

let currentTripId = null;
function openTripModal(id = null, name = '', date = '', assignee = '', contact = '', address = '', scheduleUrl = '', schedulePath = '', qrUrl = '', qrPath = '', roomType = 'single', bookedHotel = '') {
    currentTripId = id; document.getElementById('tripModalTitle').textContent = id ? '출장 수정' : '새 출장';
    document.getElementById('tripName').value = name; document.getElementById('tripDate').value = date;

    // 파일 입력 필드 리셋
    document.getElementById('tripScheduleFile').value = '';
    document.getElementById('tripQrFile').value = '';

    // 출장자 선택 드롭다운 옵션 보장 로직
    const assigneeSelect = document.getElementById('tripAssignee');
    if (assigneeSelect) {
        let assigneeExists = false;
        let customOptExists = false;
        for (let i = 0; i < assigneeSelect.options.length; i++) {
            if (assigneeSelect.options[i].value === assignee) assigneeExists = true;
            if (assigneeSelect.options[i].value === '__custom__') customOptExists = true;
        }

        // 직접 입력 옵션 추가
        if (!customOptExists) {
            const optCustom = document.createElement('option');
            optCustom.value = '__custom__';
            optCustom.textContent = '✍️ 직접 입력 (외부 인원)';
            assigneeSelect.appendChild(optCustom);
        }

        // 이메일에서 연동되었거나 명단에 없는 외부 출장자인 경우 드롭다운 옵션으로 동적 추가
        if (assignee && !assigneeExists && assignee !== '__custom__') {
            const opt = document.createElement('option');
            opt.value = assignee;
            opt.textContent = `${assignee} (이메일/외부)`;
            assigneeSelect.appendChild(opt);
        }

        // 직접 입력 선택에 대한 이벤트 리스너 등록 (1회만 등록되도록 설정)
        if (!assigneeSelect.dataset.listenerAdded) {
            assigneeSelect.dataset.listenerAdded = 'true';
            assigneeSelect.addEventListener('change', async function () {
                if (this.value === '__custom__') {
                    const customName = await customPrompt('출장자 이름을 직접 입력해주세요.');
                    if (customName && customName.trim()) {
                        const trimmed = customName.trim();
                        let exists = false;
                        for (let i = 0; i < this.options.length; i++) {
                            if (this.options[i].value === trimmed) {
                                exists = true;
                                break;
                            }
                        }
                        if (!exists) {
                            const opt = document.createElement('option');
                            opt.value = trimmed;
                            opt.textContent = `${trimmed} (직접 입력)`;
                            this.appendChild(opt);
                        }
                        this.value = trimmed;
                    } else {
                        this.value = '';
                    }
                }
            });
        }
    }

    document.getElementById('tripAssignee').value = assignee;
    document.getElementById('tripContact').value = contact;
    document.getElementById('tripAddress').value = address;

    // 숙소 정보 초기화 및 렌더링
    document.getElementById('tripRoomType').value = roomType || 'single';
    document.getElementById('tripBookedHotel').value = bookedHotel || '';
    const resultsContainer = document.getElementById('accommodationResults');
    if (bookedHotel) {
        resultsContainer.style.display = 'flex';
        resultsContainer.innerHTML = `<div style="padding:0.8rem; background-color:#10B98115; color:#10B981; border-radius:6px; font-weight:bold; font-size:0.85rem; text-align:center; display:flex; justify-content:space-between; align-items:center;"><span><span class="material-symbols-rounded" style="vertical-align:middle; font-size:1.2em;">check_circle</span> 예약 숙소: ${bookedHotel}</span><button onclick="cancelAccommodation()" style="background:transparent; color:var(--danger); border:1px solid var(--danger); padding:0.2rem 0.5rem; font-size:0.75rem;">예약 취소</button></div>`;
    } else {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
    }

    document.getElementById('tripScheduleFile').dataset.existingUrl = scheduleUrl;
    document.getElementById('tripScheduleFile').dataset.existingPath = schedulePath;
    document.getElementById('currentScheduleFile').textContent = scheduleUrl ? `첨부됨: ${schedulePath.split('_').pop()}` : '';

    document.getElementById('tripQrFile').dataset.existingUrl = qrUrl;
    document.getElementById('tripQrFile').dataset.existingPath = qrPath;
    document.getElementById('currentQrFile').textContent = qrUrl ? `첨부됨: ${qrPath.split('_').pop()}` : '';

    const trip = AppStore.getTrips()[id] || {};
    document.getElementById('tripRequiredGender').value = trip && trip.requiredGender ? trip.requiredGender : (trip && trip.requiresFemale ? 'female' : 'any');
    document.getElementById('tripRequiredPersonnel').value = trip && trip.requiredPersonnel ? trip.requiredPersonnel : 1;
    document.getElementById('tripAuthorDisplay').textContent = trip && trip.author ? `등록: ${trip.author}` : '';

    // 관리자이거나 본인이 작성한 출장이면 모달 내 삭제 버튼 표시
    const delBtn = document.getElementById('tripModalDeleteBtn');
    if (delBtn) {
        const isAdmin = auth.currentUser && ADMIN_UIDS.includes(auth.currentUser.uid);
        const isAuthor = trip && trip.author === (AppStore.getCurrentUser() ? AppStore.getCurrentUser().displayName : '');
        delBtn.style.display = (isAdmin || isAuthor) ? 'inline-block' : 'none';
    }

    document.getElementById('tripModal').style.display = 'flex';
}


async function searchAccommodation() {
    const address = document.getElementById('tripAddress').value.trim();
    if (!address) return await customAlert('출장지 주소를 먼저 입력해주세요!\n입력된 주소를 바탕으로 근처 숙소를 찾습니다.');

    const roomType = document.getElementById('tripRoomType').value;
    const typeLabel = roomType === 'single' ? '1인실' : '트윈룸';
    const resultsContainer = document.getElementById('accommodationResults');

    resultsContainer.style.display = 'flex';
    resultsContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding: 1rem 0;">카카오 지도 API를 통해 주변 실제 숙소를 검색 중입니다...⏳</div>';

    if (typeof kakao === 'undefined' || !kakao.maps || !kakao.maps.services) {
        resultsContainer.innerHTML = '<div style="text-align:center; color:var(--danger); font-size:0.85rem; padding: 1rem 0;">지도 API가 로드되지 않았습니다.</div>';
        return;
    }

    // 1. 입력된 주소를 좌표로 변환
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, function (result, status) {
        if (status === kakao.maps.services.Status.OK) {
            const coords = new kakao.maps.LatLng(result[0].y, result[0].x);
            const ps = new kakao.maps.services.Places();

            // 2. 좌표 반경 5km 이내 숙박업소(AD5) 검색 (가까운 순 정렬)
            ps.categorySearch('AD5', function (places, status, pagination) {
                if (status === kakao.maps.services.Status.OK) {
                    let html = `<div style="font-size:0.85rem; font-weight:bold; color:var(--text-main); margin-bottom: 0.3rem;">근처 실제 숙소 추천 (${typeLabel} 기준)</div>`;
                    const topPlaces = places.slice(0, 5); // 상위 5개만 표시
                    topPlaces.forEach(place => {
                        const distText = place.distance ? `출장지에서 ${place.distance}m` : '';
                        const safeName = place.place_name.replace(/'/g, "\\'");
                        html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--card-bg); padding:0.8rem; border-radius:6px; border:1px solid var(--border-color); margin-bottom:0.5rem;"><div><div style="font-weight:bold; font-size:0.9rem; color:#E63946;">${place.place_name}</div><div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">${distText} | <a href="${place.place_url}" target="_blank" style="color:var(--primary); text-decoration:underline;">카카오맵 상세정보</a></div></div><button onclick="bookAccommodation('${safeName}')" style="background-color:#E63946; padding:0.4rem 0.8rem; font-size:0.8rem;">선택 및 예약</button></div>`;
                    });

                    const regionName = address.split(' ').slice(0, 2).join(' '); // "부산 해운대구" 형태로 지역명 추출
                    html += `<button onclick="window.open('https://www.goodchoice.kr/product/result?keyword=${encodeURIComponent(regionName)}', '_blank')" style="width: 100%; margin-top: 0.5rem; background-color: var(--col-bg); color: var(--text-main); border: 1px dashed var(--danger); padding: 0.8rem; display:flex; align-items:center; justify-content:center; gap:4px; font-weight:600; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#FEE2E2'" onmouseout="this.style.backgroundColor='var(--col-bg)'"><span class="material-symbols-rounded" style="color:var(--danger);">sell</span> 여기어때에서 '${regionName}' 전체 최저가 비교하기</button>`;

                    resultsContainer.innerHTML = html;
                } else {
                    resultsContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding: 1rem 0;">주변(5km 이내)에 검색된 숙소가 없습니다.</div>';
                }
            }, { location: coords, radius: 5000, sort: kakao.maps.services.SortBy.DISTANCE });
        } else {
            resultsContainer.innerHTML = '<div style="text-align:center; color:var(--danger); font-size:0.85rem; padding: 1rem 0;">주소를 정확히 찾을 수 없어 숙소 검색에 실패했습니다.</div>';
        }
    });
}

async function bookAccommodation(hotelName) {
    if (await customConfirm(`'${hotelName}'을(를) 출장 숙소로 선택하시겠습니까?\n\n(확인 시 [여기어때] 예약 사이트로 이동하며, 출장 기록에 숙소 이름이 저장됩니다.)`)) {
        document.getElementById('tripBookedHotel').value = hotelName;
        document.getElementById('accommodationResults').innerHTML = `<div style="padding:0.8rem; background-color:#10B98115; color:#10B981; border-radius:6px; font-weight:bold; font-size:0.85rem; text-align:center; display:flex; justify-content:space-between; align-items:center;"><span><span class="material-symbols-rounded" style="vertical-align:middle; font-size:1.2em;">check_circle</span> 예약 숙소: ${hotelName}</span><button onclick="cancelAccommodation()" style="background:transparent; color:var(--danger); border:1px solid var(--danger); padding:0.2rem 0.5rem; font-size:0.75rem;">예약 취소</button></div>`;

        // 여기어때 웹 통합 검색 결과 창 열기
        const yanoljaUrl = `https://www.goodchoice.kr/product/result?keyword=${encodeURIComponent(hotelName)}`;
        window.open(yanoljaUrl, '_blank');

        showToast('숙소가 선택되었습니다. 모달 하단의 [저장]을 눌러 확정하세요.', 'info');
    }
}

function cancelAccommodation() {
    document.getElementById('tripBookedHotel').value = '';
    document.getElementById('accommodationResults').innerHTML = '';
    document.getElementById('accommodationResults').style.display = 'none';
    showToast('숙소 예약이 취소되었습니다.', 'info');
}

function closeTripModal() { document.getElementById('tripModal').style.display = 'none'; currentTripId = null; }

async function saveTrip() {
    if (!(await checkAuth('승인된 사용자만 저장할 수 있습니다.'))) return;
    const name = document.getElementById('tripName').value.trim();
    if (!name) return await customAlert('출장명을 입력해주세요.');

    const saveBtn = document.querySelector('#tripModal .modal-footer button');
    saveBtn.disabled = true; saveBtn.textContent = '저장 중...';

    try {
        const existingTrip = currentTripId ? (AppStore.getTrips()[currentTripId] || {}) : {};

        let scheduleUrl = document.getElementById('tripScheduleFile').dataset.existingUrl || '';
        let schedulePath = document.getElementById('tripScheduleFile').dataset.existingPath || '';
        let qrUrl = existingTrip.qrUrl || '';
        let qrPath = existingTrip.qrPath || '';

        // 1. 타임테이블 파일 업로드 처리
        const scheduleFileInput = document.getElementById('tripScheduleFile');
        if (scheduleFileInput && scheduleFileInput.files.length > 0) {
            const file = scheduleFileInput.files[0];
            const path = 'tripSchedules/' + Date.now() + '_' + file.name;

            // 기존 파일 삭제
            if (schedulePath) {
                await storage.ref(schedulePath).delete().catch(() => { });
            }

            const snapshot = await storage.ref(path).put(file);
            scheduleUrl = await snapshot.ref.getDownloadURL();
            schedulePath = path;
        }

        // 2. QR 이미지 파일 업로드 처리
        const qrFileInput = document.getElementById('tripQrFile');
        if (qrFileInput && qrFileInput.files.length > 0) {
            const file = qrFileInput.files[0];
            const path = 'tripQrs/' + Date.now() + '_' + file.name;

            // 기존 파일 삭제
            if (qrPath) {
                await storage.ref(qrPath).delete().catch(() => { });
            }

            const snapshot = await storage.ref(path).put(file);
            qrUrl = await snapshot.ref.getDownloadURL();
            qrPath = path;
        }

        const tripData = {
            name: name, date: document.getElementById('tripDate').value, assignee: document.getElementById('tripAssignee').value.trim(),
            contact: document.getElementById('tripContact').value.trim(), address: document.getElementById('tripAddress').value.trim(),
            roomType: document.getElementById('tripRoomType').value, bookedHotel: document.getElementById('tripBookedHotel').value,
            scheduleUrl: scheduleUrl, schedulePath: schedulePath,
            qrUrl: qrUrl, qrPath: qrPath,
            requiredGender: document.getElementById('tripRequiredGender').value,
            requiredPersonnel: parseInt(document.getElementById('tripRequiredPersonnel').value) || 1,
            author: existingTrip.author ? existingTrip.author : (AppStore.getCurrentUser() ? AppStore.getCurrentUser().displayName : '익명')
        };

        if (currentTripId) await db.ref('businessTrips/' + currentTripId).update(tripData);
        else {
            tripData.timestamp = Date.now();
            const ref = db.ref('businessTrips').push();
            tripData.id = ref.key;
            await ref.set(tripData);

            // 전사 알림 발송
            sendNotificationToAll({
                title: "새로운 출장 등록",
                message: `"${name}" 출장이 등록되었습니다. 내용을 확인하세요.`,
                type: 'trip',
                link: 'trip',
                targetId: tripData.id
            });
        }

        // 서버 통신 완료 직후 화면을 즉시 강제 렌더링
        if (typeof renderTripList === 'function') renderTripList();

        closeTripModal();
    } catch (e) {
        await customAlert("저장 실패: " + e.message);
    } finally {
        saveBtn.disabled = false; saveBtn.textContent = '저장';
    }
}

async function deleteTrip(id) {
    if (!(await checkAuth('승인된 사용자만 삭제할 수 있습니다.'))) return;
    if (!await customConfirm('출장을 삭제하시겠습니까?')) return;

    try {
        const trip = AppStore.getTrips()[id];
        if (trip && trip.schedulePath) storage.ref(trip.schedulePath).delete().catch(() => { });

        await db.ref('businessTrips/' + id).remove();

        // 서버 삭제 직후 즉시 렌더링
        if (typeof renderTripList === 'function') renderTripList();
        showToast('출장이 성공적으로 삭제되었습니다.', 'info');
    } catch (error) {
        await customAlert('❌ 삭제 실패: ' + error.message + '\n\n(파이어베이스 권한 또는 네트워크 문제일 수 있습니다)');
    }
}

async function deleteSelectedTrips() {
    const checkedBoxes = document.querySelectorAll('.trip-checkbox:checked');
    if (checkedBoxes.length === 0) {
        return await customAlert('삭제할 출장을 체크(✔)해 주세요.');
    }

    if (!(await checkAuth('승인된 사용자만 삭제할 수 있습니다.'))) return;
    if (!await customConfirm(`선택한 ${checkedBoxes.length}개의 출장을 일괄 삭제하시겠습니까?\n(이 작업은 되돌릴 수 없습니다.)`)) return;

    try {
        const promises = [];
        checkedBoxes.forEach(cb => {
            const id = cb.value;
            const trip = AppStore.getTrips()[id];
            if (trip && trip.schedulePath) storage.ref(trip.schedulePath).delete().catch(() => { });
            promises.push(db.ref('businessTrips/' + id).remove());
        });

        await Promise.all(promises);

        if (typeof renderTripList === 'function') renderTripList();
        showToast(`${checkedBoxes.length}개의 출장이 성공적으로 삭제되었습니다.`, 'info');
    } catch (error) {
        await customAlert('❌ 일괄 삭제 실패: ' + error.message);
    }
}

async function deleteCurrentTrip() {
    if (!currentTripId) return;
    await deleteTrip(currentTripId);
    closeTripModal();
}

document.getElementById('tripModal').addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); saveTrip(); }
});

// 출장 데이터 최적화: 최신 300개만 로드
db.ref('businessTrips').orderByKey().limitToLast(300).on('value', (s) => {
    const data = s.val() || {};
    for (let key in data) data[key].id = key; // 진짜 DB 키로 강제 동기화
    AppStore.setTrips(data);

    // [신규] 자동 구글 캘린더 동기화 (최근 3일 내 등록된 신규 출장 중 미동기화된 건 자동 동기화)
    if (typeof googleAccessToken !== 'undefined' && googleAccessToken) {
        const now = Date.now();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        let syncedTripsMemory = [];
        try {
            syncedTripsMemory = JSON.parse(localStorage.getItem('synced_trips_ids') || '[]');
        } catch (e) { }

        let updatedSyncList = [...syncedTripsMemory];
        let hasNewSync = false;

        Object.values(data).forEach(trip => {
            if (trip.timestamp && (now - trip.timestamp) < threeDaysMs) {
                if (!syncedTripsMemory.includes(trip.id)) {
                    if (typeof syncTripToGoogleCalendar === 'function') {
                        syncTripToGoogleCalendar(trip);
                    }
                    updatedSyncList.push(trip.id);
                    hasNewSync = true;
                }
            }
        });

        if (hasNewSync) {
            localStorage.setItem('synced_trips_ids', JSON.stringify(updatedSyncList));
        }
    }

    // 데이터 변경 수신 시 0.05초 딜레이를 주어 DOM 충돌 방지 및 안전한 렌더링
    setTimeout(() => {
        try { if (typeof renderTripList === 'function') renderTripList(); } catch (e) { }
        try { if (typeof renderTasks === 'function') renderTasks(); } catch (e) { }
        try { if (typeof renderMyPage === 'function') renderMyPage(); } catch (e) { }
    }, 50);
});

function renderTripList() {
    const list = document.getElementById('trip-list'); if (!list) return; list.innerHTML = '';
    const pastList = document.getElementById('trip-list-past'); if (!pastList) return; pastList.innerHTML = '';

    const todayTime = new Date().setHours(0, 0, 0, 0);
    const parseDate = (d) => {
        if (!d) return Infinity;
        return new Date(d.includes(' to ') ? d.split(' to ')[0] : d).getTime();
    };
    Object.values(AppStore.getTrips()).sort((a, b) => parseDate(a.date) - parseDate(b.date)).forEach(trip => {
        const div = document.createElement('div'); div.className = 'trip-card';

        let reqGender = trip.requiredGender || (trip.requiresFemale ? 'female' : 'any');
        let reqPers = trip.requiredPersonnel || 1;
        let badges = `<span style="font-size:0.7rem; background-color:var(--col-bg); color:var(--text-muted); padding:2px 6px; border-radius:4px; margin-left:6px; font-weight:bold; vertical-align:middle; border:1px solid var(--border-color);">${reqPers}명</span>`;
        if (reqGender === 'female') badges += `<span style="font-size:0.7rem; background-color:#FCE7F3; color:#EC4899; padding:2px 6px; border-radius:4px; margin-left:4px; font-weight:bold; vertical-align:middle;">👩‍💼 여성 필수</span>`;
        else if (reqGender === 'male') badges += `<span style="font-size:0.7rem; background-color:#E0F2FE; color:#3B82F6; padding:2px 6px; border-radius:4px; margin-left:4px; font-weight:bold; vertical-align:middle;">👨‍💼 남성 필수</span>`;

        // 출장자 배지 추가
        const assigneeName = trip.assignee || '미정';
        badges += `<span style="font-size:0.7rem; background-color:#EEF2FF; color:#4F46E5; padding:2px 6px; border-radius:4px; margin-left:4px; font-weight:bold; vertical-align:middle; border:1px solid #C7D2FE;">🏃 ${assigneeName}</span>`;

        // VIP 카테고리 배지 추가 (텔러스헬스, 휴노 커스텀 적용)
        let categoryBadge = '';
        const checkStr = trip.category ? trip.category : trip.name;
        if (checkStr) {
            if (checkStr.includes('텔러스헬스')) {
                categoryBadge = `<span style="font-size:0.7rem; background-color:#EFF6FF; color:#2563EB; padding:2px 6px; border-radius:4px; margin-left:4px; font-weight:bold; vertical-align:middle; border:1px solid #BFDBFE;">🏥 텔러스헬스</span>`;
            } else if (checkStr.includes('휴노')) {
                categoryBadge = `<span style="font-size:0.7rem; background-color:#F0FDF4; color:#16A34A; padding:2px 6px; border-radius:4px; margin-left:4px; font-weight:bold; vertical-align:middle; border:1px solid #BBF7D0;">🌿 휴노</span>`;
            } else if (trip.category && trip.category.toUpperCase().startsWith('VIP')) {
                categoryBadge = `<span style="font-size:0.7rem; background-color:#FFFBEB; color:#F59E0B; padding:2px 6px; border-radius:4px; margin-left:4px; font-weight:bold; vertical-align:middle; border:1px solid #FEF3C7;">⭐ VIP</span>`;
            }
        }

        div.title = trip.author ? `등록자: ${trip.author}` : '';

        let isPast = false;
        let displayDate = trip.date;
        if (trip.date) {
            let parts = trip.date.split(' to ');
            let endDate = parts.length > 1 ? parts[1] : parts[0];
            if (new Date(endDate).setHours(0, 0, 0, 0) < todayTime) isPast = true;
            if (parts.length > 1) displayDate = `${parts[0]} ~ ${parts[1]}`;
        }

        if (isPast) div.classList.add('past-trip');
        div.innerHTML = `<div class="trip-header"><div style="display:flex; align-items:flex-start; gap:10px;"><input type="checkbox" class="trip-checkbox" value="${trip.id}" style="width:18px; height:18px; margin-top:2px; cursor:pointer;" title="동선 최적화 선택"><div style="flex:1;"><div class="trip-title">${trip.name}${badges}${categoryBadge}</div><div class="trip-date">${displayDate}</div></div></div><div style="display:flex;gap:0.3rem;"><button class="delete-btn edit" style="padding:0.3rem;background:var(--col-bg);color:var(--text-main)"><span class="material-symbols-rounded">edit</span></button><button class="delete-btn del" style="padding:0.3rem"><span class="material-symbols-rounded">close</span></button></div></div><div class="trip-info-row">${trip.address}${trip.bookedHotel ? `<div style="color:#E63946; font-size:0.8rem; font-weight:bold; margin-top:4px;"><span class="material-symbols-rounded" style="font-size:1.1em; vertical-align:middle;">hotel</span> 예약 숙소: ${trip.bookedHotel}</div>` : ''}</div>`;

        div.onclick = (e) => {
            if (e.target.closest('.edit') || e.target.closest('.del')) return;
            if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') return;
            const checkbox = div.querySelector('.trip-checkbox');
            if (checkbox) checkbox.checked = !checkbox.checked;
        };

        div.querySelector('.edit').onclick = () => openTripModal(trip.id, trip.name, trip.date, trip.assignee, trip.contact, trip.address, trip.scheduleUrl, trip.schedulePath, trip.qrUrl || '', trip.qrPath || '', trip.roomType, trip.bookedHotel);
        div.querySelector('.del').onclick = () => deleteTrip(trip.id);

        if (isPast) {
            pastList.appendChild(div);
        } else {
            list.appendChild(div);
        }
    });
}

// 동선 옵션의 팀 설정 동적 렌더링
function renderTeamSettings() {
    const count = parseInt(document.getElementById('mapTeamCount').value) || 1;
    const container = document.getElementById('mapTeamSettings');
    if (!container) return;
    let html = '';
    for (let i = 1; i <= count; i++) {
        html += `
        <div style="display:flex; align-items:center; gap:6px; background:var(--card-bg); padding:6px 10px; border-radius:8px; border:1px solid var(--border-color); font-size:0.85rem; box-shadow:var(--shadow-sm);">
            <strong style="color:var(--primary); font-size:0.95rem;">${i}팀</strong>
            인원: <input type="number" id="team_personnel_${i}" value="1" min="1" style="width:40px; padding:4px; text-align:center; border:1px solid var(--border-color); border-radius:4px; outline:none;">
            성별: <select id="team_gender_${i}" style="padding:4px; border:1px solid var(--border-color); border-radius:4px; outline:none;">
                <option value="mixed">일반</option>
                <option value="male">👨‍💼 남성만</option>
                <option value="female">👩‍💼 여성만</option>
            </select>
        </div>`;
    }
    container.innerHTML = html;
}
setTimeout(renderTeamSettings, 200); // 페이지 로드 직후 1회 렌더링

let tripMap = null;
let mapPolylines = [];
let mapMarkers = [];

function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 지구 반지름 (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// 카카오 내비 API를 활용한 실제 도로 경로 및 거리 탐색 함수
async function getRoadRoute(point1, point2) {
    // 프론트엔드에서 카카오내비 REST API 직접 호출 (백엔드 우회)
    const KAKAO_REST_API_KEY = "9159f23f57165f61ac722d066d6f43b5";
    const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${point1.lng},${point1.lat}&destination=${point2.lng},${point2.lat}`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}` }
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();

        if (data && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const distance = route.summary.distance / 1000; // 미터를 km로 변환
            const duration = route.summary.duration; // 초 단위 운전 소요 시간
            const path = [];
            route.sections.forEach(section => {
                section.roads.forEach(road => {
                    for (let i = 0; i < road.vertexes.length; i += 2) {
                        path.push(new kakao.maps.LatLng(road.vertexes[i + 1], road.vertexes[i]));
                    }
                });
            });
            return { distance, duration, path };
        }
    } catch (e) {
        console.error("🔥 카카오 내비 API 직접 통신 실패:", e);
        showToast("경로 통신 오류로 직선거리로 대체되었습니다.", "warning");
    }
    // 내비 API 실패 시 기존 직선거리 로직으로 자동 폴백(안전장치)
    let fallbackDist = getHaversineDistance(point1.lat, point1.lng, point2.lat, point2.lng);
    return { distance: fallbackDist, duration: fallbackDist * 120, path: [new kakao.maps.LatLng(point1.lat, point1.lng), new kakao.maps.LatLng(point2.lat, point2.lng)] };
}

// 모든 팀과 출장지의 경우의 수를 계산하여 '총 이동 거리가 가장 짧은 환상의 짝꿍'을 찾아내는 함수
function getDailyBestAssignment(teams, trips) {
    let bestSum = Infinity;
    let bestAssignment = [];
    let N = teams.length;
    let M = trips.length;
    let maxAssign = Math.min(N, M);
    let usedTrips = new Array(M).fill(false);

    let iterations = 0;
    const MAX_ITERATIONS = 50000;

    function backtrack(teamPtr, currentSum, currentAssign) {
        if (iterations > MAX_ITERATIONS) return; // 무한루프, 브라우저 멈춤 방지
        iterations++;

        if (currentSum >= bestSum) return; // 더 긴 경로가 예상되면 즉시 포기
        if (currentAssign.length === maxAssign) {
            bestSum = currentSum;
            bestAssignment = [...currentAssign];
            return;
        }
        if (teamPtr >= N) return;

        let canSkip = (N - teamPtr > maxAssign - currentAssign.length);
        for (let i = 0; i < M; i++) {
            if (usedTrips[i]) continue;
            let team = teams[teamPtr];
            let trip = trips[i];

            let reqG = trip.requiredGender || (trip.requiresFemale ? 'female' : 'any');
            let reqP = trip.requiredPersonnel || 1;

            // 🔥 제약 조건: 요구 인원수 초과 시 또는 성별 불일치 시 배정 불가
            if (reqP > team.personnel) continue;
            if (reqG === 'female' && team.gender === 'male') continue;
            if (reqG === 'male' && team.gender === 'female') continue;

            let dist = team.lastPoint ? getHaversineDistance(team.lastPoint.lat, team.lastPoint.lng, trip.lat, trip.lng) : (1000 - trip.lat);

            usedTrips[i] = true;
            currentAssign.push({ teamIdx: teamPtr, tripIdx: i, dist: dist }); // dist 누락 버그 해결
            backtrack(teamPtr + 1, currentSum + dist, currentAssign);
            currentAssign.pop();
            usedTrips[i] = false;
        }
        if (canSkip) backtrack(teamPtr + 1, currentSum, currentAssign);
    }

    // 초기 그리디 접근으로 빠른 근사 최적값 설정 (최적화)
    let greedySum = 0;
    let greedyAssign = [];
    let greedyUsed = new Array(M).fill(false);
    for (let tPtr = 0; tPtr < N; tPtr++) {
        if (greedyAssign.length === maxAssign) break;
        let bestDist = Infinity, bestTripIdx = -1;
        for (let i = 0; i < M; i++) {
            if (greedyUsed[i]) continue;
            let team = teams[tPtr]; let trip = trips[i];
            let reqG = trip.requiredGender || (trip.requiresFemale ? 'female' : 'any');
            let reqP = trip.requiredPersonnel || 1;
            if (reqP > team.personnel || (reqG === 'female' && team.gender === 'male') || (reqG === 'male' && team.gender === 'female')) continue;
            let dist = team.lastPoint ? getHaversineDistance(team.lastPoint.lat, team.lastPoint.lng, trip.lat, trip.lng) : (1000 - trip.lat);
            if (dist < bestDist) { bestDist = dist; bestTripIdx = i; }
        }
        if (bestTripIdx !== -1) {
            greedyUsed[bestTripIdx] = true;
            greedySum += bestDist;
            greedyAssign.push({ teamIdx: tPtr, tripIdx: bestTripIdx, dist: bestDist });
        }
    }
    if (greedyAssign.length === maxAssign) {
        bestSum = greedySum;
        bestAssignment = [...greedyAssign];
    }

    backtrack(0, 0, []);
    return bestAssignment;
}

async function calculateOptimizedRoute() {
    try {
        const teamCount = parseInt(document.getElementById('mapTeamCount').value) || 1;
        const routingStrategy = document.getElementById('mapRoutingStrategy').value;
        const isStartFromHQ = document.getElementById('mapStartFromHQ').checked;
        const checkedBoxes = document.querySelectorAll('.trip-checkbox:checked');
        let targetTrips = [];

        // 1. 대상 출장지 수집
        if (checkedBoxes.length > 0) {
            const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
            targetTrips = Object.values(AppStore.getTrips()).filter(t => selectedIds.includes(t.id) && t.address);
        } else {
            const mapAssigneeEl = document.getElementById('mapAssignee');
            if (!mapAssigneeEl) {
                return await customAlert('출장 목록에서 동선을 그릴 출장지를 체크(✔)해 주세요.');
            }
            const assignee = mapAssigneeEl.value.trim().toLowerCase();
            const startDate = document.getElementById('mapStartDate').value;
            const endDate = document.getElementById('mapEndDate').value;

            if (!assignee || !startDate || !endDate) return await customAlert('출장 목록에서 동선을 그릴 출장지를 체크(✔)하거나,\n검색할 담당자 이름과 기간을 모두 입력해주세요.');
            if (startDate > endDate) return await customAlert('시작일이 종료일보다 늦을 수 없습니다.');

            targetTrips = Object.values(AppStore.getTrips()).filter(t => {
                if (!t.date || !t.assignee || !t.address) return false;
                const tName = t.assignee.toLowerCase();
                return (tName.includes(assignee) || assignee.includes(tName)) && t.date >= startDate && t.date <= endDate;
            });
        }

        if (typeof kakao === 'undefined' || !kakao.maps || !kakao.maps.services) {
            document.getElementById('tripMap').innerHTML = '<span style="color:var(--danger);">지도 API 로드 실패</span>';
            return await customAlert("카카오 지도 API가 연결되지 않았습니다.\n\nindex.html에 카카오 <script> 태그가 정확히 있는지 확인해주세요.");
        }

        document.getElementById('tripMap').innerHTML = '<div style="color:var(--text-main); font-weight:bold;">주소를 좌표로 변환하며 경로를 계산 중입니다...⏳</div>';
        document.getElementById('tripRouteList').innerHTML = '';

        // 브라우저 렌더링 양보
        await new Promise(r => setTimeout(r, 50));

        // 사전에 불가능한 조건이 있는지 필터링
        let teamsPreview = Array.from({ length: teamCount }, (_, i) => ({
            personnel: parseInt(document.getElementById(`team_personnel_${i + 1}`)?.value) || 1,
            gender: document.getElementById(`team_gender_${i + 1}`)?.value || 'mixed'
        }));

        let hasUnmatchableTrip = targetTrips.some(t => {
            let reqG = t.requiredGender || (t.requiresFemale ? 'female' : 'any');
            let reqP = t.requiredPersonnel || 1;
            return teamsPreview.every(team => reqP > team.personnel || (reqG === 'female' && team.gender === 'male') || (reqG === 'male' && team.gender === 'female'));
        });
        if (hasUnmatchableTrip) {
            document.getElementById('tripMap').innerHTML = '<span style="color:var(--text-muted);">조건이 맞지 않아 동선을 그릴 수 없습니다.</span>';
            return await customAlert('⚠️ 출장지의 요구 조건(필요 인원수 / 성별)을 만족하는 차량(팀)이 단 한 곳도 없습니다.\n[동선 옵션] 하단에서 각 팀의 인원과 성별을 넉넉하게 설정해주세요.');
        }

        if (targetTrips.length === 0) {
            document.getElementById('tripMap').innerHTML = '<span style="color:var(--text-muted);">선택된 출장지 중 주소가 입력된 내역이 없거나 조건에 맞지 않습니다.</span>';
            return;
        }

        // 2. 주소 -> 좌표 변환 (카카오 내장 Geocoder 사용)
        const tripsWithCoords = [];
        let failedTrips = [];
        const geocoder = new kakao.maps.services.Geocoder();

        for (let t of targetTrips) {
            if (!t.address || t.address.trim() === '') {
                failedTrips.push(t.name);
                continue;
            }
            await new Promise(resolve => {
                try {
                    geocoder.addressSearch(t.address, function (result, status) {
                        if (status === kakao.maps.services.Status.OK) {
                            tripsWithCoords.push({ ...t, lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
                        } else {
                            console.warn('주소 변환 실패:', t.address);
                            failedTrips.push(t.name);
                        }
                        resolve();
                    });
                } catch (e) {
                    console.error('Geocoder error:', e);
                    failedTrips.push(t.name);
                    resolve();
                }
            });
        }

        await new Promise(r => setTimeout(r, 50));

        if (failedTrips.length > 0) {
            showToast(`⚠️ 아래 출장지는 주소를 찾을 수 없어 동선에서 제외되었습니다:\n👉 ${failedTrips.join(', ')}\n\n(상호명이 아닌 정확한 도로명/지번 주소로 수정해주세요!)`, "warning");
        }

        if (tripsWithCoords.length === 0) {
            document.getElementById('tripMap').innerHTML = '<span style="color:var(--text-muted);">좌표 변환 가능한 올바른 주소가 없습니다.</span>';
            return await customAlert('입력된 주소들 중 지도에서 찾을 수 있는 정확한 주소가 없습니다.');
        }

        // 본점(출발지) 좌표 세팅
        const hqAddress = "서울시 영등포구 도신로 143";
        let hqCoords = null;
        await new Promise(resolve => {
            geocoder.addressSearch(hqAddress, function (result, status) {
                if (status === kakao.maps.services.Status.OK) {
                    hqCoords = { lat: parseFloat(result[0].y), lng: parseFloat(result[0].x), name: "본점 센터", address: hqAddress, isHQ: true };
                }
                resolve();
            });
        });
        if (!hqCoords) hqCoords = { lat: 37.506543, lng: 126.904543, name: "본점 센터", address: hqAddress, isHQ: true };

        const TEAM_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];

        let teams = Array.from({ length: teamCount }, (_, i) => {
            let teamIdx = i + 1;
            return {
                teamId: teamIdx,
                personnel: parseInt(document.getElementById(`team_personnel_${teamIdx}`)?.value) || 1,
                gender: document.getElementById(`team_gender_${teamIdx}`)?.value || 'mixed',
                color: TEAM_COLORS[i % TEAM_COLORS.length],
                route: [], path: [], totalDistance: 0, totalDuration: 0,
                simulatedDistance: 0, simulatedDuration: 0, // 🔥 공평 분배를 위한 팀별 누적 피로도 트래커
                lastPoint: isStartFromHQ ? hqCoords : null
            };
        });

        let skippedTrips = [];

        let tripsByDate = {};
        tripsWithCoords.forEach(t => {
            if (!tripsByDate[t.date]) tripsByDate[t.date] = [];
            tripsByDate[t.date].push(t);
        });
        const sortedDates = Object.keys(tripsByDate).sort((a, b) => new Date(a) - new Date(b));

        // --- 알고리즘 분기점 ---
        if (routingStrategy === 'total_distance') {
            for (let date of sortedDates) {
                let todaysTrips = [...tripsByDate[date]];
                let bestAssignment = getDailyBestAssignment(teams, todaysTrips);

                let assignedTripIndices = new Set();
                bestAssignment.forEach(assign => {
                    let team = teams[assign.teamIdx];
                    let trip = todaysTrips[assign.tripIdx];
                    team.route.push(trip);
                    team.lastPoint = trip;
                    team.simulatedDistance += assign.dist; // 누적 거리 갱신
                    assignedTripIndices.add(assign.tripIdx);
                });

                for (let i = 0; i < todaysTrips.length; i++) {
                    if (!assignedTripIndices.has(i)) skippedTrips.push(todaysTrips[i]);
                }
            }
        } else if (routingStrategy === 'sequential') {
            // [옵션 2] 전날 출장지 기준 (가까운 곳 우선 - 무조건 직전 위치에서 가장 가까운 곳 줍기)
            for (let date of sortedDates) {
                let todaysTrips = [...tripsByDate[date]];

                // 🔥 공평 분배: 현재까지 운전 거리가 '가장 짧은' 팀부터 줄을 세워서 일감을 줌
                let availableTeams = teams.map((t, idx) => idx).sort((a, b) => teams[a].simulatedDistance - teams[b].simulatedDistance);

                while (todaysTrips.length > 0 && availableTeams.length > 0) {
                    let bestTeamIdx = availableTeams[0]; // 가장 일을 안 한 팀
                    let team = teams[bestTeamIdx];
                    let bestTripIdx = -1;
                    let minDistance = Infinity;

                    for (let j = 0; j < todaysTrips.length; j++) {
                        let trip = todaysTrips[j];

                        let reqG = trip.requiredGender || (trip.requiresFemale ? 'female' : 'any');
                        let reqP = trip.requiredPersonnel || 1;
                        if (reqP > team.personnel) continue;
                        if (reqG === 'female' && team.gender === 'male') continue;
                        if (reqG === 'male' && team.gender === 'female') continue;

                        let dist = team.lastPoint ? getHaversineDistance(team.lastPoint.lat, team.lastPoint.lng, trip.lat, trip.lng) : (1000 - trip.lat);
                        if (dist < minDistance) { minDistance = dist; bestTripIdx = j; }
                    }

                    if (bestTripIdx !== -1) {
                        let selectedTrip = todaysTrips.splice(bestTripIdx, 1)[0];
                        team.route.push(selectedTrip);
                        team.lastPoint = selectedTrip;
                        team.simulatedDistance += minDistance; // 누적 거리 갱신
                    }
                    availableTeams.shift(); // 이 팀은 배정 끝
                }
                if (todaysTrips.length > 0) skippedTrips.push(...todaysTrips);
            }
        } else if (routingStrategy === 'time') {
            // [옵션 3] 실시간 교통 상황 기준 (카카오내비 실제 주행 시간 비교)
            document.getElementById('tripMap').innerHTML = '<div style="color:var(--text-main); font-weight:bold;">실시간 교통정보(카카오내비)를 분석 중입니다...⏳<br><small style="font-weight:normal;color:var(--text-muted);">요청이 많아 약간의 시간이 소요될 수 있습니다.</small></div>';

            for (let date of sortedDates) {
                let todaysTrips = [...tripsByDate[date]];

                // 🔥 공평 분배: 현재까지 운전 시간(카카오내비 기준)이 '가장 적은' 팀부터 줄을 세움
                let availableTeams = teams.map((t, idx) => idx).sort((a, b) => teams[a].simulatedDuration - teams[b].simulatedDuration);

                while (todaysTrips.length > 0 && availableTeams.length > 0) {
                    let bestTeamIdx = availableTeams[0];
                    let team = teams[bestTeamIdx];
                    let combinations = [];

                    for (let j = 0; j < todaysTrips.length; j++) {
                        let trip = todaysTrips[j];
                        let reqG = trip.requiredGender || (trip.requiresFemale ? 'female' : 'any');
                        let reqP = trip.requiredPersonnel || 1;
                        if (reqP > team.personnel) continue;
                        if (reqG === 'female' && team.gender === 'male') continue;
                        if (reqG === 'male' && team.gender === 'female') continue;
                        combinations.push({ teamIdx: bestTeamIdx, tripIdx: j, team: team, trip: todaysTrips[j] });
                    }

                    if (combinations.length === 0) {
                        availableTeams.shift();
                        continue;
                    }

                    // 트래픽 과부하 방지 (Throttling / Chunking)
                    // 한 번에 5개씩만 API를 호출하고 300ms의 대기 시간을 가집니다.
                    const chunkSize = 5;
                    const delay = ms => new Promise(res => setTimeout(res, ms));

                    for (let i = 0; i < combinations.length; i += chunkSize) {
                        const chunk = combinations.slice(i, i + chunkSize);
                        await Promise.all(chunk.map(async (combo) => {
                            if (combo.team.lastPoint) {
                                let roadData = await getRoadRoute(combo.team.lastPoint, combo.trip);
                                combo.duration = roadData.duration;
                            } else {
                                combo.duration = (1000 - combo.trip.lat) * 3600; // 초기 위치가 없을 때 위도 기준 방어
                            }
                        }));
                        if (i + chunkSize < combinations.length) await delay(300);
                    }

                    let bestCombo = combinations.reduce((min, curr) => curr.duration < min.duration ? curr : min, combinations[0]);

                    let selectedTrip = todaysTrips.splice(bestCombo.tripIdx, 1)[0];
                    team.route.push(selectedTrip);
                    team.lastPoint = selectedTrip;
                    team.simulatedDuration += bestCombo.duration || 0; // 누적 운전 시간 갱신
                    availableTeams.shift();
                }
                if (todaysTrips.length > 0) skippedTrips.push(...todaysTrips);
            }
        }

        if (skippedTrips.length > 0) {
            showToast(`⚠️ [팀 수 부족] 1팀 1일 1출장 원칙에 따라, 배정받지 못한 출장지가 ${skippedTrips.length}곳 있습니다.\n모든 동선을 소화하려면 팀(차량) 수를 늘려주세요.`, "warning");
        }

        // 4. 팀별로 확정된 스케줄을 따라 카카오 내비 실제 도로 호출 (순차적)
        for (let team of teams) {
            if (team.route.length === 0) continue;

            let current = isStartFromHQ ? hqCoords : null;
            for (let trip of team.route) {
                if (current) {
                    let roadData = await getRoadRoute(current, trip);
                    trip.distFromPrev = roadData.distance;
                    trip.durationFromPrev = roadData.duration;
                    team.totalDistance += roadData.distance;
                    team.totalDuration += roadData.duration;
                    if (roadData.path && roadData.path.length > 0) {
                        team.path.push(...roadData.path);
                    } else {
                        team.path.push(new kakao.maps.LatLng(current.lat, current.lng));
                        team.path.push(new kakao.maps.LatLng(trip.lat, trip.lng));
                    }
                } else {
                    trip.distFromPrev = 0;
                    trip.durationFromPrev = 0;
                }
                current = trip;
            }
        }

        const finalRoutes = teams.filter(t => t.route.length > 0);

        // 5. 지도 렌더링
        const mapContainer = document.getElementById('tripMap');
        mapContainer.innerHTML = '';
        const initialCenter = finalRoutes.length > 0 && finalRoutes[0].route.length > 0 ? new kakao.maps.LatLng(finalRoutes[0].route[0].lat, finalRoutes[0].route[0].lng) : new kakao.maps.LatLng(37.506543, 126.904543);
        const mapOptions = { center: initialCenter, level: 8 };
        tripMap = new kakao.maps.Map(mapContainer, mapOptions);

        const bounds = new kakao.maps.LatLngBounds();
        const listEl = document.getElementById('tripRouteList');

        if (isStartFromHQ && hqCoords) {
            const hqPosition = new kakao.maps.LatLng(hqCoords.lat, hqCoords.lng);
            bounds.extend(hqPosition);
            const hqContentEl = document.createElement('div');
            hqContentEl.innerHTML = `<div style="background-color: #1F2937; color: white; padding: 4px 8px; border-radius: 8px; display: flex; justify-content: center; align-items: center; font-weight: bold; font-size: 0.85rem; border: 2px solid white; box-shadow: var(--shadow-sm); cursor: pointer;"><span class="material-symbols-rounded" style="font-size:1.1em; margin-right:4px;">apartment</span>본점</div>`;
            const hqOverlay = new kakao.maps.CustomOverlay({ position: hqPosition, content: hqContentEl, yAnchor: 0.5, zIndex: 10 });
            hqOverlay.setMap(tripMap);
        }

        finalRoutes.sort((a, b) => a.teamId - b.teamId).forEach(teamData => {
            const color = teamData.color;

            let hrs = Math.floor(teamData.totalDuration / 3600);
            let mins = Math.floor((teamData.totalDuration % 3600) / 60);
            let durationText = hrs > 0 ? `${hrs}시간 ${mins}분` : `${mins}분`;

            // 팀 헤더 및 총 주행 거리 표시
            const headerLi = document.createElement('div');
            headerLi.className = 'route-team-header';
            headerLi.style.borderColor = color;
            headerLi.style.color = color;
            const naviBtnId = `navi-btn-${teamData.teamId}`;
            headerLi.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:0.5rem;">
                <span><span class="material-symbols-rounded">local_shipping</span> ${teamData.teamId}팀 배정 <span style="font-size:0.85rem; color:var(--text-muted); font-weight:normal;">(총 ${teamData.totalDistance.toFixed(1)}km / ${durationText})</span></span>
                <button id="${naviBtnId}" style="background-color:#FEE500; color:#000000; border:none; padding:0.3rem 0.6rem; font-size:0.85rem; display:flex; align-items:center; gap:4px; font-weight:bold; border-radius:6px; cursor:pointer;"><span class="material-symbols-rounded" style="font-size:1.1em;">navigation</span> 카카오내비 전송</button>
            </div>
        `;
            listEl.appendChild(headerLi);

            // 동선 기반 최저가 주유소 탐색 및 유류비 정밀 산출
            const routeCoords = [];
            if (isStartFromHQ && hqCoords) routeCoords.push(hqCoords);
            teamData.route.forEach(trip => routeCoords.push({ lat: trip.lat, lng: trip.lng }));

            let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
            routeCoords.forEach(c => {
                if (c.lat < minLat) minLat = c.lat;
                if (c.lat > maxLat) maxLat = c.lat;
                if (c.lng < minLng) minLng = c.lng;
                if (c.lng > maxLng) maxLng = c.lng;
            });
            minLat -= 0.15; maxLat += 0.15;
            minLng -= 0.15; maxLng += 0.15;

            let matchedStations = CHEAPEST_STATIONS_DB.filter(s =>
                s.lat >= minLat && s.lat <= maxLat && s.lng >= minLng && s.lng <= maxLng
            );
            if (matchedStations.length === 0) {
                matchedStations = [CHEAPEST_STATIONS_DB[4]]; // 알뜰주유소 폴백
            }
            const cheapestStation = matchedStations.reduce((min, curr) => curr.price < min.price ? curr : min, matchedStations[0]);

            const fuelEfficiency = 11.5;
            const expectedFuelCost = Math.round((teamData.totalDistance / fuelEfficiency) * cheapestStation.price);

            const fuelLi = document.createElement('div');
            fuelLi.className = 'smart-fuel-cost-container';
            fuelLi.style.cssText = 'margin: 0.4rem 0.5rem 0.8rem 0.5rem;';

            const brandUpper = cheapestStation.brand === 'oilbank' ? 'OILBANK' : (cheapestStation.brand === 'altteul' ? '알뜰' : cheapestStation.brand.toUpperCase());

            fuelLi.innerHTML = `
            <div style="display:flex; align-items:center; gap:4px; font-size:0.82rem; font-weight:600; color:var(--text-main);">
                <span class="material-symbols-rounded" style="color:#3B82F6; font-size:1.2rem;">local_gas_station</span>
                <span>경로 상 최저가 주유소:</span>
                <span class="fuel-station-tag ${cheapestStation.brand}">${brandUpper}</span>
                <span>${cheapestStation.name}</span>
                <span style="color:var(--text-muted); font-size:0.75rem;">(${cheapestStation.price.toLocaleString()}원/L)</span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:normal; padding-left:1.4rem;">
                총 예상 유류비: <strong style="color:var(--primary); font-size:0.85rem;">${expectedFuelCost.toLocaleString()}</strong>원 
                <span style="font-size:0.7rem; color:var(--text-muted); font-weight:normal;">(연비 ${fuelEfficiency}km/L 기준)</span>
            </div>
        `;
            listEl.appendChild(fuelLi);

            // 모바일 카카오내비 다중 경유지 전송 클릭 이벤트
            const naviBtn = document.getElementById(naviBtnId);
            naviBtn.onclick = () => {
                if (typeof Kakao === 'undefined' || !Kakao.Navi) {
                    showToast('카카오내비 연동을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.', 'warning');
                    return;
                }
                if (teamData.route.length === 0) return;
                // 카카오내비는 최대 3개의 경유지만 허용하므로 앞 3개만 자르고 나머지는 무시
                let dest = teamData.route[teamData.route.length - 1];
                let vias = teamData.route.slice(0, teamData.route.length - 1).slice(0, 3).map(t => ({ name: t.name, x: t.lng, y: t.lat }));

                Kakao.Navi.start({ name: dest.name, x: dest.lng, y: dest.lat, viaPoints: vias });
            };

            let currentRenderDate = null;
            let tripNumber = 1; // 순번 카운터

            teamData.route.forEach((trip) => {
                const position = new kakao.maps.LatLng(trip.lat, trip.lng);
                bounds.extend(position);

                if (currentRenderDate !== trip.date) {
                    const dateHeader = document.createElement('div');
                    dateHeader.style.cssText = 'font-size:0.85rem; color:var(--text-muted); margin: 0.8rem 0 0.2rem 0.5rem; font-weight:bold;';
                    dateHeader.textContent = `🗓 [${trip.date}]`;
                    listEl.appendChild(dateHeader);

                    if (isStartFromHQ && tripNumber === 1) { // 첫날의 맨 처음에만 본점 표시
                        const startLi = document.createElement('div');
                        startLi.className = 'route-item';
                        startLi.innerHTML = `<div class="route-item-number" style="background-color: #1F2937; width:auto; padding:0 8px; border-radius:12px; font-size: 0.8rem;">출발</div>
                        <div class="route-item-info">
                            <div class="route-item-title">${hqCoords.name}</div><div class="route-item-address">${hqCoords.address}</div>
                        </div>`;
                        listEl.appendChild(startLi);
                    }
                    currentRenderDate = trip.date;
                }

                // 마커 렌더링 (순번 표시)
                const contentEl = document.createElement('div');
                contentEl.innerHTML = `<div style="background-color: ${color}; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: bold; font-size: 1.1rem; border: 2px solid white; box-shadow: var(--shadow-sm); cursor: pointer;">${tripNumber}</div>`;
                const customOverlay = new kakao.maps.CustomOverlay({ position: position, content: contentEl, yAnchor: 0.5, zIndex: 2 });
                customOverlay.setMap(tripMap);

                const infoOverlay = new kakao.maps.CustomOverlay({ position: position, content: `<div style="padding:8px; font-size:0.85rem; color:#333; background:white; border-radius:4px; box-shadow:var(--shadow-md); border:2px solid ${color}; transform: translateY(-40px); white-space: nowrap;">${trip.name}</div>`, yAnchor: 1, zIndex: 3 });
                contentEl.addEventListener('mouseenter', () => infoOverlay.setMap(tripMap));
                contentEl.addEventListener('mouseleave', () => infoOverlay.setMap(null));

                let tripHrs = Math.floor(trip.durationFromPrev / 3600);
                let tripMins = Math.floor((trip.durationFromPrev % 3600) / 60);
                let tripDurationText = tripHrs > 0 ? `${tripHrs}시간 ${tripMins}분` : `${tripMins}분`;

                // 목록 아이템 렌더링
                const li = document.createElement('div');
                li.className = 'route-item';
                li.innerHTML = `<div class="route-item-number" style="background-color: ${color};">${tripNumber}</div>
                <div class="route-item-info">
                    <div class="route-item-title">${trip.name}</div><div class="route-item-address">${trip.address}</div>
                    ${trip.distFromPrev > 0 ? `<div class="route-item-dist" style="color:${color};">↑ 차량 이동 약 ${trip.distFromPrev.toFixed(1)}km (${tripDurationText})</div>` : ''}
                </div>`;
                listEl.appendChild(li);

                tripNumber++; // 순번 증가
            });

            // 팀 전체 경로 선 한 번에 그리기 (서버 부하 없이 매끄럽게 연결)
            if (teamData.path && teamData.path.length > 0) {
                teamData.path.forEach(p => bounds.extend(p));
                const polyline = new kakao.maps.Polyline({
                    path: teamData.path,
                    strokeWeight: 6,
                    strokeColor: color,
                    strokeOpacity: 0.8,
                    strokeStyle: 'solid'
                });
                polyline.setMap(tripMap);
            }
        });

        if (finalRoutes.some(r => r.route.length > 0)) {
            tripMap.setBounds(bounds);
        }
    } catch (e) {
        console.error("동선 그리기 중 에러 발생:", e);
        const mapContainer = document.getElementById('tripMap');
        if (mapContainer) {
            mapContainer.innerHTML = `<div style="color:var(--danger); padding:1rem; font-weight:bold;">경로 계산 중 오류가 발생했습니다: ${e.message}</div>`;
        }
    }
}

/**
 * 모바일 화면에서 지도 터치 오버레이를 해제하고 활성화하는 함수
 */
function activateMobileMap() {
    const overlay = document.getElementById('map-touch-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        showToast('지도가 터치 활성화 상태로 변경되었습니다.', 'info');
    }
}