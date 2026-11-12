#!/usr/bin/env node
/**
 * Makes the generated Android project able to sign release builds from
 * `android/keystore.properties`, which CI writes from GitHub secrets.
 *
 * Idempotent: running it twice changes nothing. Requires `npx cap add android`
 * to have produced `android/app/build.gradle` first.
 *
 * The `signingConfigs` block is inserted immediately before `buildTypes`, and
 * the release signing is added inside `buildTypes { release { … } }` — matched
 * only after the `buildTypes` keyword, so it can never land in
 * `signingConfigs.release` (the first `release {` in the file).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRADLE = join(ROOT, 'android', 'app', 'build.gradle');

const fail = (message) => {
  console.error(`android-release-config: ${message}`);
  process.exit(1);
};

if (!existsSync(GRADLE)) {
  fail('android/app/build.gradle missing — run `npx cap add android`');
}

let gradle = readFileSync(GRADLE, 'utf8');
const original = gradle;

const SIGNING_BLOCK = `    signingConfigs {
        release {
            if (rootProject.file('keystore.properties').exists()) {
                def keystoreProperties = new Properties()
                keystoreProperties.load(new FileInputStream(rootProject.file('keystore.properties')))
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }

`;

// 1. Add signingConfigs before buildTypes (inside the android block).
if (!gradle.includes('signingConfigs {')) {
  const buildTypesIndex = gradle.search(/^[ \t]*buildTypes\s*\{/m);
  if (buildTypesIndex === -1) fail('no buildTypes block found in build.gradle');
  gradle = `${gradle.slice(0, buildTypesIndex)}${SIGNING_BLOCK}${gradle.slice(buildTypesIndex)}`;
}

// 2. Point the release build type at that config — scoped to after buildTypes.
if (!gradle.includes('signingConfig signingConfigs.release')) {
  const buildTypesIndex = gradle.search(/^[ \t]*buildTypes\s*\{/m);
  if (buildTypesIndex === -1) fail('no buildTypes block found in build.gradle');

  const before = gradle.slice(0, buildTypesIndex);
  const region = gradle.slice(buildTypesIndex);

  const releaseMatch = /release\s*\{/.exec(region);
  if (!releaseMatch) fail('no release { } block inside buildTypes');

  const releaseBodyStart = buildTypesIndex + releaseMatch.index + releaseMatch[0].length;
  const patched = `${gradle.slice(0, releaseBodyStart)}\n            signingConfig signingConfigs.release${gradle.slice(releaseBodyStart)}`;
  gradle = before + patched.slice(before.length);
}

// 3. A signing config that silently does nothing is worse than a loud failure.
if (!gradle.includes('signingConfig signingConfigs.release')) {
  fail('failed to add the release signing config');
}

if (gradle === original) {
  console.log('android-release-config: already configured, nothing to do');
} else {
  writeFileSync(GRADLE, gradle, 'utf8');
  console.log('android-release-config: release signing configured');
}
