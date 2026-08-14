import fs from 'node:fs/promises';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';
import sharp from 'sharp';

const ROOT = '/Users/winddew/workspace/TimeAgent';
const OUT = path.join(ROOT, 'artifacts/presentation');
const W = 1280;
const H = 720;

const C = {
  navy: '#07111F', ink: '#111827', muted: '#667085', blue: '#2474F4',
  cyan: '#55D6FF', sky: '#E9F7FF', green: '#29B987', mint: '#DFF8EF',
  coral: '#F45B69', peach: '#FFF0EC', paper: '#F7F9FC', line: '#D6DEE8',
  white: '#FFFFFF', yellow: '#FFD35A', gray: '#EEF2F6',
};

const imgPaths = {
  home: path.join(ROOT, 'e2e/visual/__screenshots__/390x844/home.png'),
  voice: path.join(ROOT, 'e2e/visual/__screenshots__/390x844/voice-schedule-transport.png'),
  proposal: path.join(ROOT, 'e2e/visual/__screenshots__/390x844/voice-schedule-proposal.png'),
  plan: path.join(ROOT, 'e2e/visual/__screenshots__/390x844/plan-map-open.png'),
  login: path.join(ROOT, 'artifacts/timeagent-google-login-complete.png'),
  icon: path.join(ROOT, 'assets/images/icon.png'),
};

const dataUris = {};
for (const [key, file] of Object.entries(imgPaths)) {
  const ext = path.extname(file).slice(1);
  dataUris[key] = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${(await fs.readFile(file)).toString('base64')}`;
}

function esc(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function rect(x,y,w,h,fill,rx=0,stroke='none',sw=0) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}
function line(x1,y1,x2,y2,stroke=C.line,sw=2,dash='') {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
}
function textEl(x,y,text,size=24,fill=C.ink,weight=400,anchor='start', family='Apple SD Gothic Neo') {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(text)}</text>`;
}
function multiline(x,y,lines,size=24,fill=C.ink,weight=400,lh=1.35,anchor='start') {
  const ts = lines.map((v,i)=>`<tspan x="${x}" dy="${i===0?0:size*lh}">${esc(v)}</tspan>`).join('');
  return `<text x="${x}" y="${y}" font-family="Apple SD Gothic Neo" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${ts}</text>`;
}
function label(x,y,t,fill=C.blue,bg=C.sky,w=null) {
  const width=w ?? Math.max(92, t.length*17+34);
  return rect(x,y-25,width,38,bg,19)+textEl(x+width/2,y,t,16,fill,700,'middle');
}
function phone(x,y,w,h,key,crop='xMidYMid meet',radius=28) {
  const id=`clip-${key}-${x}-${y}`.replaceAll('.','-');
  return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}"/></clipPath></defs>`+
    rect(x-5,y-5,w+10,h+10,C.navy,radius+4)+
    `<image href="${dataUris[key]}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${crop}" clip-path="url(#${id})"/>`;
}
function footer(n, dark=false) {
  return textEl(72,684,'DX CAMP · DX DUO · 2026.08.14',13,dark?'#93A4B8':C.muted,600)+textEl(1208,684,String(n).padStart(2,'0'),13,dark?'#93A4B8':C.muted,700,'end');
}
function base(bg=C.white) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${rect(0,0,W,H,bg)}`;
}
function title(y, eyebrow, heading, dark=false) {
  return textEl(72,y,eyebrow.toUpperCase(),15,dark?C.cyan:C.blue,800)+textEl(72,y+56,heading,40,dark?C.white:C.ink,800);
}
function iconCircle(cx,cy,txt,bg=C.blue,fg=C.white,r=26) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}"/>${textEl(cx,cy+8,txt,24,fg,800,'middle')}`;
}

const slides = [];
function addSlide(svg, notes) { slides.push({svg: svg+'</svg>', notes}); }

