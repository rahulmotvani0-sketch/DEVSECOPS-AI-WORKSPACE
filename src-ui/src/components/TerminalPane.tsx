import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Terminal as TerminalIcon, X, Check, Wifi, WifiOff } from 'lucide-react';
import { TermPaneHandle } from '../types/terminal';

const SEARCH_OPTIONS = {
  decorations: {
    matchBackground: '#1e40af',
    matchBorder: '#38bdf8',
    matchOverviewRuler: '#1e40af',
    activeMatchBackground: '#0284c7',
    activeMatchBorder: '#e0f2fe',
    activeMatchColorOverviewRuler: '#7dd3fc',
  },
};

export interface TerminalPaneProps {
  paneId: string;
  sessionId: string | null;
  name: string;
  isActive: boolean;
  env: string;
  search: { term: string; nonce: number } | null;
  onFocus: () => void;
  onData: (paneId: string, data: string) => void;
  onResolved: (paneId: string, sessionId: string) => void;
  onResolveError: (paneId: string, message: string) => void;
  onSearchCount: (paneId: string, count: number) => void;
  onRegister: (handle: TermPaneHandle) => void;
  onUnregister: (paneId: string) => void;
  onRename: (paneId: string, name: string) => void;
  onClosePane: (paneId: string) => void;
}

