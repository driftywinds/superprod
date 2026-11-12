#!/usr/bin/env node
/**
 * Generates PARITY_MET.md from PARITY.md.
 *
 * Run `pnpm parity:metrics` after changing any parity status. The counters are
 * derived, never hand-written, so the file cannot drift from the tracker.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARITY_PATH = join(ROOT, 'PARITY.md');
const OUT_PATH = join(ROOT, 'PARITY_MET.md');

const STATUSES = ['Done', 'In Progress', 'TODO', 'N/A'];

const ROW = /^\|\s*([\d.]+)\s*\|(.+?)\|\s*(Done|In Progress|TODO|N\/A)\s*\|/;

const parse = (markdown) => {
  const sections = [];
  let current = null;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading && !heading[1].startsWith('Implemented')) {
      current = { title: heading[1].trim(), counts: zero(), rows: 0 };
      sections.push(current);
      continue;
    }

    const row = ROW.exec(line);
    if (row && current) {
      current.counts[row[3]] += 1;
      current.rows += 1;
    }
  }

  return sections.filter((section) => section.rows > 0);
};

const zero = () => ({ Done: 0, 'In Progress': 0, TODO: 0, 'N/A': 0 });

const pct = (done, total) => (total === 0 ? 0 : Math.round((done / total) * 100));

const bar = (done, total, width = 24) => {
  const filled = total === 0 ? 0 : Math.round((done / total) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
};

const main = () => {
  const sections = parse(readFileSync(PARITY_PATH, 'utf8'));

  const totals = zero();
  for (const section of sections) {
    for (const status of STATUSES) totals[status] += section.counts[status];
  }
  const total = STATUSES.reduce((sum, status) => sum + totals[status], 0);
  const donePct = pct(totals.Done, total);
  const startedPct = pct(totals.Done + totals['In Progress'], total);

  const lines = [
    '# PARITY_MET.md — parity at a glance',
    '',
    '> Generated from `PARITY.md` by `tools/parity-metrics.mjs`. Do not edit by hand —',
    '> run `pnpm parity:metrics` after changing a status.',
    '',
    `**Generated:** ${new Date().toISOString().slice(0, 10)}`,
    '',
    '## Overall',
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Tracked features | **${total}** |`,
    `| Done | **${totals.Done}** (${donePct}%) |`,
    `| In progress | **${totals['In Progress']}** |`,
    `| Not started | **${totals.TODO}** |`,
    `| Not applicable | ${totals['N/A']} |`,
    `| Remaining (not done) | **${total - totals.Done - totals['N/A']}** |`,
    '',
    '```',
    `done      ${bar(totals.Done, total)} ${donePct}%`,
    `started   ${bar(totals.Done + totals['In Progress'], total)} ${startedPct}%`,
    '```',
    '',
    '## By area',
    '',
    '| Area | Done | In progress | Not started | N/A | Total | Complete |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];

  for (const section of sections) {
    const sectionTotal = section.rows;
    lines.push(
      `| ${section.title} | ${section.counts.Done} | ${section.counts['In Progress']} | ${
        section.counts.TODO
      } | ${section.counts['N/A']} | ${sectionTotal} | ${pct(
        section.counts.Done,
        sectionTotal,
      )}% |`,
    );
  }

  const remaining = sections
    .map((section) => ({ ...section, left: section.counts.TODO }))
    .filter((section) => section.left > 0)
    .sort((a, b) => b.left - a.left)
    .slice(0, 10);

  lines.push(
    '',
    '## Biggest remaining areas',
    '',
    '| Area | Not started |',
    '|---|---:|',
    ...remaining.map((section) => `| ${section.title} | ${section.left} |`),
    '',
    '## Definition of done',
    '',
    'A feature counts as **Done** only when it is implemented, wired into the app,',
    'and its `PARITY.md` row names what was built and how it maps to upstream.',
    '',
  );

  writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');
  console.log(
    `PARITY_MET.md: ${totals.Done}/${total} done (${donePct}%), ${totals['In Progress']} in progress, ${totals.TODO} remaining`,
  );
};

main();
