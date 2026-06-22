/**
 * ==============================================================================
 * FaWW Workspace - 지메일 출장/업무소통 자동 연동 시스템 (ChatGPT 연동 고도화 버전)
 * ==============================================================================
 * 
 * [동기화 문제 해결 체크리스트]
 * 1. OPENAI_API_KEY 에 실제 발급받은 OpenAI API 키를 입력하셔야 정상 작동합니다.
 * 2. 지메일에 "회사명/담당자명" 형태의 계층형 라벨(예: "1. 텔러스헬스/홍길동")이 적용되어 있어야 합니다.
 * 3. 메일은 "읽지 않음" 상태여야 하며, 별표(*)가 없어야 작동합니다.
 */

const FIREBASE_DB_URL = "https://coworking-tool-default-rtdb.firebaseio.com/businessTrips.json?auth=qgZFTbFRRkxrsFH8EtQeMffLQ6kUkMUVU1utc7RJ";
const COMMUNICATIONS_DB_URL = "https://coworking-tool-default-rtdb.firebaseio.com/businessCommunications.json?auth=qgZFTbFRRkxrsFH8EtQeMffLQ6kUkMUVU1utc7RJ";

// ⚠️ 보안을 위해 OpenAI API Key를 구글 앱스 스크립트 속성(Script Properties)에서 읽어오도록 설정합니다.
// 로컬 소스 코드나 Git 커밋에 API Key가 노출되는 것을 방지합니다.
const OPENAI_API_KEY = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY') || "YOUR_OPENAI_API_KEY_HERE";


