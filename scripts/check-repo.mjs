import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`ok   ${name}`);
  passed += 1;
}

function fail(name, error) {
  console.error(`FAIL ${name}: ${error.message}`);
  failed += 1;
}

function check(name, fn) {
  try {
    fn();
    ok(name);
  } catch (error) {
    fail(name, error);
  }
}

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function requireFile(rel) {
  if (!existsSync(path.join(root, rel))) {
    throw new Error(`${rel} is missing`);
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (['node_modules', 'target', '.git', 't3n-reference', 'build'].includes(entry.name)) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

function pngSize(rel) {
  const buffer = readFileSync(path.join(root, rel));
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${rel} is not a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/`[^`]*`/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function checkMarkdown(rel) {
  const text = read(rel);
  if (text.includes('\u2014')) throw new Error(`${rel} contains an em dash`);
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)) {
    throw new Error(`${rel} contains an emoji`);
  }
  if (text.toLowerCase().includes('codebuff')) throw new Error(`${rel} contains a Codebuff reference`);
  if (text.includes('geekman58748')) throw new Error(`${rel} contains the old repository username`);

  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(https?:|#|mailto:)/.test(target)) continue;
    const local = target.split('#')[0];
    if (local && !existsSync(path.join(root, path.dirname(rel), local))) {
      throw new Error(`${rel} links to missing ${local}`);
    }
  }
}

function checkAnchors() {
  const text = read('README.md');
  const headings = new Set(
    [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => slug(match[1])),
  );
  for (const match of text.matchAll(/\]\(#([^)]+)\)/g)) {
    if (!headings.has(match[1])) throw new Error(`README.md has a missing heading #${match[1]}`);
  }
}

function tracked() {
  try {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

const required = [
  'README.md',
  'LICENSE',
  'NOTICE',
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.editorconfig',
  '.env.example',
  '.gitattributes',
  '.github/pull_request_template.md',
  '.github/dependabot.yml',
  '.github/workflows/check.yml',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  'docs/brand.html',
  'docs/assets/banner.png',
  'docs/assets/social-preview.png',
  'docs/assets/screen-hero.png',
  'docs/assets/screen-check.png',
  'docs/assets/screen-chat.png',
  'scripts/check-repo.mjs',
  'test/sanctions.test.mjs',
  'test/security.test.mjs',
  'api/security.js',
  't3n-contract/README.md',
  'package.json',
  'package-lock.json',
  'mcp-server/package.json',
  't3n-contract/Cargo.toml',
];

for (const file of required) {
  check(`${file} exists`, () => requireFile(file));
}

check('README has no em dashes or emojis', () => checkMarkdown('README.md'));
check('CONTRIBUTING has no em dashes or emojis', () => checkMarkdown('CONTRIBUTING.md'));
check('SECURITY has no em dashes or emojis', () => checkMarkdown('SECURITY.md'));
check('MCP README has no em dashes or emojis', () => checkMarkdown('mcp-server/README.md'));
check('brand source has no em dashes or emojis', () => checkMarkdown('docs/brand.html'));
check('README internal anchors resolve', checkAnchors);

check('README contains the banner and screenshots', () => {
  const text = read('README.md');
  for (const image of [
    'docs/assets/banner.png',
    'docs/assets/screen-hero.png',
    'docs/assets/screen-check.png',
    'docs/assets/screen-chat.png',
  ]) {
    if (!text.includes(image)) throw new Error(`README is missing ${image}`);
  }
});

check('banner is 2560 by 800', () => {
  const size = pngSize('docs/assets/banner.png');
  if (size.width !== 2560 || size.height !== 800) {
    throw new Error(`banner is ${size.width} by ${size.height}`);
  }
});

check('social preview is 1280 by 640', () => {
  const size = pngSize('docs/assets/social-preview.png');
  if (size.width !== 1280 || size.height !== 640) {
    throw new Error(`social preview is ${size.width} by ${size.height}`);
  }
});

check('screenshots are 1600 by 1000', () => {
  for (const file of ['screen-hero.png', 'screen-check.png', 'screen-chat.png']) {
    const size = pngSize(`docs/assets/${file}`);
    if (size.width !== 1600 || size.height !== 1000) {
      throw new Error(`${file} is ${size.width} by ${size.height}`);
    }
  }
});

check('package license is Apache-2.0', () => {
  const pkg = JSON.parse(read('package.json'));
  if (pkg.license !== 'Apache-2.0') throw new Error(`package.json license is ${pkg.license}`);
});

check('MCP package license is Apache-2.0', () => {
  const pkg = JSON.parse(read('mcp-server/package.json'));
  if (pkg.license !== 'Apache-2.0') throw new Error(`mcp-server license is ${pkg.license}`);
});

check('contract license is Apache-2.0', () => {
  if (!read('t3n-contract/Cargo.toml').includes('license = "Apache-2.0"')) {
    throw new Error('Cargo.toml license is not Apache-2.0');
  }
});

check('root lockfile license matches package.json', () => {
  const lock = JSON.parse(read('package-lock.json'));
  if (lock.packages?.['']?.license !== 'Apache-2.0') {
    throw new Error('package-lock root license is not Apache-2.0');
  }
});

check('MCP lockfile license matches package.json', () => {
  const lock = JSON.parse(read('mcp-server/package-lock.json'));
  if (lock.packages?.['']?.license !== 'Apache-2.0') {
    throw new Error('mcp-server lock root license is not Apache-2.0');
  }
});

check('package scripts include start, test, check, and integration test', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const script of ['start', 'test', 'check', 'test:integration']) {
    if (!pkg.scripts?.[script]) throw new Error(`missing script ${script}`);
  }
});

