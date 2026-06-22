const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// 프론트엔드에서 호출할 수 있는 Callable Function
exports.getKakaoRoute = functions.region('asia-northeast3').https.onCall(async (data, context) => {
    // 1. 보안: 로그인한 사용자만 API를 호출할 수 있도록 백엔드에서 차단
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', '인증된 사용자만 이용할 수 있습니다.');
    }

    const { origin, destination } = data;
    if (!origin || !destination) {
        throw new functions.https.HttpsError('invalid-argument', '출발지와 도착지 좌표가 필요합니다.');
    }

    // 2. 카카오 REST API 호출 (서버 환경 변수로 키를 완벽하게 숨김)
    // *실제 운영 시에는 터미널에서 firebase functions:config:set kakao.key="내API키" 로 암호화하여 저장하세요.
    const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 
                               (functions.config().kakao && functions.config().kakao.key) || 
                               "9159f23f57165f61ac722d066d6f43b5";
    const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin.lng},${origin.lat}&destination=${destination.lng},${destination.lat}`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}` }
        });
        
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const resultData = await response.json();
        return resultData;
    } catch (error) {
        console.error("Kakao API Error:", error);
        // 프론트엔드에는 구체적인 에러 원인을 숨기고 일반적인 메시지만 전달하여 추가적인 보안 확보
        throw new functions.https.HttpsError('internal', '경로를 가져오는 중 서버 오류가 발생했습니다.');
    }
});

// Apps Script (지메일 파싱) 전용 Webhook API
exports.webhookAddTrip = functions.region('asia-northeast3').https.onRequest(async (req, res) => {
    // 1. 간단한 보안 토큰 검사 (Apps Script와 맞춘 비밀번호)
    // *실제 운영 시에는 터미널에서 firebase functions:config:set webhook.secret="비밀토큰" 또는 환경변수(WEBHOOK_SECRET_TOKEN)로 저장하세요.
    const SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN || 
                         (functions.config().webhook && functions.config().webhook.secret) || 
                         "my-secret-faww-token-2024";
    if (req.headers.authorization !== `Bearer ${SECRET_TOKEN}`) {
        return res.status(403).send("Unauthorized");
    }

    // 2. Apps Script에서 보낸 데이터 받기
    const tripData = req.body;
    
    if (!tripData || !tripData.name || !tripData.date) {
        return res.status(400).send("Bad Request: Missing required fields");
    }

    try {
        // 3. Admin SDK를 사용하여 DB에 출장 강제 등록 (보안 규칙 우회)
        tripData.timestamp = Date.now();
        tripData.author = tripData.author || "Gmail 자동 등록";
        tripData.category = tripData.category || "일반"; // Apps Script에서 보낸 카테고리 정보 추가
        
        const ref = admin.database().ref('businessTrips').push();
        tripData.id = ref.key;
        await ref.set(tripData);
        
        res.status(200).send({ success: true, id: ref.key });
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).send("Internal Server Error");
    }
});