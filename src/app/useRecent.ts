import { useEffect, useState } from "react";
import { host, type RecentFile } from "../platform";

/** The files windows closed, newest first, but those open in some window. */
export function useRecent(): RecentFile[] {
  const [files, setFiles] = useState<RecentFile[]>([]);
  useEffect(() => {
    const off = host.recent.onChange(setFiles);
    void host.recent.list().then(setFiles, () => {});
    return off;
  }, []);
  return files;
}