const isTauri = typeof window !== 'undefined' && '__TAURI_IPC__' in window;

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  paneId,
  sessionId,
  name,
  isActive,
  env,
  search,
  onFocus,
  onData,
  onResolved,
  onResolveError,
  onSearchCount,
  onRegister,
  onUnregister,
  onRename,
  onClosePane,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const attachCancelledRef = useRef(false);
  const resolveStartedRef = useRef(false);
  const lastSearchTermRef = useRef('');
  const mockBufferRef = useRef('');
  const mockSeqRef = useRef(0);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const [resizeError, setResizeError] = useState<string | null>(null);

  const hasSession = Boolean(sessionId);

  useEffect(() => {
    if (containerRef.current && xtermRef.current) {
      xtermRef.current.focus();
    }
  }, [isActive]);

  const resizePty = useCallback(() => {
    const term = xtermRef.current;
    const sid = sessionId;
    if (!term || !sid || !isTauri) return;
    const rows = Math.max(10, Math.min(500, term.rows));
    const cols = Math.max(10, Math.min(500, term.cols));
    invoke('terminal_resize', { sessionId: sid, rows, cols }).catch(() => {});
  }, [sessionId]);

  const fitToContainer = useCallback(() => {
    const fit = fitAddonRef.current;
    if (!fit) return;
    try {
      fit.fit();
      resizePty();
    } catch {
      setResizeError('Pane too small to render');
      if (xtermRef.current) {
        xtermRef.current.write('\r\n\x1b[33m[Pane too small to render — grow the pane]\x1b[0m\r\n');
      }
    }
  }, [resizePty]);

  const mockHistoryRef = useRef<string[]>([]);
  const mockHistoryIdxRef = useRef<number>(-1);

  const mockRespond = useCallback(
    (cmdRaw: string) => {
      const term = xtermRef.current;
      if (!term) return;
      term.write('\r\n');
      const cmd = cmdRaw.trim();
      if (cmd.length > 0) {
        mockHistoryRef.current.push(cmd);
        mockHistoryIdxRef.current = mockHistoryRef.current.length;
      }

      const prompt = '\x1b[1;32mengineer@airlock-cockpit\x1b[0m:\x1b[1;34m~/devsecops-workspace\x1b[0m$ ';
      const parts = cmd.split(/\s+/);
      const baseCmd = parts[0];

      if (!cmd) {
        term.write(prompt);
        return;
      }

      if (baseCmd === 'clear') {
        term.clear();
        term.write(prompt);
        return;
      }

      if (baseCmd === 'pwd') {
        term.write('/home/engineer/devsecops-workspace\r\n');
      } else if (baseCmd === 'whoami') {
        term.write('engineer\r\n');
      } else if (baseCmd === 'uname') {
        if (cmd.includes('-a')) {
          term.write('Linux airlock-cockpit 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\r\n');
        } else {
          term.write('Linux\r\n');
        }
      } else if (baseCmd === 'date') {
        term.write(`${new Date().toUTCString()}\r\n`);
      } else if (baseCmd === 'echo') {
        let str = cmd.slice(5);
        str = str
          .replace(/\$USER/g, 'engineer')
          .replace(/\$ENV/g, env)
          .replace(/\$PWD/g, '/home/engineer/devsecops-workspace')
          .replace(/\$KUBECONFIG/g, '/home/engineer/.kube/config');
        term.write(`${str}\r\n`);
      } else if (baseCmd === 'env') {
        term.write('USER=engineer\r\n');
        term.write('HOME=/home/engineer\r\n');
        term.write('PWD=/home/engineer/devsecops-workspace\r\n');
        term.write('SHELL=/bin/bash\r\n');
        term.write(`AIRLOCK_ENV=${env.toLowerCase()}\r\n`);
        term.write('KUBECONFIG=/home/engineer/.kube/config\r\n');
        term.write('AWS_REGION=us-east-1\r\n');
        term.write('LOG_LEVEL=info\r\n');
      } else if (baseCmd === 'ls') {
        if (cmd.includes('-l') || cmd.includes('-la') || cmd.includes('-al')) {
          term.write('total 48\r\n');
          term.write('drwxr-xr-x 8 engineer engineer 4096 Sep 22 10:45 \x1b[1;34mcrates\x1b[0m\r\n');
          term.write('drwxr-xr-x 5 engineer engineer 4096 Sep 22 10:50 \x1b[1;34msrc-ui\x1b[0m\r\n');
          term.write('drwxr-xr-x 3 engineer engineer 4096 Sep 22 09:30 \x1b[1;34mlab\x1b[0m\r\n');
          term.write('drwxr-xr-x 2 engineer engineer 4096 Sep 22 08:15 \x1b[1;34mk8s\x1b[0m\r\n');
          term.write('drwxr-xr-x 2 engineer engineer 4096 Sep 22 08:20 \x1b[1;34mterraform\x1b[0m\r\n');
          term.write('-rw-r--r-- 1 engineer engineer 1842 Sep 22 10:00 \x1b[32mAGENTS.md\x1b[0m\r\n');
          term.write('-rw-r--r-- 1 engineer engineer 2104 Sep 22 09:12 \x1b[32mCLAUDE.md\x1b[0m\r\n');
          term.write('-rw-r--r-- 1 engineer engineer  850 Sep 22 08:00 \x1b[32mCargo.toml\x1b[0m\r\n');
          term.write('-rw-r--r-- 1 engineer engineer 1420 Sep 22 08:05 \x1b[32mpackage.json\x1b[0m\r\n');
          term.write('-rw------- 1 engineer engineer  412 Sep 22 10:30 \x1b[31m.env.production\x1b[0m\r\n');
        } else {
          term.write(
            '\x1b[1;34mcrates  src-ui  lab  k8s  terraform\x1b[0m  \x1b[32mAGENTS.md  CLAUDE.md  Cargo.toml  package.json\x1b[0m  \x1b[31m.env.production\x1b[0m\r\n'
          );
        }
      } else if (baseCmd === 'cat') {
        const file = parts[1];
        if (file === 'AGENTS.md') {
          term.write('\x1b[1;37m# AGENTS.md — How AI agents work on Airlock\x1b[0m\r\n');
          term.write('Airlock is a native desktop DevSecOps cockpit (Tauri + Rust core + React UI).\r\n');
          term.write('Cross-tool standard for human-gated AI cockpit execution.\r\n');
        } else if (file === 'CLAUDE.md') {
          term.write('\x1b[1;37m# CLAUDE.md — Airlock Architecture & Invariants\x1b[0m\r\n');
          term.write('1. AI never mutates infrastructure without a recorded human approval.\r\n');
          term.write('2. Secrets are redacted before reaching UI or AI context.\r\n');
          term.write('3. Native desktop software: Tauri IPC for UI <-> core.\r\n');
        } else if (file === 'Cargo.toml') {
          term.write('[workspace]\r\nmembers = ["crates/airlock-core", "crates/airlock-pty", "src-tauri"]\r\nresolver = "2"\r\n');
        } else if (file === '.env.production') {
          term.write('# Airlock Secret Redaction Active:\r\n');
          term.write('DATABASE_URL=postgres://airlock_user:\x1b[33m[REDACTED_SECRET_HASH]\x1b[0m@db.internal:5432/prod\r\n');
          term.write('AWS_SECRET_ACCESS_KEY=\x1b[33m[REDACTED_AWS_SECRET]\x1b[0m\r\n');
        } else if (file) {
          term.write(`cat: ${file}: No such file or directory\r\n`);
        } else {
          term.write('cat: missing operand\r\n');
        }
      } else if (baseCmd === 'kubectl') {
        const sub = parts[1];
        const target = parts[2];
        if (sub === 'get' && (target === 'pods' || target === 'pod' || target === 'po')) {
          term.write('NAMESPACE     NAME                             READY   STATUS             RESTARTS   AGE\r\n');
          term.write('production    checkout-api-7d89b94f-x29q       0/1     \x1b[1;31mCrashLoopBackOff\x1b[0m   5          3h12m\r\n');
          term.write('production    payments-db-0                    1/1     \x1b[1;32mRunning\x1b[0m            0          14d\r\n');
          term.write('production    auth-service-589f8489c-a81d      1/1     \x1b[1;32mRunning\x1b[0m            0          7d22m\r\n');
          term.write('airlock-sys   airlock-guard-agent-64fbc-9z4    1/1     \x1b[1;32mRunning\x1b[0m            0          30d\r\n');
        } else if (sub === 'get' && (target === 'deployments' || target === 'deployment' || target === 'deploy')) {
          term.write('NAME           READY   UP-TO-DATE   AVAILABLE   AGE\r\n');
          term.write('checkout-api   0/1     1            0           30d\r\n');
          term.write('auth-service   2/2     2            2           45d\r\n');
          term.write('payments-db    1/1     1            1           14d\r\n');
        } else if (sub === 'get' && (target === 'nodes' || target === 'node' || target === 'no')) {
          term.write('NAME                         STATUS   ROLES           AGE   VERSION\r\n');
          term.write('ip-10-0-1-42.ec2.internal    Ready    control-plane   45d   v1.30.2\r\n');
          term.write('ip-10-0-2-88.ec2.internal    Ready    worker          45d   v1.30.2\r\n');
          term.write('ip-10-0-2-89.ec2.internal    Ready    worker          45d   v1.30.2\r\n');
        } else if (sub === 'logs') {
          term.write('\x1b[90m2026-09-22T10:45:01Z [INFO] Initializing checkout service v2.4.1...\x1b[0m\r\n');
          term.write('\x1b[90m2026-09-22T10:45:02Z [INFO] Database pool connected (payments-db:5432)\x1b[0m\r\n');
          term.write('\x1b[33m2026-09-22T10:45:05Z [WARN] Memory usage elevated: 242MB / 256MB limit\x1b[0m\r\n');
          term.write('\x1b[1;31m2026-09-22T10:45:08Z [FATAL] Out of memory: killed process 1 (checkout-api)\x1b[0m\r\n');
          term.write('\x1b[1;31m[K8S KERNEL] Container checkout-api terminated with exit code 137 (OOMKilled)\x1b[0m\r\n');
        } else if (sub === 'describe') {
          term.write('Name:         checkout-api-7d89b94f-x29q\r\n');
          term.write('Namespace:    production\r\n');
          term.write('Status:       Running (CrashLoopBackOff)\r\n');
          term.write('Containers:\r\n');
          term.write('  checkout-api:\r\n');
          term.write('    Image:      ghcr.io/devsecops/checkout-api:v2.4.1\r\n');
          term.write('    Limits:     memory: 256Mi\r\n');
          term.write('    State:      Waiting (Reason: CrashLoopBackOff, ExitCode: 137)\r\n');
        } else {
          term.write('kubectl controls the Kubernetes cluster manager.\r\n');
          term.write('Usage: kubectl [get|logs|describe] [pods|deployments|nodes]\r\n');
        }
      } else if (baseCmd === 'aws') {
        if (cmd.includes('s3 ls')) {
          term.write('2026-01-15 04:12:00 s3://airlock-audit-ledger-production\r\n');
          term.write('2026-02-01 18:30:10 s3://devsecops-terraform-state-us-east-1\r\n');
          term.write('2026-05-10 09:15:22 s3://app-backups-encrypted-us-east-1\r\n');
        } else if (cmd.includes('sts get-caller-identity')) {
          term.write('{\r\n');
          term.write('    "UserId": "AROA123456789EXAMPLE:airlock-operator",\r\n');
          term.write('    "Account": "123456789012",\r\n');
          term.write('    "Arn": "arn:aws:sts::123456789012:assumed-role/AirlockDevSecOpsRole/airlock-operator"\r\n');
          term.write('}\r\n');
        } else {
          term.write('AWS CLI v2.17.40 Command Runner\r\n');
          term.write('Usage: aws [s3 ls | sts get-caller-identity]\r\n');
        }
      } else if (baseCmd === 'terraform') {
        term.write('\x1b[1;34mTerraform v1.9.5\x1b[0m\r\n');
        term.write('Initializing provider plugins...\r\n');
        term.write('\x1b[32m+ aws_iam_policy.airlock_read_only\x1b[0m will be created\r\n');
        term.write('\x1b[33m~ kubernetes_deployment.checkout_api\x1b[0m will be updated in-place (memory limit 256Mi -> 512Mi)\r\n\r\n');
        term.write('\x1b[1;32mPlan: 1 to add, 1 to change, 0 to destroy.\x1b[0m\r\n');
      } else if (baseCmd === 'airlock' || baseCmd === 'devsecops') {
        const sub = parts[1];
        if (sub === 'status') {
          term.write('\x1b[1;36m[AIRLOCK DEVSECOPS COCKPIT SYSTEM STATUS]\x1b[0m\r\n');
          term.write('Rust Core Kernel: \x1b[1;32mONLINE\x1b[0m (airlock-core v0.2.0)\r\n');
          term.write('Audit Hash Chain: \x1b[1;32mVERIFIED & IMMUTABLE\x1b[0m (Head: 0x8f4a21...c9e)\r\n');
          term.write('Human Approval Gate: \x1b[1;33mENFORCED\x1b[0m (Policy Gate #4 active)\r\n');
          term.write('DLP Secret Redaction: \x1b[1;32mACTIVE\x1b[0m (Pattern set v12: AWS/K8S/GCP/Slack/RSA)\r\n');
          term.write(`Active Context: \x1b[1;33m${env}\x1b[0m (AWS us-east-1 | Cluster: prod-k8s-01)\r\n`);
        } else if (sub === 'discovery') {
          term.write('\x1b[1;36m[AIRLOCK ASSET & INFRASTRUCTURE DISCOVERY]\x1b[0m\r\n');
          term.write('Kubernetes Workloads: 4 Deployments, 12 Pods, 3 Services across 2 Namespaces\r\n');
          term.write('Cloud Resources: AWS S3 (3 Buckets), IAM Roles (4 active), EC2 Nodes (3)\r\n');
          term.write('IaC Assets: 14 resources tracked in s3://devsecops-terraform-state-us-east-1\r\n');
          term.write('Policy Violations: 1 Critical (checkout-api OOM / Unrestricted Secret)\r\n');
        } else if (sub === 'findings' || sub === 'vulnerabilities') {
          term.write('\x1b[1;31m[CRITICAL]\x1b[0m FINDING-001: checkout-api Memory Ceiling CrashLoop (256Mi limit exceeded)\r\n');
          term.write('\x1b[1;33m[HIGH]\x1b[0m     FINDING-002: Hardcoded API token detected in terraform/main.tf:42 (DLP Redacted)\r\n');
          term.write('\x1b[1;36m[MEDIUM]\x1b[0m   FINDING-003: Public S3 Bucket Read permission on app-backups-encrypted\r\n');
        } else if (sub === 'why') {
          term.write('\x1b[1;36m[AIRLOCK AI DIAGNOSTIC INVESTIGATION: checkout-api]\x1b[0m\r\n');
          term.write('Analysis Target: pod/checkout-api-7d89b94f-x29q (Namespace: production)\r\n');
          term.write('Observed Symptom: Pod restarted 5 times in 3 hours with CrashLoopBackOff.\r\n');
          term.write('Root Cause: OOMKilled - Process 1 exceeded 256Mi cgroup ceiling during heavy traffic.\r\n');
          term.write('Recommended Fix: Increase container memory request to 256Mi and memory limit to 512Mi.\r\n');
          term.write('Remediation Command: airlock apply-patch --target deployment/checkout-api --memory-limit 512Mi\r\n');
          term.write('Approval Required: Human signature required before mutating production cluster state.\r\n');
        } else if (sub === 'vault') {
          term.write('\x1b[1;36m[AIRLOCK DLP SECRET REDACTION ENGINE]\x1b[0m\r\n');
          term.write('Active Patterns: 24 regex match rules (AWS Access Key, RSA Private Key, JWT, Bearer Token)\r\n');
          term.write('Redaction Strategy: SHA-256 HMAC Masking (UI + AI Prompt Context)\r\n');
          term.write('Status: 0 leaked secrets across 1,420 IPC requests.\r\n');
        } else if (sub === 'audit') {
          term.write('\x1b[1;36m[AIRLOCK IMMUTABLE AUDIT LEDGER LOGS]\x1b[0m\r\n');
          term.write('BLOCK #1041: [2026-09-22 10:45:00 UTC] Event: pty_session_create | Hash: 0xa1b2c3d4\r\n');
          term.write('BLOCK #1042: [2026-09-22 10:48:12 UTC] Event: policy_evaluation  | Hash: 0x5e6f7a8b\r\n');
          term.write('BLOCK #1043: [2026-09-22 10:55:30 UTC] Event: telemetry_pulse    | Hash: 0x8f4a21e9\r\n');
        } else {
          term.write('Airlock DevSecOps Cockpit CLI Engine v1.0.0\r\n');
          term.write('Usage: airlock [status | discovery | findings | why <target> | vault | audit]\r\n');
        }
      } else if (baseCmd === 'git') {
        const sub = parts[1];
        if (sub === 'status') {
          term.write("On branch main\r\nYour branch is up to date with 'origin/main'.\r\n\r\n");
          term.write('Changes not staged for commit:\r\n');
          term.write('  (use "git add <file>..." to update what will be committed)\r\n');
          term.write('	\x1b[31mmodified:   src-ui/src/components/TerminalPane.tsx\x1b[0m\r\n');
          term.write('	\x1b[31mmodified:   src-ui/src/components/TerminalView.tsx\x1b[0m\r\n\r\n');
          term.write('no changes added to commit (use "git add" and/or "git commit")\r\n');
        } else if (sub === 'log') {
          term.write('\x1b[33mcommit 8f4a21e9c2b3a4d5e6f7a8b9c0d1e2f3a4b5c6d7\x1b[0m (HEAD -> main, origin/main)\r\n');
          term.write('Author: Airlock DevSecOps <engineer@airlock.dev>\r\n');
          term.write('Date:   Tue Sep 22 10:30:00 2026 +0000\r\n\r\n');
          term.write('    feat(terminal): upgrade PTY terminal workspace with authentic Linux CLI shell engine\r\n');
        } else {
          term.write('git status | git log\r\n');
        }
      } else if (baseCmd === 'top' || baseCmd === 'htop') {
        term.write('top - 11:00:02 up 14 days,  3:22,  2 users,  load average: 0.18, 0.22, 0.19\r\n');
        term.write('Tasks: 142 total,   1 running, 141 sleeping,   0 stopped,   0 zombie\r\n');
        term.write('%Cpu(s):  2.4 us,  1.1 sy,  0.0 ni, 96.2 id,  0.1 wa,  0.0 hi,  0.2 si\r\n');
        term.write('MiB Mem :  15980.2 total,   4210.5 free,   8120.4 used,   3649.3 buff/cache\r\n\r\n');
        term.write('  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\r\n');
        term.write(' 1240 engineer  20   0  342500  88200  42100 S   1.8   0.5   0:14.22 airlock-core\r\n');
        term.write('  892 engineer  20   0 1120400 245100  95000 S   1.2   1.5   1:02.15 airlock-desktop\r\n');
        term.write(' 4210 engineer  20   0   45200   8100   3200 S   0.3   0.1   0:01.05 bash\r\n');
      } else if (baseCmd === 'help') {
        term.write('\x1b[1;36mAirlock Operations Interactive Shell Commands:\x1b[0m\r\n');
        term.write('  \x1b[1;32mSystem POSIX:\x1b[0m      pwd, ls (-la), whoami, uname (-a), date, echo, env, clear, top, cat\r\n');
        term.write('  \x1b[1;32mKubernetes CLI:\x1b[0m    kubectl [get|logs|describe] [pods|deployments|nodes]\r\n');
        term.write('  \x1b[1;32mAWS Cloud CLI:\x1b[0m     aws [s3 ls | sts get-caller-identity]\r\n');
        term.write('  \x1b[1;32mTerraform IaC:\x1b[0m     terraform plan\r\n');
        term.write('  \x1b[1;32mAirlock DevSecOps:\x1b[0m airlock [status | discovery | findings | why | vault | audit]\r\n');
        term.write('  \x1b[1;32mGit Version Control:\x1b[0m git status, git log\r\n');
      } else {
        term.write(`bash: ${baseCmd}: command not found\r\n`);
      }

      term.write(prompt);
    },
    [env]
  );

  const handleMockInput = useCallback(
    (data: string) => {
      const term = xtermRef.current;
      if (!term) return;
      const prompt = '\x1b[1;32mengineer@airlock-cockpit\x1b[0m:\x1b[1;34m~/devsecops-workspace\x1b[0m$ ';

      // Ctrl+C
      if (data === '\x03') {
        mockBufferRef.current = '';
        term.write('^C\r\n');
        term.write(prompt);
        return;
      }

      // Up Arrow
      if (data === '\x1b[A') {
        const history = mockHistoryRef.current;
        if (history.length === 0) return;
        if (mockHistoryIdxRef.current > 0) {
          mockHistoryIdxRef.current -= 1;
        }
        const prevCmd = history[mockHistoryIdxRef.current] || '';
        while (mockBufferRef.current.length > 0) {
          mockBufferRef.current = mockBufferRef.current.slice(0, -1);
          term.write('\b \b');
        }
        mockBufferRef.current = prevCmd;
        term.write(prevCmd);
        return;
      }

      // Down Arrow
      if (data === '\x1b[B') {
        const history = mockHistoryRef.current;
        if (mockHistoryIdxRef.current < history.length - 1) {
          mockHistoryIdxRef.current += 1;
          const nextCmd = history[mockHistoryIdxRef.current] || '';
          while (mockBufferRef.current.length > 0) {
            mockBufferRef.current = mockBufferRef.current.slice(0, -1);
            term.write('\b \b');
          }
          mockBufferRef.current = nextCmd;
          term.write(nextCmd);
        } else {
          mockHistoryIdxRef.current = history.length;
          while (mockBufferRef.current.length > 0) {
            mockBufferRef.current = mockBufferRef.current.slice(0, -1);
            term.write('\b \b');
          }
          mockBufferRef.current = '';
        }
        return;
      }

      if (data === '\r' || data === '\n') {
        const cmd = mockBufferRef.current;
        mockBufferRef.current = '';
        mockRespond(cmd);
      } else if (data === '\x7f' || data === '\b') {
        if (mockBufferRef.current.length > 0) {
          mockBufferRef.current = mockBufferRef.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (data.length === 1 && data >= ' ') {
        mockBufferRef.current += data;
        term.write(data);
      }
    },
    [mockRespond]
  );

  const ensureSession = useCallback(async () => {
    if (resolveStartedRef.current || sessionId) return;
    resolveStartedRef.current = true;
    if (!isTauri) {
      const mockId = `mock-${++mockSeqRef.current}`;
      onResolved(paneId, mockId);
      return;
    }
    try {
      const sid = await invoke<string>('terminal_create_session', { env });
      onResolved(paneId, sid);
    } catch (err) {
      resolveStartedRef.current = false;
      onResolveError(paneId, String(err));
    }
  }, [env, onResolved, onResolveError, paneId, sessionId]);

  const attachSession = useCallback(
    async (sid: string) => {
      if (!isTauri) return;
      attachCancelledRef.current = false;
      try {
        const backlog: number[] = await invoke('terminal_read', { sessionId: sid });
        if (!attachCancelledRef.current && backlog && backlog.length > 0) {
          xtermRef.current?.write(new Uint8Array(backlog));
        }
      } catch {
        // no buffered output yet
      }
      const eventName = `pty_output_${sid}`;
      const unlisten = await listen<number[] | Uint8Array | string>(eventName, (event) => {
        if (attachCancelledRef.current) return;
        const term = xtermRef.current;
        if (!term) return;
        const payload = event.payload;
        if (typeof payload === 'string') {
          term.write(payload);
        } else if (Array.isArray(payload)) {
          term.write(new Uint8Array(payload));
        } else if (payload) {
          term.write(new Uint8Array(payload as Uint8Array));
        }
      });
      if (attachCancelledRef.current) {
        unlisten();
      } else {
        unlistenRef.current = unlisten;
      }
      setTimeout(() => fitToContainer(), 30);
    },
    [fitToContainer]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'JetBrains Mono, Fira Code, Menlo, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: '#04060a',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        black: '#0f172a',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#38bdf8',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#f8fafc',
        brightBlack: '#475569',
        brightRed: '#ef4444',
        brightGreen: '#10b981',
        brightYellow: '#f59e0b',
        brightBlue: '#0ea5e9',
        brightMagenta: '#a855f7',
        brightCyan: '#06b6d4',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    searchAddon.onDidChangeResults((e) => {
      if (lastSearchTermRef.current) {
        onSearchCount(paneId, e.resultCount);
      }
    });

    term.onData((data: string) => {
      if (!isTauri) {
        handleMockInput(data);
        return;
      }
      onData(paneId, data);
    });

    term.onResize(({ rows, cols }) => {
      const sid = sessionId;
      if (!sid || !isTauri) return;
      const clampedRows = Math.max(10, Math.min(500, rows));
      const clampedCols = Math.max(10, Math.min(500, cols));
      invoke('terminal_resize', { sessionId: sid, rows: clampedRows, cols: clampedCols }).catch(() => {});
    });

    const resizeObserver = new ResizeObserver(() => {
      fitToContainer();
    });
    resizeObserver.observe(containerRef.current);

    onRegister({
      paneId,
      getSessionId: () => sessionId,
      getSelection: () => term.getSelection() ?? '',
      focus: () => term.focus(),
      clear: () => term.clear(),
      findNext: () => {
        if (!lastSearchTermRef.current) return false;
        try {
          return searchAddon.findNext(lastSearchTermRef.current, SEARCH_OPTIONS);
        } catch {
          return false;
        }
      },
      findPrevious: () => {
        if (!lastSearchTermRef.current) return false;
        try {
          return searchAddon.findPrevious(lastSearchTermRef.current, SEARCH_OPTIONS);
        } catch {
          return false;
        }
      },
    });

    if (isTauri) {
      // session resolution + attachment handled by the [sessionId] effect below
    } else {
      const mockId = `pty-${++mockSeqRef.current}`;
      term.write('\x1b[1;32mLinux airlock-cockpit 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64\x1b[0m\r\n');
      term.write('\x1b[1;36mAirlock DevSecOps Operating System Engine v1.0.0 (x86_64-unknown-linux-gnu)\x1b[0m\r\n');
      term.write(
        `\x1b[90mConnected environment:\x1b[0m \x1b[1;33m${env}\x1b[0m \x1b[90m| Session: ${mockId} | Type '\x1b[36mhelp\x1b[90m' for CLI tools\x1b[0m\r\n\r\n`
      );
      term.write('\x1b[1;32mengineer@airlock-cockpit\x1b[0m:\x1b[1;34m~/devsecops-workspace\x1b[0m$ ');
      onResolved(paneId, mockId);
    }

    return () => {
      attachCancelledRef.current = true;
      resizeObserver.disconnect();
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      onUnregister(paneId);
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    if (sessionId) {
      void attachSession(sessionId);
    } else {
      void ensureSession();
    }
    return () => {
      attachCancelledRef.current = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const term = xtermRef.current;
    if (!term || !isTauri) return;
    if (!search || !search.term.trim()) {
      searchAddonRef.current?.clearDecorations();
      lastSearchTermRef.current = '';
      onSearchCount(paneId, 0);
      return;
    }
    lastSearchTermRef.current = search.term;
    const found = searchAddonRef.current?.findNext?.(search.term, SEARCH_OPTIONS) ?? false;
    if (!found) {
      onSearchCount(paneId, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.nonce]);

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed) onRename(paneId, trimmed);
    setEditing(false);
  };

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#04060a',
        borderRadius: 6,
        border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
        overflow: 'hidden',
      }}
      onMouseDown={onFocus}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 8px',
          background: isActive ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: 10.5,
          fontFamily: 'var(--font-mono)',
          minHeight: 24,
        }}
      >
        <TerminalIcon size={11} style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-dim)' }} />
        {editing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{
              background: '#0b1220',
              border: '1px solid var(--accent-cyan)',
              borderRadius: 3,
              color: '#e2e8f0',
              fontSize: 10.5,
              fontFamily: 'var(--font-mono)',
              padding: '0 4px',
              width: 110,
            }}
          />
        ) : (
          <span
            style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-dim)', cursor: 'text' }}
            onDoubleClick={() => {
              setEditValue(name);
              setEditing(true);
            }}
            title={hasSession && sessionId ? `session ${sessionId.slice(0, 8)}` : 'spawning…'}
          >
            {name}
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: hasSession ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
          {hasSession ? <Wifi size={9} /> : <WifiOff size={9} />}
        </span>
        <span
          onClick={(e) => {
            e.stopPropagation();
            onClosePane(paneId);
          }}
          style={{
            marginLeft: 'auto',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            padding: '1px 3px',
            borderRadius: 3,
          }}
          title={`Close pane ${name}`}
        >
          <X size={10} />
        </span>
      </div>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          backgroundColor: '#04060a',
          position: 'relative',
          padding: '4px 6px',
        }}
      >
        {!hasSession && !resizeError && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 10,
              fontSize: 10.5,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
            <span>spawning session…</span>
          </div>
        )}
        {resizeError && (
          <div style={{ position: 'absolute', top: 8, left: 10, fontSize: 10.5, color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>
            {resizeError}
          </div>
        )}
      </div>
      {isActive && sessionId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 8px', fontSize: 9.5, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border-subtle)', background: 'rgba(15, 23, 42, 0.5)' }}>
          <Check size={9} style={{ color: 'var(--accent-emerald)' }} />
          <span>attached {env}</span>
        </div>
      )}
    </div>
  );
};