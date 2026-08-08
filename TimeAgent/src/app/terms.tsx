import { LegalDocument, type LegalSection } from '@/components/legal-document';

const sections: LegalSection[] = [
  {
    title: '1. 서비스 내용',
    paragraphs: ['TimeAgent는 일정, 준비 시간, 위치와 외부 경로 정보를 바탕으로 준비·출발 계획과 알림을 제안합니다. AI와 경로 결과는 참고 정보이며 실제 교통, 날씨와 현장 상황에 따라 달라질 수 있습니다.'],
  },
  {
    title: '2. 사용자 책임',
    paragraphs: ['사용자는 일정과 목적지 정보를 확인하고 안전한 상황에서 앱을 사용해야 합니다. 운전 중 화면 조작을 해서는 안 되며, 중요한 약속·운송·의료·재난 판단은 공식 정보와 직접 확인해야 합니다.'],
  },
  {
    title: '3. 계정과 데이터',
    paragraphs: ['Google 계정은 본인 소유 계정만 사용해야 합니다. 사용자는 설정에서 로그아웃하거나 계정 연결과 기기 데이터를 삭제할 수 있습니다. 앱 삭제나 기기 변경 전에 필요한 일정은 사용자가 별도로 보관해야 합니다.'],
  },
  {
    title: '4. 제공 변경과 중단',
    paragraphs: ['외부 지도, 교통, AI 또는 운영체제 서비스 상태에 따라 일부 기능이 지연되거나 제공되지 않을 수 있습니다. 이 경우 앱은 가능한 범위에서 마지막 정보, 임시 경로 또는 수동 입력 방법을 안내합니다.'],
  },
  {
    title: '5. 유료 기능',
    paragraphs: ['현재 Plus 화면은 출시 후보에 대한 관심 확인용이며 결제나 자동 갱신이 발생하지 않습니다. 향후 유료 기능을 제공하는 경우 가격, 갱신, 해지와 환불 조건을 결제 전에 별도로 고지합니다.'],
  },
  {
    title: '6. 문의와 약관 변경',
    paragraphs: ['서비스 문의는 Google Play 스토어에 표시된 개발자 연락처를 이용할 수 있습니다. 약관이 변경되면 시행일과 주요 내용을 앱 또는 공개 페이지에서 알립니다.'],
  },
];

export default function TermsScreen() {
  return <LegalDocument title="이용약관" effectiveDate="2026년 8월 6일" intro="TimeAgent를 사용하면 아래 조건에 동의한 것으로 봅니다. 중요한 시간과 이동 판단은 앱의 제안과 실제 상황을 함께 확인해 주세요." sections={sections} />;
}
