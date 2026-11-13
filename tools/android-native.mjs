#!/usr/bin/env node
/**
 * Merge superprod's native Android code (home-screen widget, notification icon,
 * deep links) into the generated Capacitor project.
 *
 *   pnpm build && npx cap add android   # once
 *   node tools/android-native.mjs       # safe to re-run
 *   npx cap sync android
 *
 * Idempotent: files are overwritten from native/android/, manifest entries are
 * only inserted when missing.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'native', 'android');
const appMain = join(root, 'android', 'app', 'src', 'main');
const PACKAGE = 'com.dwprod.superprod';

if (!existsSync(appMain)) {
  console.error('android/ not found. Run `pnpm build && npx cap add android` first.');
  process.exit(1);
}

// 1. Java sources.
const javaDir = join(appMain, 'java', ...PACKAGE.split('.'));
mkdirSync(javaDir, { recursive: true });
for (const file of readdirSync(join(src, 'java'))) {
  cpSync(join(src, 'java', file), join(javaDir, file));
}

// 2. Resources (layouts, drawables, xml, values).
cpSync(join(src, 'res'), join(appMain, 'res'), { recursive: true });

// 3. Manifest.
const manifestPath = join(appMain, 'AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
const snippets = readFileSync(join(src, 'manifest-snippets.xml'), 'utf8');
const [appPart, activityPart] = snippets.split('<!-- inserted inside the MainActivity <activity> -->');
const appEntries = appPart.replace('<!-- inserted inside <application> -->', '').trim();
const deepLink = activityPart.trim();

if (!manifest.includes('.TasksWidgetProvider')) {
  manifest = manifest.replace('</application>', `\n${appEntries}\n    </application>`);
}
if (!manifest.includes('android:scheme="superprod"')) {
  // Add the deep-link filter to the launcher activity.
  manifest = manifest.replace(/(<activity[^>]*android:name="[^"]*MainActivity"[\s\S]*?)(<\/activity>)/, `$1    ${deepLink}\n        $2`);
}
for (const permission of ['android.permission.POST_NOTIFICATIONS', 'android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.USE_EXACT_ALARM']) {
  if (!manifest.includes(permission)) {
    manifest = manifest.replace('</manifest>', `    <uses-permission android:name="${permission}" />\n</manifest>`);
  }
}
writeFileSync(manifestPath, manifest);

console.log('superprod native Android code merged. Next: npx cap sync android');
