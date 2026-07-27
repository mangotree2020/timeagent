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

await send('Page.enable');
const capturePath = process.env.CAPTURE_PATH ?? '/create';
const capturePrefix = process.env.CAPTURE_PREFIX ?? 'create-cdp';
for (const [width, height] of [[360, 800], [390, 844], [430, 932]]) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send('Page.navigate', { url: `http://localhost:8082${capturePath}` });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await writeFile(`tmp/ralph-loop/${capturePrefix}-${width}x${height}.png`, Buffer.from(data, 'base64'));
}

socket.close();
