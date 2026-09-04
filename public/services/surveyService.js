/**
 * surveyService.js
 * 설문조사 데이터 모델링 및 저장 로직을 처리하는 모듈
 * 
 * 객관식(숫자/코드) 밸류와 주관식(텍스트/AI토큰) 밸류를 
 * 구분하여 안전하게 Firestore에 저장하는 역할을 합니다.
 */

class SurveyService {
    constructor(db) {
        this.db = db; // Firestore instance
        this.collectionName = 'surveys';
    }

    /**
     * 설문 데이터를 분석하여 타입에 맞게 가공합니다.
     * @param {string} questionId 
     * @param {any} rawValue 
     * @returns {object} 가공된 데이터 페이로드
     */
    processValue(questionId, rawValue) {
        const isNumber = !isNaN(parseFloat(rawValue)) && isFinite(rawValue);
        
        if (isNumber || typeof rawValue === 'number') {
            // 객관식 밸류
            return {
                questionId,
                type: 'objective',
                value: Number(rawValue)
            };
        } else if (typeof rawValue === 'string') {
            // 주관식 밸류 (간단한 토큰화 예시 포함)
            // 실제 구현 시 AI API를 태워 키워드/감정(Sentiment) 토큰을 추출할 수 있습니다.
            const tokens = rawValue.split(' ').filter(word => word.length > 1);
            return {
                questionId,
                type: 'subjective',
                rawValue: rawValue,
                tokens: tokens // AI 시스템 처리를 위한 분리 저장
            };
        } else {
            return {
                questionId,
                type: 'unknown',
                rawValue
            };
        }
    }

    /**
     * 설문 응답 전체를 DB에 저장합니다.
     * @param {string} surveyId 
     * @param {string} userId 
     * @param {object} answers (ex: { q1: 5, q2: "너무 좋습니다" })
     */
    async submitSurvey(surveyId, userId, answers) {
        try {
            const responses = Object.entries(answers).map(([qId, val]) => {
                return this.processValue(qId, val);
            });

            const payload = {
                surveyId,
                userId,
                responses,
                submittedAt: new Date().toISOString()
            };

            // TODO: 실제 Firebase DB 연동 로직
            // await this.db.collection(this.collectionName).add(payload);
            
            console.log('Survey submitted successfully:', payload);
            return payload;
        } catch (error) {
            console.error('Error submitting survey:', error);
            throw error;
        }
    }
}

// 글로벌 등록 (바닐라 환경 호환성)
window.SurveyService = SurveyService;