// 1 — cover
{
  let s=base(C.navy);
  s += `<circle cx="1120" cy="100" r="260" fill="#0C2850" opacity=".45"/><circle cx="1070" cy="610" r="300" fill="#0A3147" opacity=".55"/>`;
  s += `<image href="${dataUris.icon}" x="72" y="56" width="74" height="74"/>`;
  s += textEl(166,103,'TimeAgent',30,C.white,800);
  s += textEl(72,206,'DX CAMP 6주차 · 진행 발표',17,C.cyan,800);
  s += multiline(72,295,['말로 약속하면,','늦지 않게 준비가 시작됩니다'],54,C.white,800,1.22);
  s += multiline(72,474,['비공개 테스트 공개 이후 발견한 문제와','이번 주에 검증할 사용자 반응'],24,'#B9C7D8',500,1.45);
  s += textEl(72,632,'DX Duo · 신동윤',19,C.white,700);
  s += phone(878,54,270,584,'home');
  addSlide(s,`오프닝: 이번 주에는 기능 목록이 아니라 실제 배포와 테스트에서 무엇을 배웠는지 말씀드리겠습니다.\n\n[Sources]\n- https://app.notion.com/p/pathfindercamp/DX-Campfire-c46c5d70733b8289a80901d69c4eaea4\n- ${ROOT}/docs/EXECUTION_PLAN.md\n[/Sources]`);
}

// 2 — promise / flow
{
  let s=base(C.paper)+title(72,'서비스 한 문장','약속 시간을 “지금 할 행동”으로 바꿉니다');
  s += multiline(72,180,['일정을 저장하는 앱은 많지만,','준비를 시작하게 만드는 앱은 드뭅니다.'],28,C.muted,500,1.45);
  const xs=[92,372,652,932];
  const steps=[['1','말하기','시간·장소·이동수단'],['2','확인','빠진 정보만 재질문'],['3','역산','준비·출발·도착'],['4','실행','다음 행동과 남은 시간']];
  xs.forEach((x,i)=>{
    if(i<3) s+=line(x+150,405,xs[i+1]-28,405,C.blue,4);
    s+=iconCircle(x+28,405,steps[i][0],i===3?C.green:C.blue);
    s+=textEl(x,474,steps[i][1],25,C.ink,800);
    s+=multiline(x,510,[steps[i][2]],17,C.muted,500,1.3);
  });
  s += rect(72,584,1136,54,C.sky,12)+textEl(98,619,'핵심 가치: 지연을 알리는 데서 끝나지 않고, 바로 실행 가능한 다음 행동을 제시합니다.',20,C.blue,700);
  s += footer(2);
  addSlide(s,`TimeAgent의 핵심은 캘린더 대체가 아니라 실행 지원입니다. 약속을 말하면 필요한 정보를 확인하고 준비 시작과 출발을 역산합니다.\n\n[Sources]\n- ${ROOT}/docs/EXECUTION_PLAN.md\n- https://timeflow-landing.wcshin.chatgpt.site/timeflow\n[/Sources]`);
}

