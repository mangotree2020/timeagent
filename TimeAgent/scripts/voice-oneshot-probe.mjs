#!/usr/bin/env node
// Measures what a single spoken sentence actually produces, so changes to the voice flow can be
// judged against numbers rather than impressions. Reads tmp/voice/caseN.{m4a,txt}.
import { readFile } from 'node:fs/promises';

const base = process.env.ASSISTANT_BASE_URL
  ?? 'https://chpsoncuxjpgugowrydb.supabase.co/functions/v1/assistant';
const cases = Number(process.env.CASES ?? 5);
const timezone = 'Asia/Seoul';

function localDate(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const at = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${at('year')}-${at('month')}-${at('day')}`;
}

// The draft the voice screen starts from: every spoken field blank.
const draft = {
  version: 1, step: 0, title: '', date: '', appointmentTime: '',
  destination: '', destinationAddress: '', destinationCoordinate: null,
  transport: 'AI 추천', priority: 'on-time',
  routines: [{ id: 'shower', icon: '🚿', label: '샤워', minutes: 12 }],
};

const results = [];
for (let index = 1; index <= cases; index += 1) {
  const spoken = (await readFile(`tmp/voice/case${index}.txt`, 'utf8')).trim();
  const audio = await readFile(`tmp/voice/case${index}.m4a`);
  const now = new Date();
  const response = await fetch(`${base}/v1/schedule/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: `oneshot-probe-case-${index}`,
      draft,
      history: [],
      input: { kind: 'audio', base64: audio.toString('base64'), mimeType: 'audio/m4a' },
      flowContext: { mode: 'one-shot' },
      clientContext: { nowIso: now.toISOString(), timezone, localDate: localDate(now) },
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    results.push({ index, spoken, error: `${response.status} ${JSON.stringify(payload)}` });
    continue;
  }
  const patch = payload.patch ?? {};
  // What the app decides, not what the model flagged: the title is derived from the place, and the
  // draft's own `AI 추천` default is not someone choosing how to travel.
  const title = patch.title?.trim() || (patch.destination?.trim() ? `${patch.destination.trim()} 약속` : '');
  const transportChosen = Boolean(patch.transport) && patch.transport !== 'AI 추천';
  const appMissing = [
    title ? null : '일정명',
    patch.date?.trim() ? null : '날짜',
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(patch.appointmentTime ?? '') ? null : '시간',
    patch.destination?.trim() ? null : '장소',
    transportChosen ? null : '이동수단',
  ].filter(Boolean);
  results.push({
    appTitle: title,
    appMissing,
    appAsks: payload.clarification?.field ?? appMissing[0] ?? null,
    index,
    spoken,
    transcript: payload.transcript,
    title: patch.title,
    date: patch.date,
    time: patch.appointmentTime,
    destination: patch.destination,
    transport: patch.transport,
    readyToApply: payload.readyToApply,
    clarification: payload.clarification?.field ?? null,
    prompt: payload.clarification?.prompt ?? null,
    model: payload._meta?.model,
    audioTokens: payload._meta?.usage?.inputTokensByModality
      ?.find((item) => item.modality?.toUpperCase() === 'AUDIO')?.tokens ?? null,
    totalTokens: payload._meta?.usage?.totalTokens ?? null,
  });
}

for (const row of results) {
  console.log(`\n[${row.index}] 말한 문장: ${row.spoken}`);
  if (row.error) { console.log(`  실패: ${row.error}`); continue; }
  console.log(`  전사     : ${row.transcript}`);
  console.log(`  제목     : ${row.title ?? '(없음)'}`);
  console.log(`  날짜/시각: ${row.date ?? '(없음)'} ${row.time ?? '(없음)'}`);
  console.log(`  장소     : ${row.destination ?? '(없음)'}`);
  console.log(`  이동수단 : ${row.transport ?? '(없음)'}`);
  console.log(`  앱 제목  : ${row.appTitle || '(없음)'}`);
  console.log(`  앱 되묻기: ${row.appAsks ?? '없음'}${row.prompt && row.clarification ? ` — "${row.prompt}"` : ''}`);
  console.log(`  토큰     : audio=${row.audioTokens} total=${row.totalTokens} (${row.model})`);
}

const ok = results.filter((row) => !row.error);
const field = (name) => ok.filter((row) => row[name]).length;
console.log(`\n=== 요약 (${ok.length}/${results.length} 응답) ===`);
console.log(`시각 추출 ${field('time')}/${ok.length} · 장소 추출 ${field('destination')}/${ok.length} · 이동수단 추출 ${field('transport')}/${ok.length} · 제목 추출 ${field('title')}/${ok.length}`);
console.log(`앱이 되묻지 않고 완료: ${ok.filter((row) => !row.appAsks).length}/${ok.length}`);
const totals = ok.map((row) => row.totalTokens ?? 0);
if (totals.length) console.log(`평균 토큰: ${Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)}`);
