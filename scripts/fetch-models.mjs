/**
 * Face recognition models, needed in public/models before building.
 * (Copied from Tick — the same two OpenCV models, so templates match.)
 *
 * yunet.onnx (232 KB) is kept in the repository — OpenCV's YuNet face
 * detector with its input size made flexible for the browser runtime.
 * sface.onnx (38 MB) is too big for the repository: it is downloaded from
 * the OpenCV model zoo the first time, and its checksum is verified.
 * To skip the download, copy it from Tick: tick-v4/web/public/models/sface.onnx
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '../public/models');
const MODELS = [
  {
    file: 'sface.onnx',
    sha256: '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
    url: 'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx',
  },
  { file: 'yunet.onnx', sha256: '57acd73224bfbe2a2d6d28431da2e7c5b1d643717407e7cf2cae3d4a07ce2c14' },
];

const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
fs.mkdirSync(dir, { recursive: true });

for (const m of MODELS) {
  const file = path.join(dir, m.file);
  if (fs.existsSync(file) && hash(fs.readFileSync(file)) === m.sha256) continue;
  if (!m.url) throw new Error(`${m.file} is missing or changed — restore it from the repository.`);
  console.log(`Downloading ${m.file} (first build only)…`);
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${m.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (hash(buf) !== m.sha256) throw new Error(`${m.file} did not match its expected checksum`);
  fs.writeFileSync(file, buf);
}
console.log('Face models ready.');