// 3 — release
{
  let s=base()+title(72,'실제 공개','Google Play Alpha에 올렸고, 최신 수정본은 검토 중입니다');
  s += rect(72,170,430,430,C.navy,28);
  s += label(104,218,'현재 상태',C.cyan,'#12304A',110);
  s += textEl(104,304,'1.0.4',64,C.white,800);
  s += textEl(104,350,'versionCode 5',20,'#A9B9CB',600);
  s += rect(104,394,194,48,'#173B2F',24)+textEl(201,426,'검토 중',19,'#63E6B2',800,'middle');
  s += multiline(104,494,['검토 통과 시','테스터에게 자동 배포'],22,C.white,700,1.38);
  s += line(566,270,1138,270,C.line,4);
  s += `<circle cx="590" cy="270" r="12" fill="${C.blue}"/><circle cx="1110" cy="270" r="12" fill="${C.green}"/>`;
  s += textEl(566,224,'8월 12일',18,C.blue,800)+textEl(566,316,'1.0.0 Alpha 활성화',25,C.ink,800)+multiline(566,354,['스토어 설치 경로 공개','Google 로그인 결함 발견'],18,C.muted,500,1.4);
  s += textEl(902,224,'8월 14일',18,C.green,800)+textEl(902,316,'1.0.4 제출',25,C.ink,800)+multiline(902,354,['핵심 결함 수정 완료','214/214 자동 검증 통과'],18,C.muted,500,1.4);
  s += rect(566,490,572,110,C.sky,20)+textEl(594,530,'공개 범위',16,C.blue,800)+textEl(594,572,'대한민국 · 초대형 비공개 테스트',24,C.ink,800);
  s += footer(3);
  addSlide(s,`출시 여부는 “예”입니다. 1.0.0을 Alpha로 공개했고, 오늘 핵심 수정본 1.0.4를 제출해 현재 검토 중입니다. 관리형 게시가 꺼져 있어 승인 후 자동 배포됩니다.\n\n[Sources]\n- ${ROOT}/docs/EXECUTION_PLAN.md\n- ${ROOT}/docs/RELEASE_CHECKLIST.md\n- https://play.google.com/apps/testing/com.timeagent.app\n[/Sources]`);
}

// 4 — funnel honest
{
  let s=base(C.paper)+title(72,'테스트 도달','초대는 확보했지만, “누가 어떻게 썼는지” 증거는 아직 부족합니다');
  const bars=[{x:72,w:1110,n:'19',t:'초대 가능한 계정',c:C.blue},{x:150,w:742,n:'12',t:'Play 참여 선택',c:C.green},{x:228,w:420,n:'—',t:'핵심 흐름 완료 사용자',c:C.coral}];
  bars.forEach((b,i)=>{
    const y=190+i*132;
    s+=rect(b.x,y,b.w,96,b.c,16);
    s+=textEl(b.x+28,y+62,b.n,44,C.white,800);
    s+=textEl(b.x+112,y+58,b.t,22,C.white,700);
  });
  s += rect(720,438,418,166,C.white,18,C.line,1);
  s += textEl(748,478,'해석',17,C.coral,800);
  s += multiline(748,520,['12명은 “참여 선택” 수치입니다.','실사용·완료율로 해석하지 않습니다.','이번 주부터 행동 로그와 인터뷰로 전환합니다.'],19,C.ink,600,1.45);
  s += footer(4);
  addSlide(s,`19개 계정이 초대 목록에 있고 현재 12명이 비공개 테스트 참여를 선택했습니다. 다만 참여 선택은 실사용이 아닙니다. 외부 사용자가 로그인, 음성 등록, 계획 확정까지 완료했는지는 아직 구조적으로 수집하지 못했습니다. 이것이 가장 큰 증거 공백입니다.\n\n[Sources]\n- ${ROOT}/docs/RELEASE_CHECKLIST.md\n- ${ROOT}/docs/EXECUTION_PLAN.md\n[/Sources]`);
}

// 5 — observed problems
{
  let s=base()+title(72,'사용 과정에서 발견','실기기에서 핵심 흐름을 막는 문제부터 고쳤습니다');
  const rows=[
    ['로그인','Play 서명 SHA-1 미등록','Google 계정 선택 후 로그인 성공','해결'],
    ['음성 입력','작은 목소리에서 제출되지 않음','발화 감지·종료 경로 복구','해결'],
    ['필수 확인','이동수단을 묻지 않고 넘어감','시간·장소·이동수단 모두 확인','해결'],
    ['계획 관리','확정 후 수정·삭제 경로 없음','지도·수정·삭제·저장 복귀 추가','해결'],
    ['배포','최신 수정본이 스토어에 늦게 반영','1.0.4 제출, 현재 검토 중','진행'],
  ];
  s += rect(72,166,1136,50,C.navy,10);
  [['영역',92],['발견 문제',244],['조치',628],['상태',1108]].forEach(([t,x])=>s+=textEl(x,199,t,16,C.white,700));
  rows.forEach((r,i)=>{
    const y=216+i*76;
    s += rect(72,y,1136,76,i%2?C.paper:C.white,0,C.line,0.5);
    s += textEl(92,y+46,r[0],19,C.ink,800);
    s += textEl(244,y+46,r[1],18,C.ink,500);
    s += textEl(628,y+46,r[2],18,C.ink,600);
    s += rect(1080,y+19,96,38,r[3]==='해결'?C.mint:C.peach,19)+textEl(1128,y+45,r[3],16,r[3]==='해결'?C.green:C.coral,800,'middle');
  });
  s += footer(5);
  addSlide(s,`사용 과정의 문제는 기능 선호가 아니라 성공 경로 차단 여부로 우선순위를 정했습니다. 로그인과 음성 일정 생성이 먼저였고, 이후 필수 확인과 수정·삭제 흐름을 정리했습니다.\n\n[Sources]\n- ${ROOT}/docs/EXECUTION_PLAN.md\n[/Sources]`);
}

