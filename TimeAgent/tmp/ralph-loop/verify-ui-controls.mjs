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

const pause = (milliseconds = 350) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const navigate = async (path) => {
  await send('Page.navigate', { url: `http://localhost:8082${path}` });
  await pause(900);
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

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 360,
  height: 800,
  deviceScaleFactor: 1,
  mobile: true,
});

await navigate('/schedules');
await clickText('완료');
if (!await bodyIncludes('최근 완료')) throw new Error('Completed schedule tab did not update');

await navigate('/plan-b');
await clickText('걷기 최소');
const firstAlternative = await evaluate(`document.querySelector('[role="radio"]')?.innerText ?? ''`);
if (!firstAlternative.includes('택시')) throw new Error(`Walking sort failed: ${firstAlternative}`);

await navigate('/settings');
await clickText('기본 여유 시간');
await clickText('10분');
if (!await bodyIncludes('10분')) throw new Error('Buffer setting did not update');

await navigate('/create?new=1');
await clickText('다음');
await clickText('다음');
await clickText('＋ 준비 행동 추가');
await evaluate(`(() => {
  const input = document.querySelector('input[aria-label="추가할 준비 행동"]');
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, '우산 챙기기');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await pause();
await clickText('행동 추가');
if (!await bodyIncludes('우산 챙기기')) throw new Error('Custom routine was not added');

console.log(JSON.stringify({
  schedulesCompletedTab: true,
  planBSortFirst: '택시',
  bufferSetting: '10분',
  customRoutine: '우산 챙기기',
}));
socket.close();
