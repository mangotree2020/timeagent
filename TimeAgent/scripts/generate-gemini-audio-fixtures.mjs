import { mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const manifestPath = process.argv[2] ?? 'scripts/fixtures/gemini-schedule-audio-manifest.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

for (const fixture of manifest.cases ?? []) {
  const output = resolve(fixture.path);
  const source = `${output}.aiff`;
  await mkdir(dirname(output), { recursive: true });
  run('say', ['-v', 'Yuna', '-r', String(fixture.rate ?? 180), '-o', source, fixture.utterance]);

  const common = 'adelay=300|300,apad=pad_dur=0.3,aresample=16000';
  if (fixture.effect === 'pink-low' || fixture.effect === 'pink-medium') {
    const weight = fixture.effect === 'pink-low' ? '0.05' : '0.10';
    run('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', source,
      '-f', 'lavfi', '-i', 'anoisesrc=color=pink:sample_rate=16000',
      '-filter_complex', `[0:a]${common}[speech];[speech][1:a]amix=inputs=2:duration=first:weights='1 ${weight}',loudnorm=I=-23:TP=-2:LRA=7[out]`,
      '-map', '[out]', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', output,
    ]);
  } else {
    const effect = fixture.effect === 'echo'
      ? ',aecho=0.8:0.4:80:0.20'
      : fixture.effect === 'bandlimited'
        ? ',highpass=f=300,lowpass=f=3400'
        : '';
    run('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', source,
      '-af', `${common}${effect},loudnorm=I=-23:TP=-2:LRA=7`,
      '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', output,
    ]);
  }
  await unlink(source);
}

console.log(`합성 음성 ${manifest.cases.length}개 생성 완료`);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} 실행 실패: ${result.status}`);
}
