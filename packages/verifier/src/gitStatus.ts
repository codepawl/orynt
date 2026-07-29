export type PorcelainStatusPaths = {
  changedFiles: string[];
  destructiveFiles: string[];
};

export function parsePorcelainStatusPaths(
  statusOutput: string,
): PorcelainStatusPaths {
  const changedFiles: string[] = [];
  const destructiveFiles: string[] = [];
  const records = statusOutput
    .split("\0")
    .filter((record) => record.length > 0);

  for (let index = 0; index < records.length;) {
    const record = records[index++] ?? "";
    const code = record.slice(0, 2);
    const destinationPath = record.slice(3);
    if (destinationPath) {
      changedFiles.push(destinationPath);
      if (code.includes("D") || code.includes("R")) {
        destructiveFiles.push(destinationPath);
      }
    }

    if (code.includes("R") || code.includes("C")) {
      const sourcePath = records[index++] ?? "";
      if (sourcePath) {
        changedFiles.push(sourcePath);
        if (code.includes("R")) {
          destructiveFiles.push(sourcePath);
        }
      }
    }
  }

  return { changedFiles, destructiveFiles };
}
