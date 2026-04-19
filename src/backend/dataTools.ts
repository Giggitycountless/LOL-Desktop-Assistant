import { callBackend } from "./commands";
import type { ImportLocalDataResult, LocalDataExport } from "./types";

export function exportLocalData(): Promise<LocalDataExport> {
  return callBackend<LocalDataExport>("export_local_data");
}

export function importLocalData(json: string): Promise<ImportLocalDataResult> {
  return callBackend<ImportLocalDataResult>("import_local_data", {
    input: { json },
  });
}
