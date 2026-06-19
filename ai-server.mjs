import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const launcherRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceFile = path.join(launcherRoot, "ai-server-core.mjs");
const workspaceRoot = process.env.THREADSME_WORKSPACE_ROOT || launcherRoot;
const runtimeRoot = process.env.THREADSME_RUNTIME_DIR || path.join(workspaceRoot, "work", "runtime");
const generatedRoot = path.join(runtimeRoot, "generated");

let source = await readFile(sourceFile, "utf8");

function replaceText(label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`ThreadsMe continuity patch ${label} menjangka 1 padanan, tetapi jumpa ${count}.`);
  }
  source = source.replace(before, after);
}

function replacePattern(label, pattern, replacement) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = source.match(new RegExp(pattern.source, flags)) || [];
  if (matches.length !== 1) {
    throw new Error(`ThreadsMe continuity patch ${label} menjangka 1 padanan, tetapi jumpa ${matches.length}.`);
  }
  source = source.replace(pattern, replacement);
}

replaceText(
  "source root",
  'const here = path.dirname(fileURLToPath(import.meta.url));',
  `const here = ${JSON.stringify(launcherRoot)};`,
);

replaceText(
  "extension bridge fallback",
  "const extensionBridgeUrl = publicBaseUrl || extensionBridgeUrl;",
  'const extensionBridgeUrl = publicBaseUrl || `http://${host}:${port}`;',
);

replaceText(
  "static MIME continuity",
  '  [".svg", "image/svg+xml; charset=utf-8"],\n  [".zip", "application/zip"],',
  '  [".svg", "image/svg+xml; charset=utf-8"],\n  [".ico", "image/x-icon"],\n  [".webmanifest", "application/manifest+json; charset=utf-8"],\n  [".txt", "text/plain; charset=utf-8"],\n  [".zip", "application/zip"],',
);

replaceText(
  "Product Audit quality reasons",
  '    if (quality.status === "review") post.qualityReasons = quality.reasons;',
  "    post.qualityReasons = quality.reasons;",
);

replaceText(
  "Product Audit story-run quality metadata",
  '      version.productTitle = productTitle;\n      version.productCategory = productCategory;\n      version.updatedAt = `${malaysiaNow()} GMT+8`;',
  '      const updatedPost = posts[number - 1];\n      version.productTitle = productTitle;\n      version.productCategory = productCategory;\n      version.productVerified = true;\n      version.productIntelEvidence = "manual_verified";\n      version.productIntelConfidence = 100;\n      version.qualityStatus = updatedPost?.qualityStatus || version.qualityStatus;\n      version.qualityScore = updatedPost?.qualityScore ?? version.qualityScore;\n      version.qualityChecks = updatedPost?.qualityChecks || version.qualityChecks;\n      version.qualityReasons = updatedPost?.qualityReasons || [];\n      if (version.qualityStatus === "review") version.status = "review";\n      version.updatedAt = `${malaysiaNow()} GMT+8`;',
);

replaceText(
  "proof declaration",
  "  const autoCompletePastSlots = nativeScheduleMode || options.autoCompletePastSlots === true;",
  [
    "  const forceAutoCompletePastSlots = options.autoCompletePastSlots === true;",
    "  const nativeProofMap = getNativeProofMap(statusData);",
    "  const canAutoCompleteNumber = (number) =>",
    "    forceAutoCompletePastSlots ||",
    "    (nativeScheduleMode && Boolean(nativeProofMap[number] || nativeProofMap[String(number)]));",
  ].join("\n"),
);

replaceText(
  "native proof acceptance",
  '["published", "manual_published", "native_schedule_assumed"].includes(proof.status)',
  '["published", "manual_published", "native_schedule_assumed", "native_scheduled"].includes(proof.status)',
);

