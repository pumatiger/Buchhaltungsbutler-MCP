// start-bb-mcp.mjs
// Startet den BuchhaltungsButler-MCP-Server (stdio) mit Zugangsdaten aus
// DPAPI-verschlüsselten Dateien unter %LOCALAPPDATA%\bb-mcp\.
// Die Klartextwerte existieren nur im Arbeitsspeicher dieses Prozesses und des Servers –
// nicht in .mcp.json, nicht in Umgebungsvariablen des Systems, nicht im Repo.
//
// Ablage: neben dist/ im Ordner bb-mcp/. Einbindung in betrieb/.mcp.json:
//   { "mcpServers": { "bb": { "command": "node", "args": ["C:/<pfad>/bb-mcp/start-bb-mcp.mjs"] } } }

import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.LOCALAPPDATA) {
  console.error('LOCALAPPDATA nicht gesetzt – dieser Starter ist nur für Windows gedacht.');
  process.exit(1);
}
const secretDir = join(process.env.LOCALAPPDATA, 'bb-mcp');

function readSecret(name) {
  const file = join(secretDir, `${name}.dpapi`).replace(/'/g, "''"); // für PowerShell-String maskieren
  // Entschlüsselung per DPAPI (an dein Windows-Benutzerkonto gebunden)
  const ps = `[Net.NetworkCredential]::new('', (Get-Content -LiteralPath '${file}' | ConvertTo-SecureString)).Password`;
  const value = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8',
    // stdout des Hilfsprozesses wird abgefangen und nie an Claude Code durchgereicht
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
  if (!value) throw new Error(`Secret ${name} fehlt oder ist leer (${file})`);
  return value;
}

// Phase 1 (Schattenbetrieb): Lese-Tools plus comments_create. Nicht gelistete Tools
// bietet der Server weder an, noch nimmt er Aufrufe dafür an (src/server.ts, applyToolPolicy).
// Achtung: Eine leere Liste würde ALLE Tools freigeben – deshalb die Prüfung unten.
const TOOL_ALLOWLIST = [
  'accounts_list',
  'cost_locations_list',
  'creditors_list',
  'debtors_list',
  'postingaccounts_list',
  'postings_list',
  'receipts_list',
  'receipts_get_by_id',
  'receipts_list_assigned_transactions',
  'transactions_list',
  'transactions_get_by_id',
  'transactions_list_assigned_receipts',
  'reports_get_sums_ledger',
  'comments_create',
];
if (TOOL_ALLOWLIST.length === 0) {
  console.error('TOOL_ALLOWLIST ist leer – Start abgebrochen.');
  process.exit(1);
}

const server = fileURLToPath(new URL('./dist/index.js', import.meta.url));

const child = spawn(process.execPath, [server], {
  stdio: 'inherit', // stdin/stdout gehen direkt zwischen Claude Code und dem Server durch
  env: {
    ...process.env,
    // Sicherheitsrelevante Werte immer fest setzen, damit sie sich nicht über die
    // geerbte Umgebung (z. B. env in .mcp.json) verändern lassen.
    MCP_TRANSPORT: 'stdio',
    BB_BASE_URL: 'https://webapp.buchhaltungsbutler.de/api/v1', // Zugangsdaten nur an BB
    BB_SPEC_PATH: '', // immer die mitgelieferte spec.json
    BB_READ_ONLY: '',
    BB_ALLOW_API_KEY_OVERRIDE: '', // kein Wechsel des Kundenkontos per Tool-Aufruf
    BB_TOOL_ALLOWLIST: TOOL_ALLOWLIST.join(','),
    BB_API_CLIENT: readSecret('BB_API_CLIENT'),
    BB_API_SECRET: readSecret('BB_API_SECRET'),
    BB_API_KEY: readSecret('BB_API_KEY'),
  },
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 1));