function autoRegisterTripsWithChatGPT() {
  Logger.log("=== FaWW Gmail ChatGPT Sync Started ===");

  if (OPENAI_API_KEY === "YOUR_OPENAI_API_KEY_HERE" || !OPENAI_API_KEY) {
    Logger.log("❌ 오류: OpenAI API Key가 설정되지 않았습니다. 스크립트 상단의 OPENAI_API_KEY를 수정해 주세요.");
    return;
  }

  // 1. 모든 지메일 사용자 라벨 조회
  const allLabels = GmailApp.getUserLabels();
  Logger.log(`지메일에 등록된 총 라벨 수: ${allLabels.length}개`);

  // 계층형 라벨만 필터링 (/ 가 포함된 라벨 - 기존 출장용 라벨)
  const targetLabels = allLabels.filter(l => l.getName().indexOf('/') !== -1);
  const targetLabelNames = targetLabels.map(l => `label:"${l.getName()}"`);
  
  if (targetLabelNames.length === 0) {
    Logger.log("⚠️ 동기화 대상 출장용 계층형 라벨이 지메일에 존재하지 않습니다. 동기화를 건너뜁니다.");
    return;
  }

  // 2. 검색 Query 구성 (별표 여부와 관계없이 대상 라벨이 붙은 스레드를 일단 수집)
  const searchQuery = `(${targetLabelNames.join(" OR ")})`;
  Logger.log(`생성된 지메일 검색 쿼리: ${searchQuery}`);
  
  // 최근 스레드 최대 50개 검색
  const threads = GmailApp.search(searchQuery, 0, 50);
  Logger.log(`Found ${threads.length} potential threads to inspect.`);
  
  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    let mailCategory = "일반출장"; 
    let labelAssignee = ""; 

    // 메일의 라벨을 파싱하여 출장 카테고리(회사명)와 담당 직원명 동적 추출
    const labels = thread.getLabels();
    const tripLabel = labels.find(l => l.getName().indexOf('/') !== -1);
    
    if (tripLabel) {
      const labelName = tripLabel.getName();
      const parts = labelName.split('/'); 
      // 상위 카테고리에서 숫자 및 불필요한 번호 접두사 제거 (예: "1. 텔러스헬스" -> "텔러스헬스")
      mailCategory = parts[0].replace(/^\d+\.\s*/, "").trim();     
      if (parts.length > 1) labelAssignee = parts[1].trim();
    } else {
      // 출장용 계층형 라벨이 없는 경우 처리 대상이 아니므로 다음 스레드로 패스
      continue;
    }

    const messages = thread.getMessages();
    
    // 스레드 내의 개별 메일(메시지) 단위로 순회하며 동기화되지 않은 건만 처리
    for (let m = 0; m < messages.length; m++) {
      const msg = messages[m];
      
      // 이미 이 개별 메일에 별표(*)가 붙어있다면 동기화 완료로 간주하고 패스
      if (msg.isStarred()) {
        continue;
      }
      
      const subject = msg.getSubject();
      const body = msg.getPlainBody(); 
      const fullText = `[제목]: ${subject}\n[본문]: ${body}`;
      
      console.log(`🚀 [${mailCategory}/${labelAssignee}] 개별 메일 분석 중... [제목: ${subject}]`);
      
      let parsedData = parseEmailWithChatGPT(fullText);
      
      if (parsedData) {
        // 1. 일반 업무 소통 메일인 경우 (출장이 아님)
        if (parsedData.is_trip === false) {
          console.log(`📧 일반 소통 메일 감지: ${subject}`);
          
          let communicationData = {
            title: subject,
            summary: parsedData.summary || "업무 소통 내용 요약이 없습니다.",
            category: parsedData.category || "일반문의",
            sender: parsedData.assignee || labelAssignee || "미상",
            timestamp: Date.now(),
            emailDate: msg.getDate().getTime(),
            categoryLabel: mailCategory
          };
          
          const response = UrlFetchApp.fetch(COMMUNICATIONS_DB_URL, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(communicationData),
            muteHttpExceptions: true
          });
          
          const responseCode = response.getResponseCode();
          const responseText = response.getContentText();
          console.log(`Communication Response Code: ${responseCode} | Content: ${responseText}`);
          
          if (responseCode === 200) {
            try {
              // Firebase가 자동 생성한 Key를 id 필드로 역맵핑(PATCH)하여 데이터 무결성 보장
              const resObj = JSON.parse(responseText);
              if (resObj && resObj.name) {
                const baseDbUrl = COMMUNICATIONS_DB_URL.split('.json')[0];
                const authParam = COMMUNICATIONS_DB_URL.split('?')[1] || "";
                const patchUrl = `${baseDbUrl}/${resObj.name}.json?${authParam}`;
                
                UrlFetchApp.fetch(patchUrl, {
                  method: 'patch',
                  contentType: 'application/json',
                  payload: JSON.stringify({ id: resObj.name }),
                  muteHttpExceptions: true
                });
              }
            } catch (err) {
              console.log(`⚠️ ID 필드 맵핑 패치 에러: ${err}`);
            }
            
            console.log(`✅ 일반 메일 요약 등록 완료: ${communicationData.summary}`);
            msg.star(); // 개별 메일에 별표(*)를 달아 중복 파싱 차단
          } else {
            console.log(`❌ Firebase 전송 실패 (일반 소통): ${responseText}`);
          }
          continue;
        }
        
        // 2. 출장 메일인 경우
        let tripsToRegister = [];
        if (Array.isArray(parsedData.trips)) {
          tripsToRegister = parsedData.trips;
        } else if (parsedData.name) {
          tripsToRegister = [parsedData];
        }
        
        if (tripsToRegister.length === 0) {
          console.log("⚠️ 추출된 출장 정보가 없습니다.");
          continue;
        }
  
        let successfullyRegistered = false;
        
        for (let j = 0; j < tripsToRegister.length; j++) {
          const trip = tripsToRegister[j];
          if (!trip.name) continue;
          
          const sDate = trip.startDate || null;
          const eDate = trip.endDate || sDate;
          
          // 시작일과 종료일이 다를 경우 "시작일 to 종료일" 포맷으로 자동 변환 (달력 렌더링 최적화)
          let dateVal = sDate || "";
          if (sDate && eDate && sDate !== eDate) {
            dateVal = `${sDate} to ${eDate}`;
          }
          
          let tripData = {
            name: trip.name,
            startDate: sDate,
            endDate: eDate,
            date: dateVal,
            assignee: trip.assignee || labelAssignee || "미정", // 실제 파싱된 개별 강사/담당자를 우선 적용
            contact: trip.contact || "",
            address: trip.address || "주소 미상",
            roomType: "single",
            bookedHotel: "",
            requiredGender: trip.requiredGender || "any",
            requiredPersonnel: parseInt(trip.requiredPersonnel) || 1,
            author: "Gmail 자동 등록",
            category: mailCategory,
            timestamp: Date.now()
          };
          
          const response = UrlFetchApp.fetch(FIREBASE_DB_URL, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(tripData),
            muteHttpExceptions: true
          });
          
          const responseCode = response.getResponseCode();
          const responseText = response.getContentText();
          console.log(`Response Code: ${responseCode} | Content: ${responseText}`);
          
          if (responseCode === 200) {
            try {
              // Firebase가 자동 생성한 Key를 id 필드로 역맵핑(PATCH)하여 데이터 무결성 보장
              const resObj = JSON.parse(responseText);
              if (resObj && resObj.name) {
                const baseDbUrl = FIREBASE_DB_URL.split('.json')[0];
                const authParam = FIREBASE_DB_URL.split('?')[1] || "";
                const patchUrl = `${baseDbUrl}/${resObj.name}.json?${authParam}`;
                
                UrlFetchApp.fetch(patchUrl, {
                  method: 'patch',
                  contentType: 'application/json',
                  payload: JSON.stringify({ id: resObj.name }),
                  muteHttpExceptions: true
                });
              }
            } catch (err) {
              console.log(`⚠️ ID 필드 맵핑 패치 에러: ${err}`);
            }
            
            console.log(`✅ 등록 완료: ${tripData.name} (담당자: ${tripData.assignee} | 주소: ${tripData.address} | 날짜: ${tripData.date})`);
            successfullyRegistered = true;
          } else {
            console.log(`❌ Firebase 전송 실패 (출장): ${responseText}`);
          }
        }
        
        if (successfullyRegistered) {
          msg.star(); // 개별 메일에 별표(*)를 부여하여 다음 동기화 시 스킵
        }
      }
    }
  }
  
  Logger.log("=== FaWW Gmail ChatGPT Sync Finished ===");
}


