#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function run(cmd, args) {
  spawnSync(cmd, args, { stdio: 'ignore' });
}

run('osascript', ['-e', 'tell application id "com.openai.codex" to quit']);
run('pkill', ['-x', 'ChatGPT']);
run('pkill', ['-f', '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT']);
run('pkill', ['-f', '/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework']);