replacePattern(
  "proof-gated due completion",
  /  const postedNow = \[\];\n  if \(autoCompletePastSlots\) \{[\s\S]*?\n  \}\n\n  const knownNumbers/,
  [
    "  const postedNow = [];",
    "  posts.forEach((post, index) => {",
    "    const number = index + 1;",
    '    if (!post || failedSet.has(number) || post.qualityStatus === "review") return;',
    "    const time = parseScheduleSlot(post.slot).getTime();",
    "    if (!Number.isFinite(time) || time > nowMs || !canAutoCompleteNumber(number)) return;",
    "    if (!postedSet.has(number)) postedNow.push(number);",
    "    postedSet.add(number);",
    "    scheduledSet.delete(number);",
    "    remainingSet.delete(number);",
    "    preparedSet.delete(number);",
    "    const nativeProof = nativeProofMap[number] || nativeProofMap[String(number)];",
    "    const existingResult = publishResults[number] || publishResults[String(number)] || {};",
    "    if (",
    "      nativeScheduleMode &&",
    "      nativeProof &&",
    '      !["published", "manual_published", "native_schedule_assumed"].includes(existingResult.status)',
    "    ) {",
    "      publishResults[number] = {",
    "        ...existingResult,",
    '        status: "native_schedule_assumed",',
    '        source: "Threads native schedule proof",',
    "        slot: post.slot,",
    "        publishedAt: `${malaysiaNow()} GMT+8`,",
    '        note: "Ditanda Lulus selepas slot lepas kerana siri ini mempunyai proof native Threads.",',
    "      };",
    "    }",
    "  });",
    "",
    "  const knownNumbers",
  ].join("\n"),
);

replaceText(
  "proof-gated unknown status",
  "if (time <= nowMs && autoCompletePastSlots) postedSet.add(number);",
  "if (time <= nowMs && canAutoCompleteNumber(number)) postedSet.add(number);",
);

replacePattern(
  "proof-gated previous pending",
  /  if \(autoCompletePastSlots\) \{\n    for \(const number of previousScheduled\) \{[\s\S]*?\n    \}\n  \}\n\n  let activeScheduled/,
  [
    "  for (const number of previousScheduled) {",
    "    const post = posts[number - 1];",
    "    if (!post || failedSet.has(number) || postedSet.has(number)) continue;",
    '    if (post.qualityStatus === "review") continue;',
    "    if (parseScheduleSlot(post.slot).getTime() <= nowMs && canAutoCompleteNumber(number)) {",
    "      postedSet.add(number);",
    "      postedNow.push(number);",
    "    }",
    "  }",
    "",
    "  let activeScheduled",
  ].join("\n"),
);

replaceText(
  "proof-aware active queue",
  "return !autoCompletePastSlots || slotTime > nowMs;",
  "return !canAutoCompleteNumber(number) || slotTime > nowMs;",
);

replaceText(
  "reuse native proof map",
  "  const proofMap = getNativeProofMap(statusData);\n  const activeNativeProofs = {};",
  "  const proofMap = nativeProofMap;\n  const activeNativeProofs = {};",
);

for (const legacyPattern of [
  "const autoCompletePastSlots =",
  "if (autoCompletePastSlots)",
  "!autoCompletePastSlots ||",
  "time <= nowMs && autoCompletePastSlots",
  "publicBaseUrl || extensionBridgeUrl",
  'if (quality.status === "review") post.qualityReasons = quality.reasons;',
]) {
  if (source.includes(legacyPattern)) {
    throw new Error(`ThreadsMe continuity patch masih meninggalkan pola lama: ${legacyPattern}`);
  }
}

const digest = createHash("sha256").update(source).digest("hex").slice(0, 16);
const generatedFile = path.join(generatedRoot, `ai-server-${digest}.mjs`);
await mkdir(generatedRoot, { recursive: true });
try {
  await stat(generatedFile);
} catch {
  const temporary = `${generatedFile}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, source, "utf8");
  await rename(temporary, generatedFile);
}

await import(`${pathToFileURL(generatedFile).href}?v=${digest}`);
