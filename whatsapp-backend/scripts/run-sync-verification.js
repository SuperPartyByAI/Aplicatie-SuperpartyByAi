#!/usr/bin/env node

const { execFileSync } = require('child_process');
const path = require('path');

const runNode = (script, args = []) => {
  const scriptPath = path.join(__dirname, script);
  try {
    const stdout = execFileSync('node', [scriptPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return stdout.trim();
  } catch (error) {
    const stdout = error?.stdout ? String(error.stdout).trim() : '';
    const stderr = error?.stderr ? String(error.stderr).trim() : '';
    return stdout || stderr || '';
  }
};

const parseJsonOutput = (label, raw) => {
  try {
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    return {
      error: 'invalid_json_output',
      label,
      rawLen: raw ? raw.length : 0,
    };
  }
};

const extractAuditMetrics = (payload) => ({
  duplicatesCountActive: payload?.duplicatesCountActive ?? null,
  markedDocs: payload?.markedDocs ?? null,
  activeDocs: payload?.activeDocs ?? null,
});

const runShell = (command) => {
  execFileSync('bash', ['-lc', command], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
};

const performRestart = () => {
  const restartRequested = process.env.RUN_RESTART === 'true';
  if (!restartRequested) {
    return { restartRequested: false, restartPerformed: false };
  }

  const restartCmd = process.env.RESTART_CMD;
  const restartSsh = process.env.RESTART_SSH;

  try {
    if (restartCmd && restartCmd.trim().length > 0) {
      runShell(restartCmd);
      return { restartRequested: true, restartPerformed: true };
    }

    if (process.platform !== 'linux') {
      return {
        restartRequested: true,
        restartPerformed: false,
        restartSkippedReason: 'non_linux_no_systemctl',
      };
    } else if (restartSsh && restartSsh.trim().length > 0) {
      runShell(
        `ssh -o StrictHostKeyChecking=no ${restartSsh} 'sudo systemctl restart whatsapp-backend'`,
      );
    } else {
      execFileSync('systemctl', ['restart', 'whatsapp-backend'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
    return { restartRequested: true, restartPerformed: true };
  } catch (error) {
    return {
      restartRequested: true,
      restartPerformed: false,
      restartError: error?.message || 'restart_failed',
    };
  }
};

const fail = (payload, exitCode = 2) => {
  console.log(JSON.stringify(payload));
  process.exit(exitCode);
};

(async () => {
  try {
    const beforeRaw = runNode('audit-firestore-duplicates.js', [
      '--windowHours=0.25',
      '--limit=500',
      '--excludeMarked',
      '--printIndexLink',
    ]);
    const before = parseJsonOutput('before', beforeRaw);
    if (before?.hint === 'missing_index') {
      fail({
        error: 'firestore_index_required',
        indexLink: before.indexLink,
      });
    }
    if (before?.hint === 'missing_credentials') {
      fail({
        error: 'firestore_credentials_missing',
        message: 'Set GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC',
      });
    }
    if (before?.error) {
      fail({
        error: 'audit_failed_before',
        details: before.error,
      });
    }

    runNode('quick-write-test.js', []);

    const restartInfo = performRestart();

    const afterRaw = runNode('audit-firestore-duplicates.js', [
      '--windowHours=0.25',
      '--limit=500',
      '--excludeMarked',
      '--printIndexLink',
    ]);
    const after = parseJsonOutput('after', afterRaw);
    if (after?.hint === 'missing_index') {
      fail({
        error: 'firestore_index_required',
        indexLink: after.indexLink,
      });
    }
    if (after?.hint === 'missing_credentials') {
      fail({
        error: 'firestore_credentials_missing',
        message: 'Set GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC',
      });
    }
    if (after?.error) {
      fail({
        error: 'audit_failed_after',
        details: after.error,
      });
    }

    const beforeMetrics = extractAuditMetrics(before);
    const afterMetrics = extractAuditMetrics(after);
    const beforeDupes = Number(beforeMetrics.duplicatesCountActive ?? 0);
    const afterDupes = Number(afterMetrics.duplicatesCountActive ?? 0);
    const usedFallback = Boolean(before?.usedFallback || after?.usedFallback);
    const modeUsed = before?.modeUsed || after?.modeUsed || null;
    const allowFallbackReady = process.env.ALLOW_FALLBACK_READY === 'true';
    const duplicatesDelta = afterDupes - beforeDupes;

    const result = {
      duplicatesCountActiveBefore: beforeDupes,
      duplicatesCountActiveAfter: afterDupes,
      before: beforeMetrics,
      after: afterMetrics,
      delta: {
        duplicatesCountActive: duplicatesDelta,
      },
      usedFallback,
      modeUsed,
      restartRequested: restartInfo.restartRequested,
      restartPerformed: restartInfo.restartPerformed,
    };

    if (restartInfo.restartSkippedReason) {
      result.restartSkippedReason = restartInfo.restartSkippedReason;
    }
    if (restartInfo.restartError) {
      result.restartError = restartInfo.restartError;
    }
    result.restartVerified = restartInfo.restartPerformed === true;

    if (afterDupes > beforeDupes) {
      fail({
        ...result,
        error: 'duplicates_increased',
      }, 3);
    }

    let verdict = true;
    let notReadyReason = null;
    if (usedFallback && !allowFallbackReady) {
      verdict = false;
      notReadyReason = 'missing_desc_index';
    }
    if (restartInfo.restartError) {
      verdict = false;
      notReadyReason = 'restart_failed';
    }

    result.verdict = verdict;
    if (!verdict) {
      result.not_ready_reason = notReadyReason;
    }

    console.log(JSON.stringify(result));
  } catch (error) {
    const message = error?.message || 'runner_failed';
    fail({
      error: 'runner_failed',
      message,
    });
  }
})();