// 6 — voice deep dive
{
  let s=base(C.paper)+title(72,'핵심 개선 사례','음성 일정은 이제 이동수단까지 확인해야 저장할 수 있습니다');
  s += phone(72,154,286,500,'voice');
  s += phone(386,154,286,500,'proposal');
  s += label(716,184,'변경 전',C.coral,C.peach,102);
  s += multiline(716,235,['시간·장소만 확인하고','이동수단 없이 진행 가능'],25,C.ink,700,1.4);
  s += line(716,330,1136,330,C.line,2);
  s += label(716,382,'변경 후',C.green,C.mint,102);
  s += multiline(716,433,['도보·버스·지하철·자가용·택시','한 줄 선택 → 즉시 반영','세 항목이 모두 있어야 확정'],24,C.ink,800,1.42);
  s += rect(716,568,420,72,C.sky,14)+textEl(740,598,'남은 한계',15,C.blue,800)+textEl(740,625,'주변 사람의 말과 사용자 음성 구분',17,C.ink,600);
  s += footer(6);
  addSlide(s,`음성 일정의 필수 값은 시간, 장소, 이동수단입니다. 이동수단이 빠지면 앱이 반드시 다시 묻고, 선택지는 한 줄로 보여 바로 답할 수 있습니다. 다만 상시 청취 중 주변 사람의 실제 말까지 들어오는 문제는 음량만으로 해결할 수 없어 다음 실험이 필요합니다.\n\n[Sources]\n- ${ROOT}/docs/EXECUTION_PLAN.md\n- ${ROOT}/e2e/visual/__screenshots__/390x844/voice-schedule-transport.png\n[/Sources]`);
}

// 7 — quality evidence
{
  let s=base(C.navy)+title(72,'검증 결과','최신 빌드는 자동 검증과 Android 실기기를 모두 통과했습니다',true);
  const metrics=[['214 / 214','단위·통합 검증'],['3개','화면 크기'],['Android 12','Samsung SM-N971N'],['0건','치명적 예외']];
  metrics.forEach((m,i)=>{
    const x=72+i*286;
    s += rect(x,206,254,260,i===0?'#11355E':'#101C2B',22,'#28405B',1);
    s += textEl(x+24,288,m[0],i===2?36:46,i===0?C.cyan:C.white,800);
    s += line(x+24,320,x+224,320,'#31445B',1);
    s += multiline(x+24,368,[m[1]],19,'#B9C7D8',600,1.4);
    s += iconCircle(x+218,430,i===0?'✓':i===1?'↔':i===2?'A':'!',i===3?C.green:C.blue,C.white,20);
  });
  s += rect(72,520,1112,94,'#0D293F',16)+textEl(98,557,'수동 확인',16,C.cyan,800)+textEl(98,593,'Google 로그인 · 실제 발화 전사 · 계획 확정 · 알림 행동 전환',22,C.white,700);
  s += footer(7,true);
  addSlide(s,`최신 1.0.4는 35개 스위트, 214개 검증을 통과했습니다. 360×800, 390×844, 430×932에서 잘림을 확인했고 Samsung Android 12에서 핵심 흐름과 치명적 예외 0건을 확인했습니다.\n\n[Sources]\n- ${ROOT}/docs/EXECUTION_PLAN.md\n- ${ROOT}/docs/HARNESS.md\n[/Sources]`);
}

