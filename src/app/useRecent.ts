import { useEffect, useState } from "react";
import { host, type RecentFile } from "../platform";

/** The files windows closed, newest first, but those open in some window. */
export function useRecent(): RecentFile[] {
  const [files, setFiles] = useState<RecentFile[]>([]);
  useEffect(() => host.recent.follow(setFiles), []);
  return files;
}