check('contract version matches source and README', () => {
  const cargoVersion = read('t3n-contract/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const libVersion = read('t3n-contract/src/lib.rs').match(/CONTRACT_VERSION:\s*&str\s*=\s*"([^"]+)"/)?.[1];
  if (!cargoVersion) throw new Error('Cargo.toml has no version');
  if (cargoVersion !== libVersion) {
    throw new Error(`Cargo.toml ${cargoVersion} does not match lib.rs ${libVersion}`);
  }
  if (!read('README.md').includes(cargoVersion)) {
    throw new Error(`README does not mention contract version ${cargoVersion}`);
  }
});

check('environment template has blank secrets', () => {
  const text = read('.env.example');
  for (const key of ['T3N_API_KEY', 'OPENROUTER_API_KEY']) {
    const value = text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1];
    if (value === undefined) throw new Error(`${key} is missing`);
    if (value.trim()) throw new Error(`${key} must be blank`);
  }
});

check('Render blueprint uses npm ci and a health check', () => {
  const text = read('render.yaml');
  if (!text.includes('buildCommand: npm ci')) throw new Error('buildCommand is not npm ci');
  if (!text.includes('healthCheckPath: /api/health')) throw new Error('health check is missing');
});

check('CI runs tests, checks, and the contract build', () => {
  const text = read('.github/workflows/check.yml');
  for (const command of ['npm test', 'npm run check', 'cargo test', 'cargo build']) {
    if (!text.includes(command)) throw new Error(`workflow is missing ${command}`);
  }
});

check('.env is not tracked', () => {
  const files = tracked();
  if (files.includes('.env')) throw new Error('.env is tracked');
  if (files.some((file) => file.startsWith('node_modules/'))) {
    throw new Error('node_modules is tracked');
  }
  if (files.some((file) => file.startsWith('t3n-contract/target/'))) {
    throw new Error('contract build output is tracked');
  }
});

check('no Codebuff or old username references', () => {
  const files = walk('.');
  const textExtensions = new Set([
    '.md', '.js', '.mjs', '.json', '.yml', '.yaml', '.toml', '.html',
    '.txt', '.csv', '.example', '.gitignore', '.editorconfig', '.gitattributes',
  ]);
  for (const file of files) {
    const normalized = file.split(path.sep).join('/');
    if (normalized === 'scripts/check-repo.mjs') continue;
    const ext = path.extname(file) || (file.startsWith('.') ? file : '');
    if (!textExtensions.has(ext)) continue;
    if (statSync(path.join(root, file)).size > 2_000_000) continue;
    const text = readFileSync(path.join(root, file), 'utf8').toLowerCase();
    if (text.includes('codebuff')) throw new Error(`${file} contains a Codebuff reference`);
    if (text.includes('geekman58748')) throw new Error(`${file} contains the old username`);
  }
});

check('JavaScript and MJS files parse', () => {
  const files = walk('.').filter((file) => {
    if (!/\.(mjs|js)$/.test(file)) return false;
    const normalized = file.split(path.sep).join('/');
    if (normalized.startsWith('mcp-server/build/')) return false;
    return true;
  });
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { cwd: root, stdio: 'pipe' });
    } catch (error) {
      throw new Error(`${file}: ${error.stderr?.toString().split('\n')[0] || error.message}`);
    }
  }
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exitCode = 1;
}
