import type {
  ArtifactType,
  CodeInfo,
  FileEntry,
  Finding,
  FindingItem,
  JsEngineInfo,
  ManifestInfo,
  NativeLibInfo,
} from '../types.js';

export interface CheckContext {
  artifact: ArtifactType;
  manifest: ManifestInfo;
  code: CodeInfo;
  /** Native libraries delivered for the target ABI, with ELF details. */
  nativeLibs: NativeLibInfo[];
  /** Target ABI for the download estimate. */
  abi: string;
  /** Every file in the artifact. */
  files: FileEntry[];
  /** Files a device on `abi` downloads. */
  delivered: FileEntry[];
  js: JsEngineInfo | null;
}

/** A finding plus per-file savings, so totals can be counted once per file across checks. */
export interface CheckFinding extends Omit<Finding, 'checkId' | 'savings' | 'items'> {
  /** Defaults to `files` with their compressed sizes, biggest first. */
  items?: FindingItem[];
  savingsByFile?: Record<string, number>;
  /** Shown when savings are a rough guess rather than the exact size of removable files. */
  estimate?: boolean;
}

export interface Check {
  id: string;
  title: string;
  description: string;
  /** What the check needs: just the build, or also the project / source map (later milestones). */
  requires: 'build' | 'project' | 'sourcemap';
  run(ctx: CheckContext): CheckFinding[];
}