function parseEmailWithChatGPT(emailContent) {
  const url = "https://api.openai.com/v1/chat/completions";
  const todayStr = getTodayString();
  const currentYear = todayStr.split('-')[0];

  const payload = {
    "model": "gpt-4o-mini",
    "response_format": { "type": "json_object" },
    "messages": [
      {
        "role": "system",
        "content": `너는 이메일 본문을 분석하여 출장 또는 일반 업무 소통 정보로 정확히 파악하고 분류하여 JSON 객체로 반환하는 전문가야.
기준이 되는 오늘 날짜는 **${todayStr}** 이고, 현재 연도는 **${currentYear}년** 이다. 

🔥 [출장 vs 일반 소통 판별 및 분류 규칙] 🔥
1. 메일 본문이 단순 예약 확인서, 일정 확정, 강사 배정(예: 텔러스헬스, 휴노 등 출장 목적지/강의 기관 방문)을 포함하는 출장 건이라면 "is_trip"을 true로 설정하고 trips 배열을 구성하라.
2. 만약 출장 확인서가 아닌 일반 공지사항, 단순 질문, 요청사항, 업무 보고서 공유 건인 경우 "is_trip"을 false로 설정하고 아래의 [일반 소통 객체 규칙]을 수행하라.

🔥 [1. 출장 메일인 경우 (is_trip: true) trips 추출 규칙] 🔥
trips 배열 내의 개별 출장 객체 추출:
- name: 출장 목적지 이름 또는 기관명 (예: "부산 기장군청 방문" 또는 "텔러스헬스 미팅"). 본문에서 파악된 정보가 없으면 제목을 참고하라.
- startDate: 출장 시작 날짜 (형식: YYYY-MM-DD). 이메일 본문에 연도 없이 월/일만 있는 경우(예: "6월 16일"), 기준 연도인 ${currentYear}년을 적용하여 "${currentYear}-06-16" 형식으로 채워라.
- endDate: 출장 종료 날짜 (형식: YYYY-MM-DD). 단일일 출장이거나 종료일이 없으면 startDate와 동일하게 지정하라.
- assignee: 출장 대상자 이름 (예: 강사명 또는 담당자명).
- contact: 출장자 연락처. 없으면 빈 문자열("")로 반환하라.
- address: 실제 출장 목적지 주소. 본문 하단 서명란에 있는 발신자 사무실 주소는 무시하라. 구체적인 주소가 없으면 제목의 지명(예: "부산 기장군청")을 주소로 반환하라.
- requiredPersonnel: 출장 총 인원수 (숫자 형식, 기본값 1).
- requiredGender: 필요한 성별 요구사항 ("any", "male", "female" 중 하나).

🔥 [2. 일반 업무 소통 메일인 경우 (is_trip: false) 추출 규칙] 🔥
- is_trip: false로 설정.
- summary: [중요] 이메일 본문과 제목을 읽고 본질적인 소통 내용을 명확하고 직관적인 **단 1문장의 한글**로 요약하라. 경어체(~건입니다, ~바랍니다 등)로 단정하게 끝마치라. (예: "6월 15일 검진 인원 취합에 관한 업무 보고 건입니다.")
- category: 메일 성격에 맞춰 다음 4가지 대분류 중 하나를 정확히 매핑하라:
  * '업무보고' (업무 보고서 공유, 피드백 건)
  * '공지사항' (전사 알림, 제도 개편, 공유 공지 건)
  * '일정공유' (회의 개설, 일정 조율, 교육 예약 건)
  * '일반문의' (단순 질문, 요청사항 등 기타 건)
- assignee: 메일 본문이나 발신자명에서 추정된 담당 직원/발신자 이름 (예: "최영우").

[응답 형식 예시 1 - 출장 메일인 경우]
{
  "is_trip": true,
  "trips": [
    {
      "name": "부산 기장군청 피지컬상담실 방문",
      "startDate": "${currentYear}-06-16",
      "endDate": "${currentYear}-06-17",
      "assignee": "최영우",
      "contact": "",
      "address": "부산기장군청",
      "requiredPersonnel": 1,
      "requiredGender": "any"
    }
  ]
}

[응답 형식 예시 2 - 일반 소통 메일인 경우]
{
  "is_trip": false,
  "summary": "6월 15일 텔러스헬스 검진 인원 통계 취합 보고 건입니다.",
  "category": "업무보고",
  "assignee": "최영우"
}`
      },
      {
        "role": "user",
        "content": emailContent
      }
    ],
    "temperature": 0.2
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": { "Authorization": "Bearer " + OPENAI_API_KEY },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    if (json.error) {
      Logger.log("❌ OpenAI API 에러 발생: " + json.error.message);
      return null;
    }
    if (json.choices && json.choices.length > 0) {
      return JSON.parse(json.choices[0].message.content);
    }
  } catch (e) {
    Logger.log("🔥 에러 발생: " + e);
  }
  return null;
}

function getTodayString() {
  return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
}

