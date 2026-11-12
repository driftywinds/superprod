#!/usr/bin/env node
/**
 * Makes the generated Android project able to sign release builds from
 * `android/keystore.properties`, which CI writes from GitHub secrets.
 *
 * Idempotent: running it twice changes nothing. Requires `npx cap add android`
 * to have produced `android/app/build.gradle` first.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRADLE = join(ROOT, 'android', 'app', 'build.gradle');

if (!existsSync(GRADLE)) {
  console.error('android-release-config: android/app/build.gradle missing — run `npx cap add android`');
  process.exit(1);
}

let gradle = readFileSync(GRADLE, 'utf8');
const original = gradle;

const SIGNING_BLOCK = `
    signingConfigs {
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

// 1. Insert signingConfigs before the first buildTypes block.
if (!gradle.includes('signingConfigs {')) {
  const anchor = /(\n\s*buildTypes\s*\{)/;
  if (!anchor.test(gradle)) {
    console.error('android-release-config: no buildTypes block found in build.gradle');
    process.exit(1);
  }
  gradle = gradle.replace(anchor, `$1`.replace('$1', `${SIGNING_BLOCK}$1`));
}

// 2. Point the release build type at that config.
if (!/signingConfig\s+signingConfigs\.release/.test(gradle)) {
  const releaseBlock = /(release\s*\{)([\s\S]*?)(\n\s*\})/;
  if (!releaseBlock.test(gradle)) {
    console.error('android-release-config: no release { } block found in buildTypes');
    process.exit(1);
  }
  gradle = gradle.replace(releaseBlock, (_match, open, body, close) => {
    return `${open}${body}\n            signingConfig signingConfigs.release${close}`;
  });
}

if (gradle === original) {
  console.log('android-release-config: already configured, nothing to do');
} else {
  writeFileSync(GRADLE, gradle, 'utf8');
  console.log('android-release-config: release signing configured');
}
