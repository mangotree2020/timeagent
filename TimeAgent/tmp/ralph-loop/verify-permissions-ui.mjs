import { writeFile } from 'node:fs/promises';

const targets = await fetch('http://127.0.0.1:9229/json').then((response) => response.json());
const page = targets.find((target) => target.type === 'page');
if (!page) throw new Error('Chrome page target was not found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const pause = (milliseconds = 400) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const clickText = async (text) => {
  const clicked = await evaluate(`(() => {
    const leaf = [...document.querySelectorAll('*')].find(
      (element) => element.children.length === 0 && element.textContent.trim() === ${JSON.stringify(text)}
    );
    const target = leaf?.closest('[role="button"],[role="tab"],[role="radio"]') ?? leaf?.parentElement;
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not click: ${text}`);
  await pause();
};
const bodyIncludes = (text) => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);
const capture = async (name, width, height, heading) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await evaluate(`[...document.querySelectorAll('*')].find((element) => element.textContent.trim() === ${JSON.stringify(heading)})?.scrollIntoView({ block: 'start' })`);
  await pause(150);
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  await writeFile(`tmp/ralph-loop/${name}-${width}x${height}.png`, Buffer.from(data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:8082/permissions?focus=location' });
await pause(1200);

if (!await bodyIncludes('허용하기 전에 먼저 알려드릴게요')) throw new Error('Permission explanation was not shown');
await clickText('위치 권한 요청');
if (!await bodyIncludes('대신 출발지를 직접 입력할 수 있어요')) throw new Error('Manual location fallback was not shown');

for (const [width, height] of [[360, 800], [390, 844], [430, 932]]) {
  await capture('permissions-denied-location', width, height, '현재 위치');
}

await evaluate(`(() => {
  const input = document.querySelector('input[aria-label="수동 출발지"]');
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, '부산역');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await pause();
await clickText('수동 출발지 저장');
if (!await bodyIncludes('부산역을(를) 수동 출발지로 저장했습니다.')) throw new Error('Manual location save was not announced');

await clickText('알림 권한 요청');
if (!await bodyIncludes('앱 내 안내로 계속할 수 있어요')) throw new Error('In-app notification fallback was not shown');
await capture('permissions-denied-notifications', 390, 844, '준비·출발 알림');

console.log(JSON.stringify({
  explanationBeforeRequest: true,
  manualLocationFallback: true,
  manualLocationSaved: '부산역',
  inAppNotificationFallback: true,
}));
socket.close();
