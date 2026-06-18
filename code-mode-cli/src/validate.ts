// `utcp validate` — give an agent fast feedback on config/manuals it wrote,
// without it having to reason about a full registration round-trip.
//
//   validate                 → validate the active .utcp_config.json: the config
//                              shape + each manual call template, then (unless
//                              --offline) register each manual and report how
//                              many tools it yields.
//   validate --manual <f...> → validate standalone UTCP manual file(s) (the JSON
//                              an agent authors for a `file` call template).
import { promises as fs } from 'fs';
import { CallTemplateSerializer, UtcpManualSerializer, ensureCorePluginsInitialized } from '@utcp/sdk';
import { createClient } from './config.js';

export interface ManualReport {
  name: string;
  call_template_type?: string;
  structure_valid: boolean;
  registered?: boolean;
  tool_count?: number;
  errors: string[];
}

/** Validate the active config and its manuals. */
export async function validateConfig(configFlag: string | undefined, offline: boolean): Promise<any> {
  let client, rawConfig, configPath;
  try {
    // skipManualRegistration: validates the config shape but lets us register
    // each manual individually below to capture per-manual results.
    ({ client, rawConfig, configPath } = await createClient(configFlag, { skipManualRegistration: true }));
  } catch (e: any) {
    return { valid: false, error: `Config is invalid: ${e.message}` };
  }

  const rawManuals = (rawConfig as any).manual_call_templates;
  if (rawManuals !== undefined && !Array.isArray(rawManuals)) {
    return {
      valid: false,
      config_path: configPath,
      error: `"manual_call_templates" must be an array, got ${typeof rawManuals}.`,
    };
  }
  const manuals: any[] = rawManuals || [];
  const reports: ManualReport[] = [];
  const ser = new CallTemplateSerializer();

  for (const m of manuals) {
    const report: ManualReport = {
      name: m?.name ?? '(unnamed)',
      call_template_type: m?.call_template_type,
      structure_valid: false,
      errors: [],
    };
    try {
      ser.validateDict(m);
      report.structure_valid = true;
    } catch (e: any) {
      report.errors.push(`Invalid call template: ${e.message}`);
    }

    if (report.structure_valid && !offline) {
      try {
        const result = await client.registerManual(m);
        report.registered = result.success;
        report.tool_count = result.manual?.tools?.length ?? 0;
        if (!result.success) report.errors.push(...(result.errors || []));
      } catch (e: any) {
        report.registered = false;
        report.errors.push(`Registration failed: ${e.message}`);
      }
    }
    reports.push(report);
  }

  await client.close().catch(() => {});

  const valid = reports.every((r) => r.structure_valid && (offline || r.registered !== false));
  return { valid, config_path: configPath, offline, manuals: reports };
}

/** Validate standalone UTCP manual files (JSON). */
export async function validateManualFiles(paths: string[]): Promise<any> {
  ensureCorePluginsInitialized();
  const ser = new UtcpManualSerializer();
  const results = [];
  for (const p of paths) {
    const entry: any = { file: p, valid: false, errors: [] };
    try {
      const parsed = JSON.parse(await fs.readFile(p, 'utf-8'));
      const manual = ser.validateDict(parsed);
      entry.valid = true;
      entry.tool_count = manual.tools.length;
      entry.tools = manual.tools.map((t: any) => t.name);
    } catch (e: any) {
      entry.errors.push(e.message);
    }
    results.push(entry);
  }
  return { valid: results.every((r) => r.valid), manuals: results };
}
