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
const storedDelay = () => evaluate(`(() => {
  for (const value of Object.values(localStorage)) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed.delayMinutes === 'number' && 'currentStepId' in parsed) return parsed.delayMinutes;
    } catch {}
  }
  return null;
})()`);

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:8082/progress' });
await pause(1400);

if (await storedDelay() !== 0) throw new Error('Initial persisted delay was not zero');
await clickText('시간 더 필요');
await clickText('+5분');
if (!await bodyIncludes('변경 전후 확인')) throw new Error('Comparison sheet did not open');
if (await storedDelay() !== 0) throw new Error('Preview mutated the persisted session');

for (const [width, height] of [[360, 800], [390, 844], [430, 932]]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await evaluate(`[...document.querySelectorAll('*')].find((element) => element.textContent.trim() === '변경 전후 확인')?.scrollIntoView({ block: 'start' })`);
  await pause(150);
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await writeFile(`tmp/ralph-loop/delay-proposal-${width}x${height}.png`, Buffer.from(data, 'base64'));
}

await clickText('기존 계획 유지');
if (!await bodyIncludes('변경을 거절하고 기존 계획을 유지합니다.')) throw new Error('Reject result was not announced');
if (await storedDelay() !== 0) throw new Error('Reject changed the persisted session');

await clickText('시간 더 필요');
await clickText('+5분');
await clickText('변경안 적용');
await pause(300);
if (!await bodyIncludes('5분 지연')) throw new Error('Applied delay was not shown');
if (await storedDelay() !== 5) throw new Error('Applied delay was not persisted');

console.log(JSON.stringify({
  previewPersistedDelay: 0,
  rejectedPersistedDelay: 0,
  appliedPersistedDelay: 5,
  viewports: ['360x800', '390x844', '430x932'],
}));
socket.close();