// 8 — what feedback says
{
  let s=base()+title(72,'피드백에서 배운 점','지금 필요한 것은 기능 추가보다 “완료 증거”입니다');
  s += rect(72,168,512,418,C.sky,26);
  s += textEl(104,220,'확인된 반응·요구',18,C.blue,800);
  const left=['Google 로그인이 바로 되어야 한다','음성은 말한 뒤 스스로 끝나야 한다','빠진 이동수단을 반드시 물어야 한다','계획에서 지도·수정·삭제가 보여야 한다'];
  left.forEach((t,i)=>{s+=iconCircle(116,270+i*70,'✓',C.blue,C.white,17);s+=textEl(148,278+i*70,t,20,C.ink,650);});
  s += rect(616,168,520,418,C.peach,26);
  s += textEl(648,220,'아직 모르는 것',18,C.coral,800);
  const right=['첫 음성 일정 완료율은 얼마인가','어느 질문에서 가장 많이 이탈하는가','준비 시작 알림이 실제 행동으로 이어지는가','일주일 뒤 다시 쓰는 사용자는 누구인가'];
  right.forEach((t,i)=>{s+=iconCircle(660,270+i*70,'?',C.coral,C.white,17);s+=textEl(692,278+i*70,t,20,C.ink,650);});
  s += textEl(72,632,'결론  |  배포 이후의 다음 제품은 “측정 가능한 테스트 루프”입니다.',25,C.ink,800);
  s += footer(8);
  addSlide(s,`현재 피드백은 실기기 관찰과 반복 개선 요청에서 명확하게 나타났습니다. 하지만 외부 사용자의 정량·정성 반응은 아직 충분하지 않습니다. 그래서 다음 주의 목표는 기능 수가 아니라 완료율과 이탈 이유를 확보하는 것입니다.\n\n[Sources]\n- DX Camp 6주차 중간 안내 및 밋업 공지 (사용자 제공)\n- ${ROOT}/docs/EXECUTION_PLAN.md\n[/Sources]`);
}

// 9 — next actions
{
  let s=base(C.paper)+title(72,'다음 7일','배포를 유지하면서 세 가지 숫자를 확보하겠습니다');
  const steps=[
    ['01','배포','1.0.4 검토 통과 확인','참여자 12명 이상 유지'],
    ['02','관찰','로그인 → 음성 → 확정 퍼널','실패 화면·이탈 단계 기록'],
    ['03','대화','완료자·이탈자 각 3명 인터뷰','다음 수정 1개만 선택'],
  ];
  steps.forEach((m,i)=>{
    const x=72+i*372;
    s += textEl(x,206,m[0],18,C.blue,800);
    s += line(x,232,x+328,232,i===2?C.green:C.blue,5);
    s += textEl(x,286,m[1],30,C.ink,800);
    s += multiline(x,334,[m[2],m[3]],19,C.muted,600,1.55);
  });
  s += rect(72,468,1116,132,C.navy,22);
  s += textEl(104,516,'이번 주 성공 기준',17,C.cyan,800);
  s += textEl(104,562,'① 로그인 성공률   ② 첫 음성 일정 확정률   ③ 24시간 내 준비 시작률',27,C.white,800);
  s += footer(9);
  addSlide(s,`다음 7일은 세 단계입니다. 최신 버전 배포를 유지하고, 로그인부터 일정 확정까지 퍼널을 기록하며, 완료자와 이탈자를 직접 인터뷰하겠습니다. 개선은 가장 큰 이탈 원인 하나만 선택합니다.\n\n[Sources]\n- DX Camp 6주차 중간 안내 및 밋업 공지 (사용자 제공)\n- ${ROOT}/docs/RELEASE_CHECKLIST.md\n- https://play.google.com/apps/testing/com.timeagent.app\n[/Sources]`);
}

// 10 — close / demo
{
  let s=base(C.navy);
  s += `<image href="${dataUris.icon}" x="72" y="64" width="68" height="68"/>`;
  s += textEl(160,108,'TimeAgent',28,C.white,800);
  s += multiline(72,250,['이제 더 만들기보다,','실제 사용을 더 보겠습니다.'],55,C.white,800,1.24);
  s += rect(72,478,492,92,'#11355E',18)+textEl(100,516,'비공개 테스트 참여',16,C.cyan,800)+textEl(100,550,'play.google.com/apps/testing/com.timeagent.app',18,C.white,600);
  s += rect(594,478,492,92,'#103126',18)+textEl(622,516,'오늘의 요청',16,'#63E6B2',800)+textEl(622,550,'테스터 3명 연결 · 10분 관찰 기회',21,C.white,700);
  s += textEl(72,650,'DX Duo · TimeAgent',18,'#A9B9CB',600);
  s += phone(1020,90,188,408,'plan');
  addSlide(s,`마무리: 앱은 공개했고 핵심 차단 문제를 고쳤습니다. 이제 가장 필요한 것은 테스터를 더 모으는 것보다, 실제로 한 번 끝까지 쓰는 장면을 관찰하는 것입니다. 가능하다면 오늘 테스터 세 분 연결과 10분 관찰 기회를 요청드립니다.\n\n[Sources]\n- https://play.google.com/apps/testing/com.timeagent.app\n- https://play.google.com/store/apps/details?id=com.timeagent.app\n[/Sources]`);
}

await fs.mkdir(OUT,{recursive:true});
const pptx = new PptxGenJS();
pptx.layout='LAYOUT_WIDE';
pptx.author='DX Duo';
pptx.subject='DX Camp 6주차 TimeAgent 진행 발표';
pptx.title='TimeAgent — DX Camp 6주차 진행 발표';
pptx.company='DX Duo';
pptx.lang='ko-KR';
pptx.theme={headFontFace:'Apple SD Gothic Neo',bodyFontFace:'Apple SD Gothic Neo',lang:'ko-KR'};

const sourceLog=[];
for (let i=0;i<slides.length;i++) {
  const num=String(i+1).padStart(2,'0');
  const svgPath=path.join(OUT,`slide-${num}.svg`);
  const pngPath=path.join(OUT,`slide-${num}.png`);
  await fs.writeFile(svgPath,slides[i].svg);
  await sharp(Buffer.from(slides[i].svg)).png().toFile(pngPath);
  const slide=pptx.addSlide();
  slide.background={color:'FFFFFF'};
  slide.addImage({path:pngPath,x:0,y:0,w:13.333,h:7.5});
  if (typeof slide.addNotes === 'function') slide.addNotes(slides[i].notes);
  sourceLog.push(`Slide ${i+1}\n${slides[i].notes.match(/\[Sources\][\s\S]*?\[\/Sources\]/)?.[0] ?? ''}`);
}
await pptx.writeFile({fileName:path.join(OUT,'DX-Duo_TimeAgent_6주차_중간발표_2026-08-14.pptx')});
await fs.writeFile(path.join(OUT,'source-notes.txt'),sourceLog.join('\n\n'));

// 5×2 montage for whole-deck QA
const thumbs=[];
for(let i=0;i<slides.length;i++){
  const p=path.join(OUT,`slide-${String(i+1).padStart(2,'0')}.png`);
  thumbs.push(await sharp(p).resize(512,288).toBuffer());
}
const composite=thumbs.map((input,i)=>({input,left:(i%5)*512,top:Math.floor(i/5)*288}));
await sharp({create:{width:2560,height:576,channels:4,background:'#DDE4EC'}}).composite(composite).png().toFile(path.join(OUT,'deck-montage.png'));
console.log(JSON.stringify({slides:slides.length,out:OUT,pptx:'DX-Duo_TimeAgent_6주차_중간발표_2026-08-14.pptx'},null,2));
